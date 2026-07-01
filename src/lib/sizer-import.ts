// Parser for a Nutanix Sizer (sizer.nutanix.com) scenario JSON export.
//
// The Sizer export is a large, deeply-nested object. We only need a curated
// slice of it to drive the Proposal Builder, so this module normalizes the raw
// export into a small, strongly-typed `ProposalScenario` that the proposal
// document model and exporters consume. It is intentionally defensive: a Sizer
// export can omit fields depending on the scenario, so every read is guarded
// and `parseSizerScenario` throws a friendly error when the file clearly isn't
// a Sizer export.

export type SizerComponent = {
  code: string;
  description: string;
  // OEM (Cisco/Dell/HPE) exports classify each line with a featureName such as
  // "CPU", "RAM", "HDD", "SSD", "NVME" or "NETWORK" instead of using Nutanix
  // C-* SKU prefixes. We key off this first so OEM specs populate correctly.
  featureName: string | null;
  qtyPerNode: number | null;
  totalQty: number | null;
};

// External enterprise storage arrays Nutanix compute can run against (NVMe/TCP).
export type ExternalStorageInfo = {
  arrayDisplayName: string | null; // e.g. "FlashArray//C50"
  productFamily: string | null; // e.g. "FlashArray//C50"
  vendorCode: string | null; // e.g. "CISCO-OEM"
  vendor: string | null; // normalized: "Pure Storage" | "Dell PowerStore"
};

export type NodeModel = {
  sku: string; // e.g. NX-8170-G10
  blocks: number; // number of chassis/blocks of this SKU
  nodesInBlock: number;
  nodes: number; // blocks * nodesInBlock
  cpu: {
    code: string;
    model: string; // e.g. Intel Xeon 6530P
    ghz: number | null;
    coresPerCpu: number | null;
    watts: number | null;
    socketsPerNode: number; // CPUs per node
  } | null;
  memory: {
    moduleGiB: number | null;
    modulesPerNode: number;
    perNodeGiB: number | null;
  } | null;
  drives: {
    code: string;
    kind: "NVMe" | "SSD" | "HDD";
    sizeTB: number | null;
    perNode: number;
  }[];
  nic: string | null;
  gpu: string | null;
  components: SizerComponent[];
};

export type ProposalCluster = {
  name: string;
  solutionType: string | null;
  nodes: number;
  capacity: {
    cores: number;
    ramGiB: number;
    ssdTiB: number;
    hddTiB: number;
  };
  utilization: { cpu: number | null; ram: number | null; storage: number | null }; // %
  failover: { nMinus1: number | null; nMinus2: number | null }; // overall % at N-1 / N-2
  models: NodeModel[];
  license: { edition: string; cores: number | null; termMonths: number | null } | null;
  externalStorage: ExternalStorageInfo | null;
};

export type ProposalScenario = {
  source: "nutanix_sizer";
  meta: {
    customer: string;
    environmentName: string;
    opportunityName: string | null;
    se: string; // owner / login
    seEmail: string | null;
    installCountry: string | null;
    sizerVersion: string | null;
    permalink: string | null;
    createdDate: string | null;
  };
  totals: {
    clusters: number;
    nodes: number;
    cores: number;
    ramGiB: number;
    ssdTiB: number;
    hddTiB: number;
    vmCount: number | null;
    vCpus: number | null;
  };
  clusters: ProposalCluster[];
  // First external storage array detected across clusters, if the build uses one.
  externalStorage: ExternalStorageInfo | null;
};

// --- low-level guards --------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function numOf(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (isObj(v) && typeof v.value === "number" && Number.isFinite(v.value)) return v.value;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function strOf(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function round(n: number, p = 2): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

// --- component parsing -------------------------------------------------------

function parseComponents(raw: unknown[]): SizerComponent[] {
  const out: SizerComponent[] = [];
  for (const c of raw) {
    if (!isObj(c)) continue;
    const code = strOf(c.code);
    if (!code) continue;
    out.push({
      code,
      description: strOf(c.description) ?? code,
      featureName: strOf(c.featureName),
      qtyPerNode: numOf(c.qtyPerNode),
      totalQty: numOf(c.totalQtyAcrossBlocks) ?? numOf(c.qty),
    });
  }
  return out;
}

// A "NONE" placeholder line (e.g. C-HDD-NONE, C-SSD-NONE_Cisco-CP) means the
// component is intentionally absent -- common on OEM external-storage builds.
function isNone(c: SizerComponent): boolean {
  // Match "NONE" even when a suffix is glued on (e.g. C-SSD-NONE_Cisco-CP), and
  // catch OEM "No X Included" phrasing in the description.
  return /NONE/i.test(c.code) || /\bNo\s+(HDD|SSD|NVMe?|GPU|Network|Memory)\b/i.test(c.description);
}
function feature(c: SizerComponent): string {
  return (c.featureName ?? "").toUpperCase();
}

