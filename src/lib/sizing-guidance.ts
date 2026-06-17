// Nutanix cluster build guidance encoded as logic the Simple Sizer applies for
// accuracy: redundancy minimums, cluster-size limits, licensing thresholds,
// storage efficiency, IOPS-to-disk-tier mapping, and validation. Numbers track
// the Nutanix Bible, Prism System Maximums (AOS 7.5), and the Nutanix Sizer.

export type Rf = 2 | 3;
export type StorageEfficiency = "none" | "compression" | "ecx";

export const SIZING_RULES = {
  // RF2 needs ≥3 nodes (replica on a different node); RF3 needs ≥5.
  minNodesByRf: { 2: 3, 3: 5 } as Record<Rf, number>,
  // Block/rack awareness distributes replicas across chassis.
  minBlocksByRf: { 2: 3, 3: 5 } as Record<Rf, number>,
  maxNodesPerCluster: 32, // Prism System Maximums (AOS 7.5)
  cvmRamGiBPerNode: 32,
  starterMaxNodes: 12, // NCI Starter ≤ 12 nodes
  edgeMaxNodes: 5, // NCI-Edge: ≤5 nodes, ≤25 VMs
  edgeMaxVms: 25,
  ecxMinNodes: 4, // Erasure Coding requires Pro+ and ≥4 nodes
  vcpuPcoreBand: { generalMin: 4, generalMax: 6, latencySensitiveMax: 4 },
  memoryOvercommitMax: 1.25, // 1:1–1.25:1 recommended on AHV
  network: { minGbE: 10, recommendedGbE: 25 },
} as const;

export function minNodesForRf(rf: Rf): number {
  return SIZING_RULES.minNodesByRf[rf];
}

export function recommendedClusterCount(nodeCount: number): number {
  return Math.max(1, Math.ceil(nodeCount / SIZING_RULES.maxNodesPerCluster));
}

export type LicenseTier = { tier: string; detail: string };

export function licenseTier(nodeCount: number, vmCount: number | null): LicenseTier {
  if (nodeCount <= SIZING_RULES.edgeMaxNodes && (vmCount ?? 0) > 0 && (vmCount ?? 0) <= SIZING_RULES.edgeMaxVms) {
    return { tier: "NCI-Edge", detail: "≤5 nodes and ≤25 VMs qualify for Edge pricing." };
  }
  if (nodeCount <= SIZING_RULES.starterMaxNodes) {
    return { tier: "NCI Starter", detail: "≤12 nodes. Compression included; no dedup / EC-X." };
  }
  return { tier: "NCI Pro / Ultimate", detail: ">12 nodes unlocks dedup, EC-X, and advanced data protection." };
}

// Replica/parity multiplier applied to the data footprint before the SSD spare
// slack. EC-X lowers RF overhead; compression reduces data before replication.
export function effectiveStorageFactor(rf: Rf, efficiency: StorageEfficiency): number {
  if (efficiency === "ecx") return rf === 3 ? 1.6 : 1.4; // ~1.25–1.5× per EC-X guidance
  if (efficiency === "compression") return rf / 1.4; // conservative ~30% data reduction
  return rf;
}

export function storageEfficiencyLabel(efficiency: StorageEfficiency): string {
  if (efficiency === "ecx") return "Erasure Coding (EC-X, Pro+, ≥4 nodes)";
  if (efficiency === "compression") return "Inline compression (~30% conservative)";
  return "None (full RF copies)";
}

export type DiskTier = {
  tier: string;
  band: string;
  workloads: string;
  latency: string;
};

