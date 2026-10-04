// VM-driven NX hardware sizing.
//
// The build is sized from the VMs in the export and nothing else: host
// inventory is context, never an input. Every overhead the platform carries is
// charged explicitly, per node, and itemised so the report can show its work.
//
// Units: arithmetic runs in binary units (GiB / TiB) because that is what the
// exports contain and what memory hardware is built in. Decimal values (drive
// sizes in TB, CVM storage constants in GB) are converted to binary at the
// boundary. Display converts everything to decimal GB / TB (see sizer-format).
//
// Sources for every constant are recorded beside it. "User ruling" means the
// value was decided by the sizing owner because neither reference document
// states one.

import { AUTO_ORDER, NX_MODELS, findNxModel, type DriveLayout, type NxCpu, type NxModel } from "@/lib/nx-catalog";
import { applyAdjustment, type ParsedEnvironment, type VmAdjustments, type VmRecord } from "@/lib/simple-sizer-core";

const GIB = 1024 ** 3;
const TIB = 1024 ** 4;
const decimalGBToGiB = (gb: number) => (gb * 1e9) / GIB;
const decimalTBToTiB = (tb: number) => (tb * 1e12) / TIB;
const mibToGiB = (mib: number) => mib / 1024;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export type Rf = 2 | 3;

export const SIZING_CONSTANTS = {
  // CVM per HCI node, identical on every node (user ruling; AOS 7.6 Advanced
  // Admin Guide Table 16 p.82 "Default: Any General x86" row lists 32 GiB).
  cvmVcpu: 12,
  cvmRamGiB: 32,
  // AOS 7.6 Table 17 p.83: RF3 = (Table 16 vRAM + 8) or 40 GiB, whichever is lower.
  cvmRamGiBRf3: Math.min(32 + 8, 40),
  // Sizer Guide p.60, CVM mode "Regular (Hyperthreading Enabled) 2:1 vCPU-to-core".
  // Confirmed by a Sizer output: 12 vCPU CVM -> 6 cores per node.
  cvmVcpuPerPCore: 2,
  // User ruling: 5% of each node's raw RAM and raw storage (not CPU).
  safetyBufferFraction: 0.05,
  // User ruling: no node below 12 physical cores (2 x 8 is 16, so allowed).
  minCoresPerNode: 12,
  // User ruling.
  maxNodesPerCluster: 32,
  // Sizer Guide p.56/p.80: data-center models need >= 3 nodes. RF3 tolerates two
  // failures (AOS 7.6 p.34) and needs >= 5 nodes.
  minNodesByRf: { 2: 3, 3: 5 } as Record<Rf, number>,
  // CVM storage reservation per node (user ruling; decimal GB).
  cvmStorage: {
    bootHomeGB: 280,
    oplogGB: { 2: 400, 3: 600 } as Record<Rf, number>,
    hadesGBPerDataDrive: 100,
    cassandraFractionOfRaw: 0.03,
    curatorFractionOfRaw: 0.02,
    ext4FractionHdd: 0.018,
    ext4FractionFlashUnder4TB: 0.026,
    ext4FractionFlash4TBPlus: 0.018,
  },
} as const;

export const CVM_PCORES_PER_NODE = Math.ceil(SIZING_CONSTANTS.cvmVcpu / SIZING_CONSTANTS.cvmVcpuPerPCore);

export function cvmRamGiBFor(rf: Rf): number {
  return rf === 3 ? SIZING_CONSTANTS.cvmRamGiBRf3 : SIZING_CONSTANTS.cvmRamGiB;
}

/** AHV memory overhead. Configurable because it changes between AHV releases. */
export type AhvOverhead = {
  label: string;
  hostBaseGiB: number;
  hostFractionOfRam: number;
  flowVirtualNetworkingGiB: number;
  flowMicrosegmentationGiB: number;
  perVmBaseMiB: number;
  perVmPerVcpuMiB: number;
  perVmPerRamGiBMiB: number;
};