// Pull a clean "Intel Xeon 6745P" / "AMD EPYC 9654" out of either the Nutanix
// description ("... Intel Xeon 6530P processor ...") or the OEM parenthetical
// ("(Intel(R) Xeon(R) 6745P CPU @ 3.1GHz)").
function cpuModelFromDescription(desc: string): string | null {
  const intel = desc.match(/Intel(?:\(R\))?\s*Xeon(?:\(R\))?\s*[\w-]+/i);
  if (intel) return intel[0].replace(/\(R\)/gi, "").replace(/\s+/g, " ").trim();
  const amd = desc.match(/AMD\s*(?:\(R\))?\s*EPYC\s*[\w-]+/i);
  if (amd) return amd[0].replace(/\(R\)/gi, "").replace(/\s+/g, " ").trim();
  return null;
}

// Cluster context lets us derive per-CPU core counts for OEM exports whose
// component descriptions omit the core count (we back it out of capacity).
type ClusterContext = { cores?: number | null; nodes?: number | null };

function parseCpu(components: SizerComponent[], ctx: ClusterContext = {}): NodeModel["cpu"] {
  const c = components.find(
    (x) => (feature(x) === "CPU" || x.code.startsWith("C-CPU") || /_CPU_/i.test(x.code)) && !isNone(x),
  );
  if (!c) return null;
  // Prefer the human-readable "@ 3.1GHz" form; the raw SKU can glue a version
  // like "..._CPU___3_1GHz" that would otherwise misparse to 1 GHz.
  const ghz = c.description.match(/@\s*([\d.]+)\s*GHz/i) ?? c.description.match(/([\d]+\.[\d]+)\s*GHz/i);
  const coreMatch = c.description.match(/([\d]+)[ -]?core/i);
  const watts = c.description.match(/([\d]+)\s*W\b/i);
  const socketsPerNode = c.qtyPerNode ?? 1;

  let coresPerCpu = coreMatch ? Number(coreMatch[1]) : null;
  // OEM exports rarely spell out cores; derive from cluster capacity when we can.
  if (coresPerCpu == null && ctx.cores && ctx.nodes && socketsPerNode) {
    const derived = ctx.cores / ctx.nodes / socketsPerNode;
    if (Number.isFinite(derived) && derived > 0) coresPerCpu = Math.round(derived);
  }

  return {
    code: c.code,
    model: cpuModelFromDescription(c.description) ?? c.code.replace(/^C-CPU-/, "Xeon "),
    ghz: ghz ? Number(ghz[1]) : null,
    coresPerCpu,
    watts: watts ? Number(watts[1]) : null,
    socketsPerNode,
  };
}

function parseMemory(components: SizerComponent[]): NodeModel["memory"] {
  const c = components.find(
    (x) =>
      (feature(x) === "RAM" || feature(x) === "MEMORY" || x.code.startsWith("C-MEM") || /_MEMORY_/i.test(x.code)) &&
      !isNone(x),
  );
  if (!c) return null;
  const mod = c.description.match(/([\d]+)\s*GB/i);
  const moduleGiB = mod ? Number(mod[1]) : null;
  const modulesPerNode = c.qtyPerNode ?? 0;

  // OEM lines report the total memory per node ("768GB Memory", qty 1) rather
  // than a module size × count, so treat the GB figure as the per-node total.
  const isOemTotal = feature(c) === "RAM" || /_MEMORY_/i.test(c.code);
  if (isOemTotal && moduleGiB != null) {
    return { moduleGiB: null, modulesPerNode: modulesPerNode || 1, perNodeGiB: moduleGiB };
  }

  return {
    moduleGiB,
    modulesPerNode,
    perNodeGiB: moduleGiB != null && modulesPerNode ? moduleGiB * modulesPerNode : moduleGiB,
  };
}

