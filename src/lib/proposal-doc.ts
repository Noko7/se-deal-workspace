import type { NodeModel, ProposalCluster, ProposalScenario, SizerAddOnLicense } from "@/lib/sizer-import";
import type { ParsedEnvironment } from "@/lib/simple-sizer-core";
import { blankImplementationPlan, editionFromLicense, type EditionKey, type ImplementationPlan } from "@/lib/nci-editions";
import { isBasePlatform, LICENSE_CATALOG, newLicenseLine, type LicenseLine, type LicenseProductKey } from "@/lib/license-catalog";
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

// A parsed customer environment plus where it came from. The parse itself is
// the Simple Sizer's `ParsedEnvironment`, reused verbatim so the proposal and
// the sizer can never disagree about what an export says.
export type CurrentEnvironment = {
  parsed: ParsedEnvironment;
  sourceFile: string;
  /** "collector_excel" | "rvtools" | "liveoptics", carried for slide provenance. */
  source: ParsedEnvironment["source"];
};

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
  // The customer's estate as it runs today, parsed from a Nutanix Collector,
  // RVTools or LiveOptics export by the Simple Sizer's parser. Optional: a
  // proposal is complete without it, and it only exists once an SE uploads one.
  // Holding it here is what lets the deck compare today against the proposal.
  environment: CurrentEnvironment | null;
  contacts: Contact[];
  executiveSummary: string;
  challengesIntro: string;
  challenges: ChallengeGroups;
  benefitsIntro: string;
  benefits: ChallengeGroups;
  currentState: string[];
  proposedState: string[];
  timeline: TimelineMilestone[];
  // Blank until the SE writes it (see implementationPlanOf for older docs).
  implementation?: ImplementationPlan;
  // Software scope: which products/editions the design includes and the quantity
  // to license. Scope only -- pricing lives in a separate quote.
  licensing: {
    termYears: number;
    lines: LicenseLine[];
  };
  scenario: ProposalScenario;
  // The Configuration Review: a plain record of the design as reviewed and
  // confirmed with the customer, with no sales narrative. Optional so a doc
  // built before it existed still renders (see configReviewOf).
  review?: ConfigReview;
};

export type ConfigReview = {
  title: string;
  purpose: string;
  reviewDate: string;
  customerAttendees: string[];
  nutanixAttendees: string[];
  // Sizing results the customer is acknowledging (over-committed tiers, no N-1
  // headroom). Seeded from the scenario; the SE can edit or clear them.
  notes: string[];
  assumptions: string[];
  exclusions: string[];
  confirmation: string;
};

/** Products the design includes that have a brand icon, deduped, stable order. */
export function purchasedProducts(doc: ProposalDoc): ProductKey[] {
  const order: ProductKey[] = ["CloudInfrastructure", "CloudManager", "NUS", "Database", "NAI", "NKP", "Prism", "NC2"];
  const have = new Set(doc.licensing.lines.map((l) => l.product));
  return order.filter((p) => have.has(p));
}

/** The implementation plan, blank for a doc built before the plan was editable. */
export function implementationPlanOf(doc: ProposalDoc): ImplementationPlan {
  return doc.implementation ?? blankImplementationPlan();
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

const SIZER_ADDON_PRODUCT: Record<SizerAddOnLicense["product"], LicenseProductKey> = {
  NCM: "CloudManager",
  NUS: "NUS",
  NDB: "Database",
  NKP: "NKP",
};

// Add-ons Sizer already quoted (NCM, NUS, ...), one line per product with the
// quantities summed across clusters. Editions Sizer named but the catalog does
// not offer fall back to the catalog default.
function sizerAddOnLines(scenario: ProposalScenario): LicenseLine[] {
  const byProduct = new Map<LicenseProductKey, { tier: string; qty: number }>();
  for (const cluster of scenario.clusters) {
    for (const a of cluster.addOnLicenses ?? []) {
      const product = SIZER_ADDON_PRODUCT[a.product];
      const prev = byProduct.get(product);
      if (prev) prev.qty += a.qty ?? 0;
      else byProduct.set(product, { tier: a.edition, qty: a.qty ?? 0 });
    }
  }
  return [...byProduct].map(([product, { tier, qty }]) =>
    newLicenseLine(product, { qty: Math.round(qty), ...(LICENSE_CATALOG[product].tiers.includes(tier) ? { tier } : {}) }),
  );
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
  if (!m.memory.moduleGiB) return `${fmtInt(m.memory.perNodeGiB)} GB/node`;
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
    implementation: blankImplementationPlan(),
    licensing: {
      termYears: 3,
      lines: [newLicenseLine(baseProduct, { tier: baseTier, qty: Math.round(t.cores) }), ...sizerAddOnLines(scenario)],
    },
    hardwareOptions: [newHardwareOption(scenario, 0, sourceFile, true)],
    environment: null,
    scenario,
  };
  built.review = buildConfigReview(built);
  return built;
}

