import type { NodeModel, ProposalCluster, ProposalScenario } from "@/lib/sizer-import";
import { editionFromLicense, type EditionKey } from "@/lib/nci-editions";
import { isBasePlatform, LICENSE_CATALOG, newLicenseLine, type LicenseLine } from "@/lib/license-catalog";
import type { ProductKey } from "@/lib/nutanix-icons";

export type { LicenseLine } from "@/lib/license-catalog";

// The editable Proposal document. buildProposalDoc() turns a parsed Sizer
// scenario into an on-brand proposal with sensible, fully-editable defaults.
// The same document drives both the web preview, the 2-page PDF (mini-TCO
// "Solution Brief"), and the BOM .pptx exporter — mirroring the QBR pattern
// where preview and export share one model.

export type Contact = { name: string; title: string; email: string; phone: string };

export type ChallengeGroups = {
  technical: string[];
  operational: string[];
  financial: string[];
};

export type TimelineMilestone = { label: string; done?: boolean };

// One aggregated hardware line for the Solution Summary rollup.
export type HardwareRollupLine = {
  sku: string;
  nodes: number;
  cpuSummary: string;
  cores: number;
  ramGiB: number;
  rawStorageTB: number;
};

export type HardwareVendor = "Nutanix" | "Dell" | "Cisco" | "HPE" | "Lenovo" | "Pure" | "Fujitsu";

// External storage arrays Nutanix compute can run against (NVMe/TCP). Pure is
// the most common, with Dell PowerStore also supported.
export type ExternalStorageVendor = "Pure Storage" | "Dell PowerStore";
export const EXTERNAL_STORAGE_VENDORS: ExternalStorageVendor[] = ["Pure Storage", "Dell PowerStore"];

// One proposed hardware build. A deal often puts two or three of these in front
// of a customer -- the same workload sized on NX versus an OEM platform, or a
// distributed build versus a consolidated one -- each arriving as its own Sizer
// JSON export. Exactly one option is `recommended`; that option's scenario is
// mirrored into `doc.scenario`, which remains the single source the narrative,
// rollups and two-pager read from.
export type HardwareOption = {
  id: string;
  label: string; // "Option A" — positional, reassigned on add/remove
  name: string; // editable display name, e.g. "Nutanix NX-8170-G10"
  vendor: HardwareVendor;
  sourceFile: string | null; // the uploaded filename, for provenance
  recommended: boolean;
  scenario: ProposalScenario;
};

export type ProposalDoc = {
  meta: {
    customer: string;
    title: string;
    preparedBy: string;
    dateLabel: string;
    opportunityName: string | null;
    installCountry: string | null;
    supportTerm: string;
    // NCI software edition for the licensing slides (auto-detected, overridable).
    edition: EditionKey;
    vendor: HardwareVendor;
  };
  options: {
    includeSoftwareSlides: boolean; // full NCI editions comparison + support
    // Render a licensing page for every product in the portfolio rather than
    // only the ones this design licenses.
    includeAllLicensingPages: boolean;
    // External-storage deal: positions the design as Nutanix compute (AHV/NCI)
    // running against an external enterprise array, which reframes the copy.
    externalStorage: boolean;
    externalStorageVendor: ExternalStorageVendor;
  };
  // Always at least one entry. doc.scenario mirrors the recommended option.
  hardwareOptions: HardwareOption[];
  contacts: Contact[];
  executiveSummary: string;
  challengesIntro: string;
  challenges: ChallengeGroups;
  benefitsIntro: string;
  benefits: ChallengeGroups;
  currentState: string[];
  proposedState: string[];
  timeline: TimelineMilestone[];
  // Software scope: which products/editions the design includes and the quantity
  // to license. Scope only -- pricing lives in a separate quote.
  licensing: {
    termYears: number;
    lines: LicenseLine[];
  };
  scenario: ProposalScenario;
};

/** Products the design includes that have a brand icon, deduped, stable order. */
export function purchasedProducts(doc: ProposalDoc): ProductKey[] {
  const order: ProductKey[] = ["CloudInfrastructure", "CloudManager", "NUS", "Database", "NAI", "NKP", "Prism", "NC2"];
  const have = new Set(doc.licensing.lines.map((l) => l.product));
  return order.filter((p) => have.has(p));
}

/** The single base-platform license line (NCI or EUC), if present. */
export function basePlatformLine(doc: ProposalDoc): LicenseLine | null {
  return doc.licensing.lines.find((l) => isBasePlatform(l.product)) ?? null;
}

