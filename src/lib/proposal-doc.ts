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
    // External-storage deal: positions the design as Nutanix compute (AHV/NCI)
    // running against an external enterprise array, which reframes the copy.
    externalStorage: boolean;
    externalStorageVendor: ExternalStorageVendor;
  };
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
export function buildProposalDoc(scenario: ProposalScenario): ProposalDoc {
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
    scenario,
  };
  return built;
}

// Helpers reused by the preview + exporters.
export const proposalHelpers = {
  fmtInt,
  tib,
  tibToTb,
  clusterSummaryLine,
};