function parseDrives(components: SizerComponent[]): NodeModel["drives"] {
  const out: NodeModel["drives"] = [];
  for (const c of components) {
    const fn = feature(c);
    const isNvme = c.code.startsWith("C-NVM") || fn === "NVME" || /_NVME?_/i.test(c.code);
    const isSsd = c.code.startsWith("C-SSD") || fn === "SSD";
    const isHdd = c.code.startsWith("C-HDD") || fn === "HDD";
    if (!(isNvme || isSsd || isHdd)) continue;
    // Skip NONE placeholders -- e.g. external-storage builds carry no internal drives.
    if (isNone(c)) continue;
    const size = c.description.match(/([\d.]+)\s*TB/i);
    out.push({
      code: c.code,
      kind: isNvme ? "NVMe" : isSsd ? "SSD" : "HDD",
      sizeTB: size ? Number(size[1]) : null,
      perNode: c.qtyPerNode ?? 0,
    });
  }
  return out;
}

function parseNic(components: SizerComponent[]): string | null {
  const nics = components.filter(
    (x) => (x.code.startsWith("C-NIC") || feature(x) === "NETWORK" || feature(x) === "NETWORKING") && !isNone(x),
  );
  if (!nics.length) return null;
  return nics.map((n) => `${n.qtyPerNode ?? 1}× ${n.description.replace(/^C-NIC-\S+\s*/, "")}`.trim()).join(", ");
}

function parseGpu(components: SizerComponent[]): string | null {
  const g = components.find((x) => (x.code.startsWith("C-GPU") || feature(x) === "GPU") && !isNone(x));
  return g ? g.description : null;
}

function parseBlocks(blockInfo: unknown[], ctx: ClusterContext = {}): NodeModel[] {
  const models: NodeModel[] = [];
  for (const b of blockInfo) {
    if (!isObj(b)) continue;
    const sku = strOf(b.blockSKU) ?? strOf(b.blockSKUWithFiveDigitCode);
    if (!sku) continue;
    const blocks = numOf(b.count) ?? 0;
    const nodesInBlock = numOf(b.nodesInBlock) ?? 1;
    const components = parseComponents(asArr(b.components));
    models.push({
      sku,
      blocks,
      nodesInBlock,
      nodes: blocks * nodesInBlock,
      cpu: parseCpu(components, ctx),
      memory: parseMemory(components),
      drives: parseDrives(components),
      nic: parseNic(components),
      gpu: parseGpu(components),
      components,
    });
  }
  return models;
}

// Map an array display name / vendor code to a normalized vendor label.
function normalizeStorageVendor(...hints: (string | null)[]): string | null {
  const hay = hints.filter(Boolean).join(" ");
  if (/pure|flasharray|flashblade/i.test(hay)) return "Pure Storage";
  if (/powerstore|dell|powermax|unity/i.test(hay)) return "Dell PowerStore";
  return null;
}

// Detect an external storage array from a cluster's summary + externalStorageData.
function parseExternalStorage(raw: Record<string, unknown>): ExternalStorageInfo | null {
  const ssw = isObj(raw.sizingSummaryWrapper) ? raw.sizingSummaryWrapper : {};
  const cs = isObj(ssw.currentSummary) ? ssw.currentSummary : {};
  const summary = isObj(cs.externalStorageSummary) ? cs.externalStorageSummary : null;
  const esd = isObj(raw.externalStorageData) ? raw.externalStorageData : {};
  const sizing = isObj(esd.sizing) ? esd.sizing : {};

  const arrayDisplayName = summary ? strOf(summary.arrayDisplayName) : null;
  const productFamily = strOf(sizing.productFamily);
  const vendorCode = strOf(sizing.vendorCode);
  if (!arrayDisplayName && !productFamily) return null;

  return {
    arrayDisplayName,
    productFamily,
    vendorCode,
    vendor: normalizeStorageVendor(arrayDisplayName, productFamily, vendorCode),
  };
}

function parseLicense(cblInfo: unknown[]): ProposalCluster["license"] {
  for (const q of cblInfo) {
    if (!isObj(q)) continue;
    const comps = parseComponents(asArr(q.components));
    const sw = comps.find((c) => /^SW-NCI/i.test(c.code));
    if (!sw) continue;
    const term = comps.find((c) => /Term-Months/i.test(c.code) || /Term in months/i.test(c.description));
    const edition = /ULT/i.test(sw.code) ? "Ultimate" : /PRO/i.test(sw.code) ? "Pro" : /STARTER|STR/i.test(sw.code) ? "Starter" : "NCI";
    return { edition, cores: sw.totalQty, termMonths: term?.totalQty ?? null };
  }
  return null;
}

function parseCapacity(cap: unknown): ProposalCluster["capacity"] {
  const c = isObj(cap) ? cap : {};
  return {
    cores: round(numOf(c.cores) ?? 0, 0),
    ramGiB: round(numOf(c.ram) ?? 0, 0),
    ssdTiB: round(numOf(c.ssd) ?? 0),
    hddTiB: round(numOf(c.hdd) ?? 0),
  };
}

