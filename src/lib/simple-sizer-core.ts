import {
  SIZING_RULES,
  diskTierForIops,
  effectiveStorageFactor,
  licenseTier as deriveLicenseTier,
  minNodesForRf,
  networkRecommendation as deriveNetworkRecommendation,
  prismCentralReserveFor,
  splitNodesIntoClusters,
  validateBuild,
  type CvmReserve,
  type DiskTier,
  type LicenseTier,
  type PrismCentralReserve,
  type Rf,
  type StorageEfficiency,
} from "@/lib/sizing-guidance";
import {
  chooseNodeProfile,
  customNodeProfile,
  findNodeProfile,
  fitProfile,
  usableCoresPerNode,
  usableRamPerNode,
  type NodeDemand,
  type NodeProfile,
  type ProfileFit,
} from "@/lib/node-profiles";

import type { PlausibilityIssue } from "@/lib/sizer-units";

export type SizerSource = "collector_excel" | "rvtools" | "liveoptics";

export type { StorageEfficiency } from "@/lib/sizing-guidance";
export type { NodeProfile, ProfileFit } from "@/lib/node-profiles";
export type { PlausibilityIssue } from "@/lib/sizer-units";

// One distinct hardware configuration inside a cluster. Clusters are frequently
// mixed, so the inventory groups by model *and* per-host spec rather than
// averaging a cluster into a node that doesn't exist.
export type ClusterHardwareModel = {
  model: string;
  vendor: string | null;
  cpuModel: string | null;
  hostCount: number;
  // Per-host spec for this group.
  socketsPerHost: number;
  coresPerSocket: number;
  coresPerHost: number;
  ramPerHostGiB: number;
  storagePerHostTiB: number;
  // Group totals.
  cpuCores: number;
  memoryGiB: number;
  storageTiB: number;
};

// A single physical host, kept so the Existing Clusters view can list hardware
// exhaustively rather than only in aggregate.
export type HostRecord = {
  name: string;
  model: string;
  vendor: string | null;
  cpuModel: string | null;
  sockets: number;
  coresPerSocket: number;
  cores: number;
  ramGiB: number;
  cpuUtilPct: number | null;
  memoryUtilPct: number | null;
};

// What the parser read, and how it decided. Surfaced in the UI so an SE can
// verify every column and unit rather than trusting the tool.
export type ParseAudit = {
  field: string;
  sheet: string;
  column: string | null;
  unit: string | null;
  confidence: "header" | "magnitude" | "header-overridden" | "unresolved";
  note: string;
};

// Totals for one slice of the VM estate (all VMs, powered-on only, or off only).
// Mirrors the Collector "Cluster Summary" tab so an SE can reconcile the numbers.
export type PowerSlice = {
  vms: number;
  vcpu: number;
  ramGiB: number;
  diskProvisionedTiB: number;
  partitionConfiguredTiB: number;
  partitionConsumedTiB: number;
};

export function emptyPowerSlice(): PowerSlice {
  return { vms: 0, vcpu: 0, ramGiB: 0, diskProvisionedTiB: 0, partitionConfiguredTiB: 0, partitionConsumedTiB: 0 };
}

export type TopVm = {
  name: string;
  cluster: string | null;
  vcpu: number;
  ramGiB: number;
  storageTiB: number;
  poweredOn: boolean;
};

export type ParsedCluster = {
  // Stable unique key. Obfuscated exports routinely repeat cluster names, so
  // nothing downstream may use `name` as identity.
  id: string;
  name: string;
  datacenter: string | null;
  moid: string | null;
  hosts: number;
  hostRecords: HostRecord[];
  topVms: TopVm[];
  hostCpuUtilPct: number | null;
  hostMemoryUtilPct: number | null;
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
  // Power-state split. `all` always matches the aggregate fields above; when the
  // export carries no power state, `poweredOn` equals `all` and `powerStateKnown`
  // is false so the UI can say so rather than implying every VM is running.
  powerStateKnown: boolean;
  all: PowerSlice;
  poweredOn: PowerSlice;
  poweredOff: PowerSlice;
};

