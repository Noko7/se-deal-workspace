import type { NodeModel, ProposalCluster, ProposalScenario } from "@/lib/sizer-import";

// Compact, realistic sample scenarios so the Proposal Builder demonstrates the
// full output before the SE uploads their own Nutanix Sizer JSON exports. Both
// mirror the structure produced by parseSizerScenario(), and they size the same
// estate two different ways so the multi-hardware comparison has something to
// compare. Utilization figures carry the decimals Sizer actually reports.

function model(
  sku: string,
  blocks: number,
  nodesInBlock: number,
  cpu: { model: string; ghz: number; cores: number; sockets: number },
  mem: { moduleGiB: number; modules: number },
  drives: { kind: NodeModel["drives"][number]["kind"]; sizeTB: number; perNode: number }[],
): NodeModel {
  const nodes = blocks * nodesInBlock;
  return {
    sku,
    blocks,
    nodesInBlock,
    nodes,
    cpu: { code: `C-CPU-${sku}`, model: cpu.model, ghz: cpu.ghz, coresPerCpu: cpu.cores, watts: null, socketsPerNode: cpu.sockets },
    memory: { moduleGiB: mem.moduleGiB, modulesPerNode: mem.modules, perNodeGiB: mem.moduleGiB * mem.modules },
    drives: drives.map((d) => ({ code: `C-${d.kind === "NVMe" ? "NVM" : d.kind}-${d.sizeTB}TB`, kind: d.kind, sizeTB: d.sizeTB, perNode: d.perNode })),
    nic: "2× Mellanox 25/10GbE 2-port SFP28 (CX6)",
    gpu: null,
    components: [],
  };
}

// All-flash clusters report no HDD tier, so the blended storage percentage is
// simply the SSD figure. Spelled out here so the sample exercises the same
// utilization shape the parser produces.
function util(cpu: number, ram: number, ssd: number): ProposalCluster["utilization"] {
  return { cpu, ram, storage: ssd, ssd, hdd: null };
}

export const SAMPLE_PROPOSAL_LABEL = "Sample: Calloway Ridge Health (3 clusters)";
export const SAMPLE_ALTERNATE_LABEL = "Consolidated alternative (2 clusters)";

const SAMPLE_META: ProposalScenario["meta"] = {
  customer: "Calloway Ridge Health",
  environmentName: "Datacenter Refresh FY27",
  opportunityName: "Calloway Ridge - Platform Refresh",
  se: "Nutanix SE",
  seEmail: null,
  installCountry: "United States",
  sizerVersion: "6.2.0.0",
  permalink: null,
  createdDate: new Date().toISOString().slice(0, 10),
};

/** Distributed sizing: three purpose-built clusters on mid-range nodes. */
export function buildSampleScenario(se = "Nutanix SE"): ProposalScenario {
  const clusters: ProposalCluster[] = [
    {
      name: "MGMT",
      solutionType: "CostOptimized",
      nodes: 3,
      capacity: { cores: 48, ramGiB: 768, ssdTiB: 41.91, hddTiB: 0 },
      utilization: util(38.4, 41.7, 43.9),
      failover: { nMinus1: 61.2, nMinus2: 91.8 },
      models: [model("NX-1175S-G10", 3, 1, { model: "Intel Xeon 6517P", ghz: 3.2, cores: 16, sockets: 1 }, { moduleGiB: 32, modules: 8 }, [{ kind: "NVMe" as const, sizeTB: 3.84, perNode: 4 }])],
      license: { edition: "Pro", cores: 48, termMonths: 36 },
      externalStorage: null,
    },
    {
      name: "North-Char",
      solutionType: "CostOptimized",
      nodes: 4,
      capacity: { cores: 256, ramGiB: 3072, ssdTiB: 167.64, hddTiB: 0 },
      utilization: util(52.3, 48.6, 61.4),
      failover: { nMinus1: 76.4, nMinus2: 107.6 },
      models: [model("NX-8170-G10", 4, 1, { model: "Intel Xeon 6530P", ghz: 2.3, cores: 32, sockets: 2 }, { moduleGiB: 32, modules: 24 }, [{ kind: "NVMe" as const, sizeTB: 7.68, perNode: 6 }])],
      license: { edition: "Pro", cores: 256, termMonths: 36 },
      externalStorage: null,
    },
    {
      name: "CJIS",
      solutionType: "CostOptimized",
      nodes: 5,
      capacity: { cores: 240, ramGiB: 2560, ssdTiB: 209.55, hddTiB: 0 },
      utilization: util(47.1, 44.2, 57.8),
      failover: { nMinus1: 69.7, nMinus2: 94.3 },
      models: [
        model("NX-3235-G10", 2, 2, { model: "Intel Xeon 6527P", ghz: 3.0, cores: 24, sockets: 2 }, { moduleGiB: 64, modules: 8 }, [{ kind: "SSD" as const, sizeTB: 7.68, perNode: 6 }]),
        model("NX-3135-G10", 1, 1, { model: "Intel Xeon 6527P", ghz: 3.0, cores: 24, sockets: 2 }, { moduleGiB: 64, modules: 8 }, [{ kind: "SSD" as const, sizeTB: 7.68, perNode: 6 }]),
      ],
      license: { edition: "Pro", cores: 240, termMonths: 36 },
      externalStorage: null,
    },
  ];
  return {
    source: "nutanix_sizer",
    meta: { ...SAMPLE_META, se },
    totals: { clusters: 3, nodes: 12, cores: 544, ramGiB: 6400, ssdTiB: 419.1, hddTiB: 0, vmCount: 123, vCpus: 553 },
    clusters,
    externalStorage: null,
  };
}

/** Same estate consolidated onto fewer, denser nodes — the comparison option. */
export function buildSampleAlternateScenario(se = "Nutanix SE"): ProposalScenario {
  const clusters: ProposalCluster[] = [
    {
      name: "Core",
      solutionType: "Consolidated",
      nodes: 5,
      capacity: { cores: 480, ramGiB: 7680, ssdTiB: 209.62, hddTiB: 0 },
      utilization: util(58.9, 55.4, 66.2),
      failover: { nMinus1: 73.6, nMinus2: 98.1 },
      models: [model("NX-8170A-G10", 5, 1, { model: "Intel Xeon 6548Y+", ghz: 2.5, cores: 48, sockets: 2 }, { moduleGiB: 64, modules: 24 }, [{ kind: "NVMe" as const, sizeTB: 15.36, perNode: 6 }])],
      license: { edition: "Pro", cores: 480, termMonths: 36 },
      externalStorage: null,
    },
    {
      name: "CJIS",
      solutionType: "CostOptimized",
      nodes: 3,
      capacity: { cores: 72, ramGiB: 1152, ssdTiB: 41.88, hddTiB: 0 },
      utilization: util(44.7, 46.9, 52.1),
      failover: { nMinus1: 62.8, nMinus2: 94.2 },
      models: [model("NX-1175S-G10", 3, 1, { model: "Intel Xeon 6537P", ghz: 3.0, cores: 24, sockets: 1 }, { moduleGiB: 32, modules: 12 }, [{ kind: "NVMe" as const, sizeTB: 7.68, perNode: 4 }])],
      license: { edition: "Pro", cores: 72, termMonths: 36 },
      externalStorage: null,
    },
  ];
  return {
    source: "nutanix_sizer",
    meta: { ...SAMPLE_META, se },
    totals: { clusters: 2, nodes: 8, cores: 552, ramGiB: 8832, ssdTiB: 251.5, hddTiB: 0, vmCount: 123, vCpus: 553 },
    clusters,
    externalStorage: null,
  };
}
