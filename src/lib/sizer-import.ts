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
  qtyPerNode: number | null;
  totalQty: number | null;
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
      qtyPerNode: numOf(c.qtyPerNode),
      totalQty: numOf(c.totalQtyAcrossBlocks) ?? numOf(c.qty),
    });
  }
  return out;
}

function parseCpu(components: SizerComponent[]): NodeModel["cpu"] {
  const c = components.find((x) => x.code.startsWith("C-CPU") && !/NONE/i.test(x.code));
  if (!c) return null;
  const ghz = c.description.match(/([\d.]+)\s*GHz/i);
  const cores = c.description.match(/([\d]+)[ -]core/i);
  const watts = c.description.match(/([\d]+)\s*W\b/i);
  const model = c.description.match(/Intel Xeon\s+\S+|AMD EPYC\s+\S+/i);
  return {
    code: c.code,
    model: model ? model[0] : c.code.replace(/^C-CPU-/, "Xeon "),
    ghz: ghz ? Number(ghz[1]) : null,
    coresPerCpu: cores ? Number(cores[1]) : null,
    watts: watts ? Number(watts[1]) : null,
    socketsPerNode: c.qtyPerNode ?? 1,
  };
}

function parseMemory(components: SizerComponent[]): NodeModel["memory"] {
  const c = components.find((x) => x.code.startsWith("C-MEM") && !/NONE/i.test(x.code));
  if (!c) return null;
  const mod = c.description.match(/([\d]+)\s*GB/i);
  const moduleGiB = mod ? Number(mod[1]) : null;
  const modulesPerNode = c.qtyPerNode ?? 0;
  return {
    moduleGiB,
    modulesPerNode,
    perNodeGiB: moduleGiB != null && modulesPerNode ? moduleGiB * modulesPerNode : null,
  };
}

function parseDrives(components: SizerComponent[]): NodeModel["drives"] {
  const out: NodeModel["drives"] = [];
  for (const c of components) {
    const isNvme = c.code.startsWith("C-NVM");
    const isSsd = c.code.startsWith("C-SSD");
    const isHdd = c.code.startsWith("C-HDD");
    if (!(isNvme || isSsd || isHdd)) continue;
    if (/NONE/i.test(c.code)) continue;
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
  const nics = components.filter((x) => x.code.startsWith("C-NIC") && !/NONE/i.test(x.code));
  if (!nics.length) return null;
  return nics.map((n) => `${n.qtyPerNode ?? 1}× ${n.description.replace(/^C-NIC-\S+\s*/, "")}`.trim()).join(", ");
}

function parseGpu(components: SizerComponent[]): string | null {
  const g = components.find((x) => x.code.startsWith("C-GPU") && !/NONE/i.test(x.code));
  return g ? g.description : null;
}

function parseBlocks(blockInfo: unknown[]): NodeModel[] {
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
      cpu: parseCpu(components),
      memory: parseMemory(components),
      drives: parseDrives(components),
      nic: parseNic(components),
      gpu: parseGpu(components),
      components,
    });
  }
  return models;
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
  const models = parseBlocks(asArr(ml.blockBudgetaryQuoteInfo));
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
    capacity: parseCapacity(raw.capacitySummary),
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
  };
}
