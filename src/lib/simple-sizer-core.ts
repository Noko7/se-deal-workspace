export type SizerSource = "collector_excel" | "rvtools" | "liveoptics";

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
  settings: SizerSettings;
}): SizerRecommendation {
  const n = Math.max(3, input.settings.nodeCount);
  const ratio = Math.max(1, input.settings.vcpuToPcoreRatio);

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
  const storageRf = input.settings.rf;
  const storageRfApplied = input.aggStorageTiB * storageRf;
  const totalRawStorageTiB = storageRfApplied / STORAGE_SLACK_UTIL_TARGET;

  // Pass 2 (N-1)
  const nodeWorkloadPCores = basePCores / (n - 1);
  const nodeTotalPCores = nodeWorkloadPCores + CVM_PCORES_PER_NODE;
  const nodeWorkloadRam = baseRamGiB / (n - 1);
  const nodeTotalRamGiB = (nodeWorkloadRam + CVM_RAM_GB_PER_NODE) * (1 + HYPERVISOR_RAM_OVERHEAD);
  const nodeStorageTiB = totalRawStorageTiB / n;

  const clusterTotalPCores = nodeTotalPCores * n;
  const clusterTotalRamGiB = nodeTotalRamGiB * n;
  const clusterTotalStorageTiB = nodeStorageTiB * n;

  const maxVmPcoreNeed = input.maxVmVcpu == null ? null : input.maxVmVcpu / ratio;
  const workloadPcorePerNode = nodeTotalPCores - CVM_PCORES_PER_NODE;
  const workloadRamPerNode = baseRamGiB / (n - 1);
  const monsterVmCpuRisk = maxVmPcoreNeed != null && maxVmPcoreNeed > workloadPcorePerNode;
  const monsterVmRamRisk = input.maxVmRamGiB != null && input.maxVmRamGiB > workloadRamPerNode;
  const monsterVmRisk = monsterVmCpuRisk || monsterVmRamRisk;
  const monsterVmReason = monsterVmRisk
    ? `VM exceeds per-node workload envelope (${monsterVmCpuRisk ? "CPU" : ""}${monsterVmCpuRisk && monsterVmRamRisk ? " and " : ""}${monsterVmRamRisk ? "RAM" : ""}).`
    : null;

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
  };
}

