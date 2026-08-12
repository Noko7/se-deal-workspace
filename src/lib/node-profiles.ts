// Node hardware classes the Simple Sizer picks from when the node profile is set
// to "Auto". These are indicative platform *classes* modelled on common 2-socket
// Nutanix NX configurations — not orderable SKUs. Final part numbers still come
// from Nutanix Sizer / the HCL, which the tool says out loud in the UI.
//
// `cores` is physical cores per node and is fixed — it's the CPU SKU you buy.
// RAM and storage are ceilings: DIMMs and drive bays get populated to fit, so
// the sizer reports the capacity a node actually needs, not the class maximum.

import { SIZING_RULES, cvmReserveFor, type CvmReserve } from "@/lib/sizing-guidance";

export type NodeProfile = {
  id: string;
  label: string;
  family: string;
  cores: number;
  maxRamGiB: number;
  maxStorageTiB: number;
  blurb: string;
  // Custom profiles are taken literally — no right-sizing of RAM or drives.
  fixed?: boolean;
};

export const NODE_PROFILES: NodeProfile[] = [
  {
    id: "edge",
    label: "Edge",
    family: "NX-1000 class",
    cores: 16,
    maxRamGiB: 256,
    maxStorageTiB: 8,
    blurb: "ROBO and edge sites. The smallest sensible footprint.",
  },
  {
    id: "small",
    label: "Small",
    family: "NX-1000 / 3000 class",
    cores: 24,
    maxRamGiB: 384,
    maxStorageTiB: 15,
    blurb: "Small production clusters and dev/test.",
  },
  {
    id: "balanced",
    label: "Balanced",
    family: "NX-3000 class",
    cores: 32,
    maxRamGiB: 768,
    maxStorageTiB: 23,
    blurb: "General-purpose VSI. The common default.",
  },
  {
    id: "balanced-plus",
    label: "Balanced+",
    family: "NX-3000 / 3100 class",
    cores: 48,
    maxRamGiB: 1024,
    maxStorageTiB: 30,
    blurb: "Mixed production with room to grow.",
  },
  {
    id: "compute",
    label: "Compute-dense",
    family: "NX-3100 / 8000 class",
    cores: 64,
    maxRamGiB: 1536,
    maxStorageTiB: 30,
    blurb: "CPU-heavy consolidation at high VM density.",
  },
  {
    id: "memory",
    label: "Memory-dense",
    family: "NX-8100 class",
    cores: 64,
    maxRamGiB: 2048,
    maxStorageTiB: 46,
    blurb: "In-memory databases, large VDI, SAP.",
  },
  {
    id: "storage",
    label: "Storage-dense",
    family: "NX-8100 / 8500 class",
    cores: 48,
    maxRamGiB: 1024,
    maxStorageTiB: 92,
    blurb: "Capacity-led workloads, file services, backup targets.",
  },
  {
    id: "max",
    label: "Max-density",
    family: "NX-8100 class (top bin)",
    cores: 96,
    maxRamGiB: 3072,
    maxStorageTiB: 92,
    blurb: "Largest estates, fewest nodes to manage.",
  },
];

// Realistic DIMM populations for 12/16/24-slot 2-socket nodes. A node is quoted
// at the next step up from what it needs rather than at some arbitrary GiB figure.
const RAM_LADDER = [128, 192, 256, 384, 512, 640, 768, 1024, 1152, 1536, 2048, 2560, 3072];

function ladderRam(neededGiB: number, maxGiB: number): number {
  for (const step of RAM_LADDER) {
    if (step >= neededGiB && step <= maxGiB) return step;
  }
  return maxGiB;
}

export function findNodeProfile(id: string): NodeProfile | null {
  return NODE_PROFILES.find((p) => p.id === id) ?? null;
}

export function customNodeProfile(cores: number, ramGiB: number, storageTiB: number): NodeProfile {
  return {
    id: "custom",
    label: "Custom",
    family: "SE-specified",
    cores: Math.max(8, Math.floor(cores) || 0),
    maxRamGiB: Math.max(64, Math.floor(ramGiB) || 0),
    maxStorageTiB: Math.max(1, Number(storageTiB) || 0),
    blurb: "Hand-entered node spec.",
    fixed: true,
  };
}

// What one workload (a whole environment, or a single source cluster) needs from
// the hardware, already including CVM/Prism Central overhead and RF expansion.
export type NodeDemand = {
  pCores: number;
  ramGiB: number;
  rawStorageTiB: number;
  maxVmPCores: number | null;
  maxVmRamGiB: number | null;
};

export type FitOptions = {
  failoverHosts: number;
  // RF floor — RF2 needs >= 3 nodes, RF3 needs >= 5.
  minNodes: number;
  // How full the finished cluster should run, 0-1, counting CVM overhead
  // against it. The single headroom knob for every dimension.
  targetUtilization: number;
  // Exact nodes per cluster, or null to fill clusters to the planning maximum.
  // A fixed size buys as many identical clusters as the workload needs.
  nodesPerCluster?: number | null;
};