export type ParsedEnvironment = {
  source: SizerSource;
  sourceDetection: "manual";
  fileName: string;
  fileSizeBytes: number | null;
  analyzedAt: string;
  datacenters: number | null;
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
  powerStateKnown: boolean;
  all: PowerSlice;
  poweredOn: PowerSlice;
  poweredOff: PowerSlice;
  guestOs: { name: string; count: number }[];
  topVms: TopVm[];
  snapshots: number | null;
  hostCpuUtilPct: number | null;
  hostMemoryUtilPct: number | null;
  sheetsFound: string[];
  // How every quantity was read, and any reason the numbers can't be trusted.
  audit: ParseAudit[];
  plausibility: PlausibilityIssue[];
  clusterDetails: ParsedCluster[];
  notes: string[];
};

export type WorkloadBasis = "poweredOn" | "all";
export type RfSetting = "auto" | 2 | 3;
export type PlanMode = "consolidated" | "per-cluster";
export const AUTO_PROFILE = "auto";
export const CUSTOM_PROFILE = "custom";

export type SizerSettings = {
  // Size against running VMs (default) or every VM in the export.
  workloadBasis: WorkloadBasis;
  vcpuToPcoreRatio: number;
  // "auto" keeps RF2 for small clusters and steps up to RF3 at 5+ nodes.
  rf: RfSetting;
  // N+1 = 1 (default), N+2 = 2. HA failover capacity reserved for restarts.
  failoverHosts: number;
  storageBasis: "provisioned" | "consumed";
  storageEfficiency: StorageEfficiency;
  // AUTO_PROFILE picks the node class; CUSTOM_PROFILE uses the three custom* fields.
  nodeProfileId: string;
  customCores: number;
  customRamGiB: number;
  customStorageTiB: number;
  // One pooled build vs. one target cluster per source cluster.
  planMode: PlanMode;
  // Observed peak IOPS (7-day, 4K random) — drives disk-tier guidance.
  peakIops: number | null;
};

export const DEFAULT_SIZER_SETTINGS: SizerSettings = {
  workloadBasis: "poweredOn",
  vcpuToPcoreRatio: 4,
  rf: "auto",
  failoverHosts: 1,
  storageBasis: "consumed",
  storageEfficiency: "none",
  nodeProfileId: AUTO_PROFILE,
  customCores: 64,
  customRamGiB: 1024,
  customStorageTiB: 40,
  planMode: "consolidated",
  peakIops: null,
};

// What the sizer is asked to place: one environment, or one source cluster.
export type Workload = {
  label: string;
  vmCount: number;
  vcpu: number;
  ramGiB: number;
  storageTiB: number;
  maxVmVcpu: number | null;
  maxVmRamGiB: number | null;
};

export type NodeSpec = { cores: number; ramGiB: number; storageTiB: number };

export type BuildRecommendation = {
  workload: Workload;
  profile: NodeProfile;
  autoSelected: boolean;
  demand: NodeDemand;
  fit: ProfileFit;
  effectiveRf: Rf;
  rfUpgraded: boolean;
  failoverHosts: number;
  nodes: number;
  workingNodes: number;
  clusterCount: number;
  clusterSizes: number[];
  perNode: NodeSpec;
  totals: { cores: number; ramGiB: number; rawStorageTiB: number };
  headroom: { cpuPct: number; ramPct: number; storagePct: number };
  monsterVmRisk: boolean;
  monsterVmReason: string | null;
  // Platform overhead carried by the build, stated rather than implied.
  overhead: {
    cvm: CvmReserve;
    cvmTotalCores: number;
    cvmTotalRamGiB: number;
    prismCentral: PrismCentralReserve;
  };
  licenseTier: LicenseTier;
  diskTier: DiskTier | null;
  perNodeIops: number | null;
  networkRecommendation: string;
  warnings: string[];
};

// One cluster the customer would actually stand up.
export type TargetCluster = {
  name: string;
  nodes: number;
  rf: Rf;
  origin: string[];
  perNode: NodeSpec;
  totals: { cores: number; ramGiB: number; rawStorageTiB: number };
  util: { cpuPct: number; ramPct: number; storagePct: number };
};

export type ClusterBuild = { source: ParsedCluster; build: BuildRecommendation };