function parseCluster(raw: unknown): ProposalCluster | null {
  if (!isObj(raw)) return null;
  const name = strOf(raw.name) ?? "Cluster";
  const ml = isObj(raw.modelAndLicenseDetails) ? raw.modelAndLicenseDetails : {};
  const capacity = parseCapacity(raw.capacitySummary);
  // Count nodes up front so parseCpu can derive OEM core counts from capacity.
  const blockInfo = asArr(ml.blockBudgetaryQuoteInfo);
  const nodeCount = blockInfo.reduce<number>((sum, b) => {
    if (!isObj(b)) return sum;
    return sum + (numOf(b.count) ?? 0) * (numOf(b.nodesInBlock) ?? 1);
  }, 0);
  const models = parseBlocks(blockInfo, { cores: capacity.cores, nodes: nodeCount });
  const license = parseLicense(asArr(ml.cblBudgetaryQuoteInfo));
  const nodes = models.reduce((sum, m) => sum + m.nodes, 0);

  // Utilization + failover live under sizingSummaryWrapper.currentSummary.
  const ssw = isObj(raw.sizingSummaryWrapper) ? raw.sizingSummaryWrapper : {};
  const cs = isObj(ssw.currentSummary) ? ssw.currentSummary : {};
  const ud = isObj(cs.utilizationDetails) ? cs.utilizationDetails : {};
  const cur = isObj(ud.currentUtilizations) ? ud.currentUtilizations : {};
  const fo = isObj(cs.failoverCapacities) ? cs.failoverCapacities : {};
  const overall = isObj(fo.overall) ? fo.overall : {};

  return {
    name,
    solutionType: strOf(raw.solutionType),
    nodes,
    capacity,
    externalStorage: parseExternalStorage(raw),
    utilization: {
      cpu: numOf(cur.cpu),
      ram: numOf(cur.ram),
      storage: numOf(cur.ssd) ?? numOf(cur.hdd),
    },
    failover: {
      nMinus1: numOf(overall.utilizationPercentageForNminus1),
      nMinus2: numOf(overall.utilizationPercentageForNminus2),
    },
    models,
    license,
  };
}

/** Parse a raw Nutanix Sizer JSON export into a curated ProposalScenario. */
export function parseSizerScenario(raw: unknown): ProposalScenario {
  if (!isObj(raw) || !Array.isArray(raw.clusters) || !isObj(raw.scenario)) {
    throw new Error(
      "This doesn't look like a Nutanix Sizer scenario export. Export the scenario JSON from sizer.nutanix.com (Scenario → Export → JSON) and upload that file.",
    );
  }
  const scenario = raw.scenario;
  const details = isObj(scenario.details) ? scenario.details : {};

  const clusters = (raw.clusters as unknown[]).map(parseCluster).filter((c): c is ProposalCluster => c !== null);
  if (!clusters.length) {
    throw new Error("The Sizer export was read, but it contains no clusters with hardware. Re-export after the scenario is sized.");
  }

  const totalCap = parseCapacity(scenario.capacitySummary);
  const totalNodes = clusters.reduce((s, c) => s + c.nodes, 0);
  const sizing = isObj(scenario.sizingDetails) ? scenario.sizingDetails : {};
  const wr = isObj(sizing.workloadsRawData) ? sizing.workloadsRawData : {};
  const wTotal = isObj(wr.total) ? wr.total : {};

  const created = numOf(details.createdDate);

  return {
    source: "nutanix_sizer",
    meta: {
      customer: strOf(details.sfdcAccountName) ?? strOf(details.envName) ?? "Customer",
      environmentName: strOf(details.envName) ?? "Sizing Scenario",
      opportunityName: strOf(details.opportunityName),
      se: strOf(details.owner) ?? strOf(details.login) ?? "Nutanix SE",
      seEmail: strOf(details.login),
      installCountry: strOf(details.installCountry),
      sizerVersion: strOf(details.sizerClientBuild),
      permalink: strOf(details.permalink),
      createdDate: created ? new Date(created).toISOString().slice(0, 10) : null,
    },
    totals: {
      clusters: clusters.length,
      nodes: totalNodes,
      cores: totalCap.cores,
      ramGiB: totalCap.ramGiB,
      ssdTiB: totalCap.ssdTiB,
      hddTiB: totalCap.hddTiB,
      vmCount: numOf(wTotal.vmCount),
      vCpus: numOf(wTotal.vCpus),
    },
    clusters,
    externalStorage: clusters.find((c) => c.externalStorage)?.externalStorage ?? null,
  };
}