export const AHV_PRESETS: Record<"current" | "legacy", AhvOverhead> = {
  // User-supplied current AHV guidance.
  current: {
    label: "Current AHV",
    hostBaseGiB: 3.5,
    hostFractionOfRam: 0.022,
    flowVirtualNetworkingGiB: 2,
    flowMicrosegmentationGiB: 4,
    perVmBaseMiB: 50,
    perVmPerVcpuMiB: 1,
    perVmPerRamGiBMiB: 7,
  },
  // User-supplied older AHV guide: 2.6 GB per host + 60 MB per VM (decimal).
  legacy: {
    label: "Older AHV (2.6 GB/host + 60 MB/VM)",
    hostBaseGiB: decimalGBToGiB(2.6),
    hostFractionOfRam: 0,
    flowVirtualNetworkingGiB: 2,
    flowMicrosegmentationGiB: 4,
    perVmBaseMiB: (60e6) / 1024 ** 2,
    perVmPerVcpuMiB: 0,
    perVmPerRamGiBMiB: 0,
  },
};

export type PcProfileId =
  | "none"
  | "x-small"
  | "small"
  | "large"
  | "x-large"
  | "small-scale-out"
  | "large-scale-out"
  | "x-large-scale-out";

export type PcProfile = {
  id: Exclude<PcProfileId, "none">;
  label: string;
  vms: number;
  vcpu: number;
  ramGiB: number;
  // "Storage capacity" column: charged on the consumed basis.
  storageGiB: number;
  // "Configured vDisk total" column: charged on the provisioned basis.
  vdiskGiB: number;
};

// User-supplied Prism Central table (totals across the profile's VMs).
export const PC_PROFILES: PcProfile[] = [
  { id: "x-small", label: "X-Small", vms: 1, vcpu: 4, ramGiB: 18, storageGiB: 100, vdiskGiB: 100 },
  { id: "small", label: "Small", vms: 1, vcpu: 6, ramGiB: 28, storageGiB: 500, vdiskGiB: 500 },
  { id: "large", label: "Large", vms: 1, vcpu: 10, ramGiB: 46, storageGiB: 2500, vdiskGiB: 10000 },
  { id: "x-large", label: "X-Large", vms: 1, vcpu: 14, ramGiB: 62, storageGiB: 2500, vdiskGiB: 10000 },
  { id: "small-scale-out", label: "Small scale-out", vms: 3, vcpu: 18, ramGiB: 84, storageGiB: 1500, vdiskGiB: 1500 },
  { id: "large-scale-out", label: "Large scale-out", vms: 3, vcpu: 30, ramGiB: 138, storageGiB: 7500, vdiskGiB: 30000 },
  { id: "x-large-scale-out", label: "X-Large scale-out", vms: 3, vcpu: 42, ramGiB: 186, storageGiB: 7500, vdiskGiB: 30000 },
];

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type NxSizerSettings = {
  // "auto" steps through AUTO_ORDER starting with NX-1175S-G10.
  modelSku: "auto" | string;
  workloadBasis: "poweredOn" | "all";
  // "utilization": each VM's 95th-percentile CPU, falling back to vCPU / ratio
  // where the export has none. "configuration": vCPU / ratio for every VM.
  cpuBasis: "utilization" | "configuration";
  vcpuPerPcore: number;
  // "consumed": each VM's 95th-percentile memory where the export has it,
  // falling back to configured memory.
  memoryBasis: "provisioned" | "consumed";
  storageBasis: "consumed" | "provisioned";
  // Powered-off VMs still occupy capacity; include their storage by default.
  includePoweredOffStorage: boolean;
  // Compression savings the SE expects, 0-1. Off by default (user ruling).
  compressionSavings: number;
  rf: Rf;
  // Nodes the cluster must survive losing: N+0, N+1 (default), N+2.
  failoverNodes: 0 | 1 | 2;
  prismCentral: PcProfileId;
  ahvPreset: "current" | "legacy";
  flowVirtualNetworking: boolean;
  flowMicrosegmentation: boolean;
  vmAdjustments: VmAdjustments;
};

export const DEFAULT_NX_SETTINGS: NxSizerSettings = {
  modelSku: "auto",
  workloadBasis: "poweredOn",
  cpuBasis: "utilization",
  vcpuPerPcore: 4,
  memoryBasis: "provisioned",
  storageBasis: "consumed",
  includePoweredOffStorage: true,
  compressionSavings: 0,
  rf: 2,
  failoverNodes: 1,
  prismCentral: "none",
  ahvPreset: "current",
  flowVirtualNetworking: false,
  flowMicrosegmentation: false,
  vmAdjustments: {},
};