/** Human label for the base platform, e.g. "NCI Pro" or "EUC Ultimate". */
export function basePlatformLabel(doc: ProposalDoc): string {
  const base = basePlatformLine(doc);
  if (!base) return `NCI ${doc.meta.edition}`;
  return `${LICENSE_CATALOG[base.product].label} ${base.tier}`;
}

const todayLabel = () =>
  new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

// Concise procurement-to-go-live path. Kept short so page 2 stays clean; the SE
// can add milestones inline if a deal needs more detail.
export const DEFAULT_TIMELINE: TimelineMilestone[] = [
  { label: "Purchase Order" },
  { label: "Hardware Delivered" },
  { label: "Implementation Complete" },
  { label: "Migration Complete" },
  { label: "Go Live" },
];

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
const tib = (n: number) => `${n.toFixed(2)} TiB`;

// TiB → TB (decimal) for the marketing-facing "usable capacity" rollup.
const tibToTb = (tib: number) => tib * 1.099511627776;

/** Per-model node specs aggregated across the whole scenario, for the rollup. */
export function hardwareRollup(scenario: ProposalScenario): HardwareRollupLine[] {
  const bySku = new Map<string, { nodes: number; cores: number; ramGiB: number; rawTB: number; cpu: string }>();
  for (const cluster of scenario.clusters) {
    for (const m of cluster.models) {
      const cores = nodeCores(m) * m.nodes;
      const ram = (m.memory?.perNodeGiB ?? 0) * m.nodes;
      const rawTB = nodeRawStorageTB(m) * m.nodes;
      const cpu = cpuSummary(m);
      const prev = bySku.get(m.sku);
      if (prev) {
        prev.nodes += m.nodes;
        prev.cores += cores;
        prev.ramGiB += ram;
        prev.rawTB += rawTB;
      } else {
        bySku.set(m.sku, { nodes: m.nodes, cores, ramGiB: ram, rawTB, cpu });
      }
    }
  }
  return [...bySku.entries()].map(([sku, v]) => ({
    sku,
    nodes: v.nodes,
    cpuSummary: v.cpu,
    cores: v.cores,
    ramGiB: v.ramGiB,
    rawStorageTB: v.rawTB,
  }));
}

export function nodeCores(m: NodeModel): number {
  if (!m.cpu?.coresPerCpu) return 0;
  return m.cpu.coresPerCpu * (m.cpu.socketsPerNode || 1);
}

export function nodeRawStorageTB(m: NodeModel): number {
  return m.drives.reduce((sum, d) => sum + (d.sizeTB ?? 0) * d.perNode, 0);
}

export function cpuSummary(m: NodeModel): string {
  if (!m.cpu) return "N/A";
  const parts = [`${m.cpu.socketsPerNode}×`, m.cpu.model];
  if (m.cpu.coresPerCpu) parts.push(`(${m.cpu.coresPerCpu}-core`);
  if (m.cpu.ghz) parts.push(`@ ${m.cpu.ghz} GHz)`);
  else if (m.cpu.coresPerCpu) parts[parts.length - 1] += ")";
  return parts.join(" ");
}

export function memorySummary(m: NodeModel): string {
  if (!m.memory?.perNodeGiB) return "N/A";
  return `${m.memory.modulesPerNode}× ${m.memory.moduleGiB} GB (${fmtInt(m.memory.perNodeGiB)} GB/node)`;
}

export function storageSummary(m: NodeModel): string {
  if (!m.drives.length) return "N/A";
  return m.drives
    .map((d) => `${d.perNode}× ${d.sizeTB} TB ${d.kind}`)
    .join(" + ");
}

/**
 * Print a utilization percentage at a single, declared precision: one decimal,
 * with a trailing ".0" trimmed. Sizer reports figures like 61.43076923076923,
 * so interpolating the raw number produces a nonsense label, and rounding to a
 * whole number quietly misstates the design.
 */
export function formatPct(pct: number): string {
  return pct.toFixed(1).replace(/\.0$/, "");
}

// One row of the cluster capacity block: what was sized, and how much of it the
// workload consumes.
export type CapacityRow = {
  label: string;
  value: string;
  pct: number | null; // raw, unrounded — drives the bar width
  pctLabel: string | null; // rendered percentage, e.g. "61.4%"
  detail: string | null; // per-tier breakdown, when the blend hides detail
};