// Per-node IOPS (4K random, 70/30 R/W) → disk tier. Upper bound is exclusive.
const IOPS_TIERS: { max: number | null; tier: DiskTier }[] = [
  {
    max: 5000,
    tier: {
      tier: "Hybrid (HDD + SSD cache)",
      band: "< 5,000",
      workloads: "File/print, DR replication targets, dev/test, backup repositories, archive",
      latency: "5–15 ms",
    },
  },
  {
    max: 25000,
    tier: {
      tier: "All-Flash SSD",
      band: "5,000–25,000",
      workloads: "General VSI, web/app tier, light VDI, file shares (NUS), smaller Exchange",
      latency: "1–3 ms",
    },
  },
  {
    max: 75000,
    tier: {
      tier: "All-Flash NVMe",
      band: "25,000–75,000",
      workloads: "Mid-tier OLTP (SQL/Oracle), heavy VDI, large Exchange, NDB-managed DBs",
      latency: "< 1 ms",
    },
  },
  {
    max: 200000,
    tier: {
      tier: "All-NVMe + RDMA (25/100 GbE)",
      band: "75,000–200,000",
      workloads: "High-perf OLTP, analytics (Spark/Hadoop), ERP, mission-critical SAP HANA",
      latency: "< 500 µs",
    },
  },
  {
    max: null,
    tier: {
      tier: "NVMe + Intel Optane / SCM",
      band: "> 200,000",
      workloads: "Tier-0 latency-sensitive DBs, HFT, in-memory caching at scale, HPC",
      latency: "< 200 µs",
    },
  },
];

export function diskTierForIops(perNodeIops: number | null | undefined): DiskTier | null {
  if (perNodeIops == null || perNodeIops <= 0) return null;
  for (const band of IOPS_TIERS) {
    if (band.max == null || perNodeIops < band.max) return band.tier;
  }
  return IOPS_TIERS[IOPS_TIERS.length - 1].tier;
}

export function networkRecommendation(perNodeIops: number | null | undefined): string {
  if (perNodeIops != null && perNodeIops >= 75000) {
    return "25/100 GbE with RDMA + dual ToR (LACP); standard MTU 1500.";
  }
  return "25 GbE recommended (10 GbE minimum), dual ToR with LACP; standard MTU 1500.";
}

// Hard/soft build validations. Returned newest-issue-first for display.
export function validateBuild(input: {
  rf: Rf;
  nodeCount: number;
  failoverHosts: number;
  vmCount: number | null;
  vcpuPcoreRatio: number;
  storageEfficiency: StorageEfficiency;
}): string[] {
  const warnings: string[] = [];
  const minNodes = minNodesForRf(input.rf);

  if (input.nodeCount === 2) {
    warnings.push("Two-node cluster: requires a Witness VM for quorum (NCI-Edge/Starter).");
  } else if (input.nodeCount < minNodes) {
    warnings.push(`RF${input.rf} requires ≥ ${minNodes} nodes so replicas land on separate nodes.`);
  }

  const minBlocks = SIZING_RULES.minBlocksByRf[input.rf];
  warnings.push(`For block (chassis) awareness, spread nodes across ≥ ${minBlocks} blocks.`);

  if (input.nodeCount - input.failoverHosts < 1) {
    warnings.push("Failover reservation leaves no working node — add nodes or lower the reservation.");
  } else if (input.failoverHosts < 1) {
    warnings.push("No HA failover headroom reserved — size for at least N+1.");
  }

  if (input.nodeCount > SIZING_RULES.maxNodesPerCluster) {
    const count = recommendedClusterCount(input.nodeCount);
    warnings.push(
      `Exceeds the 32-node cluster maximum — split into ${count} clusters under one Prism Central.`,
    );
  }

  if (input.vcpuPcoreRatio > SIZING_RULES.vcpuPcoreBand.generalMax) {
    warnings.push(
      `vCPU:pCore ${input.vcpuPcoreRatio}:1 exceeds the 6:1 guideline — expect CPU ready-time contention.`,
    );
  }

  if (input.storageEfficiency === "ecx" && input.nodeCount < SIZING_RULES.ecxMinNodes) {
    warnings.push("Erasure Coding (EC-X) requires NCI Pro+ and ≥ 4 nodes.");
  }

  return warnings;
}

// Curated reference shown in the tool's collapsible guidance panel, with sources.
export type ReferenceLink = { label: string; href: string };
export type ReferenceItem = { rule: string; detail: string; source: ReferenceLink };
export type ReferenceGroup = { title: string; items: ReferenceItem[] };

