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
    blurb: "ROBO and edge sites — smallest sensible footprint.",
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
    blurb: "General-purpose VSI — the common default.",
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
    blurb: "Largest estates — fewest nodes to manage.",
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
};

export type ProfileFit = {
  profile: NodeProfile;
  nodesForCpu: number;
  nodesForRam: number;
  nodesForStorage: number;
  // Nodes carrying workload, before the HA spare(s) and the RF floor.
  workingNodes: number;
  totalNodes: number;
  clusterCount: number;
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

export function fitProfile(profile: NodeProfile, demand: NodeDemand, options: FitOptions): ProfileFit {
  const cvm = cvmFor(profile);
  const coresPerNode = usableCoresPerNode(profile);
  const maxRamPerNode = usableRamPerNode(profile);
  const maxStoragePerNode = Math.max(0.1, profile.maxStorageTiB);

  const nodesForCpu = Math.max(1, Math.ceil(demand.pCores / coresPerNode));
  const nodesForRam = Math.max(1, Math.ceil(demand.ramGiB / maxRamPerNode));
  const nodesForStorage = Math.max(1, Math.ceil(demand.rawStorageTiB / maxStoragePerNode));

  const workingNodes = Math.max(nodesForCpu, nodesForRam, nodesForStorage);
  const failoverHosts = Math.max(0, options.failoverHosts);
  const totalNodes = Math.max(options.minNodes, workingNodes + failoverHosts);
  const clusterCount = Math.max(1, Math.ceil(totalNodes / SIZING_RULES.maxNodesPerCluster));

  const driver: ProfileFit["driver"] =
    totalNodes > workingNodes + failoverHosts
      ? "resiliency"
      : nodesForStorage > Math.max(nodesForCpu, nodesForRam)
        ? "storage"
        : nodesForRam >= nodesForCpu
          ? "ram"
          : "cpu";

  // Populate each node for the share of the workload it carries, plus the CVM.
  // The HA spare(s) are excluded from the divisor: after a host failure the
  // survivors must still hold the whole workload, so RAM is sized on the
  // load-carrying nodes, not the full count. A node also has to be able to host
  // the customer's largest single VM. Drives are pooled across every node, so
  // capacity divides by the full count.
  const loadNodes = Math.max(1, totalNodes - failoverHosts);
  const ramNeededPerNode = Math.max(demand.ramGiB / loadNodes, demand.maxVmRamGiB ?? 0) + cvm.ramGiB;
  const ramPerNodeGiB = profile.fixed ? profile.maxRamGiB : ladderRam(ramNeededPerNode, profile.maxRamGiB);
  const storagePerNodeTiB = profile.fixed
    ? profile.maxStorageTiB
    : Math.min(profile.maxStorageTiB, demand.rawStorageTiB / totalNodes);

  const cpuUtilPct = pct(demand.pCores, totalNodes * coresPerNode);
  const ramUtilPct = pct(demand.ramGiB, totalNodes * usableRamPerNode(profile, ramPerNodeGiB));
  const storageUtilPct = pct(demand.rawStorageTiB, totalNodes * maxStoragePerNode);

  const fitsLargestVm =
    (demand.maxVmPCores == null || demand.maxVmPCores <= coresPerNode) &&
    (demand.maxVmRamGiB == null || demand.maxVmRamGiB <= maxRamPerNode);

  // Scoring. Cores are a fixed purchase, so stranded CPU is the real cost of an
  // oversized class — it carries full weight. RAM and drives get right-sized, so
  // only the rounding waste counts. Node sprawl is the cost of an undersized
  // class: more rack units, ports, and hosts to operate. A node that can't host
  // the customer's biggest VM is effectively disqualified.
  const cpuWaste = 1 - Math.min(1, cpuUtilPct / 100);
  const ramWaste = 1 - Math.min(1, ramUtilPct / 100);
  const storageWaste = 1 - Math.min(1, storageUtilPct / 100);
  const sprawl = totalNodes / SIZING_RULES.maxNodesPerCluster;
  const score = cpuWaste + 0.25 * ramWaste + 0.15 * storageWaste + 0.5 * sprawl + (fitsLargestVm ? 0 : 2);

  return {
    profile,
    nodesForCpu,
    nodesForRam,
    nodesForStorage,
    workingNodes,
    totalNodes,
    clusterCount,
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
