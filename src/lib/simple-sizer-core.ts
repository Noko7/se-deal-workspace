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
  type UtilizationBasis,
} from "@/lib/sizing-guidance";
import {
  chooseNodeProfile,
  customNodeProfile,
  findNodeProfile,
  fitProfile,
  usableCoresPerNode,
  usableRamPerNode,
  type FitOptions,
  type NodeDemand,
  type NodeProfile,
  type ProfileFit,
} from "@/lib/node-profiles";

import type { PlausibilityIssue } from "@/lib/sizer-units";

export type SizerSource = "collector_excel" | "rvtools" | "liveoptics";

export type { StorageEfficiency, UtilizationBasis } from "@/lib/sizing-guidance";
export type { NodeProfile, ProfileFit } from "@/lib/node-profiles";
export type { PlausibilityIssue } from "@/lib/sizer-units";

/**
 * What the export's performance data says the workload actually uses, as opposed
 * to what it has been allocated. Present only when the file carries telemetry.
 *
 * `cpuPCores` is physical cores genuinely busy, and it can drive the build.
 * `ramGiB` is guest memory actually touched, and it deliberately cannot: memory
 * is sized from what VMs are configured with, never from what they happen to be
 * using, because a VM that reclaims its balloon needs the RAM back immediately.
 */
export type ObservedLoad = {
  cpuPCores: number | null;
  ramGiB: number | null;
  basis: UtilizationBasis;
  // Share of hosts (or VMs) that reported, 0-1. Thin coverage describes the
  // hosts that answered, not the estate.
  coverage: number;
  // Sheet and column the figure came from, for the parsed-inputs panel.
  source: string;
};

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

/**
 * One guest, as read from the export. This is the unit the build is sized from:
 * the VMs in the file are the VMs that will run on the new cluster, so the
 * workload is their sum and nothing else. Host utilization is inventory context,
 * not an input.
 *
 * `cpuUsed` carries whichever statistics the export offered, in physical cores.
 * A null entry means "not measured", which is not the same as zero.
 */
export type VmCpuUsage = {
  average: number | null;
  p95: number | null;
  peak: number | null;
};

export type VmRecord = {
  // Stable and unique. Names repeat constantly in obfuscated exports.
  id: string;
  name: string;
  clusterId: string | null;
  clusterName: string | null;
  poweredOn: boolean | null;
  os: string;
  vcpu: number;
  ramGiB: number;
  storageProvisionedTiB: number;
  storageConsumedTiB: number;
  cpuUsed: VmCpuUsage;
  ramUsedGiB: number | null;
};

/**
 * An SE's changes to one VM before sizing: drop it from the build, or correct
 * what the export said it has. Overrides are held separately from the parse so
 * the file on disk always remains the record of what was read.
 */
export type VmAdjustment = {
  excluded?: boolean;
  vcpu?: number;
  ramGiB?: number;
  storageTiB?: number;
};

export type VmAdjustments = Record<string, VmAdjustment>;

// Which per-VM CPU statistic the build is sized on.
//
// Summing per-VM peaks assumes every guest peaks in the same second, which they
// do not: on a real four-host cluster the VM peaks add to 87 cores while the
// hosts never went above 44. A 95th percentile is the best available answer, an
// average is the usual fallback, and peak is offered for workloads that really
// do move together.
export type CpuStatistic = "p95" | "average" | "peak" | "allocated";