// ---------------------------------------------------------------------------
// Workload: what the VMs need, before any platform overhead
// ---------------------------------------------------------------------------

export type NxWorkload = {
  // VMs that run on the cluster (CPU and RAM are charged for these).
  runningVms: number;
  // Every VM kept, including powered off (storage is charged for these).
  storedVms: number;
  excludedVms: number;
  vcpu: number;
  // Physical cores the running VMs draw: 95th percentile where measured,
  // vCPU / ratio where not.
  cpuCores: number;
  cpuMeasuredVms: number;
  cpuFallbackVms: number;
  ramGiB: number;
  // Running VMs sized on measured memory (consumed basis only).
  ramMeasuredVms: number;
  storage: {
    basis: "consumed" | "provisioned";
    vmsTiB: number;
    volumeGroupsTiB: number;
    // VMs whose consumed figure came from the VM-level column, not partitions.
    vmLevelFallbackVms: number;
    // VMs with no consumed figure at all, counted at provisioned.
    provisionedFallbackVms: number;
  };
  largestVm: { byVcpu: LargestVm | null; byRam: LargestVm | null };
  // Source-cluster CVMs left out of the workload (see isSourceCvm).
  sourceCvmsExcluded: string[];
  prismCentral: PcProfile | null;
};

export type LargestVm = { name: string; vcpu: number; ramGiB: number };

// A source Nutanix cluster's Controller VMs (Nutanix naming NTNX-<serial>-<node>-CVM)
// appear as VMs in Collector exports of AHV clusters. The new build carries its
// own CVM per node, so these are excluded unless the SE re-includes them.
export function isSourceCvm(vm: VmRecord): boolean {
  return /^NTNX-.+-CVM$/i.test(vm.name.trim());
}

export function isExcluded(vm: VmRecord, adjustments: VmAdjustments): boolean {
  const explicit = adjustments[vm.id]?.excluded;
  return explicit ?? isSourceCvm(vm);
}

function selectVms(parsed: ParsedEnvironment, settings: NxSizerSettings) {
  const kept: VmRecord[] = [];
  let excluded = 0;
  for (const vm of parsed.vms) {
    const adjusted = isExcluded(vm, settings.vmAdjustments) ? null : applyAdjustment(vm, settings.vmAdjustments);
    if (adjusted) kept.push(adjusted);
    else excluded += 1;
  }
  // With no power state in the export every VM counts as running.
  const running =
    settings.workloadBasis === "all" || !parsed.powerStateKnown ? kept : kept.filter((vm) => vm.poweredOn !== false);
  return { kept, running, excluded };
}

// A VM with no consumed figure anywhere in the export is counted at its
// provisioned size (user ruling), never at zero.
export function vmStorageTiB(vm: VmRecord, basis: "consumed" | "provisioned"): number {
  if (basis === "provisioned" || vm.consumedSource === "none") return vm.storageProvisionedTiB;
  return vm.storageConsumedTiB;
}

export function vmCpuCores(
  vm: VmRecord,
  vcpuPerPcore: number,
  basis: NxSizerSettings["cpuBasis"] = "utilization",
): { cores: number; measured: boolean } {
  if (basis === "utilization" && vm.cpuUsed.p95 != null) return { cores: vm.cpuUsed.p95, measured: true };
  return { cores: vm.vcpu / Math.max(1, vcpuPerPcore), measured: false };
}

export function vmRamGiB(vm: VmRecord, basis: NxSizerSettings["memoryBasis"]): { ramGiB: number; measured: boolean } {
  if (basis === "consumed" && vm.ramUsedGiB != null) return { ramGiB: vm.ramUsedGiB, measured: true };
  return { ramGiB: vm.ramGiB, measured: false };
}