export type ProfileFit = {
  profile: NodeProfile;
  nodesForCpu: number;
  nodesForRam: number;
  nodesForStorage: number;
  // Nodes carrying workload, before the RF floor and any cluster-size rounding.
  workingNodes: number;
  totalNodes: number;
  clusterCount: number;
  // Nodes in each cluster, all equal when the size was pinned.
  nodesPerCluster: number;
  // Right-sized per-node build: cores are the class's, RAM/drives are populated
  // to what the workload actually needs (capped at the class ceiling).
  ramPerNodeGiB: number;
  storagePerNodeTiB: number;
  // Whether the largest single VM fits inside one node's usable envelope.
  fitsLargestVm: boolean;
  // Utilization of the *proposed* build — how full each dimension lands.
  cpuUtilPct: number;
  ramUtilPct: number;
  storageUtilPct: number;
  // Which dimension set the node count.
  driver: "cpu" | "ram" | "storage" | "resiliency";
  // The Controller VM reserve carried on every node in this build.
  cvm: CvmReserve;
  score: number;
};

// Relative cost of a build, used only to compare node classes against each
// other. A node costs far more than its CPUs: chassis, rack unit, switch ports,
// the per-node licence minimum, and someone's time to run it. That fixed part is
// expressed in core-equivalents so a single number can settle the trade between
// "more small nodes" and "fewer big ones". Without it the solver optimises for
// packing nodes full, which is how a 4-host cluster once turned into five
// 16-core Edge nodes.
const NODE_BASE_COST = 24;
const RAM_GIB_PER_CORE_COST = 32;
// A class that cannot host the customer's largest VM is not a candidate.
const MONSTER_VM_PENALTY = 4;

/** The CVM reserve this node class carries — scales with node density. */
export function cvmFor(profile: NodeProfile): CvmReserve {
  return cvmReserveFor(profile.cores);
}

// Usable capacity per node, after the Controller VM has taken its share.
export function usableCoresPerNode(profile: NodeProfile): number {
  return Math.max(1, profile.cores - cvmFor(profile).cores);
}

export function usableRamPerNode(profile: NodeProfile, ramGiB: number = profile.maxRamGiB): number {
  return Math.max(1, ramGiB - cvmFor(profile).ramGiB);
}

function pct(part: number, whole: number): number {
  if (!(whole > 0)) return 0;
  return Math.max(0, Math.min(999, (part / whole) * 100));
}

/**
 * How much workload one node of this class can carry at the target utilization.
 *
 * The CVM is a tenant of the node like any other VM, so it counts against the
 * target rather than being subtracted first: a node is "50% used" when the
 * workload *and* the CVM together occupy half of it. Below the point where the
 * CVM alone exceeds the target, the class cannot be used at all, which is what
 * the zero return means.
 */
function workloadPerNode(profile: NodeProfile, ramPerNodeGiB: number, target: number) {
  const cvm = cvmFor(profile);
  return {
    cores: Math.max(0, profile.cores * target - cvm.cores),
    ramGiB: Math.max(0, ramPerNodeGiB * target - cvm.ramGiB),
    // Drives carry no platform tenant; the target is pure free space for
    // rebuilds, snapshots and growth.
    storageTiB: Math.max(0, profile.maxStorageTiB * target),
  };
}

