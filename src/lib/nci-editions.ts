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
