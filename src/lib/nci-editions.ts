// Nutanix Cloud Infrastructure (NCI) software editions — Starter / Pro / Ultimate.
//
// The comparison matrix below captures the headline differentiators between the
// editions (Portfolio 2). It is intentionally a curated summary of the official
// "NCI Software Editions" collateral rather than the full multi-page feature
// grid, and links back to the authoritative source. Cell values:
//   true   -> included
//   false  -> not available
//   "addon"-> available via an add-on license
//   string -> qualified note (e.g. "2 or 3")

export type EditionKey = "Starter" | "Pro" | "Ultimate";
export const EDITIONS: EditionKey[] = ["Starter", "Pro", "Ultimate"];

export const EDITION_TAGLINE: Record<EditionKey, string> = {
  Starter: "Core set of software functionality",
  Pro: "Rich data services, resilience and management features",
  Ultimate: "The full suite of Nutanix software capabilities for complex infrastructure",
};

export const EDITION_IDEAL: Record<EditionKey, string> = {
  Starter: "Small-scale deployments with a limited set of workloads (on-prem only)",
  Pro: "Running multiple applications or large-scale single-workload deployments (on-prem or public cloud)",
  Ultimate: "Multi-site deployments and advanced security requirements (on-prem or public cloud)",
};

export type Cell = boolean | "addon" | string;
export type EditionRow = { feature: string; starter: Cell; pro: Cell; ultimate: Cell };
export type EditionSection = { title: string; rows: EditionRow[] };

export const NCI_EDITION_MATRIX: EditionSection[] = [
  {
    title: "Core Platform",
    rows: [
      { feature: "Nutanix AHV virtualization", starter: true, pro: true, ultimate: true },
      { feature: "Max cluster size", starter: "12 nodes", pro: ">12 nodes", ultimate: ">12 nodes" },
      { feature: "Tunable Redundancy Factor", starter: "2", pro: "2 or 3", ultimate: "2 or 3" },
      { feature: "Availability domains", starter: "Node", pro: "Node, Block, Rack", ultimate: "Node, Block, Rack" },
      { feature: "Online cluster grow / shrink", starter: true, pro: true, ultimate: true },
    ],
  },
  {
    title: "Enterprise Data Services",
    rows: [
      { feature: "Inline compression (LZ4)", starter: true, pro: true, ultimate: true },
      { feature: "Deep / capacity compression (LZ4HC)", starter: false, pro: true, ultimate: true },
      { feature: "Capacity deduplication", starter: false, pro: true, ultimate: true },
      { feature: "Erasure Coding (EC-X)", starter: false, pro: true, ultimate: true },
      { feature: "VM Flash Mode & storage QoS", starter: false, pro: true, ultimate: true },
    ],
  },
  {
    title: "Data Protection & Disaster Recovery",
    rows: [
      { feature: "Async replication & app-consistent snapshots", starter: true, pro: true, ultimate: true },
      { feature: "Multi-site DR (many-to-one / one-to-many)", starter: false, pro: "addon", ultimate: true },
      { feature: "NearSync replication (RPO 1 to 15 min)", starter: false, pro: "addon", ultimate: true },
      { feature: "Sync replication / Metro (RPO = 0)", starter: false, pro: "addon", ultimate: true },
      { feature: "Runbook orchestration", starter: false, pro: "addon", ultimate: true },
    ],
  },
  {
    title: "Security",
    rows: [
      { feature: "Data-at-rest encryption (SW & SED) + Native KMS", starter: false, pro: true, ultimate: true },
      { feature: "Microsegmentation (Flow)", starter: false, pro: "addon", ultimate: true },
      { feature: "Nutanix Security Central", starter: false, pro: "addon", ultimate: true },
    ],
  },
  {
    title: "Compute, Containers & Management",
    rows: [
      { feature: "Prism Central multi-cluster management", starter: true, pro: true, ultimate: true },
      { feature: "Cross-cluster live migration", starter: false, pro: true, ultimate: true },
      { feature: "Nutanix Kubernetes Platform (NKP)", starter: false, pro: "NKP Starter", ultimate: "NKP Starter" },
      { feature: "VM-host & VM:VM affinity policies", starter: false, pro: true, ultimate: true },
    ],
  },
];

export const NCI_EDITIONS_SOURCE = "https://www.nutanix.com/products/cloud-platform/software-options";

// Nutanix Cloud Manager (NCM) software editions — Starter / Pro / Ultimate.
// Transcribed from the "NCM Software Editions" pages (Portfolio 2) so the deck
// can mirror the NCI editions treatment for the management layer.
export const NCM_EDITION_TAGLINE: Record<EditionKey, string> = {
  Starter: "Infrastructure AIOps and low-code automation",
  Pro: "IaaS and cost governance across private and public clouds",
  Ultimate: "Enterprise app automation, security, and governance",
};

export const NCM_EDITION_IDEAL: Record<EditionKey, string> = {
  Starter: "Infrastructure AIOps: monitoring, planning, rightsizing and low code automation",
  Pro: "IaaS across private and public clouds, plus cost governance",
  Ultimate: "Enterprise deployments, supporting complex app automation, security features and governance workflows",
};