/**
 * The canonical CPU / memory / storage rows for a cluster. The preview and the
 * .pptx exporter both read this, so the two can never disagree about either the
 * number or the way it is phrased.
 */
export function capacityRows(c: ProposalCluster): CapacityRow[] {
  const u = c.utilization;
  const usableTiB = c.capacity.ssdTiB + c.capacity.hddTiB;

  // Show the tier split only when both tiers carry capacity — otherwise the
  // blended figure is simply the one tier's number and a breakdown adds noise.
  const hybrid = c.capacity.ssdTiB > 0 && c.capacity.hddTiB > 0 && u.ssd != null && u.hdd != null;
  const storageDetail = hybrid
    ? `Flash ${formatPct(u.ssd as number)}% of ${tib(c.capacity.ssdTiB)} · HDD ${formatPct(u.hdd as number)}% of ${tib(c.capacity.hddTiB)}`
    : null;

  const row = (label: string, value: string, pct: number | null, detail: string | null = null): CapacityRow => ({
    label,
    value,
    pct,
    pctLabel: pct == null ? null : `${formatPct(pct)}%`,
    detail,
  });

  return [
    row("CPU Cores", fmtInt(c.capacity.cores), u.cpu),
    row("Memory", `${fmtInt(c.capacity.ramGiB)} GB`, u.ram),
    row("Usable Storage", tib(usableTiB), u.storage, storageDetail),
  ];
}

function clusterSummaryLine(c: ProposalCluster): string {
  const skus = c.models.map((m) => `${m.nodes}× ${m.sku}`).join(" + ");
  return `${c.name}: ${skus} · ${fmtInt(c.capacity.cores)} cores, ${fmtInt(c.capacity.ramGiB)} GB RAM, ${tib(c.capacity.ssdTiB + c.capacity.hddTiB)} usable`;
}

/** Infer the hardware vendor from the SKUs / OEM in the scenario. */
export function detectVendor(scenario: ProposalScenario): HardwareVendor {
  const skus = scenario.clusters.flatMap((c) => c.models.map((m) => m.sku.toUpperCase())).join(" ");
  if (/\bNX-/.test(skus)) return "Nutanix";
  if (/\bXC|DELL|POWEREDGE/.test(skus)) return "Dell";
  if (/\bUCS|CISCO|HX\b/.test(skus)) return "Cisco";
  if (/\bDX|HPE|PROLIANT|DL\d/.test(skus)) return "HPE";
  if (/\bHX-|LENOVO|THINKAGILE/.test(skus)) return "Lenovo";
  if (/\bFUJITSU|PRIMERGY/.test(skus)) return "Fujitsu";
  return "Nutanix";
}