export type SizingPlan = {
  mode: PlanMode;
  profile: NodeProfile;
  autoSelected: boolean;
  consolidated: BuildRecommendation;
  perCluster: ClusterBuild[];
  targets: TargetCluster[];
  totalNodes: number;
  totalClusters: number;
  totals: { cores: number; ramGiB: number; rawStorageTiB: number };
  warnings: string[];
  // When non-empty the recommendation is not trustworthy and the UI must show
  // diagnostics instead of a build.
  blockers: PlausibilityIssue[];
};

// A build this size means the inputs are wrong, not that the customer needs a
// datacenter. Above it, the recommendation is suppressed.
const MAX_CREDIBLE_NODES = 512;

// Overheads and headroom the build always carries. Prism Central is sized from
// the estate (see `prismCentralReserveFor`); the per-node CVM reserve comes from
// the node class (see `cvmReserveFor`). Neither is a magic constant.
const HYPERVISOR_RAM_OVERHEAD = 0.05;
const STORAGE_UTIL_TARGET = 0.8; // leave 20% free for rebuild/curator

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function sliceFor(
  source: { poweredOn: PowerSlice; all: PowerSlice; powerStateKnown: boolean },
  basis: WorkloadBasis,
): PowerSlice {
  if (basis === "all" || !source.powerStateKnown) return source.all;
  return source.poweredOn;
}

function storageFromSlice(slice: PowerSlice, basis: "provisioned" | "consumed"): number {
  if (basis === "consumed" && slice.partitionConsumedTiB > 0) return slice.partitionConsumedTiB;
  if (slice.partitionConfiguredTiB > 0) return slice.partitionConfiguredTiB;
  return slice.diskProvisionedTiB;
}

// CPU and RAM come from the chosen basis (running VMs by default), but storage
// always comes from every VM — a powered-off VM still occupies capacity and still
// has to be migrated.
export function environmentWorkload(parsed: ParsedEnvironment, settings: SizerSettings): Workload {
  const slice = sliceFor(parsed, settings.workloadBasis);
  return {
    label: "Whole environment",
    vmCount: slice.vms,
    vcpu: slice.vcpu,
    ramGiB: slice.ramGiB,
    storageTiB: storageFromSlice(parsed.all, settings.storageBasis),
    maxVmVcpu: parsed.maxVmVcpu,
    maxVmRamGiB: parsed.maxVmRamGiB,
  };
}

export function clusterWorkload(cluster: ParsedCluster, settings: SizerSettings): Workload {
  const slice = sliceFor(cluster, settings.workloadBasis);
  return {
    label: cluster.name,
    vmCount: slice.vms,
    vcpu: slice.vcpu,
    ramGiB: slice.ramGiB,
    storageTiB: storageFromSlice(cluster.all, settings.storageBasis),
    maxVmVcpu: cluster.maxVmVcpu,
    maxVmRamGiB: cluster.maxVmRamGiB,
  };
}

// Physical demand before RF: whole cores, RAM with hypervisor overhead, and the
// Prism Central footprint. Storage is layered on per-RF inside the solver.
function computeDemand(workload: Workload, settings: SizerSettings, rf: Rf): NodeDemand {
  const ratio = Math.max(1, settings.vcpuToPcoreRatio);
  const factor = effectiveStorageFactor(rf, settings.storageEfficiency);
  // Prism Central runs on the cluster it manages, so its vCPU, RAM and disk are
  // part of the workload — and it grows with the estate.
  const pc = prismCentralReserveFor(workload.vmCount);
  return {
    pCores: Math.ceil((workload.vcpu + pc.totalVcpu) / ratio),
    ramGiB: (workload.ramGiB + pc.totalRamGiB) * (1 + HYPERVISOR_RAM_OVERHEAD),
    rawStorageTiB: ((workload.storageTiB + pc.totalStorageTiB) * factor) / STORAGE_UTIL_TARGET,
    maxVmPCores: workload.maxVmVcpu == null ? null : Math.ceil(workload.maxVmVcpu / ratio),
    maxVmRamGiB: workload.maxVmRamGiB,
  };
}