/** Sizing results past 100% of capacity, phrased for the customer to acknowledge. */
export function sizingFlags(scenario: ProposalScenario): string[] {
  const flags: string[] = [];
  for (const c of scenario.clusters) {
    const u = c.utilization;
    const over = (p: number | null): p is number => p != null && p > 100;
    if (over(u.cpu)) flags.push(`${c.name}: CPU is sized at ${formatPct(u.cpu)}% of available capacity.`);
    if (over(u.ram)) flags.push(`${c.name}: memory is sized at ${formatPct(u.ram)}% of available capacity.`);
    const hybrid = c.capacity.ssdTiB > 0 && c.capacity.hddTiB > 0;
    if (hybrid && over(u.ssd)) flags.push(`${c.name}: the flash (SSD/NVMe) tier is sized at ${formatPct(u.ssd)}% of usable flash capacity.`);
    if (hybrid && over(u.hdd)) flags.push(`${c.name}: the HDD tier is sized at ${formatPct(u.hdd)}% of usable HDD capacity.`);
    if (!hybrid && over(u.storage)) flags.push(`${c.name}: storage is sized at ${formatPct(u.storage)}% of usable capacity.`);
    if (over(c.failover.nMinus1)) {
      flags.push(
        `${c.name}: with one node offline (failure or planned maintenance), the cluster would run at ${formatPct(c.failover.nMinus1)}% of its remaining capacity, so workloads may be affected until the node is restored.`,
      );
    }
  }
  return flags;
}

/** Default Configuration Review content, phrased from the recommended scenario. */
export function buildConfigReview(doc: ProposalDoc): ConfigReview {
  const s = doc.scenario;
  const customer = doc.meta.customer;
  const notes = sizingFlags(s);
  const workload =
    s.totals.vmCount != null
      ? `${fmtInt(s.totals.vmCount)} VMs${s.totals.vCpus != null ? ` / ${fmtInt(s.totals.vCpus)} vCPUs` : ""}`
      : "the workload profile";
  const hasFailover = s.clusters.some((c) => c.failover.nMinus1 != null);
  return {
    title: `Configuration Review: ${customer}`,
    purpose:
      `This document records the Nutanix configuration reviewed with ${customer} on ${doc.meta.dateLabel}. ` +
      "It captures the hardware and software in scope, the capacity the design provides, and the sizing inputs and assumptions it is based on, as discussed and confirmed on that call.",
    reviewDate: doc.meta.dateLabel,
    customerAttendees: [],
    nutanixAttendees: [doc.meta.preparedBy].filter(Boolean),
    notes,
    assumptions: [
      `Sized in Nutanix Sizer from ${workload} provided by ${customer}${s.meta.createdDate ? ` (scenario dated ${s.meta.createdDate})` : ""}.`,
      "Usable capacity is after Nutanix data-resiliency overhead, as calculated by Nutanix Sizer.",
      "Utilization figures reflect the reviewed workload at the time of sizing.",
      ...(hasFailover ? ["Resiliency (N-1) shows cluster load with one node offline for a failure or planned maintenance."] : []),
      "No additional growth is included beyond the workload reviewed, unless listed here.",
    ],
    exclusions: [
      "Workloads, applications or data not included in the reviewed sizing inputs.",
      "Growth, new projects, or changes to data protection, retention or replication after this review.",
      "Site readiness: rack space, power, cooling, and network switching and cabling.",
      "Third-party software and licensing, including guest operating systems and applications.",
    ],
    confirmation:
      `Please review the configuration above${notes.length ? ", including the items noted on review," : ""} and reply to confirm it matches ${customer}'s requirements, or let us know of any changes before the order is placed. ` +
      "Any changes to the workload or requirements after confirmation may require the design to be re-sized.",
  };
}

/** The doc's Configuration Review, falling back to defaults if it has none yet. */
export function configReviewOf(doc: ProposalDoc): ConfigReview {
  return doc.review ? { ...doc.review, notes: doc.review.notes ?? [] } : buildConfigReview(doc);
}

/** Attach (or replace) the customer's current estate on a proposal. */
export function setEnvironment(doc: ProposalDoc, environment: CurrentEnvironment | null): ProposalDoc {
  doc.environment = environment;
  return doc;
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
  // OEM exports prefix the SKU with the vendor ("Dell - XC670-16S-CORE").
  const skus = [
    ...new Set(scenario.clusters.flatMap((c) => c.models.map((m) => m.sku.replace(/^(Dell|HPE|Cisco|Lenovo|Fujitsu)\s*-\s*/i, "")))),
  ];
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
  const previousFlags = sizingFlags(doc.scenario).join("\n");
  doc.scenario = rec.scenario;
  if (doc.review && (doc.review.notes ?? []).join("\n") === previousFlags) doc.review.notes = sizingFlags(rec.scenario);
  doc.meta.vendor = rec.vendor;

  // Re-quantify the base platform against the new build. Editions and add-on
  // quantities are deliberate SE choices, so they are left alone; the base
  // per-core count is a direct function of the hardware and would otherwise go
  // stale the moment the recommendation changes. NCM is metered on the same
  // managed cores, so it follows along while it still matches the old count.
  for (const line of doc.licensing.lines) {
    if (!isBasePlatform(line.product) && line.product !== "CloudManager") continue;
    if (line.qty === previousCores) line.qty = Math.round(rec.scenario.totals.cores);
  }
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