/** Pick the predominant NCI edition across clusters. */
function detectEdition(scenario: ProposalScenario): EditionKey {
  const counts = new Map<EditionKey, number>();
  for (const c of scenario.clusters) {
    const e = editionFromLicense(c.license?.edition);
    counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  let best: EditionKey = "Pro";
  let max = -1;
  for (const [e, n] of counts) if (n > max) ((max = n), (best = e));
  return best;
}

// The customer-facing narrative blocks, derived from the scenario and the deal
// mode. Kept separate so toggling the deal type can regenerate the copy.
type ProposalNarrative = {
  title: string;
  executiveSummary: string;
  challengesIntro: string;
  challenges: ChallengeGroups;
  benefitsIntro: string;
  benefits: ChallengeGroups;
  currentState: string[];
  proposedState: string[];
};

// First cluster with known post-node-failure capacity headroom, as a short
// factual clause. Some exports (notably a few OEM/Sizer builds) omit this
// field -- omit the clause rather than print a hole where a number should be.
function failoverClause(scenario: ProposalScenario): string {
  const pct = scenario.clusters.find((c) => c.failover.nMinus1 != null)?.failover.nMinus1;
  return pct == null ? "" : ` Retains ~${Math.round(pct)}% capacity after a single node failure.`;
}

export function proposalNarrative(
  scenario: ProposalScenario,
  externalStorage: boolean,
  storageVendor: ExternalStorageVendor = "Pure Storage",
): ProposalNarrative {
  const t = scenario.totals;
  const customer = scenario.meta.customer;
  const clusterLine = scenario.clusters.length === 1 ? "a single cluster" : `${t.clusters} clusters`;
  const usable = tib(t.ssdTiB + t.hddTiB);

  if (externalStorage) {
    return {
      title: `Nutanix with External Storage Proposal for ${customer}`,
      executiveSummary:
        `${customer}: ${fmtInt(t.nodes)} Nutanix compute nodes across ${clusterLine} running AHV, ` +
        `sized for ${fmtInt(t.cores)} CPU cores and ${fmtInt(t.ramGiB)} GB memory. Primary storage stays on the ` +
        `existing ${storageVendor} array, connected over NVMe/TCP. Compute and storage scale independently, so ` +
        `each is refreshed and sized on its own schedule.`,
      challengesIntro: "Current setup:",
      challenges: {
        technical: ["Compute refresh is tied to the storage array (and vice versa)", "Hypervisor licensing scales with compute", `${storageVendor} capacity is underutilized by the current stack`],
        operational: ["Compute and storage are managed in separate tools", "Manual work required for routine infrastructure tasks"],
        financial: ["Hypervisor and maintenance costs scale with node count", "Refresh cycles force a combined compute + storage buy"],
      },
      benefitsIntro: `Proposed design:`,
      benefits: {
        technical: ["AHV runs on Nutanix compute against the external array over NVMe/TCP", "Compute and storage scale independently", "Existing array's data services stay in place"],
        operational: ["Compute and VMs managed from one place in Prism", "Nodes added non-disruptively"],
        financial: [`${storageVendor} investment reused, not replaced`, "AHV included -- no separate hypervisor license", "Subscription-term pricing"],
      },
      currentState: ["Compute and storage refresh locked together", "Hypervisor cost scales with every node", "Compute and storage cannot be sized independently"],
      proposedState: [
        `${fmtInt(t.nodes)} Nutanix compute nodes, AHV included`,
        `Primary storage stays on ${storageVendor}`,
        "Compute and storage sized and refreshed independently",
      ],
    };
  }

  return {
    title: `Nutanix Solution Proposal for ${customer}`,
    executiveSummary:
      `${customer}: ${fmtInt(t.nodes)} nodes across ${clusterLine} on Nutanix Cloud Infrastructure (NCI) with AHV -- ` +
      `${fmtInt(t.cores)} CPU cores, ${fmtInt(t.ramGiB)} GB memory, ${usable} usable capacity.` +
      failoverClause(scenario) +
      ` One system for compute and storage; capacity is added by adding a node.`,
    challengesIntro: "Current setup:",
    challenges: {
      technical: ["Hardware is aging and approaching end of support", "Compute and storage are scaled separately", "DR/replication coverage is inconsistent across workloads"],
      operational: ["Manual work required for routine infrastructure tasks", "Sites are managed inconsistently"],
      financial: ["Maintenance and licensing costs scale independently", "Refresh and expansion costs are hard to forecast"],
    },
    benefitsIntro: "Proposed design:",
    benefits: {
      technical: ["Upgrades and lifecycle management are one-click", "Compression, dedup, and erasure coding included, no add-on license", "Snapshots and async/sync DR included"],
      operational: ["Entire estate managed from one place in Prism Central", "Capacity added by adding a node, no downtime"],
      financial: ["Software consolidated under one NCI edition", "Subscription-term pricing"],
    },
    currentState: ["Limited headroom for growth", "Inconsistent DR/replication coverage", "Recovery time exceeds target"],
    proposedState: [
      `${fmtInt(t.nodes)} nodes, ${usable} usable capacity`,
      "Every VM covered by DR/replication",
      "Recovery time reduced",
    ],
  };
}

/** Re-apply mode-specific copy to a doc (used when the deal-type toggle flips). */
export function applyDealMode(
  doc: ProposalDoc,
  externalStorage: boolean,
  storageVendor: ExternalStorageVendor = doc.options?.externalStorageVendor ?? "Pure Storage",
): ProposalDoc {
  const n = proposalNarrative(doc.scenario, externalStorage, storageVendor);
  return {
    ...doc,
    meta: { ...doc.meta, title: n.title },
    options: { ...doc.options, externalStorage, externalStorageVendor: storageVendor },
    executiveSummary: n.executiveSummary,
    challengesIntro: n.challengesIntro,
    challenges: n.challenges,
    benefitsIntro: n.benefitsIntro,
    benefits: n.benefits,
    currentState: n.currentState,
    proposedState: n.proposedState,
  };
}

/** Map a detected external-storage vendor string to a supported deal vendor. */
function detectExternalStorageVendor(scenario: ProposalScenario): ExternalStorageVendor | null {
  const v = scenario.externalStorage?.vendor ?? null;
  if (v && (EXTERNAL_STORAGE_VENDORS as string[]).includes(v)) return v as ExternalStorageVendor;
  // Fall back to name sniffing when the vendor wasn't normalized upstream.
  const hay = [scenario.externalStorage?.arrayDisplayName, scenario.externalStorage?.productFamily]
    .filter(Boolean)
    .join(" ");
  if (/pure|flasharray|flashblade/i.test(hay)) return "Pure Storage";
  if (/powerstore|dell|powermax|unity/i.test(hay)) return "Dell PowerStore";
  return null;
}

/** Build a ready-to-edit proposal with defaults derived from the scenario. */
export function buildProposalDoc(scenario: ProposalScenario, sourceFile: string | null = null): ProposalDoc {
  const t = scenario.totals;

  // Auto-detect an external-storage build (e.g. Nutanix compute + Pure FlashArray)
  // so the copy, vendor logo, and deal framing default correctly on import.
  const externalStorageDetected = scenario.externalStorage != null;
  const detectedVendor = detectExternalStorageVendor(scenario) ?? "Pure Storage";
  const n = proposalNarrative(scenario, externalStorageDetected, detectedVendor);

  // External-storage designs are licensed with NCI Compute (NCI-C); everything
  // else uses the standard NCI base platform. Clamp the detected edition to the
  // tiers the chosen base platform actually offers.
  const detectedEdition = detectEdition(scenario);
  const baseProduct = externalStorageDetected ? "ComputeInfrastructure" : "CloudInfrastructure";
  const baseTier = LICENSE_CATALOG[baseProduct].tiers.includes(detectedEdition) ? detectedEdition : "Pro";

  const built: ProposalDoc = {
    meta: {
      customer: scenario.meta.customer,
      title: n.title,
      preparedBy: scenario.meta.se,
      dateLabel: todayLabel(),
      opportunityName: scenario.meta.opportunityName,
      installCountry: scenario.meta.installCountry,
      supportTerm: "3 Years, Production Support",
      edition: detectEdition(scenario),
      vendor: detectVendor(scenario),
    },
    options: {
      includeSoftwareSlides: true,
      includeAllLicensingPages: false,
      externalStorage: externalStorageDetected,
      externalStorageVendor: detectedVendor,
    },
    contacts: [
      { name: scenario.meta.se, title: "Systems Engineer", email: scenario.meta.seEmail ?? "", phone: "" },
      { name: "", title: "Account Executive", email: "", phone: "" },
    ],
    executiveSummary: n.executiveSummary,
    challengesIntro: n.challengesIntro,
    challenges: n.challenges,
    benefitsIntro: n.benefitsIntro,
    benefits: n.benefits,
    currentState: n.currentState,
    proposedState: n.proposedState,
    timeline: DEFAULT_TIMELINE.map((m) => ({ ...m })),
    licensing: {
      termYears: 3,
      lines: [newLicenseLine(baseProduct, { tier: baseTier, qty: Math.round(t.cores) })],
    },
    hardwareOptions: [newHardwareOption(scenario, 0, sourceFile, true)],
    scenario,
  };
  return built;
}

// --- multiple hardware options ----------------------------------------------

/** Positional label for an option: 0 -> "Option A". Wraps past 26 as "Option AA". */
export function optionLabel(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Option ${s}`;
}

/**
 * Readable default name for an option. Naming every SKU stops being useful past
 * a couple of models, so a mixed build is described by its shape instead. The
 * SE can rename it; the full model list is on the comparison slide regardless.
 */
export function defaultOptionName(scenario: ProposalScenario): string {
  const skus = [...new Set(scenario.clusters.flatMap((c) => c.models.map((m) => m.sku)))];
  const vendor = detectVendor(scenario);
  if (!skus.length) return `${vendor} platform`;
  if (skus.length <= 2) return `${vendor} ${skus.join(" + ")}`;
  return `${vendor} mixed build · ${skus.length} models, ${fmtInt(scenario.totals.nodes)} nodes`;
}

let optionCounter = 0;
export function newHardwareOption(
  scenario: ProposalScenario,
  index: number,
  sourceFile: string | null = null,
  recommended = false,
): HardwareOption {
  return {
    id: `hw_${Date.now().toString(36)}_${(optionCounter++).toString(36)}`,
    label: optionLabel(index),
    name: defaultOptionName(scenario),
    vendor: detectVendor(scenario),
    sourceFile,
    recommended,
    scenario,
  };
}

/** The recommended option, falling back to the first when a doc is hand-edited. */
export function recommendedOption(doc: ProposalDoc): HardwareOption | null {
  if (!doc.hardwareOptions?.length) return null;
  return doc.hardwareOptions.find((o) => o.recommended) ?? doc.hardwareOptions[0];
}

// Keep labels positional (A, B, C...) and guarantee exactly one recommendation.
function normalizeOptions(options: HardwareOption[]): HardwareOption[] {
  const hasRecommended = options.some((o) => o.recommended);
  return options.map((o, i) => ({
    ...o,
    label: optionLabel(i),
    recommended: hasRecommended ? o.recommended : i === 0,
  }));
}

// Mirror the recommended option into the fields derived from a single scenario,
// so the narrative, rollups and per-core licensing quantity all describe the
// build the customer is actually being pointed at.
function syncToRecommended(doc: ProposalDoc): ProposalDoc {
  const rec = recommendedOption(doc);
  if (!rec) return doc;
  const previousCores = Math.round(doc.scenario.totals.cores);
  doc.scenario = rec.scenario;
  doc.meta.vendor = rec.vendor;

  // Re-quantify the base platform against the new build. Editions and add-on
  // quantities are deliberate SE choices, so they are left alone; the base
  // per-core count is a direct function of the hardware and would otherwise go
  // stale the moment the recommendation changes.
  const base = doc.licensing.lines.find((l) => isBasePlatform(l.product));
  if (base && base.qty === previousCores) base.qty = Math.round(rec.scenario.totals.cores);
  return doc;
}

/** Append a parsed scenario as a new option. The first upload stays recommended. */
export function addHardwareOption(doc: ProposalDoc, scenario: ProposalScenario, sourceFile: string | null): ProposalDoc {
  const existing = doc.hardwareOptions ?? [];
  const next = [...existing, newHardwareOption(scenario, existing.length, sourceFile, existing.length === 0)];
  doc.hardwareOptions = normalizeOptions(next);
  return syncToRecommended(doc);
}

/** Remove an option. Removing the recommended one promotes the first remaining. */
export function removeHardwareOption(doc: ProposalDoc, id: string): ProposalDoc {
  const remaining = (doc.hardwareOptions ?? []).filter((o) => o.id !== id);
  if (!remaining.length) return doc; // a proposal always describes some hardware
  if (!remaining.some((o) => o.recommended)) remaining[0] = { ...remaining[0], recommended: true };
  doc.hardwareOptions = normalizeOptions(remaining);
  return syncToRecommended(doc);
}

/** Point the proposal at a different option. */
export function setRecommendedOption(doc: ProposalDoc, id: string): ProposalDoc {
  doc.hardwareOptions = (doc.hardwareOptions ?? []).map((o) => ({ ...o, recommended: o.id === id }));
  return syncToRecommended(doc);
}

// One row of the side-by-side option comparison.
export type OptionComparisonMetric = {
  label: string;
  /** Values positionally aligned with doc.hardwareOptions. */
  values: string[];
};

/** Metrics table for the "Hardware Options" comparison slide. */
export function optionComparison(doc: ProposalDoc): OptionComparisonMetric[] {
  const opts = doc.hardwareOptions ?? [];
  const metric = (label: string, pick: (o: HardwareOption) => string): OptionComparisonMetric => ({
    label,
    values: opts.map(pick),
  });
  return [
    metric("Platform", (o) => o.name),
    metric("Clusters", (o) => fmtInt(o.scenario.totals.clusters)),
    metric("Nodes", (o) => fmtInt(o.scenario.totals.nodes)),
    metric("CPU cores", (o) => fmtInt(o.scenario.totals.cores)),
    metric("Memory", (o) => `${fmtInt(o.scenario.totals.ramGiB)} GB`),
    metric("Usable storage", (o) => tib(o.scenario.totals.ssdTiB + o.scenario.totals.hddTiB)),
    metric("Node models", (o) => {
      const skus = [...new Set(o.scenario.clusters.flatMap((c) => c.models.map((m) => m.sku)))];
      return skus.join(", ") || "—";
    }),
    metric("Headroom at N-1", (o) => {
      const pcts = o.scenario.clusters.map((c) => c.failover.nMinus1).filter((p): p is number => p != null);
      return pcts.length ? `${formatPct(Math.max(...pcts))}% peak` : "—";
    }),
  ];
}

// Helpers reused by the preview + exporters.
export const proposalHelpers = {
  fmtInt,
  tib,
  tibToTb,
  clusterSummaryLine,
};
