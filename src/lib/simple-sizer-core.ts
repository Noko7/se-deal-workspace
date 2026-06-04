export type SizerSource = "collector_excel" | "rvtools" | "liveoptics";

export type ParsedEnvironment = {
  source: SizerSource;
  sourceDetection: "manual";
  fileName: string;
  clusters: number;
  hosts: number;
  totalCpuCores: number;
  consumedCpuCores: number | null;
  totalMemoryGiB: number;
  consumedMemoryGiB: number | null;
  totalStorageTiB: number;
  consumedStorageTiB: number | null;
  notes: string[];
};

export type SizerSettings = {
  nMinusOne: boolean;
  rf: 2 | 3;
  cvmOverheadPct: number;
  pcOverheadPct: number;
  growthPct: number;
};

export type SizerRecommendation = {
  availableCpuCores: number;
  availableMemoryGiB: number;
  availableStorageTiB: number;
  recommendedCpuCores: number | null;
  recommendedMemoryGiB: number | null;
  recommendedStorageTiB: number | null;
  cpuDelta: number | null;
  memoryDeltaGiB: number | null;
  storageDeltaTiB: number | null;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function computeSizerRecommendation(parsed: ParsedEnvironment, settings: SizerSettings): SizerRecommendation {
  const hostFactor = settings.nMinusOne && parsed.hosts > 1 ? (parsed.hosts - 1) / parsed.hosts : 1;
  const overheadFactor = 1 - (settings.cvmOverheadPct + settings.pcOverheadPct) / 100;
  const safeOverheadFactor = Math.max(0.1, overheadFactor);
  const growthFactor = 1 + settings.growthPct / 100;

  const availableCpuCores = parsed.totalCpuCores * hostFactor * safeOverheadFactor;
  const availableMemoryGiB = parsed.totalMemoryGiB * hostFactor * safeOverheadFactor;
  const availableStorageTiB = parsed.totalStorageTiB * hostFactor;

  const recommendedCpuCores =
    parsed.consumedCpuCores == null ? null : (parsed.consumedCpuCores * growthFactor) / safeOverheadFactor;
  const recommendedMemoryGiB =
    parsed.consumedMemoryGiB == null ? null : (parsed.consumedMemoryGiB * growthFactor) / safeOverheadFactor;
  const recommendedStorageTiB =
    parsed.consumedStorageTiB == null
      ? null
      : parsed.consumedStorageTiB * settings.rf * growthFactor + parsed.consumedStorageTiB * 0.08;

  return {
    availableCpuCores: round2(availableCpuCores),
    availableMemoryGiB: round2(availableMemoryGiB),
    availableStorageTiB: round2(availableStorageTiB),
    recommendedCpuCores: recommendedCpuCores == null ? null : round2(recommendedCpuCores),
    recommendedMemoryGiB: recommendedMemoryGiB == null ? null : round2(recommendedMemoryGiB),
    recommendedStorageTiB: recommendedStorageTiB == null ? null : round2(recommendedStorageTiB),
    cpuDelta: recommendedCpuCores == null ? null : round2(Math.max(0, recommendedCpuCores - availableCpuCores)),
    memoryDeltaGiB:
      recommendedMemoryGiB == null ? null : round2(Math.max(0, recommendedMemoryGiB - availableMemoryGiB)),
    storageDeltaTiB:
      recommendedStorageTiB == null ? null : round2(Math.max(0, recommendedStorageTiB - availableStorageTiB)),
  };
}

