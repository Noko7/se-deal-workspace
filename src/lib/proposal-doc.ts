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
  quote: { text: string; author: string };
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

export const DEFAULT_TIMELINE: TimelineMilestone[] = [
  { label: "Purchase Order" },
  { label: "Order Process Completion" },
  { label: "Manufacturing Complete" },
  { label: "Shipping Scheduled" },
  { label: "Technology Arrives" },
  { label: "Project Planning Complete" },
  { label: "Implementation Complete" },
  { label: "Testing Complete" },
  { label: "Migration Complete" },
  { label: "Go Live", done: false },
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
  quote: { text: string; author: string };
};

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
        `This proposal runs ${customer} on Nutanix Cloud Infrastructure (NCI) with the AHV hypervisor for compute, while ` +
        `primary storage is delivered by an external ${storageVendor} array over NVMe/TCP. Compute and storage scale ` +
        `independently across ${fmtInt(t.nodes)} nodes and ${clusterLine}, so you keep your enterprise storage investment, ` +
        `add Nutanix compute as you grow, and manage the environment from Prism with AHV included.`,
      challengesIntro:
        "A few things about the setup today make it harder than it should be to grow and run the environment.",
      challenges: {
        technical: ["Compute refresh is tied to the storage array (and vice versa)", "Hypervisor licensing keeps climbing", `Existing ${storageVendor} capacity is underutilized by the current stack`],
        operational: ["Too much of the day goes to manual infrastructure work", "Compute and storage are managed in separate tools"],
        financial: ["Hypervisor and maintenance costs keep creeping up", "Refresh cycles force you to buy compute and storage together"],
      },
      benefitsIntro:
        `Here is how Nutanix takes each of those off your plate while keeping your ${storageVendor} array in the design.`,
      benefits: {
        technical: ["Run AHV on Nutanix compute against external storage over NVMe/TCP", "Scale compute and storage independently", "Keep advanced data services on the external array"],
        operational: ["Manage compute and VMs from one place in Prism", "Add a compute node to grow, non-disruptively"],
        financial: [`Reuse the existing ${storageVendor} investment`, "AHV included, no separate hypervisor tax", "Subscription pricing you can actually plan around"],
      },
      currentState: ["Compute and storage refresh locked together", "Hypervisor costs climbing", "Limited flexibility to scale one without the other"],
      proposedState: [
        `Nutanix compute across ${fmtInt(t.nodes)} nodes`,
        `Primary storage on external ${storageVendor}`,
        "Compute and storage scale independently",
      ],
      quote: {
        text: "Nutanix let us modernize compute and keep the storage array we already trust. We scale each one on its own terms.",
        author: "Customer reference",
      },
    };
  }

  return {
    title: `Nutanix Solution Proposal for ${customer}`,
    executiveSummary:
      `This proposal puts ${customer} on a Nutanix cloud platform built from ${fmtInt(t.nodes)} ` +
      `nodes across ${clusterLine}. That works out to ${fmtInt(t.cores)} CPU cores, ${fmtInt(t.ramGiB)} GB of memory, ` +
      `and ${usable} of usable capacity to run on. We move what you already have onto Nutanix Cloud ` +
      `Infrastructure (NCI) with AHV, so there is one system to manage instead of separate compute and storage, ` +
      `the environment is easier to protect, and when you need more you add a node rather than starting another project.`,
    challengesIntro:
      "A few things about the setup today make it harder than it should be to grow, protect, and run the environment.",
    challenges: {
      technical: ["Hardware is aging and close to end of support", "Compute and storage have to be scaled separately", "Not every workload is covered by DR or replication"],
      operational: ["Too much of the day goes to manual infrastructure work", "Each site gets managed a little differently"],
      financial: ["Maintenance and licensing keep creeping up", "Refresh and expansion costs are hard to predict"],
    },
    benefitsIntro:
      "Here is how the Nutanix platform takes each of those off your plate, with one system instead of three.",
    benefits: {
      technical: ["Upgrades and lifecycle handled in a click", "Compression, dedup, and EC-X built in, no extra license", "Snapshots and async or sync DR come standard"],
      operational: ["Run the whole estate from one place in Prism Central", "Add a node to grow, with nothing taken offline"],
      financial: ["Software consolidated under one NCI edition", "Subscription pricing you can actually plan around"],
    },
    currentState: ["Running tight on resources and headroom", "Can't protect or replicate every VM", "Recovery takes longer than anyone wants"],
    proposedState: [
      `Room to grow across ${fmtInt(t.nodes)} nodes`,
      "Every VM protected and replicated",
      "Faster recovery with DR built in",
    ],
    quote: {
      text: "Nutanix gave us cloud simplicity on our own terms. We grow by adding a node, not by kicking off another project.",
      author: "Customer reference",
    },
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
    quote: { ...n.quote },
  };
}

/** Build a ready-to-edit proposal with defaults derived from the scenario. */
export function buildProposalDoc(scenario: ProposalScenario): ProposalDoc {
  const t = scenario.totals;
  const n = proposalNarrative(scenario, false);

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
    options: { includeSoftwareSlides: true, externalStorage: false, externalStorageVendor: "Pure Storage" },
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
      lines: [newLicenseLine("CloudInfrastructure", { tier: detectEdition(scenario), qty: Math.round(t.cores) })],
    },
    quote: { ...n.quote },
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
