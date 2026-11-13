// Nutanix Cloud Infrastructure (NCI) software editions — Starter / Pro / Ultimate.
//
// The comparison matrix below is transcribed from the six "NCI Software
// Editions" pages of the Portfolio 2 collateral and links back to the
// authoritative source. Cell values:
//   true   -> included
//   false  -> not available
//   "addon"-> available via an add-on license
//   string -> qualified note (e.g. "2 or 3"); a string containing "add-on"
//             names the add-on license and renders like "addon"

export type EditionKey = "Starter" | "Pro" | "Ultimate";
export const EDITIONS: EditionKey[] = ["Starter", "Pro", "Ultimate"];

export const EDITION_TAGLINE: Record<EditionKey, string> = {
  Starter: "Core set of software functionality",
  Pro: "Rich data services, resilience and management features",
  Ultimate: "The full suite of Nutanix software capabilities for complex infrastructure",
};

export const EDITION_IDEAL: Record<EditionKey, string> = {
  Starter: "Small-scale deployments with a limited set of workloads (on-prem only)",
  Pro: "Running multiple applications or large-scale single workload deployments (on-prem or in public clouds)",
  Ultimate: "Multi-site deployments and advanced security requirements (on-prem or in public clouds)",
};

export type Cell = boolean | "addon" | string;
export type EditionRow = { feature: string; starter: Cell; pro: Cell; ultimate: Cell };
export type EditionSection = { title: string; rows: EditionRow[] };

// Named add-on licenses, as printed in the Portfolio 2 editions collateral.
const ADV_REPLICATION = "Adv. Replication add-on";
const SECURITY_ADDON = "Security add-on";
const NDK_ADDON = "NDK add-on"; // Nutanix Data Services for Kubernetes

