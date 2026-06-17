import {
  diskTierForIops,
  effectiveStorageFactor,
  licenseTier as deriveLicenseTier,
  minNodesForRf,
  networkRecommendation as deriveNetworkRecommendation,
  recommendedClusterCount,
  validateBuild,
  type DiskTier,
  type LicenseTier,
  type StorageEfficiency,
} from "@/lib/sizing-guidance";

export type SizerSource = "collector_excel" | "rvtools" | "liveoptics";

export type { StorageEfficiency } from "@/lib/sizing-guidance";

export type ClusterHardwareModel = {
  model: string;
  vendor: string | null;
  hostCount: number;
  cpuCores: number;
  memoryGiB: number;
  storageTiB: number;
};

export type ParsedCluster = {
  name: string;
  moid: string | null;
  hosts: number;
  totalVms: number;
  avgVcpuPerVm: number;
  vcpuPcoreRatio: number;
  hardwareModels: ClusterHardwareModel[];
  aggVcpu: number;
  aggRamGiB: number;
  aggStorageProvisionedTiB: number;
  aggStorageConsumedTiB: number;
  maxVmVcpu: number | null;
  maxVmRamGiB: number | null;
  totalCpuCores: number;
  consumedCpuCores: number | null;
  totalMemoryGiB: number;
  consumedMemoryGiB: number | null;
  totalStorageTiB: number;
  consumedStorageTiB: number | null;
};

export type ParsedEnvironment = {
  source: SizerSource;
  sourceDetection: "manual";
  fileName: string;
  clusters: number;
  hosts: number;
  totalVms: number;
  avgVcpuPerVm: number;
  vcpuPcoreRatio: number;
  totalCpuCores: number;
  consumedCpuCores: number | null;
  totalMemoryGiB: number;
  consumedMemoryGiB: number | null;
  totalStorageTiB: number;
  consumedStorageTiB: number | null;
  aggVcpu: number;
  aggRamGiB: number;
  aggStorageProvisionedTiB: number;
  aggStorageConsumedTiB: number;
  maxVmVcpu: number | null;
  maxVmRamGiB: number | null;
  clusterDetails: ParsedCluster[];
  notes: string[];
};

export type SizerSettings = {
  vcpuToPcoreRatio: number;
  nodeCount: number;
  rf: 2 | 3;
  storageBasis: "provisioned" | "consumed";
  // N+1 = 1 (default), N+2 = 2. HA failover capacity reserved for restarts.
  failoverHosts?: number;
  // Storage efficiency assumption applied to raw capacity sizing.
  storageEfficiency?: StorageEfficiency;
  // Observed cluster peak IOPS (7-day, 4K random) — drives disk-tier guidance.
  peakIops?: number | null;
};

export type SizerRecommendation = {
  basePCores: number;
  baseRamGiB: number;
  totalRawStorageTiB: number;
  nodeTotalPCores: number;
  nodeTotalRamGiB: number;
  nodeStorageTiB: number;
  clusterTotalPCores: number;
  clusterTotalRamGiB: number;
  clusterTotalStorageTiB: number;
  monsterVmRisk: boolean;
  monsterVmReason: string | null;
  // Nutanix build guidance derived from the inputs above.
  effectiveNodeCount: number;
  failoverHosts: number;
  clusterCount: number;
  licenseTier: LicenseTier;
  diskTier: DiskTier | null;
  perNodeIops: number | null;
  networkRecommendation: string;
  warnings: string[];
};