const NUTANIX_BIBLE: ReferenceLink = { label: "Nutanix Bible", href: "https://www.nutanixbible.com/" };
const NUTANIX_SIZER: ReferenceLink = { label: "Nutanix Sizer", href: "https://sizer.nutanix.com/" };
const NUTANIX_PORTAL: ReferenceLink = { label: "Nutanix Portal", href: "https://portal.nutanix.com/" };
const NCI_LICENSING: ReferenceLink = {
  label: "NCI Licensing",
  href: "https://www.nutanix.com/products/cloud-infrastructure",
};

export const SIZING_REFERENCE: ReferenceGroup[] = [
  {
    title: "Cluster Sizing Fundamentals",
    items: [
      { rule: "Minimum cluster size", detail: "RF2 → 3 nodes · RF3 → 5 nodes. 1/2-node need a Witness VM.", source: NUTANIX_BIBLE },
      { rule: "Maximum cluster size", detail: "Up to 32 nodes per AOS cluster; scale out with more clusters under one Prism Central.", source: NUTANIX_PORTAL },
      { rule: "Block awareness", detail: "RF2 → ≥3 blocks · RF3 → ≥5 blocks for chassis-level redundancy.", source: NUTANIX_BIBLE },
      { rule: "N+1 planning", detail: "Always size N+1 headroom (N+2 for HA-critical) so HA restarts fit.", source: NUTANIX_SIZER },
      { rule: "Licensing tiers", detail: "Starter ≤ 12 nodes · Pro/Ultimate > 12 · Edge ≤ 5 nodes / ≤ 25 VMs.", source: NCI_LICENSING },
    ],
  },
  {
    title: "Resource Ratios",
    items: [
      { rule: "vCPU:pCore overcommit", detail: "4:1–6:1 general; 2:1–4:1 for latency-sensitive (SQL/Oracle/VDI golden).", source: NUTANIX_SIZER },
      { rule: "CVM RAM reservation", detail: "32 GiB per node minimum (48–64 GiB for high-throughput/all-flash).", source: NUTANIX_BIBLE },
      { rule: "Memory overcommit", detail: "1:1–1.25:1 on AHV; ballooning/swap add latency beyond that.", source: NUTANIX_PORTAL },
      { rule: "HA failover reservation", detail: "Reserve 1 host (or N hosts) of CPU/RAM for restart-on-failure.", source: NUTANIX_PORTAL },
    ],
  },
  {
    title: "Storage",
    items: [
      { rule: "Usable capacity (RF2)", detail: "~50% of raw after RF + 20% SSD spare; compression/dedup add 1.5–3× effective.", source: NUTANIX_BIBLE },
      { rule: "Erasure Coding (EC-X)", detail: "Pro+ and ≥4 nodes; cuts overhead from 2× to ~1.25–1.5× for cold/warm data.", source: NUTANIX_BIBLE },
      { rule: "Containers + QoS", detail: "Group workloads (general/DB/VDI) into containers for per-tier efficiency & QoS.", source: NUTANIX_PORTAL },
    ],
  },
  {
    title: "Network & Resilience",
    items: [
      { rule: "Data network", detail: "25 GbE recommended (10 GbE minimum); dual ToR with LACP; standard MTU 1500.", source: NUTANIX_PORTAL },
      { rule: "AHV HA", detail: "Automatic VM restart within ~3 min; honors affinity + failover reservation.", source: NUTANIX_PORTAL },
      { rule: "Metro / DR", detail: "Metro (RPO 0, ≤5 ms RTT) and Nutanix DR (RPO from 1 min) need Pro+.", source: NUTANIX_PORTAL },
    ],
  },
];

export const KEY_RESOURCES: ReferenceLink[] = [
  NUTANIX_BIBLE,
  NUTANIX_SIZER,
  { label: "Hardware Compatibility List", href: "https://portal.nutanix.com/page/documents/list?type=hardware" },
  NCI_LICENSING,
  { label: "Nutanix Move (migration)", href: "https://www.nutanix.com/products/move" },
  NUTANIX_PORTAL,
];