export function applyAdjustment(vm: VmRecord, adjustments: VmAdjustments): VmRecord | null {
  const adjustment = adjustments[vm.id];
  if (!adjustment) return vm;
  if (adjustment.excluded) return null;

  // An edited vCPU count scales measured usage with it: an SE halving a VM's
  // vCPU is saying it should run on half the cores, not that its telemetry is
  // suddenly wrong.
  const scale = adjustment.vcpu != null && vm.vcpu > 0 ? adjustment.vcpu / vm.vcpu : 1;
  const scaled = (value: number | null) => (value == null ? null : value * scale);

  // A typed-in storage figure is the SE's answer for that VM, so it replaces
  // both provisioned and consumed. Overriding only provisioned would leave the
  // default consumed basis reading the export's number and the edit doing
  // nothing.
  return {
    ...vm,
    vcpu: adjustment.vcpu ?? vm.vcpu,
    ramGiB: adjustment.ramGiB ?? vm.ramGiB,
    storageProvisionedTiB: adjustment.storageTiB ?? vm.storageProvisionedTiB,
    storageConsumedTiB: adjustment.storageTiB ?? vm.storageConsumedTiB,
    cpuUsed:
      scale === 1
        ? vm.cpuUsed
        : { average: scaled(vm.cpuUsed.average), p95: scaled(vm.cpuUsed.p95), peak: scaled(vm.cpuUsed.peak) },
  };
}

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
  // Telemetry, when the export carries any. Drives CPU sizing; never memory.
  observed: ObservedLoad | null;
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
  observed: ObservedLoad | null;
  powerStateKnown: boolean;
  all: PowerSlice;
  poweredOn: PowerSlice;
  poweredOff: PowerSlice;
  guestOs: { name: string; count: number }[];
  topVms: TopVm[];
  // Every guest in the export. This is what the build is sized from, and what
  // the VM table lets an SE edit or exclude.
  vms: VmRecord[];
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
// Where CPU demand comes from. "observed" prefers what the export's performance
// data says the guests actually burn, falling back to allocation when the file
// carries no telemetry. "allocated" always divides configured vCPU by the
// overcommit ratio, which is the only option on an inventory-only export.
export type CpuBasis = "observed" | "allocated";
export const AUTO_PROFILE = "auto";
export const CUSTOM_PROFILE = "custom";