export type ClusterRecommendation = {
  clusterName: string;
  recommendation: SizerRecommendation;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function computeSizerRecommendation(parsed: ParsedEnvironment, settings: SizerSettings): SizerRecommendation {
  return computeRecommendationFromAggregates({
    aggVcpu: parsed.aggVcpu,
    aggRamGiB: parsed.aggRamGiB,
    aggStorageTiB:
      settings.storageBasis === "consumed" && parsed.aggStorageConsumedTiB > 0
        ? parsed.aggStorageConsumedTiB
        : parsed.aggStorageProvisionedTiB,
    maxVmVcpu: parsed.maxVmVcpu,
    maxVmRamGiB: parsed.maxVmRamGiB,
    vmCount: parsed.totalVms,
    peakIops: settings.peakIops ?? null,
    settings,
  });
}

export function computeClusterRecommendations(
  parsed: ParsedEnvironment,
  settings: SizerSettings,
): ClusterRecommendation[] {
  return parsed.clusterDetails.map((cluster) => {
    const recommendation = computeRecommendationFromAggregates({
      aggVcpu: cluster.aggVcpu,
      aggRamGiB: cluster.aggRamGiB,
      aggStorageTiB:
        settings.storageBasis === "consumed" && cluster.aggStorageConsumedTiB > 0
          ? cluster.aggStorageConsumedTiB
          : cluster.aggStorageProvisionedTiB,
      maxVmVcpu: cluster.maxVmVcpu,
      maxVmRamGiB: cluster.maxVmRamGiB,
      vmCount: cluster.totalVms,
      peakIops: null,
      settings,
    });
    return { clusterName: cluster.name, recommendation };
  });
}

function computeRecommendationFromAggregates(input: {
  aggVcpu: number;
  aggRamGiB: number;
  aggStorageTiB: number;
  maxVmVcpu: number | null;
  maxVmRamGiB: number | null;
  vmCount: number | null;
  peakIops: number | null;
  settings: SizerSettings;
}): SizerRecommendation {
  const rf = input.settings.rf;
  const efficiency: StorageEfficiency = input.settings.storageEfficiency ?? "none";
  // Enforce the RF minimum (RF2 → 3 nodes, RF3 → 5 nodes).
  const n = Math.max(minNodesForRf(rf), input.settings.nodeCount);
  const ratio = Math.max(1, input.settings.vcpuToPcoreRatio);
  // HA failover reservation: N+1 by default, capped so ≥1 node carries workload.
  const failoverHosts = Math.min(Math.max(1, input.settings.failoverHosts ?? 1), n - 1);
  const workNodes = n - failoverHosts;

  // Business constants
  const CVM_PCORES_PER_NODE = 4;
  const CVM_RAM_GB_PER_NODE = 32;
  const PC_PCORES = 2;
  const PC_RAM_GB = 32;
  const HYPERVISOR_RAM_OVERHEAD = 0.05;
  const STORAGE_SLACK_UTIL_TARGET = 0.8;

  // Pass 1
  const workloadPCores = Math.ceil(input.aggVcpu / ratio);
  const basePCores = workloadPCores + PC_PCORES;
  const baseRamGiB = input.aggRamGiB + PC_RAM_GB;
  const storageFactor = effectiveStorageFactor(rf, efficiency);
  const totalRawStorageTiB = (input.aggStorageTiB * storageFactor) / STORAGE_SLACK_UTIL_TARGET;

  // Pass 2 — workload distributes across surviving (N − failover) nodes.
  const nodeWorkloadPCores = basePCores / workNodes;
  const nodeTotalPCores = nodeWorkloadPCores + CVM_PCORES_PER_NODE;
  const nodeWorkloadRam = baseRamGiB / workNodes;
  const nodeTotalRamGiB = (nodeWorkloadRam + CVM_RAM_GB_PER_NODE) * (1 + HYPERVISOR_RAM_OVERHEAD);
  const nodeStorageTiB = totalRawStorageTiB / n;

  const clusterTotalPCores = nodeTotalPCores * n;
  const clusterTotalRamGiB = nodeTotalRamGiB * n;
  const clusterTotalStorageTiB = nodeStorageTiB * n;

  const maxVmPcoreNeed = input.maxVmVcpu == null ? null : input.maxVmVcpu / ratio;
  const workloadPcorePerNode = nodeTotalPCores - CVM_PCORES_PER_NODE;
  const workloadRamPerNode = baseRamGiB / workNodes;
  const monsterVmCpuRisk = maxVmPcoreNeed != null && maxVmPcoreNeed > workloadPcorePerNode;
  const monsterVmRamRisk = input.maxVmRamGiB != null && input.maxVmRamGiB > workloadRamPerNode;
  const monsterVmRisk = monsterVmCpuRisk || monsterVmRamRisk;
  const monsterVmReason = monsterVmRisk
    ? `VM exceeds per-node workload envelope (${monsterVmCpuRisk ? "CPU" : ""}${monsterVmCpuRisk && monsterVmRamRisk ? " and " : ""}${monsterVmRamRisk ? "RAM" : ""}).`
    : null;

  const perNodeIops = input.peakIops != null && input.peakIops > 0 ? Math.round(input.peakIops / n) : null;

  return {
    basePCores: round2(basePCores),
    baseRamGiB: round2(baseRamGiB),
    totalRawStorageTiB: round2(totalRawStorageTiB),
    nodeTotalPCores: round2(nodeTotalPCores),
    nodeTotalRamGiB: round2(nodeTotalRamGiB),
    nodeStorageTiB: round2(nodeStorageTiB),
    clusterTotalPCores: round2(clusterTotalPCores),
    clusterTotalRamGiB: round2(clusterTotalRamGiB),
    clusterTotalStorageTiB: round2(clusterTotalStorageTiB),
    monsterVmRisk,
    monsterVmReason,
    effectiveNodeCount: n,
    failoverHosts,
    clusterCount: recommendedClusterCount(n),
    licenseTier: deriveLicenseTier(n, input.vmCount),
    diskTier: diskTierForIops(perNodeIops),
    perNodeIops,
    networkRecommendation: deriveNetworkRecommendation(perNodeIops),
    warnings: validateBuild({
      rf,
      nodeCount: n,
      failoverHosts,
      vmCount: input.vmCount,
      vcpuPcoreRatio: ratio,
      storageEfficiency: efficiency,
    }),
  };
}