function resolveProfile(settings: SizerSettings): { profile: NodeProfile | null; autoSelected: boolean } {
  if (settings.nodeProfileId === AUTO_PROFILE) return { profile: null, autoSelected: true };
  if (settings.nodeProfileId === CUSTOM_PROFILE) {
    return {
      profile: customNodeProfile(settings.customCores, settings.customRamGiB, settings.customStorageTiB),
      autoSelected: false,
    };
  }
  const found = findNodeProfile(settings.nodeProfileId);
  return found ? { profile: found, autoSelected: false } : { profile: null, autoSelected: true };
}

// RF, node count, and node class are mutually dependent: RF sets the storage
// multiplier and the node floor, and the resulting node count can push RF2 -> RF3.
// Settle it with a short fixed-point loop — RF only ever ratchets upward, so it
// converges in at most two passes.
function solve(
  workload: Workload,
  settings: SizerSettings,
  pickProfile: (demand: NodeDemand, minNodes: number) => NodeProfile,
): { rf: Rf; profile: NodeProfile; fit: ProfileFit; demand: NodeDemand } {
  const failoverHosts = Math.max(0, Math.floor(settings.failoverHosts));
  let rf: Rf = settings.rf === 3 ? 3 : 2;
  let result: { rf: Rf; profile: NodeProfile; fit: ProfileFit; demand: NodeDemand } | null = null;

  for (let pass = 0; pass < 4; pass += 1) {
    const minNodes = minNodesForRf(rf);
    const demand = computeDemand(workload, settings, rf);
    const profile = pickProfile(demand, minNodes);
    const fit = fitProfile(profile, demand, { failoverHosts, minNodes });
    result = { rf, profile, fit, demand };

    const next: Rf = settings.rf === 3 ? 3 : settings.rf === 2 ? 2 : fit.totalNodes >= 5 ? 3 : 2;
    if (next === rf) break;
    rf = next;
  }

  return result!;
}

export function sizeWorkload(
  workload: Workload,
  settings: SizerSettings,
  forcedProfile?: NodeProfile | null,
): BuildRecommendation {
  const { profile: settingProfile, autoSelected } = resolveProfile(settings);
  const fixedProfile = forcedProfile ?? settingProfile;
  const failoverHosts = Math.max(0, Math.floor(settings.failoverHosts));

  const { rf, profile, fit, demand } = solve(workload, settings, (demandForRf, minNodes) =>
    fixedProfile ?? chooseNodeProfile([demandForRf], { failoverHosts, minNodes }),
  );

  const nodes = fit.totalNodes;
  const clusterSizes = splitNodesIntoClusters(nodes);
  const perNodeIops = settings.peakIops != null && settings.peakIops > 0 ? Math.round(settings.peakIops / nodes) : null;

  const monsterVmCpu = demand.maxVmPCores != null && demand.maxVmPCores > usableCoresPerNode(profile);
  const monsterVmRam = demand.maxVmRamGiB != null && demand.maxVmRamGiB > usableRamPerNode(profile);
  const monsterVmRisk = monsterVmCpu || monsterVmRam;

  const warnings = validateBuild({
    rf,
    nodeCount: Math.min(nodes, SIZING_RULES.maxNodesPerCluster),
    failoverHosts,
    vmCount: workload.vmCount,
    vcpuPcoreRatio: Math.max(1, settings.vcpuToPcoreRatio),
    storageEfficiency: settings.storageEfficiency,
  });
  if (nodes > SIZING_RULES.maxNodesPerCluster) {
    warnings.unshift(
      `${nodes} nodes exceeds the ${SIZING_RULES.maxNodesPerCluster}-node cluster maximum — planned as ${clusterSizes.length} clusters under one Prism Central.`,
    );
  }

  return {
    workload,
    profile,
    autoSelected: forcedProfile ? false : autoSelected,
    demand: {
      ...demand,
      pCores: Math.ceil(demand.pCores),
      ramGiB: round2(demand.ramGiB),
      rawStorageTiB: round2(demand.rawStorageTiB),
    },
    fit,
    effectiveRf: rf,
    rfUpgraded: settings.rf === "auto" && rf === 3,
    failoverHosts,
    nodes,
    workingNodes: fit.workingNodes,
    clusterCount: clusterSizes.length,
    clusterSizes,
    perNode: {
      cores: profile.cores,
      ramGiB: fit.ramPerNodeGiB,
      storageTiB: fit.storagePerNodeTiB,
    },
    totals: {
      cores: profile.cores * nodes,
      ramGiB: fit.ramPerNodeGiB * nodes,
      rawStorageTiB: round2(demand.rawStorageTiB),
    },
    headroom: {
      cpuPct: round2(fit.cpuUtilPct),
      ramPct: round2(fit.ramUtilPct),
      storagePct: round2(fit.storageUtilPct),
    },
    monsterVmRisk,
    monsterVmReason: monsterVmRisk
      ? `Largest VM needs ${monsterVmCpu ? `${demand.maxVmPCores} pCores` : ""}${monsterVmCpu && monsterVmRam ? " and " : ""}${monsterVmRam ? `${Math.round(demand.maxVmRamGiB ?? 0)} GB RAM` : ""} — more than one ${profile.label} node has free after the CVM. Move to a larger node class.`
      : null,
    overhead: {
      cvm: fit.cvm,
      cvmTotalCores: fit.cvm.cores * nodes,
      cvmTotalRamGiB: fit.cvm.ramGiB * nodes,
      prismCentral: prismCentralReserveFor(workload.vmCount),
    },
    licenseTier: deriveLicenseTier(Math.min(nodes, SIZING_RULES.maxNodesPerCluster), workload.vmCount),
    diskTier: diskTierForIops(perNodeIops),
    perNodeIops,
    networkRecommendation: deriveNetworkRecommendation(perNodeIops),
    warnings,
  };
}

