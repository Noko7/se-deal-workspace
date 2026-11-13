// Parser checks against the shapes OEM Sizer exports actually use. The Dell
// fixture mirrors a real XC670 export: memory as a DIMM line with a per-node
// quantity, CPU speed and cores abbreviated ("3.2G, 16C/32T"), NVMe drives
// filed under featureName "HDD", and NCM quoted next to NCI.

import assert from "node:assert/strict";
import test from "node:test";

import { parseSizerScenario } from "@/lib/sizer-import";
import { buildProposalDoc, cpuSummary, memorySummary, storageSummary } from "@/lib/proposal-doc";

type Comp = { code: string; featureName?: string | null; description: string; qtyPerNode?: number | null; totalQtyAcrossBlocks?: number | null };

function dellExport(memory: Comp) {
  const nodes = 3;
  const components: Comp[] = [
    { code: "Dell - XC670-16S-CORE", featureName: null, description: "Dell - XC670-16S-CORE", qtyPerNode: 1, totalQtyAcrossBlocks: nodes },
    {
      code: "338-CTBD",
      featureName: "CPU",
      description: "338-CTBD (Intel Xeon 6 Performance 6517P 3.2G, 16C/32T, 24GT/s, 72M Cache, Turbo, (190W) DDR5-6400)",
      qtyPerNode: 1,
      totalQtyAcrossBlocks: nodes,
    },
    memory,
    { code: "345-BKFS", featureName: "HDD", description: "345-BKFS (3.2TB Data Center NVMe Mixed Use AG Drive E3s Gen5 with carrier)", qtyPerNode: 4, totalQtyAcrossBlocks: 12 },
    { code: "Dell-SSD-NONE", featureName: "SSD", description: "Dell-SSD-NONE (Do not quote this SKU. No SSD Included.)", qtyPerNode: 1, totalQtyAcrossBlocks: nodes },
    { code: "540-BFLP", featureName: "NETWORK", description: "540-BFLP (NVIDIA ConnectX-6 Lx Dual Port 25GbE SFP28 Adapter, OCP 3.0 NIC +Sec)", qtyPerNode: 1, totalQtyAcrossBlocks: nodes },
    { code: "C-PCIe-NIC-NONE_Dell", featureName: "NETWORK", description: "C-PCIe-NIC-NONE_Dell (No PCIe NIC Selected)", qtyPerNode: 1, totalQtyAcrossBlocks: nodes },
  ];
  const capacitySummary = { cores: { value: 48 }, ssd: { unit: "TiB", value: 34.9 }, hdd: { unit: "TiB", value: 0 }, ram: { unit: "GB", value: 1152 } };
  const license = (sku: string) => ({
    components: [
      { code: sku, qty: 48, description: `${sku} (Subscription for 1 CPU Core)` },
      { code: "Term-Months", qty: 36, description: "Term-Months (Term in months)" },
    ],
  });
  return {
    scenario: { details: { sfdcAccountName: "Fixture Co", envName: "Fixture" }, capacitySummary },
    clusters: [
      {
        name: "Cluster-1",
        capacitySummary,
        modelAndLicenseDetails: {
          blockBudgetaryQuoteInfo: [{ blockSKU: "Dell - XC670-16S-CORE", nodesInBlock: 1, count: nodes, components }],
          cblBudgetaryQuoteInfo: [license("SW-NCI-PRO-PR"), license("SW-NCM-PRO-PR")],
        },
      },
    ],
  };
}

const DIMMS: Comp = { code: "370-BCGL", featureName: "RAM", description: "370-BCGL (96GB RDIMM, 6400MT/s, Dual Rank)", qtyPerNode: 4, totalQtyAcrossBlocks: 12 };

test("an OEM DIMM line with a per-node quantity multiplies out to the node total", () => {
  const m = parseSizerScenario(dellExport(DIMMS)).clusters[0].models[0];
  assert.deepEqual(m.memory, { moduleGiB: 96, modulesPerNode: 4, perNodeGiB: 384 });
  assert.equal(memorySummary(m), "4× 96 GB (384 GB/node)");
});

test("an OEM line that already states the node total is not multiplied", () => {
  const total: Comp = { code: "UCSC_MEMORY_384", featureName: "RAM", description: "384GB Memory", qtyPerNode: 1, totalQtyAcrossBlocks: 3 };
  const m = parseSizerScenario(dellExport(total)).clusters[0].models[0];
  assert.equal(m.memory?.perNodeGiB, 384);
  assert.equal(memorySummary(m), "384 GB/node", "no 'null GB' module size in the summary");
});

test("Dell's abbreviated CPU wording yields model, cores and clock", () => {
  const m = parseSizerScenario(dellExport(DIMMS)).clusters[0].models[0];
  assert.equal(m.cpu?.model, "Intel Xeon 6517P");
  assert.equal(m.cpu?.coresPerCpu, 16);
  assert.equal(m.cpu?.ghz, 3.2);
  assert.equal(cpuSummary(m), "1× Intel Xeon 6517P (16-core @ 3.2 GHz)");
});

test("an NVMe drive filed under featureName HDD is reported as NVMe", () => {
  const m = parseSizerScenario(dellExport(DIMMS)).clusters[0].models[0];
  assert.equal(storageSummary(m), "4× 3.2 TB NVMe");
});

test("NCM quoted in Sizer is carried into the proposal's software scope", () => {
  const scenario = parseSizerScenario(dellExport(DIMMS));
  assert.deepEqual(scenario.clusters[0].addOnLicenses, [{ product: "NCM", edition: "Pro", qty: 48 }]);
  const lines = buildProposalDoc(scenario, "dell.json").licensing.lines.map((l) => `${l.product} ${l.tier} ${l.qty}`);
  assert.deepEqual(lines, ["CloudInfrastructure Pro 48", "CloudManager Pro 48"]);
});
