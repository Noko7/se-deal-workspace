import type { NodeModel, ProposalScenario } from "@/lib/sizer-import";

// A compact, realistic 3-cluster sample so the Proposal Builder demonstrates the
// full output before the SE uploads their own Nutanix Sizer JSON export. Mirrors
// the structure produced by parseSizerScenario().

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

export const SAMPLE_PROPOSAL_LABEL = "Sample: Dummy Account (3 clusters)";

export function buildSampleScenario(se = "Nutanix SE"): ProposalScenario {
  const clusters = [
    {
      name: "MGMT",
      solutionType: "CostOptimized",
      nodes: 3,
      capacity: { cores: 48, ramGiB: 768, ssdTiB: 41.91, hddTiB: 0 },
      utilization: { cpu: 38, ram: 41, storage: 44 },
      failover: { nMinus1: 60, nMinus2: 90 },
      models: [model("NX-1175S-G10", 3, 1, { model: "Intel Xeon 6517P", ghz: 3.2, cores: 16, sockets: 1 }, { moduleGiB: 32, modules: 8 }, [{ kind: "NVMe" as const, sizeTB: 3.84, perNode: 4 }])],
      license: { edition: "Pro", cores: 48, termMonths: 36 },
    },
    {
      name: "North-Char",
      solutionType: "CostOptimized",
      nodes: 4,
      capacity: { cores: 256, ramGiB: 3072, ssdTiB: 167.64, hddTiB: 0 },
      utilization: { cpu: 52, ram: 49, storage: 61 },
      failover: { nMinus1: 76, nMinus2: 108 },
      models: [model("NX-8170-G10", 4, 1, { model: "Intel Xeon 6530P", ghz: 2.3, cores: 32, sockets: 2 }, { moduleGiB: 32, modules: 24 }, [{ kind: "NVMe" as const, sizeTB: 7.68, perNode: 6 }])],
      license: { edition: "Pro", cores: 256, termMonths: 36 },
    },
    {
      name: "CJIS",
      solutionType: "CostOptimized",
      nodes: 5,
      capacity: { cores: 240, ramGiB: 2560, ssdTiB: 209.55, hddTiB: 0 },
      utilization: { cpu: 47, ram: 44, storage: 58 },
      failover: { nMinus1: 70, nMinus2: 95 },
      models: [
        model("NX-3235-G10", 2, 2, { model: "Intel Xeon 6527P", ghz: 3.0, cores: 24, sockets: 2 }, { moduleGiB: 64, modules: 8 }, [{ kind: "SSD" as const, sizeTB: 7.68, perNode: 6 }]),
        model("NX-3135-G10", 1, 1, { model: "Intel Xeon 6527P", ghz: 3.0, cores: 24, sockets: 2 }, { moduleGiB: 64, modules: 8 }, [{ kind: "SSD" as const, sizeTB: 7.68, perNode: 6 }]),
      ],
      license: { edition: "Pro", cores: 240, termMonths: 36 },
    },
  ];
  return {
    source: "nutanix_sizer",
    meta: {
      customer: "Dummy Account",
      environmentName: "Erick / Ryan - Sample",
      opportunityName: "No Opportunity",
      se,
      seEmail: null,
      installCountry: "United States",
      sizerVersion: "6.2.0.0",
      permalink: null,
      createdDate: new Date().toISOString().slice(0, 10),
    },
    totals: { clusters: 3, nodes: 12, cores: 544, ramGiB: 6400, ssdTiB: 419.1, hddTiB: 0, vmCount: 123, vCpus: 553 },
    clusters,
  };
}