function targetsFromBuild(build: BuildRecommendation, namePrefix: string, origin: string[]): TargetCluster[] {
  const total = build.nodes;
  return build.clusterSizes.map((nodes, i) => {
    const share = total > 0 ? nodes / total : 0;
    const storage = round2(build.totals.rawStorageTiB * share);
    const usableCores = usableCoresPerNode(build.profile) * nodes;
    const usableRam = usableRamPerNode(build.profile, build.perNode.ramGiB) * nodes;
    return {
      name: build.clusterSizes.length === 1 ? namePrefix : `${namePrefix} ${i + 1}`,
      nodes,
      rf: build.effectiveRf,
      origin,
      perNode: {
        cores: build.profile.cores,
        ramGiB: build.perNode.ramGiB,
        storageTiB: round2(storage / Math.max(1, nodes)),
      },
      totals: {
        cores: build.profile.cores * nodes,
        ramGiB: build.perNode.ramGiB * nodes,
        rawStorageTiB: storage,
      },
      util: {
        cpuPct: round2(usableCores > 0 ? (build.demand.pCores * share * 100) / usableCores : 0),
        ramPct: round2(usableRam > 0 ? (build.demand.ramGiB * share * 100) / usableRam : 0),
        storagePct: round2(build.profile.maxStorageTiB > 0 ? (storage * 100) / (build.profile.maxStorageTiB * nodes) : 0),
      },
    };
  });
}