export function buildWorkload(parsed: ParsedEnvironment, settings: NxSizerSettings): NxWorkload {
  const { kept, running, excluded } = selectVms(parsed, settings);
  let cpuCores = 0;
  let measured = 0;
  let ramGiB = 0;
  let ramMeasured = 0;
  for (const vm of running) {
    const c = vmCpuCores(vm, settings.vcpuPerPcore, settings.cpuBasis);
    cpuCores += c.cores;
    if (c.measured) measured += 1;
    const r = vmRamGiB(vm, settings.memoryBasis);
    ramGiB += r.ramGiB;
    if (r.measured) ramMeasured += 1;
  }
  const stored = settings.includePoweredOffStorage || !parsed.powerStateKnown ? kept : kept.filter((vm) => vm.poweredOn !== false);
  // The VM with the most vCPU and the VM with the most RAM are often different
  // guests, and each must fit on one node.
  let byVcpu: LargestVm | null = null;
  let byRam: LargestVm | null = null;
  for (const vm of running) {
    if (!byVcpu || vm.vcpu > byVcpu.vcpu || (vm.vcpu === byVcpu.vcpu && vm.ramGiB > byVcpu.ramGiB)) {
      byVcpu = { name: vm.name, vcpu: vm.vcpu, ramGiB: vm.ramGiB };
    }
    if (!byRam || vm.ramGiB > byRam.ramGiB || (vm.ramGiB === byRam.ramGiB && vm.vcpu > byRam.vcpu)) {
      byRam = { name: vm.name, vcpu: vm.vcpu, ramGiB: vm.ramGiB };
    }
  }
  const vgs = parsed.volumeGroups ?? [];
  return {
    runningVms: running.length,
    storedVms: stored.length,
    excludedVms: excluded,
    vcpu: running.reduce((s, vm) => s + vm.vcpu, 0),
    cpuCores,
    cpuMeasuredVms: measured,
    cpuFallbackVms: running.length - measured,
    ramGiB,
    ramMeasuredVms: ramMeasured,
    storage: {
      basis: settings.storageBasis,
      vmsTiB: stored.reduce((s, vm) => s + vmStorageTiB(vm, settings.storageBasis), 0),
      volumeGroupsTiB: vgs.reduce(
        (s, vg) => s + (settings.storageBasis === "consumed" ? vg.consumedTiB : vg.provisionedTiB),
        0,
      ),
      vmLevelFallbackVms: stored.filter((vm) => vm.consumedSource === "vm-level").length,
      provisionedFallbackVms: stored.filter((vm) => vm.consumedSource === "none").length,
    },
    largestVm: { byVcpu, byRam },
    sourceCvmsExcluded: parsed.vms.filter((vm) => isSourceCvm(vm) && isExcluded(vm, settings.vmAdjustments)).map((vm) => vm.name),
    prismCentral: PC_PROFILES.find((p) => p.id === settings.prismCentral) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Demand: workload plus everything charged against the cluster as a whole
// ---------------------------------------------------------------------------

export type NxDemand = {
  cpu: { vmCores: number; pcCores: number; total: number };
  ram: { vmGiB: number; vmOverheadGiB: number; pcGiB: number; pcOverheadGiB: number; total: number };
  storage: {
    vmsTiB: number;
    volumeGroupsTiB: number;
    pcTiB: number;
    logicalTiB: number;
    compressionSavings: number;
    afterCompressionTiB: number;
    rf: Rf;
    rawTiB: number;
  };
};

function perVmOverheadGiB(ahv: AhvOverhead, vcpu: number, ramGiB: number): number {
  return mibToGiB(ahv.perVmBaseMiB + ahv.perVmPerVcpuMiB * vcpu + ahv.perVmPerRamGiBMiB * ramGiB);
}

export function buildDemand(parsed: ParsedEnvironment, workload: NxWorkload, settings: NxSizerSettings): NxDemand {
  const ahv = AHV_PRESETS[settings.ahvPreset];
  const { running } = selectVms(parsed, settings);
  const vmOverhead = running.reduce((s, vm) => s + perVmOverheadGiB(ahv, vm.vcpu, vm.ramGiB), 0);
  const pc = workload.prismCentral;
  // A PC profile's RAM and vCPU are totals across its VMs; overhead is per VM.
  const pcOverhead = pc ? pc.vms * perVmOverheadGiB(ahv, pc.vcpu / pc.vms, pc.ramGiB / pc.vms) : 0;
  const pcCores = pc ? pc.vcpu / Math.max(1, settings.vcpuPerPcore) : 0;
  const pcTiB = pc ? (settings.storageBasis === "consumed" ? pc.storageGiB : pc.vdiskGiB) / 1024 : 0;

  const logical = workload.storage.vmsTiB + workload.storage.volumeGroupsTiB + pcTiB;
  const savings = Math.min(0.95, Math.max(0, settings.compressionSavings));
  const afterCompression = logical * (1 - savings);
  return {
    cpu: { vmCores: workload.cpuCores, pcCores, total: workload.cpuCores + pcCores },
    ram: {
      vmGiB: workload.ramGiB,
      vmOverheadGiB: vmOverhead,
      pcGiB: pc?.ramGiB ?? 0,
      pcOverheadGiB: pcOverhead,
      total: workload.ramGiB + vmOverhead + (pc?.ramGiB ?? 0) + pcOverhead,
    },
    storage: {
      vmsTiB: workload.storage.vmsTiB,
      volumeGroupsTiB: workload.storage.volumeGroupsTiB,
      pcTiB,
      logicalTiB: logical,
      compressionSavings: savings,
      afterCompressionTiB: afterCompression,
      rf: settings.rf,
      rawTiB: afterCompression * settings.rf,
    },
  };
}

// ---------------------------------------------------------------------------
// One node configuration and what it can carry
// ---------------------------------------------------------------------------

export type DriveSet = { media: "NVMe" | "SSD" | "HDD"; count: number; sizeTB: number }[];

export type NodeConfig = {
  model: NxModel;
  cpu: NxCpu;
  cores: number;
  ramGiB: number;
  drives: DriveSet;
  rawTB: number;
};

export type NodeCapacity = {
  cpu: { cores: number; cvmCores: number; usable: number };
  ram: { rawGiB: number; bufferGiB: number; cvmGiB: number; ahvHostGiB: number; usable: number };
  storage: {
    rawTiB: number;
    bufferTiB: number;
    cvm: {
      bootHomeTiB: number;
      oplogTiB: number;
      hadesTiB: number;
      cassandraTiB: number;
      curatorTiB: number;
      ext4TiB: number;
      totalTiB: number;
    };
    usable: number;
  };
};

export function nodeCapacity(config: NodeConfig, settings: NxSizerSettings): NodeCapacity {
  const c = SIZING_CONSTANTS;
  const ahv = AHV_PRESETS[settings.ahvPreset];
  const cvmGiB = cvmRamGiBFor(settings.rf);
  const bufferGiB = config.ramGiB * c.safetyBufferFraction;
  const ahvHostGiB =
    ahv.hostBaseGiB +
    ahv.hostFractionOfRam * config.ramGiB +
    (settings.flowVirtualNetworking ? ahv.flowVirtualNetworkingGiB : 0) +
    (settings.flowMicrosegmentation ? ahv.flowMicrosegmentationGiB : 0);

  const rawTiB = decimalTBToTiB(config.rawTB);
  const dataDrives = config.drives.reduce((s, d) => s + d.count, 0);
  const ext4TB = config.drives.reduce((s, d) => {
    const fraction =
      d.media === "HDD"
        ? c.cvmStorage.ext4FractionHdd
        : d.sizeTB < 4
          ? c.cvmStorage.ext4FractionFlashUnder4TB
          : c.cvmStorage.ext4FractionFlash4TBPlus;
    return s + d.count * d.sizeTB * fraction;
  }, 0);
  const cvm = {
    bootHomeTiB: decimalTBToTiB(c.cvmStorage.bootHomeGB / 1000),
    oplogTiB: decimalTBToTiB(c.cvmStorage.oplogGB[settings.rf] / 1000),
    hadesTiB: decimalTBToTiB((c.cvmStorage.hadesGBPerDataDrive * dataDrives) / 1000),
    cassandraTiB: rawTiB * c.cvmStorage.cassandraFractionOfRaw,
    curatorTiB: rawTiB * c.cvmStorage.curatorFractionOfRaw,
    ext4TiB: decimalTBToTiB(ext4TB),
    totalTiB: 0,
  };
  cvm.totalTiB = cvm.bootHomeTiB + cvm.oplogTiB + cvm.hadesTiB + cvm.cassandraTiB + cvm.curatorTiB + cvm.ext4TiB;
  const bufferTiB = rawTiB * c.safetyBufferFraction;

  return {
    cpu: { cores: config.cores, cvmCores: CVM_PCORES_PER_NODE, usable: config.cores - CVM_PCORES_PER_NODE },
    ram: {
      rawGiB: config.ramGiB,
      bufferGiB,
      cvmGiB,
      ahvHostGiB,
      usable: config.ramGiB - bufferGiB - cvmGiB - ahvHostGiB,
    },
    storage: { rawTiB, bufferTiB, cvm, usable: rawTiB - bufferTiB - cvm.totalTiB },
  };
}

function driveSets(layout: Extract<DriveLayout, { kind: "uniform" }>): DriveSet[] {
  return layout.counts.flatMap((count) => layout.sizesTB.map((sizeTB) => [{ media: layout.media, count, sizeTB }]));
}

export function nodeConfigs(model: NxModel): NodeConfig[] {
  // All-flash only (user ruling): hybrid layouts stay in the catalogue as the
  // spec sheets list them, but are never offered.
  const sets = model.drives
    .filter((layout): layout is Extract<DriveLayout, { kind: "uniform" }> => layout.kind === "uniform")
    .flatMap(driveSets);
  const out: NodeConfig[] = [];
  for (const cpu of model.cpus) {
    const cores = cpu.coresPerCpu * model.socketsPerNode;
    if (cores < SIZING_CONSTANTS.minCoresPerNode) continue;
    for (const ramGiB of model.ramTotalsGiB) {
      for (const drives of sets) {
        const rawTB = drives.reduce((s, d) => s + d.count * d.sizeTB, 0);
        out.push({ model, cpu, cores, ramGiB, drives, rawTB });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fitting a configuration to the demand
// ---------------------------------------------------------------------------

export type ClusterPlan = {
  nodes: number;
  // Nodes left carrying the workload after the failover nodes are lost.
  workingNodes: number;
  failoverNodes: number;
  // True when the RF minimum, not the workload, set this cluster's size.
  raisedToMinimum: boolean;
};

export type NxFit = {
  config: NodeConfig;
  capacity: NodeCapacity;
  nodesFor: { cpu: number; ram: number; storage: number };
  workingNodes: number;
  driver: "cpu" | "ram" | "storage" | "minimum";
  clusters: ClusterPlan[];
  totalNodes: number;
  totalCores: number;
  largestVmFits: boolean;
  largestVmReason: string | null;
};

function needed(demand: number, perNode: number): number {
  if (demand <= 0) return 0;
  if (perNode <= 0) return Number.POSITIVE_INFINITY;
  // A hair of tolerance so 3.0000000001 nodes of float noise stays 3.
  return Math.ceil(demand / perNode - 1e-9);
}

/**
 * Split working nodes into clusters of at most `maxNodesPerCluster`, each with
 * its own failover nodes and each at or above the RF minimum.
 */
export function planClusters(workingNodes: number, failover: number, rf: Rf): ClusterPlan[] {
  const max = SIZING_CONSTANTS.maxNodesPerCluster;
  const min = SIZING_CONSTANTS.minNodesByRf[rf];
  const perClusterWorking = max - failover;
  const count = Math.max(1, Math.ceil(workingNodes / perClusterWorking));
  const base = Math.floor(workingNodes / count);
  const remainder = workingNodes % count;
  return Array.from({ length: count }, (_, i) => {
    const working = base + (i < remainder ? 1 : 0);
    const nodes = Math.max(min, working + failover);
    return { nodes, workingNodes: nodes - failover, failoverNodes: failover, raisedToMinimum: nodes > working + failover };
  });
}

export function fitConfig(config: NodeConfig, demand: NxDemand, workload: NxWorkload, settings: NxSizerSettings): NxFit {
  const capacity = nodeCapacity(config, settings);
  const nodesFor = {
    cpu: needed(demand.cpu.total, capacity.cpu.usable),
    ram: needed(demand.ram.total, capacity.ram.usable),
    storage: needed(demand.storage.rawTiB, capacity.storage.usable),
  };
  const working = Math.max(1, nodesFor.cpu, nodesFor.ram, nodesFor.storage);
  const clusters = Number.isFinite(working) ? planClusters(working, settings.failoverNodes, settings.rf) : [];
  const totalNodes = clusters.reduce((s, c) => s + c.nodes, 0);
  const driver: NxFit["driver"] = clusters.some((c) => c.raisedToMinimum)
    ? "minimum"
    : nodesFor.storage > Math.max(nodesFor.cpu, nodesFor.ram)
      ? "storage"
      : nodesFor.ram >= nodesFor.cpu
        ? "ram"
        : "cpu";

  // The largest VM must fit inside one node's usable envelope (user ruling:
  // vCPU <= node cores - CVM cores; RAM <= usable RAM after CVM, AHV, buffer).
  const ahv = AHV_PRESETS[settings.ahvPreset];
  const reasons: string[] = [];
  for (const vm of [workload.largestVm.byVcpu, workload.largestVm.byRam]) {
    if (!vm) continue;
    const ramNeed = vm.ramGiB + perVmOverheadGiB(ahv, vm.vcpu, vm.ramGiB);
    if (vm.vcpu > capacity.cpu.usable) {
      reasons.push(`${vm.name}: ${vm.vcpu} vCPU exceeds ${capacity.cpu.usable} usable cores per node`);
    }
    if (ramNeed > capacity.ram.usable) {
      reasons.push(`${vm.name}: RAM exceeds usable RAM per node`);
    }
  }
  const largestVmFits = reasons.length === 0;
  const largestVmReason = largestVmFits ? null : Array.from(new Set(reasons)).join("; ");

  return {
    config,
    capacity,
    nodesFor,
    workingNodes: working,
    driver,
    clusters,
    totalNodes,
    totalCores: totalNodes * config.cores,
    largestVmFits,
    largestVmReason,
  };
}

// Fewest total cores (NCI is licensed per core), then fewest nodes, then the
// least RAM, then the least raw storage.
function better(a: NxFit, b: NxFit): boolean {
  if (a.totalCores !== b.totalCores) return a.totalCores < b.totalCores;
  if (a.totalNodes !== b.totalNodes) return a.totalNodes < b.totalNodes;
  if (a.config.ramGiB !== b.config.ramGiB) return a.config.ramGiB < b.config.ramGiB;
  return a.config.rawTB < b.config.rawTB;
}

export function bestFitForModel(
  model: NxModel,
  demand: NxDemand,
  workload: NxWorkload,
  settings: NxSizerSettings,
): { best: NxFit | null; anyLargestVmFit: boolean; reason: string | null } {
  let best: NxFit | null = null;
  let lastReason: string | null = null;
  for (const config of nodeConfigs(model)) {
    const fit = fitConfig(config, demand, workload, settings);
    if (!Number.isFinite(fit.totalNodes) || fit.totalNodes === 0) continue;
    if (!fit.largestVmFits) {
      lastReason = fit.largestVmReason;
      continue;
    }
    if (!best || better(fit, best)) best = fit;
  }
  return { best, anyLargestVmFit: best != null, reason: best ? null : lastReason };
}

// ---------------------------------------------------------------------------
// The recommendation
// ---------------------------------------------------------------------------

export type ModelAttempt = { sku: string; fits: boolean; reason: string | null };

export type NxRecommendation = {
  settings: NxSizerSettings;
  workload: NxWorkload;
  demand: NxDemand;
  fit: NxFit | null;
  attempts: ModelAttempt[];
  // Utilization of the recommended build, with every node up and with the
  // failover nodes lost (per cluster, failover nodes carry no workload).
  utilization: {
    cpu: { allUp: number; failover: number };
    ram: { allUp: number; failover: number };
    storage: { allUp: number; failover: number };
  } | null;
  warnings: string[];
  blockers: string[];
};

function utilizationOf(fit: NxFit, demand: NxDemand) {
  const allUp = fit.totalNodes;
  const failover = fit.clusters.reduce((s, c) => s + c.workingNodes, 0);
  const pct = (need: number, per: number, nodes: number) => (per > 0 && nodes > 0 ? (need / (per * nodes)) * 100 : 0);
  return {
    cpu: { allUp: pct(demand.cpu.total, fit.capacity.cpu.usable, allUp), failover: pct(demand.cpu.total, fit.capacity.cpu.usable, failover) },
    ram: { allUp: pct(demand.ram.total, fit.capacity.ram.usable, allUp), failover: pct(demand.ram.total, fit.capacity.ram.usable, failover) },
    storage: {
      allUp: pct(demand.storage.rawTiB, fit.capacity.storage.usable, allUp),
      failover: pct(demand.storage.rawTiB, fit.capacity.storage.usable, failover),
    },
  };
}

export function recommendNx(parsed: ParsedEnvironment, settings: NxSizerSettings): NxRecommendation {
  const workload = buildWorkload(parsed, settings);
  const demand = buildDemand(parsed, workload, settings);
  const attempts: ModelAttempt[] = [];
  const warnings: string[] = [];
  const blockers: string[] = parsed.plausibility.map((p) => `${p.field}: ${p.observed} (expected ${p.expected}). ${p.detail}`);

  let fit: NxFit | null = null;
  if (settings.modelSku !== "auto") {
    const model = findNxModel(settings.modelSku);
    if (!model || model.excluded) {
      blockers.push(`${settings.modelSku} is not an approved HCI model for VM sizing.`);
    } else {
      const r = bestFitForModel(model, demand, workload, settings);
      attempts.push({ sku: model.sku, fits: r.best != null, reason: r.reason });
      fit = r.best;
      if (!fit) blockers.push(`No ${model.sku} configuration can host the largest VM (${r.reason}). Choose a larger model.`);
    }
  } else {
    // Step through the approved order; a model is passed over only when no
    // configuration of it can host the largest VM (user ruling).
    for (const sku of AUTO_ORDER) {
      const model = findNxModel(sku);
      if (!model) continue;
      const r = bestFitForModel(model, demand, workload, settings);
      attempts.push({ sku, fits: r.best != null, reason: r.reason });
      if (r.best) {
        fit = r.best;
        break;
      }
    }
    if (!fit) {
      blockers.push("No approved NX model can host the largest VM on a single node.");
    }
  }

  if (workload.runningVms === 0) blockers.push("No running VMs to size.");
  if (fit && fit.clusters.length > 1) {
    warnings.push(
      `${fit.totalNodes} nodes exceed one ${SIZING_CONSTANTS.maxNodesPerCluster}-node cluster, so the build is ${fit.clusters.length} clusters, each with its own N+${settings.failoverNodes}.`,
    );
  }
  if (workload.sourceCvmsExcluded.length) {
    const names = Array.from(new Set(workload.sourceCvmsExcluded));
    warnings.push(
      `${names.length} source-cluster CVM(s) (${workload.sourceCvmsExcluded.length} VM rows) excluded from the workload; the new build carries its own CVMs: ${names.join(", ")}.`,
    );
  }
  if (settings.failoverNodes === 0) warnings.push("N+0: the cluster cannot lose a node without running short.");
  if (settings.cpuBasis === "utilization" && workload.cpuFallbackVms > 0) {
    warnings.push(
      `${workload.cpuFallbackVms} of ${workload.runningVms} running VMs have no 95th-percentile CPU figure and are sized at vCPU / ${settings.vcpuPerPcore}.`,
    );
  }
  if (workload.storage.basis === "consumed" && workload.storage.provisionedFallbackVms > 0) {
    warnings.push(
      `${workload.storage.provisionedFallbackVms} VMs have no consumed-storage figure in the export and are counted at their provisioned size.`,
    );
  }
  if (settings.memoryBasis === "consumed" && workload.ramMeasuredVms < workload.runningVms) {
    warnings.push(
      `${workload.runningVms - workload.ramMeasuredVms} of ${workload.runningVms} running VMs have no measured memory figure and are sized at configured memory.`,
    );
  }
  if (workload.storage.basis === "consumed" && workload.storage.vmLevelFallbackVms > 0) {
    warnings.push(
      `${workload.storage.vmLevelFallbackVms} VMs had no guest partition data; their consumed storage comes from the VM-level used column.`,
    );
  }
  if (settings.prismCentral === "none" && parsed.vms.some((vm) => /prism\s*central/i.test(vm.name))) {
    warnings.push("The export contains a VM named Prism Central; it is sized as a workload VM. No additional Prism Central was added.");
  }
  if (settings.prismCentral !== "none" && parsed.vms.some((vm) => /prism\s*central/i.test(vm.name))) {
    warnings.push("A Prism Central profile was added and the export already contains a VM named Prism Central. Exclude one to avoid counting it twice.");
  }

  return {
    settings,
    workload,
    demand,
    fit,
    attempts,
    utilization: fit ? utilizationOf(fit, demand) : null,
    warnings,
    blockers,
  };
}

export function approvedModels(): NxModel[] {
  return NX_MODELS.filter((m) => !m.excluded);
}
