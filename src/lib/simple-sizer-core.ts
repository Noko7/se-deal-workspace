import type { PlausibilityIssue } from "@/lib/sizer-units";

export type SizerSource = "collector_excel" | "rvtools" | "liveoptics";

// How hard an observed-utilization figure is. A peak or 95th percentile already
// contains the spikes; an average hides them.
export type UtilizationBasis = "peak" | "p95" | "average";

export type { PlausibilityIssue } from "@/lib/sizer-units";

/**
 * What the export's performance data says the workload actually uses, as opposed
 * to what it has been allocated. Present only when the file carries telemetry.
 *
 * Host-level context for the existing-environment view; never a sizing input.
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
export type HostNic = {
  name: string;
  speedMbps: number | null;
  driver: string | null;
  mac: string | null;
  // Link state as the export reports it ("Up" / "Down"), when present.
  status?: string | null;
};

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
  // Physical NICs, when the export carries them. `count` comes from a host
  // column, `adapters` from a per-NIC sheet; either may be missing. Inventory
  // context only; never a sizing input.
  nics?: { count: number | null; adapters: HostNic[] } | null;
};

// What the parser read, and how it decided. Surfaced in the UI so an SE can
// verify every column and unit rather than trusting the tool.
export type ParseAudit = {
  field: string;
  sheet: string;
  column: string | null;
  unit: string | null;
  // "header": the unit is printed in the column header. "registry": the header
  // carries no unit and the tool's documented convention supplies it.
  // "unresolved": neither, so the column is not used.
  confidence: "header" | "registry" | "unresolved";
  // The resolved value is physically impossible; the build is blocked.
  implausible?: boolean;
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
  // Provisioned = virtual disk capacity. Consumed = guest partition used, or the
  // tool's VM-level used column when the guest reported no partitions.
  storageProvisionedTiB: number;
  storageConsumedTiB: number;
  consumedSource?: "partition" | "vm-level" | "none";
  cpuUsed: VmCpuUsage;
  ramUsedGiB: number | null;
};

// Storage with no owning VM, e.g. Kubernetes persistent volumes in a Collector
// 7.x export. It has no CPU or RAM but still has to be migrated.
export type VolumeGroupRecord = {
  name: string;
  owner: string;
  clusterId: string | null;
  provisionedTiB: number;
  consumedTiB: number;
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
  volumeGroups?: VolumeGroupRecord[];
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