export const NCI_EDITION_MATRIX: EditionSection[] = [
  {
    title: "Enterprise Data Services",
    rows: [
      { feature: "Max cluster size", starter: "12 nodes", pro: ">12 nodes*", ultimate: ">12 nodes*" },
      { feature: "Heterogeneous clusters", starter: true, pro: true, ultimate: true },
      { feature: "VM-centric snapshots & clones", starter: true, pro: true, ultimate: true },
      { feature: "Data tiering", starter: true, pro: true, ultimate: true },
      { feature: "Online cluster grow / shrink", starter: true, pro: true, ultimate: true },
      { feature: "Data path redundancy", starter: true, pro: true, ultimate: true },
      { feature: "Tunable Redundancy Factor", starter: "2", pro: "2 or 3", ultimate: "2 or 3" },
      { feature: "Availability domains", starter: "Node", pro: "Node, Block, Rack", ultimate: "Node, Block, Rack" },
      { feature: "Basic compression (LZ4), inline and post-process", starter: true, pro: true, ultimate: true },
      { feature: "Deep compression (LZ4HC) for cold data", starter: true, pro: true, ultimate: true },
      { feature: "Cache deduplication", starter: true, pro: true, ultimate: true },
      { feature: "Capacity deduplication", starter: true, pro: true, ultimate: true },
      { feature: "Erasure Coding (EC-X)", starter: false, pro: true, ultimate: true },
      { feature: "VM-centric storage QoS", starter: false, pro: true, ultimate: true },
      { feature: "VM Flash Mode", starter: false, pro: true, ultimate: true },
    ],
  },
  {
    title: "Consolidated Storage Services",
    rows: [
      { feature: "Volume Groups, in-cluster VMs", starter: true, pro: true, ultimate: true },
      { feature: "Volume Groups, external access", starter: "Nutanix backup only", pro: "Primary and backup", ultimate: "Primary and backup" },
      { feature: "Files / Objects storage (included capacity)", starter: "1 TiB free", pro: "1 TiB free", ultimate: "1 TiB free" },
      { feature: "Cloud storage (Amazon EBS attach for NC2 on AWS)", starter: false, pro: false, ultimate: true },
    ],
  },
  {
    title: "Data Protection & Disaster Recovery",
    rows: [
      { feature: "Async replication (RPO 1 hr or greater)", starter: true, pro: true, ultimate: true },
      { feature: "Application-consistent snapshots", starter: true, pro: true, ultimate: true },
      { feature: "Self-service restore", starter: false, pro: true, ultimate: true },
      { feature: "Multi-site DR (many-to-one, one-to-many, many-to-many)", starter: false, pro: ADV_REPLICATION, ultimate: true },
      { feature: "Metro Availability", starter: false, pro: ADV_REPLICATION, ultimate: true },
      { feature: "Sync replication (RPO = 0)", starter: false, pro: ADV_REPLICATION, ultimate: true },
      { feature: "NearSync replication (RPO 1 to 15 min)", starter: false, pro: ADV_REPLICATION, ultimate: true },
      { feature: "Advanced orchestration with runbook automation", starter: false, pro: ADV_REPLICATION, ultimate: true },
    ],
  },
  {
    title: "Security",
    rows: [
      { feature: "Client authentication", starter: true, pro: true, ultimate: true },
      { feature: "Cluster lockdown", starter: false, pro: true, ultimate: true },
      { feature: "Data-at-rest encryption (software-based & SED)", starter: false, pro: true, ultimate: true },
      { feature: "Native KMS", starter: false, pro: true, ultimate: true },
    ],
  },
  {
    title: "Enterprise Compute",
    rows: [
      { feature: "Nutanix AHV virtualization", starter: true, pro: true, ultimate: true },
      { feature: "Credential Guard", starter: true, pro: true, ultimate: true },
      { feature: "vGPU and GPU passthrough", starter: false, pro: true, ultimate: true },
      { feature: "HA guaranteed failover", starter: false, pro: true, ultimate: true },
      { feature: "Nutanix Kubernetes Platform (NKP)", starter: false, pro: "NKP Starter", ultimate: "NKP Starter" },
      { feature: "VM-host affinity policies", starter: false, pro: true, ultimate: true },
      { feature: "Advanced processor capability", starter: false, pro: true, ultimate: true },
      { feature: "Automatic cluster placement", starter: false, pro: true, ultimate: true },
      { feature: "VM:VM affinity", starter: false, pro: true, ultimate: true },
      { feature: "Cross-cluster live migration", starter: false, pro: true, ultimate: true },
    ],
  },
  {
    title: "Data Services for Kubernetes",
    rows: [
      { feature: "App-centric local snapshots and restore", starter: false, pro: NDK_ADDON, ultimate: NDK_ADDON },
      { feature: "App-centric asynchronous DR (RPO > 1 hr)", starter: false, pro: NDK_ADDON, ultimate: NDK_ADDON },
    ],
  },
  {
    title: "Networking & Network Security",
    rows: [
      { feature: "Overlay networking", starter: false, pro: true, ultimate: true },
      { feature: "Microsegmentation (Flow)", starter: false, pro: SECURITY_ADDON, ultimate: true },
      { feature: "Nutanix Security Central", starter: false, pro: SECURITY_ADDON, ultimate: true },
    ],
  },
  {
    title: "Management & Analytics",
    rows: [
      { feature: "Multi-cluster management with Prism Central", starter: true, pro: true, ultimate: true },
      { feature: "Infrastructure management, monitoring and health", starter: true, pro: true, ultimate: true },
      { feature: "Enterprise authentication and RBAC", starter: true, pro: true, ultimate: true },
      { feature: "REST APIs", starter: true, pro: true, ultimate: true },
      { feature: "Comprehensive search", starter: true, pro: true, ultimate: true },
      { feature: "Insights", starter: true, pro: true, ultimate: true },
      { feature: "Life Cycle Manager (LCM)", starter: true, pro: true, ultimate: true },
      { feature: "Foundation", starter: true, pro: true, ultimate: true },
      { feature: "Foundation Central", starter: true, pro: true, ultimate: true },
    ],
  },
];

export const NCI_EDITION_FOOTNOTE =
  "* Refer to Nutanix Configuration Maximums on the Nutanix portal. NDK = Nutanix Data Services for Kubernetes.";

export const NCI_EDITIONS_SOURCE = "https://www.nutanix.com/products/cloud-platform/software-options";

// Nutanix Cloud Manager (NCM) software editions — Starter / Pro / Ultimate.
// Transcribed from the three "NCM Software Editions" pages (Portfolio 2) so the deck
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
      { feature: "Self-tuning with Machine Learning", starter: false, pro: true, ultimate: true },
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