export function fitProfile(profile: NodeProfile, demand: NodeDemand, options: FitOptions): ProfileFit {
  const cvm = cvmFor(profile);
  const coresPerNode = usableCoresPerNode(profile);
  const maxRamPerNode = usableRamPerNode(profile);
  const target = Math.min(1, Math.max(0.05, options.targetUtilization));
  const failoverHosts = Math.max(0, options.failoverHosts);

  // Nodes needed for each dimension so the finished cluster lands on target.
  // A class whose CVM already exceeds the target cannot host anything, so it
  // reports an impossible node count and loses on score rather than dividing by
  // zero.
  const capacity = workloadPerNode(profile, profile.maxRamGiB, target);
  const nodesFor = (need: number, per: number) => (per > 0 ? Math.max(1, Math.ceil(need / per)) : Number.MAX_SAFE_INTEGER);
  const nodesForCpu = nodesFor(demand.pCores, capacity.cores);
  const nodesForRam = nodesFor(demand.ramGiB, capacity.ramGiB);
  const nodesForStorage = nodesFor(demand.rawStorageTiB, capacity.storageTiB);

  const workingNodes = Math.min(Number.MAX_SAFE_INTEGER, Math.max(nodesForCpu, nodesForRam, nodesForStorage));

  // A cluster running at the target already absorbs the failures N+1 reserves
  // for, so no spare is bolted on top. It is checked rather than assumed: after
  // losing `failoverHosts`, the survivors must still hold the workload at 100%.
  const survivable = (n: number) =>
    n - failoverHosts >= 1 &&
    demand.pCores <= (n - failoverHosts) * coresPerNode &&
    demand.ramGiB <= (n - failoverHosts) * maxRamPerNode;
  let sized = Math.max(options.minNodes, workingNodes);
  while (sized < SIZING_RULES.maxNodesPerCluster * 64 && !survivable(sized)) sized += 1;

  // A pinned cluster size buys whole clusters, so the total rounds up to a
  // multiple of it. Each cluster carries its own CVMs, which is already priced
  // in above: the per-node workload capacity is net of them.
  const pinned = options.nodesPerCluster ?? null;
  const nodesPerCluster = pinned && pinned > 0 ? Math.min(pinned, SIZING_RULES.maxNodesPerCluster) : null;
  const totalNodes = nodesPerCluster ? Math.ceil(sized / nodesPerCluster) * nodesPerCluster : sized;
  const clusterCount = nodesPerCluster
    ? totalNodes / nodesPerCluster
    : Math.max(1, Math.ceil(totalNodes / SIZING_RULES.maxNodesPerCluster));

  const driver: ProfileFit["driver"] =
    totalNodes > workingNodes && workingNodes < options.minNodes
      ? "resiliency"
      : nodesForStorage > Math.max(nodesForCpu, nodesForRam)
        ? "storage"
        : nodesForRam >= nodesForCpu
          ? "ram"
          : "cpu";

  // Populate each node so that its share of the workload plus its CVM lands on
  // the target, and so that one node can still hold the customer's largest
  // single VM. Drives are pooled across the cluster, so capacity divides evenly.
  const ramForShare = (demand.ramGiB / totalNodes + cvm.ramGiB) / target;
  const ramForLargestVm = (demand.maxVmRamGiB ?? 0) + cvm.ramGiB;
  const ramPerNodeGiB = profile.fixed
    ? profile.maxRamGiB
    : ladderRam(Math.max(ramForShare, ramForLargestVm), profile.maxRamGiB);
  const storagePerNodeTiB = profile.fixed
    ? profile.maxStorageTiB
    : Math.min(profile.maxStorageTiB, demand.rawStorageTiB / (totalNodes * target));

  // Utilization as the customer will see it in Prism: everything running on the
  // cluster, including the platform's own VMs, over what was bought.
  const cpuUtilPct = pct(demand.pCores + totalNodes * cvm.cores, totalNodes * profile.cores);
  const ramUtilPct = pct(demand.ramGiB + totalNodes * cvm.ramGiB, totalNodes * ramPerNodeGiB);
  const storageUtilPct = pct(demand.rawStorageTiB, totalNodes * Math.max(0.1, storagePerNodeTiB));

  const fitsLargestVm =
    (demand.maxVmPCores == null || demand.maxVmPCores <= coresPerNode) &&
    (demand.maxVmRamGiB == null || demand.maxVmRamGiB <= usableRamPerNode(profile, ramPerNodeGiB));

  // Score the whole build, not how tightly each node is packed. Cost is what an
  // SE is actually trading: node count times what a node of this class costs.
  // Drives are right-sized to the workload, so they barely separate the classes
  // and are left out. Ties go to the smaller class because NODE_PROFILES runs
  // small to large and the winner is taken on a strict improvement.
  const costPerNode = NODE_BASE_COST + profile.cores + ramPerNodeGiB / RAM_GIB_PER_CORE_COST;
  const score = totalNodes * costPerNode * (fitsLargestVm ? 1 : MONSTER_VM_PENALTY);

  return {
    profile,
    nodesForCpu,
    nodesForRam,
    nodesForStorage,
    workingNodes,
    totalNodes,
    clusterCount,
    nodesPerCluster: nodesPerCluster ?? Math.ceil(totalNodes / clusterCount),
    ramPerNodeGiB,
    storagePerNodeTiB: Number(storagePerNodeTiB.toFixed(2)),
    fitsLargestVm,
    cpuUtilPct,
    ramUtilPct,
    storageUtilPct,
    driver,
    cvm,
    score,
  };
}

// Pick the single node class that best serves every supplied demand. Passing more
// than one demand standardises the platform across a multi-cluster estate, which
// is what customers actually buy — one part number, many clusters.
export function chooseNodeProfile(demands: NodeDemand[], options: FitOptions): NodeProfile {
  const candidates = demands.length
    ? demands
    : [{ pCores: 1, ramGiB: 1, rawStorageTiB: 1, maxVmPCores: null, maxVmRamGiB: null }];
  let best: { profile: NodeProfile; score: number } | null = null;
  for (const profile of NODE_PROFILES) {
    const score = candidates.reduce((sum, demand) => sum + fitProfile(profile, demand, options).score, 0);
    if (!best || score < best.score) best = { profile, score };
  }
  return (best ?? { profile: NODE_PROFILES[2] }).profile;
}