export const NCM_EDITION_MATRIX: EditionSection[] = [
  {
    title: "Intelligent Operations",
    rows: [
      { feature: "Reporting", starter: true, pro: true, ultimate: true },
      { feature: "Customizable Dashboard", starter: true, pro: true, ultimate: true },
      { feature: "Capacity Forecast and Planning", starter: true, pro: true, ultimate: true },
      { feature: "Resource Inefficiency Detection and Right-sizing", starter: true, pro: true, ultimate: true },
      { feature: "Support for ESXi on non-NCI environments", starter: true, pro: true, ultimate: true },
      { feature: "Low-code / No-code Operations Automation", starter: true, pro: true, ultimate: true },
      { feature: "SQL Server Monitoring for IT Ops", starter: false, pro: true, ultimate: true },
      { feature: "Application Discovery", starter: false, pro: true, ultimate: true },
      { feature: "Self-tuning with Machine Learning", starter: false, pro: false, ultimate: true },
    ],
  },
  {
    title: "Cost Governance",
    rows: [
      { feature: "Cost Metering for Private Cloud Resources", starter: false, pro: true, ultimate: true },
      { feature: "Cloud Visibility and Optimization", starter: false, pro: true, ultimate: true },
      { feature: "Budgeting and Chargeback", starter: false, pro: true, ultimate: true },
    ],
  },
  {
    title: "Self-Service",
    rows: [
      { feature: "Self-Service Marketplace", starter: false, pro: true, ultimate: true },
      { feature: "IaaS (Single VM) Blueprints", starter: false, pro: true, ultimate: true },
      { feature: "Advanced Orchestration Runbooks", starter: false, pro: true, ultimate: true },
      { feature: "App (Multi VM) Blueprints", starter: false, pro: false, ultimate: true },
      { feature: "Governance (Approvals & Scheduler)", starter: false, pro: false, ultimate: true },
    ],
  },
  {
    title: "Security Compliance",
    rows: [
      { feature: "Security Monitoring & Remediation", starter: false, pro: false, ultimate: true },
      { feature: "Network Security Planning", starter: false, pro: false, ultimate: true },
      { feature: "Regulatory Compliance", starter: false, pro: false, ultimate: true },
    ],
  },
];

// Implementation plan (Portfolio 2 delivery model). Mirrors the Furman-style
// "Implementation Plan" slide: the delivery is grouped into the workstreams
// below. Commercial detail (session counts, pricing) lives in the quote.
export type ImplementationPhase = { title: string; subtitle: string; items: string[] };
export const IMPLEMENTATION_PLAN: ImplementationPhase[] = [
  {
    title: "Migration",
    subtitle: "Data migration & Day 1",
    items: [
      "Discovery and migration planning workshop",
      "Nutanix Move for VM migration from ESXi / Hyper-V",
      "Cutover runbook, validation, and Day-1 operational handoff",
    ],
  },
  {
    title: "Deployment",
    subtitle: "Professional Services (virtual)",
    items: [
      "Foundation imaging and cluster creation",
      "Prism Central deployment and registration",
      "Network, storage, and data services configuration",
    ],
  },
  {
    title: "Rack & Cluster Deploy",
    subtitle: "Rack & stack",
    items: [
      "Physical rack & stack of nodes and switches",
      "Cabling, power, and out-of-band (IPMI) setup",
      "Cluster bring-up and health validation",
    ],
  },
  {
    title: "Education & Enablement",
    subtitle: "Administrator enablement",
    items: [
      "Administrator enablement on Prism and AHV",
      "Operational runbook and best-practice review",
      "Nutanix University learning paths and certification",
    ],
  },
];

export const IMPLEMENTATION_ADDON_NOTE =
  "Add-on implementation services (for example a DR deployment session) are available and detailed in the quote.";

// Support programs (Portfolio 2) — used for the support slide.
export type SupportProgram = { name: string; ideal: string; rows: { label: string; value: string }[] };
export const SUPPORT_PROGRAMS: SupportProgram[] = [
  {
    name: "Production Support",
    ideal: "24x7x365 priority call & case handling, next-business-day on-site service.",
    rows: [
      { label: "Coverage", value: "24x7x365" },
      { label: "P1 response", value: "1 hour" },
      { label: "P2 response", value: "4 hours" },
      { label: "Hardware replacement", value: "NBD (8AM to 5PM)" },
      { label: "Support admins / contract", value: "6" },
    ],
  },
  {
    name: "Mission Critical Support",
    ideal: "Faster response, direct access to senior engineers, and up to 4-hour on-site service.",
    rows: [
      { label: "Coverage", value: "24x7x365" },
      { label: "P1 response", value: "30 minutes" },
      { label: "P2 response", value: "2 hours" },
      { label: "Hardware replacement", value: "4-hour parts**" },
      { label: "Support admins / contract", value: "Unlimited" },
    ],
  },
];

/** Map a raw Sizer license edition string ("Pro", "Ultimate", "NCI"...) to an EditionKey. */
export function editionFromLicense(label: string | null | undefined): EditionKey {
  const v = (label ?? "").toLowerCase();
  if (v.includes("ult")) return "Ultimate";
  if (v.includes("star") || v.includes("str")) return "Starter";
  return "Pro";
}