// Full plan for the uploaded environment. Both views are always computed so the
// UI can flip between "one pooled build" and "one cluster per source cluster"
// without recomputing, and so the two can be compared side by side.
export function buildSizingPlan(parsed: ParsedEnvironment, settings: SizerSettings): SizingPlan {
  const failoverHosts = Math.max(0, Math.floor(settings.failoverHosts));
  const { profile: settingProfile, autoSelected } = resolveProfile(settings);

  const envWorkload = environmentWorkload(parsed, settings);
  const clusterWorkloads = parsed.clusterDetails.map((cluster) => ({
    cluster,
    workload: clusterWorkload(cluster, settings),
  }));

  // On Auto, standardise one node class across the estate — customers buy one
  // part number, not a platform per cluster. It is chosen against the demands
  // that will actually be built: the pooled demand when consolidating, or every
  // cluster's demand when each becomes its own cluster. Scoring the per-cluster
  // demands while consolidating lets a long tail of small source clusters outvote
  // the build itself — 38 two-host clusters once dragged an 861 TB estate onto a
  // 24-core node class it had no business using.
  let standardProfile = settingProfile;
  if (!standardProfile) {
    const seedRf: Rf = settings.rf === 3 ? 3 : 2;
    const demands: NodeDemand[] =
      settings.planMode === "per-cluster"
        ? clusterWorkloads.map(({ workload }) => computeDemand(workload, settings, seedRf))
        : [computeDemand(envWorkload, settings, seedRf)];
    standardProfile = chooseNodeProfile(demands.length ? demands : [computeDemand(envWorkload, settings, seedRf)], {
      failoverHosts,
      minNodes: minNodesForRf(seedRf),
    });
  }

  const consolidated = sizeWorkload(envWorkload, settings, standardProfile);
  const perCluster: ClusterBuild[] = clusterWorkloads.map(({ cluster, workload }) => ({
    source: cluster,
    build: sizeWorkload(workload, settings, standardProfile),
  }));

  const targets =
    settings.planMode === "consolidated"
      ? targetsFromBuild(
          consolidated,
          "Nutanix Cluster",
          parsed.clusterDetails.map((c) => c.name),
        )
      : perCluster.flatMap(({ source, build }) => targetsFromBuild(build, source.name, [source.name]));

  const totalNodes = targets.reduce((sum, t) => sum + t.nodes, 0);
  const totals = targets.reduce(
    (acc, t) => ({
      cores: acc.cores + t.totals.cores,
      ramGiB: acc.ramGiB + t.totals.ramGiB,
      rawStorageTiB: acc.rawStorageTiB + t.totals.rawStorageTiB,
    }),
    { cores: 0, ramGiB: 0, rawStorageTiB: 0 },
  );

  const warnings = new Set<string>(consolidated.warnings);
  if (settings.planMode === "per-cluster") {
    warnings.clear();
    // Warnings that fire for every cluster (block awareness, say) are stated once;
    // cluster-specific ones name the clusters they apply to. Without this a
    // 40-cluster estate produces 40 copies of the same line.
    const byWarning = new Map<string, string[]>();
    perCluster.forEach(({ source, build }) => {
      build.warnings.forEach((w) => byWarning.set(w, [...(byWarning.get(w) ?? []), source.name]));
    });
    for (const [warning, clusters] of byWarning) {
      if (clusters.length === perCluster.length || perCluster.length === 1) {
        warnings.add(warning);
      } else {
        const named = clusters.slice(0, 3).join(", ");
        const extra = clusters.length > 3 ? ` +${clusters.length - 3} more` : "";
        warnings.add(`${named}${extra}: ${warning}`);
      }
    }
    const consolidatedSaving = consolidated.nodes - totalNodes;
    if (consolidatedSaving < 0) {
      warnings.add(
        `Sizing per source cluster costs ${Math.abs(consolidatedSaving)} more node${Math.abs(consolidatedSaving) === 1 ? "" : "s"} than consolidating — each cluster carries its own HA spare and RF floor.`,
      );
    }
  }
  if (!parsed.powerStateKnown && settings.workloadBasis === "poweredOn") {
    warnings.add("Export has no VM power state — sized against every VM in the file.");
  }

  // Anything the parser already flagged blocks the build, and so does a node
  // count that could only come from a bad input.
  const blockers: PlausibilityIssue[] = [...parsed.plausibility];
  if (totalNodes > MAX_CREDIBLE_NODES) {
    const driver =
      consolidated.fit.driver === "storage"
        ? `${consolidated.demand.rawStorageTiB.toLocaleString()} TiB of raw capacity`
        : consolidated.fit.driver === "ram"
          ? `${Math.round(consolidated.demand.ramGiB).toLocaleString()} GiB of RAM`
          : `${consolidated.demand.pCores.toLocaleString()} physical cores`;
    blockers.push({
      field: "Recommended node count",
      observed: `${totalNodes.toLocaleString()} nodes across ${targets.length.toLocaleString()} clusters`,
      expected: `≤ ${MAX_CREDIBLE_NODES} nodes`,
      detail: `Driven by ${driver}. A figure this large comes from a misread column, not a real environment — check the parsed inputs below.`,
    });
  }

  return {
    mode: settings.planMode,
    profile: standardProfile,
    autoSelected,
    consolidated,
    perCluster,
    targets,
    totalNodes,
    totalClusters: targets.length,
    totals: { cores: totals.cores, ramGiB: totals.ramGiB, rawStorageTiB: round2(totals.rawStorageTiB) },
    warnings: Array.from(warnings),
    blockers,
  };
}