export type SizerSettings = {
  // Size against running VMs (default) or every VM in the export.
  workloadBasis: WorkloadBasis;
  // Which per-VM CPU statistic drives the build. Memory has no equivalent on
  // purpose: it is always sized from provisioned, never from measured use.
  cpuStatistic: CpuStatistic;
  vcpuToPcoreRatio: number;
  // How full the finished cluster should run, counting the CVM and Prism
  // Central against it. Everything the build provides is sized so that workload
  // plus platform overhead lands here.
  targetUtilizationPct: number;
  // "auto" fills clusters to the planning maximum. A number builds clusters of
  // exactly that size and adds however many are needed, which is how an estate
  // of edge sites gets ten two-node clusters instead of one twenty-node cluster.
  nodesPerCluster: "auto" | number;
  // Per-VM exclusions and corrections applied before anything is summed.
  vmAdjustments: VmAdjustments;
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
  cpuStatistic: "p95",
  vcpuToPcoreRatio: 4,
  targetUtilizationPct: 50,
  nodesPerCluster: "auto",
  vmAdjustments: {},
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
// Every figure here is the sum of the VMs that will actually run, after the SE's
// exclusions and edits. Nothing in it comes from host utilization.
export type Workload = {
  label: string;
  vmCount: number;
  // Excluded by the SE, reported so a shrunken build is never a surprise.
  excludedVms: number;
  vcpu: number;
  ramGiB: number;
  storageTiB: number;
  maxVmVcpu: number | null;
  maxVmRamGiB: number | null;
  // Physical cores the guests actually draw, per statistic. Sized on `chosen`.
  cpu: WorkloadCpu;
};

export type WorkloadCpu = {
  chosen: number;
  statistic: CpuStatistic;
  // Every statistic the export could support, so the spread is visible.
  available: { p95: number | null; average: number | null; peak: number | null; allocated: number };
  // VMs with no telemetry, which fall back to vCPU over the overcommit ratio.
  vmsWithoutTelemetry: number;
  // Set when the asked-for statistic was not in the export.
  fellBackTo: CpuStatistic | null;
};

/**
 * Total the physical cores a set of VMs draws, for one statistic.
 *
 * A VM the export has no telemetry for falls back to its allocation over the
 * overcommit ratio, so a file with partial performance data still totals to
 * something meaningful rather than silently under-counting.
 */
function cpuForStatistic(vms: VmRecord[], statistic: Exclude<CpuStatistic, "allocated">, ratio: number): number | null {
  let total = 0;
  let measured = 0;
  for (const vm of vms) {
    const value = vm.cpuUsed[statistic];
    if (value != null) {
      total += value;
      measured += 1;
    } else {
      total += vm.vcpu / ratio;
    }
  }
  return measured > 0 ? total : null;
}

function resolveWorkloadCpu(vms: VmRecord[], settings: SizerSettings): WorkloadCpu {
  const ratio = Math.max(1, settings.vcpuToPcoreRatio);
  const allocated = vms.reduce((sum, vm) => sum + vm.vcpu, 0) / ratio;
  const available = {
    p95: cpuForStatistic(vms, "p95", ratio),
    average: cpuForStatistic(vms, "average", ratio),
    peak: cpuForStatistic(vms, "peak", ratio),
    allocated,
  };

  // Fall through in order of usefulness when the asked-for statistic is absent.
  const order: CpuStatistic[] =
    settings.cpuStatistic === "allocated"
      ? ["allocated"]
      : [settings.cpuStatistic, "p95", "average", "peak", "allocated"];

  for (const statistic of order) {
    const value = statistic === "allocated" ? allocated : available[statistic];
    if (value != null) {
      return {
        chosen: value,
        statistic,
        available,
        vmsWithoutTelemetry:
          statistic === "allocated" ? vms.length : vms.filter((vm) => vm.cpuUsed[statistic] == null).length,
        fellBackTo: statistic === settings.cpuStatistic ? null : statistic,
      };
    }
  }
  return { chosen: allocated, statistic: "allocated", available, vmsWithoutTelemetry: vms.length, fellBackTo: "allocated" };
}

/**
 * What one VM contributes to the CPU total under a given statistic, and whether
 * that came from telemetry or from its allocation. Shared by the VM table and
 * the export so a row never shows a different statistic than the build used.
 */
export function vmCpuContribution(
  vm: VmRecord,
  statistic: CpuStatistic,
  ratio: number,
): { cores: number; measured: boolean } {
  if (statistic !== "allocated") {
    const value = vm.cpuUsed[statistic];
    if (value != null) return { cores: value, measured: true };
  }
  return { cores: vm.vcpu / Math.max(1, ratio), measured: false };
}

export function cpuStatisticLabel(statistic: CpuStatistic): string {
  if (statistic === "p95") return "95th percentile";
  if (statistic === "peak") return "peak";
  if (statistic === "average") return "average";
  return "allocated vCPU";
}

export function workloadCpuSummary(cpu: WorkloadCpu, targetPct: number, asked?: CpuStatistic): string {
  const head =
    cpu.statistic === "allocated"
      ? `${Math.round(cpu.chosen).toLocaleString()} physical cores from allocated vCPU, built to land at ${targetPct}% utilization.`
      : `${Math.round(cpu.chosen).toLocaleString()} physical cores from the ${cpuStatisticLabel(
          cpu.statistic,
        )} usage of the VMs themselves, built to land at ${targetPct}% utilization.`;
  const fallback =
    cpu.fellBackTo && asked && asked !== cpu.statistic
      ? ` The export carries no ${cpuStatisticLabel(asked)} figure, so ${cpuStatisticLabel(cpu.statistic)} was used instead.`
      : "";
  const untelemetered = cpu.vmsWithoutTelemetry
    ? ` ${cpu.vmsWithoutTelemetry.toLocaleString()} VM${cpu.vmsWithoutTelemetry === 1 ? "" : "s"} had no telemetry and fell back to allocated vCPU.`
    : "";
  const peak =
    cpu.statistic !== "peak" && cpu.available.peak != null
      ? ` Summing every VM's peak instead would ask for ${Math.round(cpu.available.peak).toLocaleString()} cores, which assumes they all peak at once.`
      : "";
  return `${head}${fallback}${untelemetered}${peak}`;
}

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

// Overhead the build always carries. Prism Central is sized from the estate
// (see `prismCentralReserveFor`) and the per-node CVM reserve comes from the
// node class (see `cvmReserveFor`), so neither is a magic constant. Free space
// for rebuilds is no longer a constant either: it falls out of the utilization
// target, which applies to capacity exactly as it does to CPU and memory.
const HYPERVISOR_RAM_OVERHEAD = 0.05;

function round2(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * The VMs a build has to carry, after the SE's exclusions and edits.
 *
 * Powered-off guests are dropped from CPU and memory when sizing against running
 * VMs, but never from storage: a stopped VM still occupies capacity and still
 * has to be migrated. So the storage total always walks the full list.
 */
function selectVms(vms: VmRecord[], settings: SizerSettings, powerStateKnown: boolean) {
  const kept: VmRecord[] = [];
  let excluded = 0;
  for (const vm of vms) {
    const adjusted = applyAdjustment(vm, settings.vmAdjustments);
    if (!adjusted) {
      excluded += 1;
      continue;
    }
    kept.push(adjusted);
  }
  const running =
    settings.workloadBasis === "all" || !powerStateKnown ? kept : kept.filter((vm) => vm.poweredOn !== false);
  return { kept, running, excluded };
}

function workloadFromVms(
  label: string,
  vms: VmRecord[],
  settings: SizerSettings,
  powerStateKnown: boolean,
): Workload {
  const { kept, running, excluded } = selectVms(vms, settings, powerStateKnown);
  const storageTiB = kept.reduce((sum, vm) => {
    const consumed = vm.storageConsumedTiB;
    const provisioned = vm.storageProvisionedTiB;
    if (settings.storageBasis === "consumed" && consumed > 0) return sum + consumed;
    return sum + (provisioned > 0 ? provisioned : consumed);
  }, 0);

  // Totalling thousands of per-VM floats accumulates error that shows up as
  // 40.000000000000006 TB in the UI, so each total is rounded once here.
  return {
    label,
    vmCount: running.length,
    excludedVms: excluded,
    vcpu: round2(running.reduce((sum, vm) => sum + vm.vcpu, 0)),
    ramGiB: round2(running.reduce((sum, vm) => sum + vm.ramGiB, 0)),
    storageTiB: Number(storageTiB.toFixed(4)),
    maxVmVcpu: running.length ? Math.max(...running.map((vm) => vm.vcpu)) : null,
    maxVmRamGiB: running.length ? Math.max(...running.map((vm) => vm.ramGiB)) : null,
    cpu: resolveWorkloadCpu(running, settings),
  };
}

export function environmentWorkload(parsed: ParsedEnvironment, settings: SizerSettings): Workload {
  return workloadFromVms("Whole environment", parsed.vms, settings, parsed.powerStateKnown);
}

export function clusterWorkload(cluster: ParsedCluster, parsed: ParsedEnvironment, settings: SizerSettings): Workload {
  const vms = parsed.vms.filter((vm) => vm.clusterId === cluster.id);
  return workloadFromVms(cluster.name, vms, settings, parsed.powerStateKnown);
}

/**
 * What the hardware has to provide, before any headroom.
 *
 * These are pure demand figures: cores the guests draw, memory they are
 * configured with, raw capacity after replication. The target utilization is
 * applied once, in `fitProfile`, so headroom is never quietly baked in twice.
 *
 * CPU comes from measured per-VM usage. Memory never does. A guest's configured
 * memory is a promise the hypervisor has to keep the moment the guest asks for
 * it, so sizing on what it happens to be touching today is how a cluster ends up
 * swapping in production. Memory is always provisioned.
 */
function computeDemand(workload: Workload, settings: SizerSettings, rf: Rf): NodeDemand {
  const ratio = Math.max(1, settings.vcpuToPcoreRatio);
  const factor = effectiveStorageFactor(rf, settings.storageEfficiency);
  // Prism Central runs on the cluster it manages, so its vCPU, RAM and disk are
  // part of the workload, and it grows with the estate. It is a new VM with no
  // history, so it is counted at its allocation.
  const pc = prismCentralReserveFor(workload.vmCount);
  return {
    pCores: workload.cpu.chosen + pc.totalVcpu / ratio,
    ramGiB: (workload.ramGiB + pc.totalRamGiB) * (1 + HYPERVISOR_RAM_OVERHEAD),
    rawStorageTiB: (workload.storageTiB + pc.totalStorageTiB) * factor,
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
/**
 * Fit options shared by the solver and the class chooser, so both judge a build
 * against exactly the same rules.
 *
 * A pinned cluster size overrides the RF node floor when it is smaller: an SE
 * who asks for two-node edge clusters gets two-node edge clusters, with the
 * Witness requirement raised as a warning rather than silently rounded away.
 */
export function fitOptionsFor(settings: SizerSettings, rf: Rf): FitOptions {
  const pinned = settings.nodesPerCluster === "auto" ? null : Math.max(1, Math.floor(settings.nodesPerCluster));
  return {
    failoverHosts: Math.max(0, Math.floor(settings.failoverHosts)),
    minNodes: pinned ?? minNodesForRf(rf),
    targetUtilization: Math.min(1, Math.max(0.05, settings.targetUtilizationPct / 100)),
    nodesPerCluster: pinned,
  };
}

function solve(
  workload: Workload,
  settings: SizerSettings,
  pickProfile: (demand: NodeDemand, options: FitOptions) => NodeProfile,
): { rf: Rf; profile: NodeProfile; fit: ProfileFit; demand: NodeDemand } {
  let rf: Rf = settings.rf === 3 ? 3 : 2;
  let result: { rf: Rf; profile: NodeProfile; fit: ProfileFit; demand: NodeDemand } | null = null;

  for (let pass = 0; pass < 4; pass += 1) {
    const options = fitOptionsFor(settings, rf);
    const demand = computeDemand(workload, settings, rf);
    const profile = pickProfile(demand, options);
    const fit = fitProfile(profile, demand, options);
    result = { rf, profile, fit, demand };

    // Auto-RF looks at the size of one cluster, not the estate: ten two-node
    // edge clusters are ten small failure domains, not one twenty-node one.
    const next: Rf =
      settings.rf === 3 ? 3 : settings.rf === 2 ? 2 : fit.nodesPerCluster >= SIZING_RULES.autoRf3AtNodes ? 3 : 2;
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

  const { rf, profile, fit, demand } = solve(
    workload,
    settings,
    (demandForRf, options) => fixedProfile ?? chooseNodeProfile([demandForRf], options),
  );

  const nodes = fit.totalNodes;
  // A pinned size produces equal clusters by construction; auto fills to the
  // planning maximum and keeps them within one node of each other.
  const clusterSizes =
    settings.nodesPerCluster === "auto"
      ? splitNodesIntoClusters(nodes)
      : Array.from({ length: fit.clusterCount }, () => fit.nodesPerCluster);
  const perNodeIops = settings.peakIops != null && settings.peakIops > 0 ? Math.round(settings.peakIops / nodes) : null;

  const monsterVmCpu = demand.maxVmPCores != null && demand.maxVmPCores > usableCoresPerNode(profile);
  const monsterVmRam = demand.maxVmRamGiB != null && demand.maxVmRamGiB > usableRamPerNode(profile);
  const monsterVmRisk = monsterVmCpu || monsterVmRam;

  // Validation is about one cluster, so it is fed the size of a cluster rather
  // than the estate total.
  const warnings = validateBuild({
    rf,
    nodeCount: fit.nodesPerCluster,
    failoverHosts,
    vmCount: workload.vmCount,
    vcpuPcoreRatio: Math.max(1, settings.vcpuToPcoreRatio),
    storageEfficiency: settings.storageEfficiency,
  });
  if (settings.nodesPerCluster !== "auto" && clusterSizes.length > 1) {
    warnings.unshift(
      `${clusterSizes.length} clusters of ${fit.nodesPerCluster} node${fit.nodesPerCluster === 1 ? "" : "s"}, ${nodes} nodes in total, under one Prism Central.`,
    );
  } else if (nodes > SIZING_RULES.maxNodesPerCluster) {
    warnings.unshift(
      `${nodes} nodes exceeds the ${SIZING_RULES.maxNodesPerCluster}-node cluster maximum, so it is planned as ${clusterSizes.length} clusters under one Prism Central.`,
    );
  }
  if (workload.excludedVms > 0) {
    warnings.push(
      `${workload.excludedVms} VM${workload.excludedVms === 1 ? " was" : "s were"} excluded from this build by hand.`,
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
      ? `Largest VM needs ${monsterVmCpu ? `${demand.maxVmPCores} pCores` : ""}${monsterVmCpu && monsterVmRam ? " and " : ""}${monsterVmRam ? `${Math.round(demand.maxVmRamGiB ?? 0)} GB RAM` : ""}, more than one ${profile.label} node has free after the CVM. Move to a larger node class.`
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
  const { profile: settingProfile, autoSelected } = resolveProfile(settings);

  const envWorkload = environmentWorkload(parsed, settings);
  const clusterWorkloads = parsed.clusterDetails.map((cluster) => ({
    cluster,
    workload: clusterWorkload(cluster, parsed, settings),
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
    standardProfile = chooseNodeProfile(
      demands.length ? demands : [computeDemand(envWorkload, settings, seedRf)],
      fitOptionsFor(settings, seedRf),
    );
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
        `Sizing per source cluster costs ${Math.abs(consolidatedSaving)} more node${Math.abs(consolidatedSaving) === 1 ? "" : "s"} than consolidating. Each cluster carries its own HA spare and RF floor.`,
      );
    }
  }
  if (!parsed.powerStateKnown && settings.workloadBasis === "poweredOn") {
    warnings.add("Export has no VM power state, so the build is sized against every VM in the file.");
  }
  if (consolidated.workload.cpu.fellBackTo) {
    warnings.add(
      `The export has no ${cpuStatisticLabel(settings.cpuStatistic)} CPU figure for every VM, so the build used ${cpuStatisticLabel(consolidated.workload.cpu.statistic)} instead.`,
    );
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
      detail: `Driven by ${driver}. A figure this large comes from a misread column, not a real environment. Check the parsed inputs below.`,
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
