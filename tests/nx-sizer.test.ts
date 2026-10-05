// Rules for the VM-driven NX sizing engine. Expected numbers are worked out by
// hand in the comments beside each assertion; none are read back from the engine.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findNxModel, NX_MODELS } from "@/lib/nx-catalog";
import {
  CVM_PCORES_PER_NODE,
  DEFAULT_NX_SETTINGS,
  PC_PROFILES,
  SIZING_CONSTANTS,
  approvedModels,
  buildDemand,
  buildWorkload,
  cvmRamGiBFor,
  fitConfig,
  nodeCapacity,
  nodeConfigs,
  planClusters,
  recommendNx,
  type NodeConfig,
  type NxDemand,
  type NxSizerSettings,
} from "@/lib/nx-sizer";
import type { ParsedEnvironment, VmRecord } from "@/lib/simple-sizer-core";

// --- fixtures ---------------------------------------------------------------

let seq = 0;
function vm(over: Partial<VmRecord> = {}): VmRecord {
  seq += 1;
  return {
    id: `vm-${seq}`,
    name: `vm-${seq}`,
    clusterId: null,
    clusterName: null,
    poweredOn: true,
    os: "Linux",
    vcpu: 2,
    ramGiB: 8,
    storageProvisionedTiB: 0.1,
    storageConsumedTiB: 0.05,
    consumedSource: "partition",
    cpuUsed: { average: null, p95: null, peak: null },
    ramUsedGiB: null,
    ...over,
  };
}

function env(vms: VmRecord[], extra: Record<string, unknown> = {}): ParsedEnvironment {
  return { vms, powerStateKnown: true, volumeGroups: [], plausibility: [], ...extra } as unknown as ParsedEnvironment;
}

// Existing rules are checked on the NX catalog ("auto") at the failover limit
// (target 1); generic hardware and the 50% target have their own tests.
const settings = (over: Partial<NxSizerSettings> = {}): NxSizerSettings => ({ ...DEFAULT_NX_SETTINGS, modelSku: "auto", targetUtilization: 1, ...over });

function close(actual: number, expected: number, what: string, eps = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= eps, `${what}: got ${actual}, expected ${expected}`);
}

const TIB_PER_TB = 1e12 / 2 ** 40; // 0.909494701772928

// A 24-core / 512 GiB node with 4 x 7.68 TB NVMe (30.72 TB raw).
const m1175 = findNxModel("NX-1175S-G10")!;
function node(over: Partial<NodeConfig> = {}): NodeConfig {
  return {
    model: m1175,
    cpu: m1175.cpus[0],
    cores: 24,
    ramGiB: 512,
    drives: [{ media: "NVMe", count: 4, sizeTB: 7.68 }],
    rawTB: 30.72,
    ...over,
  };
}

// --- overheads --------------------------------------------------------------

describe("CVM", () => {
  it("takes 6 physical cores per node (12 vCPU at 2:1) and 32 GiB, 40 GiB at RF3", () => {
    assert.equal(CVM_PCORES_PER_NODE, 6); // ceil(12 / 2)
    assert.equal(cvmRamGiBFor(2), 32);
    assert.equal(cvmRamGiBFor(3), 40); // min(32 + 8, 40)
  });

  it("leaves cores - 6 usable and charges the CVM RAM by RF", () => {
    const rf2 = nodeCapacity(node(), settings({ rf: 2 }));
    const rf3 = nodeCapacity(node(), settings({ rf: 3 }));
    assert.equal(rf2.cpu.usable, 18); // 24 - 6
    assert.equal(rf2.ram.cvmGiB, 32);
    assert.equal(rf3.ram.cvmGiB, 40);
    close(rf2.ram.usable - rf3.ram.usable, 8, "RF3 costs 8 GiB more RAM");
  });

  it("charges the CVM storage for a 4 x 7.68 TB NVMe node at RF2 (~2.882 TiB)", () => {
    const cap = nodeCapacity(node(), settings({ rf: 2 }));
    // decimal TB: boot/home 0.280 + oplog 0.400 + hades 4 x 0.100 = 1.080
    //   + Cassandra 3% x 30.72 = 0.9216 + Curator 2% x 30.72 = 0.6144
    //   + ext4 1.8% x 30.72 (7.68 TB drives are >= 4 TB) = 0.55296
    //   = 3.16896 TB = 3.16896 x 0.9094947 = 2.88215 TiB
    close(cap.storage.cvm.totalTiB, 3.16896 * TIB_PER_TB, "CVM storage", 1e-9);
    assert.ok(Math.abs(cap.storage.cvm.totalTiB - 2.882) < 0.001);
    close(cap.storage.cvm.hadesTiB, 0.4 * TIB_PER_TB, "Hades 100 GB x 4 drives");
    close(cap.storage.cvm.oplogTiB, 0.4 * TIB_PER_TB, "RF2 oplog 400 GB");
  });

  it("uses a 600 GB oplog at RF3", () => {
    const cap = nodeCapacity(node(), settings({ rf: 3 }));
    close(cap.storage.cvm.oplogTiB, 0.6 * TIB_PER_TB, "RF3 oplog");
  });

  it("picks the ext4 fraction by media and drive size", () => {
    // 2 x 3.84 TB NVMe: 2.6% x 7.68 TB = 0.19968 TB
    const small = nodeCapacity(node({ drives: [{ media: "NVMe", count: 2, sizeTB: 3.84 }], rawTB: 7.68 }), settings());
    close(small.storage.cvm.ext4TiB, 0.19968 * TIB_PER_TB, "sub-4 TB flash ext4");
    // 2 x 7.68 TB NVMe: 1.8% x 15.36 TB = 0.27648 TB
    const big = nodeCapacity(node({ drives: [{ media: "NVMe", count: 2, sizeTB: 7.68 }], rawTB: 15.36 }), settings());
    close(big.storage.cvm.ext4TiB, 0.27648 * TIB_PER_TB, ">= 4 TB flash ext4");
    // 2 x 3.84 NVMe + 2 x 8 TB HDD: 0.026 x 7.68 + 0.018 x 16 = 0.19968 + 0.288 = 0.48768 TB
    const hybrid = nodeCapacity(
      node({
        drives: [
          { media: "NVMe", count: 2, sizeTB: 3.84 },
          { media: "HDD", count: 2, sizeTB: 8 },
        ],
        rawTB: 23.68,
      }),
      settings(),
    );
    close(hybrid.storage.cvm.ext4TiB, 0.48768 * TIB_PER_TB, "hybrid ext4");
  });
});

describe("safety buffer", () => {
  it("is 5% of node raw RAM and raw storage, and not of CPU", () => {
    const cap = nodeCapacity(node(), settings());
    close(cap.ram.bufferGiB, 25.6, "5% of 512 GiB");
    const rawTiB = 30.72 * TIB_PER_TB; // 27.9397
    close(cap.storage.rawTiB, rawTiB, "raw TiB", 1e-9);
    close(cap.storage.bufferTiB, rawTiB * 0.05, "5% raw storage"); // 1.39698
    assert.equal(cap.cpu.usable, cap.cpu.cores - 6, "no CPU buffer");
  });

  it("nets raw - buffer - CVM storage", () => {
    const cap = nodeCapacity(node(), settings());
    // 27.93968 - 1.39698 - 2.88215 = 23.66054 TiB
    close(cap.storage.usable, 27.93968 - 1.39698 - 2.88215, "usable storage", 1e-4);
  });
});

describe("AHV host overhead", () => {
  it("is 3.5 GiB + 2.2% of physical RAM", () => {
    const cap = nodeCapacity(node(), settings());
    close(cap.ram.ahvHostGiB, 3.5 + 0.022 * 512, "AHV host"); // 14.764
    // 512 - 25.6 - 32 - 14.764 = 439.636
    close(cap.ram.usable, 439.636, "usable RAM");
  });

  it("adds 2 GiB for Flow Virtual Networking and 4 GiB for Flow Microsegmentation", () => {
    const base = nodeCapacity(node(), settings()).ram.ahvHostGiB;
    close(nodeCapacity(node(), settings({ flowVirtualNetworking: true })).ram.ahvHostGiB - base, 2, "Flow VN");
    close(nodeCapacity(node(), settings({ flowMicrosegmentation: true })).ram.ahvHostGiB - base, 4, "Flow Seg");
    close(
      nodeCapacity(node(), settings({ flowVirtualNetworking: true, flowMicrosegmentation: true })).ram.ahvHostGiB - base,
      6,
      "both",
    );
  });

  it("charges no AHV CPU overhead", () => {
    const withFlow = nodeCapacity(node(), settings({ flowVirtualNetworking: true, flowMicrosegmentation: true }));
    assert.equal(withFlow.cpu.usable, 18);
  });
});

describe("per-VM overhead", () => {
  it("is 50 MiB + 1 MiB per vCPU + 7 MiB per GiB of RAM", () => {
    // 4 vCPU, 16 GiB: 50 + 4 + 112 = 166 MiB = 0.162109375 GiB
    const parsed = env([vm({ vcpu: 4, ramGiB: 16 })]);
    const w = buildWorkload(parsed, settings());
    const d = buildDemand(parsed, w, settings());
    close(d.ram.vmOverheadGiB, 166 / 1024, "per-VM overhead");
    close(d.ram.total, 16 + 166 / 1024, "RAM demand");
  });

  it("sums per running VM only", () => {
    // VM a: 2 vCPU 8 GiB = 50 + 2 + 56 = 108 MiB; VM b: 8 vCPU 32 GiB = 50 + 8 + 224 = 282 MiB
    const parsed = env([vm({ vcpu: 2, ramGiB: 8 }), vm({ vcpu: 8, ramGiB: 32 }), vm({ vcpu: 64, ramGiB: 512, poweredOn: false })]);
    const s = settings();
    const d = buildDemand(parsed, buildWorkload(parsed, s), s);
    close(d.ram.vmOverheadGiB, (108 + 282) / 1024, "overhead of running VMs only");
  });

  it("uses the legacy 2.6 GB/host + 60 MB/VM preset when chosen", () => {
    const parsed = env([vm()]);
    const s = settings({ ahvPreset: "legacy" });
    const d = buildDemand(parsed, buildWorkload(parsed, s), s);
    close(d.ram.vmOverheadGiB, 60e6 / 1024 ** 3, "60 MB per VM in GiB"); // 0.055879
    close(nodeCapacity(node(), s).ram.ahvHostGiB, 2.6e9 / 1024 ** 3, "2.6 GB per host"); // 2.4214
  });
});

// --- workload ---------------------------------------------------------------

describe("workload", () => {
  it("excludes powered-off VMs from CPU and RAM but keeps their storage", () => {
    const parsed = env([
      vm({ vcpu: 8, ramGiB: 16, storageConsumedTiB: 0.5 }),
      vm({ vcpu: 4, ramGiB: 8, storageConsumedTiB: 0.25 }),
      vm({ vcpu: 16, ramGiB: 64, storageConsumedTiB: 1.0, poweredOn: false }),
    ]);
    const w = buildWorkload(parsed, settings());
    assert.equal(w.runningVms, 2);
    assert.equal(w.storedVms, 3);
    assert.equal(w.vcpu, 12); // 8 + 4
    close(w.cpuCores, 3, "cores"); // (8 + 4) / 4
    assert.equal(w.ramGiB, 24); // 16 + 8
    close(w.storage.vmsTiB, 1.75, "storage includes the powered-off VM"); // 0.5 + 0.25 + 1.0
  });

  it("includes powered-off VMs in CPU and RAM when the basis is 'all'", () => {
    const parsed = env([vm({ vcpu: 8, ramGiB: 16 }), vm({ vcpu: 16, ramGiB: 64, poweredOn: false })]);
    const w = buildWorkload(parsed, settings({ workloadBasis: "all" }));
    assert.equal(w.runningVms, 2);
    close(w.cpuCores, 6, "cores"); // 24 / 4
    assert.equal(w.ramGiB, 80);
  });

  it("treats every VM as running when the export has no power state", () => {
    const parsed = env([vm({ poweredOn: null }), vm({ poweredOn: null })], { powerStateKnown: false });
    assert.equal(buildWorkload(parsed, settings()).runningVms, 2);
  });

  it("uses p95 CPU where present and vCPU / ratio elsewhere", () => {
    const parsed = env([
      vm({ vcpu: 8, cpuUsed: { average: 1, p95: 1.5, peak: 3 } }), // 1.5 cores measured
      vm({ vcpu: 4 }), // 4 / 4 = 1.0
    ]);
    const w = buildWorkload(parsed, settings());
    close(w.cpuCores, 2.5, "cores");
    assert.equal(w.cpuMeasuredVms, 1);
    assert.equal(w.cpuFallbackVms, 1);
    // Ratio is an SE input: at 2:1 the unmeasured VM needs 2 cores -> 3.5.
    close(buildWorkload(parsed, settings({ vcpuPerPcore: 2 })).cpuCores, 3.5, "cores at 2:1");
  });

  it("does not use average or peak in place of p95", () => {
    const parsed = env([vm({ vcpu: 8, cpuUsed: { average: 6, p95: null, peak: 8 } })]);
    const w = buildWorkload(parsed, settings());
    close(w.cpuCores, 2, "falls back to vCPU / ratio"); // 8 / 4
    assert.equal(w.cpuMeasuredVms, 0);
  });

  it("charges consumed or provisioned storage by basis, plus volume groups", () => {
    const parsed = env([vm({ storageConsumedTiB: 1, storageProvisionedTiB: 3 })], {
      volumeGroups: [{ name: "vg", owner: "o", clusterId: null, consumedTiB: 0.5, provisionedTiB: 2 }],
    });
    const consumed = buildWorkload(parsed, settings({ storageBasis: "consumed" }));
    close(consumed.storage.vmsTiB, 1, "VM consumed");
    close(consumed.storage.volumeGroupsTiB, 0.5, "VG consumed");
    const provisioned = buildWorkload(parsed, settings({ storageBasis: "provisioned" }));
    close(provisioned.storage.vmsTiB, 3, "VM provisioned");
    close(provisioned.storage.volumeGroupsTiB, 2, "VG provisioned");
  });

  it("drops VMs the SE excluded", () => {
    const keep = vm();
    const drop = vm();
    const w = buildWorkload(env([keep, drop]), settings({ vmAdjustments: { [drop.id]: { excluded: true } } }));
    assert.equal(w.runningVms, 1);
    assert.equal(w.excludedVms, 1);
  });
});

describe("Prism Central profile", () => {
  it("adds vCPU / ratio, RAM and per-VM overhead", () => {
    // Small scale-out: 3 VMs, 18 vCPU, 84 GiB. Cores = 18 / 4 = 4.5.
    // Overhead per VM: 6 vCPU, 28 GiB -> 50 + 6 + 196 = 252 MiB; x 3 = 756 MiB.
    const parsed = env([vm({ vcpu: 4, ramGiB: 16 })]);
    const s = settings({ prismCentral: "small-scale-out" });
    const d = buildDemand(parsed, buildWorkload(parsed, s), s);
    close(d.cpu.pcCores, 4.5, "PC cores");
    close(d.cpu.total, 1 + 4.5, "total cores"); // VM 4/4 = 1
    close(d.ram.pcGiB, 84, "PC RAM");
    close(d.ram.pcOverheadGiB, 756 / 1024, "PC overhead");
  });

  it("charges the storage-capacity column on the consumed basis and configured vDisk on provisioned", () => {
    // Large scale-out: capacity 7,500 GiB, configured vDisk 30,000 GiB.
    const parsed = env([vm({ storageConsumedTiB: 1, storageProvisionedTiB: 2 })]);
    const consumed = settings({ prismCentral: "large-scale-out", storageBasis: "consumed" });
    const dc = buildDemand(parsed, buildWorkload(parsed, consumed), consumed);
    close(dc.storage.pcTiB, 7500 / 1024, "PC consumed"); // 7.3242
    close(dc.storage.logicalTiB, 1 + 7500 / 1024, "logical");
    const provisioned = settings({ prismCentral: "large-scale-out", storageBasis: "provisioned" });
    const dp = buildDemand(parsed, buildWorkload(parsed, provisioned), provisioned);
    close(dp.storage.pcTiB, 30000 / 1024, "PC provisioned"); // 29.2969
    close(dp.storage.logicalTiB, 2 + 30000 / 1024, "logical");
  });

  it("has the seven documented profiles", () => {
    assert.deepEqual(
      PC_PROFILES.map((p) => [p.id, p.vms, p.vcpu, p.ramGiB, p.storageGiB, p.vdiskGiB]),
      [
        ["x-small", 1, 4, 18, 100, 100],
        ["small", 1, 6, 28, 500, 500],
        ["large", 1, 10, 46, 2500, 10000],
        ["x-large", 1, 14, 62, 2500, 10000],
        ["small-scale-out", 3, 18, 84, 1500, 1500],
        ["large-scale-out", 3, 30, 138, 7500, 30000],
        ["x-large-scale-out", 3, 42, 186, 7500, 30000],
      ],
    );
  });

  it("adds nothing when none is selected", () => {
    const parsed = env([vm()]);
    const d = buildDemand(parsed, buildWorkload(parsed, settings()), settings());
    assert.equal(d.cpu.pcCores, 0);
    assert.equal(d.ram.pcGiB, 0);
    assert.equal(d.storage.pcTiB, 0);
  });
});

describe("compression and replication factor", () => {
  it("scales storage demand by (1 - savings) x RF", () => {
    // 10 TiB VMs + 1 TiB VG = 11 TiB logical. 30% savings -> 7.7. RF2 -> 15.4; RF3 -> 23.1.
    const parsed = env([vm({ storageConsumedTiB: 10 })], {
      volumeGroups: [{ name: "vg", owner: "o", clusterId: null, consumedTiB: 1, provisionedTiB: 1 }],
    });
    const rf2 = settings({ compressionSavings: 0.3, rf: 2 });
    const d2 = buildDemand(parsed, buildWorkload(parsed, rf2), rf2);
    close(d2.storage.logicalTiB, 11, "logical");
    close(d2.storage.afterCompressionTiB, 7.7, "after compression");
    close(d2.storage.rawTiB, 15.4, "RF2 raw");
    const rf3 = settings({ compressionSavings: 0.3, rf: 3 });
    close(buildDemand(parsed, buildWorkload(parsed, rf3), rf3).storage.rawTiB, 23.1, "RF3 raw");
  });

  it("is off by default", () => {
    const parsed = env([vm({ storageConsumedTiB: 10 })]);
    const d = buildDemand(parsed, buildWorkload(parsed, settings()), settings());
    close(d.storage.rawTiB, 20, "RF2 raw with no savings");
  });

  it("reduces the nodes a storage-bound build needs", () => {
    // 200 TiB of VMs. Usable per 4 x 7.68 TB node = 23.6605 TiB.
    // No savings: 400 TiB raw / 23.6605 = 16.9 -> 17 working nodes.
    // 50% savings: 200 TiB raw / 23.6605 = 8.45 -> 9 working nodes.
    const parsed = env([vm({ storageConsumedTiB: 200 })]);
    const run = (compressionSavings: number) => {
      const s = settings({ compressionSavings });
      const w = buildWorkload(parsed, s);
      return fitConfig(node(), buildDemand(parsed, w, s), w, s);
    };
    assert.equal(run(0).nodesFor.storage, 17);
    assert.equal(run(0.5).nodesFor.storage, 9);
    assert.ok(run(0.5).totalNodes < run(0).totalNodes);
  });
});

// --- failover, minimums, clusters --------------------------------------------

// A demand shaped by hand so the node counts are checkable.
function demand(over: { cpu?: number; ram?: number; rawTiB?: number }): NxDemand {
  return {
    cpu: { vmCores: over.cpu ?? 1, pcCores: 0, total: over.cpu ?? 1 },
    ram: { vmGiB: over.ram ?? 1, vmOverheadGiB: 0, pcGiB: 0, pcOverheadGiB: 0, total: over.ram ?? 1 },
    storage: {
      vmsTiB: 0,
      volumeGroupsTiB: 0,
      pcTiB: 0,
      logicalTiB: 0,
      compressionSavings: 0,
      afterCompressionTiB: 0,
      rf: 2,
      rawTiB: over.rawTiB ?? 0.1,
    },
  };
}

const noLargeVm = buildWorkload(env([vm({ vcpu: 1, ramGiB: 1 })]), settings());

describe("failover", () => {
  // 16-core / 256 GiB node: usable cores 10; usable RAM 256 - 12.8 - 32 - (3.5 + 5.632) = 202.068.
  const small = node({ cores: 16, ramGiB: 256 });

  it("N+1 means the demand fits on N-1 nodes", () => {
    // 45 cores / 10 = 4.5 -> 5 working nodes; + 1 failover = 6 nodes.
    const fit = fitConfig(small, demand({ cpu: 45 }), noLargeVm, settings({ failoverNodes: 1 }));
    assert.equal(fit.workingNodes, 5);
    assert.equal(fit.totalNodes, 6);
    assert.equal(fit.clusters[0].failoverNodes, 1);
    // With one node lost, 5 x 10 = 50 >= 45 (fits); with two lost, 4 x 10 = 40 < 45 (would not).
    assert.ok(fit.workingNodes * fit.capacity.cpu.usable >= 45);
    assert.ok((fit.workingNodes - 1) * fit.capacity.cpu.usable < 45);
    assert.equal(fit.totalCores, 6 * 16);
  });

  it("N+0 and N+2 shift the node count by the failover nodes", () => {
    assert.equal(fitConfig(small, demand({ cpu: 45 }), noLargeVm, settings({ failoverNodes: 0 })).totalNodes, 5);
    assert.equal(fitConfig(small, demand({ cpu: 45 }), noLargeVm, settings({ failoverNodes: 2 })).totalNodes, 7);
  });

  it("applies the same rule to RAM", () => {
    // 450 GiB / 202.068 = 2.23 -> 3 working; N+1 = 4. CPU needs 1.
    const fit = fitConfig(small, demand({ cpu: 1, ram: 450 }), noLargeVm, settings());
    assert.equal(fit.nodesFor.ram, 3);
    assert.equal(fit.totalNodes, 4);
    assert.equal(fit.driver, "ram");
  });

  it("applies the same rule to storage", () => {
    // 60 TiB raw / 23.6605 = 2.54 -> 3 working; N+1 = 4.
    const fit = fitConfig(small, demand({ cpu: 1, ram: 1, rawTiB: 60 }), noLargeVm, settings());
    assert.equal(fit.nodesFor.storage, 3);
    assert.equal(fit.totalNodes, 4);
    assert.equal(fit.driver, "storage");
  });

  it("reports utilization with the failover nodes lost at or under 100%", () => {
    const rec = recommendNx(env(Array.from({ length: 30 }, () => vm({ vcpu: 8, ramGiB: 32 }))), settings());
    assert.ok(rec.fit && rec.utilization);
    assert.ok(rec.utilization.cpu.failover <= 100 + 1e-6);
    assert.ok(rec.utilization.ram.failover <= 100 + 1e-6);
    assert.ok(rec.utilization.storage.failover <= 100 + 1e-6);
    assert.ok(rec.utilization.cpu.allUp <= rec.utilization.cpu.failover);
  });
});

describe("minimum nodes", () => {
  const small = node({ cores: 16, ramGiB: 256 });

  it("is 3 at RF2 even for a trivial workload", () => {
    const fit = fitConfig(small, demand({}), noLargeVm, settings({ rf: 2 }));
    assert.equal(fit.workingNodes, 1);
    assert.equal(fit.totalNodes, 3);
    assert.equal(fit.driver, "minimum");
    assert.equal(fit.clusters[0].raisedToMinimum, true);
  });

  it("is 5 at RF3", () => {
    const fit = fitConfig(small, demand({}), noLargeVm, settings({ rf: 3 }));
    assert.equal(fit.totalNodes, 5);
    assert.equal(fit.driver, "minimum");
  });

  it("does not raise a build already above the minimum", () => {
    const fit = fitConfig(small, demand({ cpu: 45 }), noLargeVm, settings({ rf: 2 }));
    assert.equal(fit.totalNodes, 6);
    assert.equal(fit.clusters[0].raisedToMinimum, false);
    assert.notEqual(fit.driver, "minimum");
  });

  it("is a constant per RF", () => {
    assert.deepEqual(SIZING_CONSTANTS.minNodesByRf, { 2: 3, 3: 5 });
  });
});

describe("cluster limit", () => {
  it("keeps up to 32 nodes (31 working + 1 failover) in one cluster", () => {
    const plan = planClusters(31, 1, 2);
    assert.equal(plan.length, 1);
    assert.equal(plan[0].nodes, 32);
  });

  it("splits 32 working nodes into two clusters, each with its own failover node", () => {
    // ceil(32 / 31) = 2 clusters of 16 working + 1 failover = 17 nodes each = 34.
    const plan = planClusters(32, 1, 2);
    assert.deepEqual(
      plan.map((c) => [c.nodes, c.workingNodes, c.failoverNodes]),
      [
        [17, 16, 1],
        [17, 16, 1],
      ],
    );
  });

  it("spreads an uneven split", () => {
    // 70 working / 31 -> 3 clusters of 24, 23, 23 working (+1 each).
    assert.deepEqual(
      planClusters(70, 1, 2).map((c) => c.nodes),
      [25, 24, 24],
    );
  });

  it("uses the per-cluster failover for N+2", () => {
    // 60 working / (32 - 2) = 2 clusters of 30 working + 2 = 32 nodes each.
    const plan = planClusters(60, 2, 2);
    assert.deepEqual(
      plan.map((c) => [c.nodes, c.failoverNodes]),
      [
        [32, 2],
        [32, 2],
      ],
    );
  });

  it("applies the RF minimum per cluster", () => {
    const plan = planClusters(1, 1, 3);
    assert.equal(plan[0].nodes, 5);
    assert.equal(plan[0].workingNodes, 4);
  });

  it("flows through fitConfig and the recommendation warning", () => {
    // 16-core node: usable 10. 320 cores -> 32 working -> 2 clusters of 17 = 34 nodes.
    const fit = fitConfig(node({ cores: 16, ramGiB: 256 }), demand({ cpu: 320 }), noLargeVm, settings());
    assert.equal(fit.workingNodes, 32);
    assert.equal(fit.clusters.length, 2);
    assert.equal(fit.totalNodes, 34);
  });
});

// --- configurations and model selection --------------------------------------

describe("node core minimum", () => {
  it("never offers a configuration under 12 cores per node", () => {
    for (const model of NX_MODELS) {
      for (const config of nodeConfigs(model)) {
        assert.ok(config.cores >= 12, `${model.sku} ${config.cpu.model}: ${config.cores} cores`);
      }
    }
  });

  it("never produces a 1 x 8-core node", () => {
    for (const model of NX_MODELS) {
      for (const config of nodeConfigs(model)) {
        assert.ok(!(model.socketsPerNode === 1 && config.cpu.coresPerCpu === 8), `${model.sku} ${config.cpu.model}`);
      }
    }
    const skus = new Set(nodeConfigs(m1175).map((c) => c.cpu.model));
    assert.ok(!skus.has("Intel Xeon 6507P"), "8-core 6507P is 1 x 8 on NX-1175S");
    assert.ok(!skus.has("Intel Xeon 6714P"), "8-core 6714P is 1 x 8 on NX-1175S");
    assert.ok(skus.has("Intel Xeon 6505P"), "12-core 6505P is allowed");
  });

  it("allows 2 x 8 (16 cores)", () => {
    const m3035 = findNxModel("NX-3035-G10")!;
    const sixteen = nodeConfigs(m3035).filter((c) => c.cpu.model === "Intel Xeon 6507P");
    assert.ok(sixteen.length > 0);
    assert.ok(sixteen.every((c) => c.cores === 16));
  });

  it("never recommends a node under 12 cores", () => {
    const rec = recommendNx(env([vm({ vcpu: 1, ramGiB: 1 })]), settings());
    assert.ok(rec.fit);
    assert.ok(rec.fit.config.cores >= 12);
  });
});

describe("all-flash only", () => {
  it("never offers a configuration with HDDs, on any model", () => {
    for (const model of NX_MODELS) {
      for (const c of nodeConfigs(model)) assert.ok(c.drives.every((d) => d.media !== "HDD"), `${model.sku}`);
    }
  });
});

describe("Sizer-style import options", () => {
  it("CPU configuration ignores measured p95 and uses vCPU / ratio", () => {
    // 8 vCPU with p95 = 1.5 cores. Utilization: 1.5. Configuration at 4:1: 2.
    const parsed = env([vm({ vcpu: 8, cpuUsed: { p95: 1.5, peak: null, average: null } })]);
    close(buildWorkload(parsed, settings({ cpuBasis: "utilization" })).cpuCores, 1.5, "utilization");
    close(buildWorkload(parsed, settings({ cpuBasis: "configuration", vcpuPerPcore: 4 })).cpuCores, 2, "configuration");
  });

  it("memory consumed uses the measured figure where present, configured otherwise", () => {
    // 16 GiB measured at 6 GiB + 32 GiB unmeasured = 38 GiB consumed; 48 GiB provisioned.
    const parsed = env([vm({ ramGiB: 16, ramUsedGiB: 6 }), vm({ ramGiB: 32, ramUsedGiB: null })]);
    close(buildWorkload(parsed, settings({ memoryBasis: "consumed" })).ramGiB, 38, "consumed");
    close(buildWorkload(parsed, settings({ memoryBasis: "provisioned" })).ramGiB, 48, "provisioned");
  });

  it("powered-off storage is counted only when asked", () => {
    // On: 1 TiB consumed. Off: 2 TiB consumed.
    const parsed = env([
      vm({ poweredOn: true, storageConsumedTiB: 1, storageProvisionedTiB: 3 }),
      vm({ poweredOn: false, storageConsumedTiB: 2, storageProvisionedTiB: 4 }),
    ]);
    close(buildWorkload(parsed, settings({ includePoweredOffStorage: true })).storage.vmsTiB, 3, "with off");
    close(buildWorkload(parsed, settings({ includePoweredOffStorage: false })).storage.vmsTiB, 1, "on only");
  });

  it("a VM with no consumed figure counts at its provisioned size", () => {
    const parsed = env([vm({ storageConsumedTiB: 0, storageProvisionedTiB: 5, consumedSource: "none" })]);
    const w = buildWorkload(parsed, settings({ storageBasis: "consumed" }));
    close(w.storage.vmsTiB, 5, "provisioned fallback");
    assert.equal(w.storage.provisionedFallbackVms, 1);
  });
});

describe("model selection", () => {
  it("ROBO: takes the small single-socket node with the fewest cores, then the least raw", () => {
    // A tiny workload fits at the RF2 minimum of 3 nodes on a 12-core
    // single-socket node (3 x 12 = 36 cores). Every candidate is listed in attempts.
    const rec = recommendNx(env(Array.from({ length: 10 }, () => vm())), settings({ useCase: "robo" }));
    assert.ok(rec.fit);
    assert.equal(rec.fit.totalNodes, 3);
    assert.equal(rec.fit.config.model.socketsPerNode, 1);
    assert.equal(rec.fit.totalCores, 36);
    assert.deepEqual(rec.blockers, []);
    assert.deepEqual(rec.attempts.map((a) => a.sku), ["NX-1120AS-G10", "NX-1175S-G10", "NX-3035-G10"]);
  });

  it("general consolidation only offers dual-socket platforms", () => {
    const rec = recommendNx(env(Array.from({ length: 10 }, () => vm())), settings({ useCase: "general" }));
    assert.ok(rec.fit);
    assert.equal(rec.fit.config.model.socketsPerNode, 2);
    assert.deepEqual(rec.attempts.map((a) => a.sku), ["NX-3035-G10", "NX-8170-G10", "NX-8150-G10", "NX-8170A-G10"]);
  });

  it("picks the model needing the fewest nodes, then the fewest cores", () => {
    // 300 VMs x 8 vCPU / 4 = 600 cores: the 128-core 8150/8170A need far fewer nodes than the 48-core 3035.
    const rec = recommendNx(env(Array.from({ length: 300 }, () => vm({ vcpu: 8, ramGiB: 32 }))), settings({ useCase: "general" }));
    assert.ok(rec.fit);
    assert.notEqual(rec.fit.config.model.sku, "NX-3035-G10");
    const nodesFor = (sku: string) => recommendNx(env(Array.from({ length: 300 }, () => vm({ vcpu: 8, ramGiB: 32 }))), settings({ modelSku: sku })).fit!.totalNodes;
    assert.ok(rec.fit.totalNodes <= nodesFor("NX-3035-G10"));
    assert.ok(rec.fit.totalNodes <= nodesFor("NX-8170-G10"));
  });

  it("fits a VM's vCPU against the node's physical cores (AHV will not start more)", () => {
    // 24 vCPU needs a 24-core node; the CVM's cores are not taken off.
    const rec = recommendNx(env([vm({ vcpu: 24, ramGiB: 16 })]), settings({ modelSku: "NX-1175S-G10" }));
    assert.ok(rec.fit);
    assert.equal(rec.fit.config.cores, 24);
  });

  it("passes over a ROBO model whose biggest CPU is smaller than the largest VM", () => {
    // 37 vCPU > 36 cores on the biggest 1175S CPU (and 16 on 1120AS); 3035 has 2 x 24.
    const rec = recommendNx(env([vm({ vcpu: 37, ramGiB: 16 })]), settings({ useCase: "robo" }));
    assert.ok(rec.fit);
    assert.equal(rec.fit.config.model.sku, "NX-3035-G10");
    const by = new Map(rec.attempts.map((a) => [a.sku, a]));
    assert.equal(by.get("NX-1175S-G10")?.fits, false);
    assert.match(by.get("NX-1175S-G10")?.reason ?? "", /37 vCPU exceeds 36 physical cores/);
    assert.deepEqual(rec.blockers, []);
  });

  it("blocks when no approved model can host the largest VM", () => {
    const rec = recommendNx(env([vm({ vcpu: 500, ramGiB: 16 })]), settings());
    assert.equal(rec.fit, null);
    assert.ok(rec.blockers.some((b) => /largest VM/.test(b)));
  });

  it("honours an explicit model and refuses an excluded one", () => {
    const picked = recommendNx(env([vm()]), settings({ modelSku: "NX-8170-G10" }));
    assert.equal(picked.fit?.config.model.sku, "NX-8170-G10");
    assert.deepEqual(picked.attempts.map((a) => a.sku), ["NX-8170-G10"]);
    const gpu = recommendNx(env([vm()]), settings({ modelSku: "NX-9183-G10" }));
    assert.equal(gpu.fit, null);
    assert.ok(gpu.blockers.some((b) => /not an approved/.test(b)));
  });

  it("never auto-selects the storage-only, GPU-required or GPU platforms or NX-1120AS", () => {
    for (const sku of ["NX-8155AS-G10", "NX-9183-G10", "NX-8150G-G10"]) {
      assert.equal(findNxModel(sku)?.excluded, true, sku);
      assert.ok(!approvedModels().some((m) => m.sku === sku), sku);
    }
    const rec = recommendNx(env([vm({ vcpu: 100, ramGiB: 16 })]), settings());
    assert.ok(!rec.attempts.some((a) => a.sku === "NX-1120AS-G10"));
    assert.ok(rec.attempts.every((a) => !["NX-8155AS-G10", "NX-9183-G10", "NX-8150G-G10"].includes(a.sku)));
  });

  it("allows 1024 GiB on NX-1175S", () => {
    assert.ok(m1175.ramTotalsGiB.includes(1024));
    assert.equal(Math.max(...m1175.ramTotalsGiB), 1024);
  });
});

describe("plausibility blockers", () => {
  it("block the recommendation", () => {
    const parsed = env([vm()], {
      plausibility: [{ field: "Storage per VM", observed: "1,200 TiB", expected: "<= 256 TiB", detail: "unit slip" }],
    });
    const rec = recommendNx(parsed, settings());
    assert.ok(rec.blockers.some((b) => b.startsWith("Storage per VM")));
  });

  it("block when there is nothing to size", () => {
    const rec = recommendNx(env([]), settings());
    assert.ok(rec.blockers.some((b) => /No running VMs/.test(b)));
  });
});

describe("source-cluster CVMs", () => {
  it("are excluded by default, listed, and can be re-included", () => {
    const cvm = vm({ name: "NTNX-20SM3F140083-A-CVM", vcpu: 12, ramGiB: 32 });
    const guest = vm({ vcpu: 4, ramGiB: 16 });
    const parsed = env([cvm, guest]);
    const w = buildWorkload(parsed, settings());
    assert.equal(w.runningVms, 1);
    assert.equal(w.ramGiB, 16);
    assert.deepEqual(w.sourceCvmsExcluded, ["NTNX-20SM3F140083-A-CVM"]);
    const back = buildWorkload(parsed, settings({ vmAdjustments: { [cvm.id]: { excluded: false } } }));
    assert.equal(back.runningVms, 2);
    assert.deepEqual(back.sourceCvmsExcluded, []);
  });
});

describe("target utilization", () => {
  const small = node({ cores: 16, ramGiB: 256 });

  it("defaults to 50%", () => {
    assert.equal(DEFAULT_NX_SETTINGS.targetUtilization, 0.5);
  });

  it("sizes so all nodes up land at the target", () => {
    // 45 cores / (10 x 0.5) = 9 nodes all up (8 working + 1 failover).
    const fit = fitConfig(small, demand({ cpu: 45 }), noLargeVm, settings({ targetUtilization: 0.5 }));
    assert.equal(fit.nodesForTarget.cpu, 9);
    assert.equal(fit.totalNodes, 9);
    close((45 / (10 * fit.totalNodes)) * 100, 50, "all-up CPU", 1);
  });

  it("recommended builds land at or under about 50% with every node up", () => {
    const rec = recommendNx(env(Array.from({ length: 30 }, () => vm({ vcpu: 8, ramGiB: 32 }))), settings({ targetUtilization: 0.5 }));
    assert.ok(rec.utilization);
    assert.ok(rec.utilization.cpu.allUp <= 50 + 1e-6);
    assert.ok(rec.utilization.ram.allUp <= 50 + 1e-6);
    assert.ok(rec.utilization.storage.allUp <= 50 + 1e-6);
    assert.ok(rec.utilization.cpu.failover <= 100 + 1e-6);
  });
});

describe("report storage requirement", () => {
  it("minimum raw per node carries the workload at the target and is within the installed raw", async () => {
    const { storageRequirement } = await import("@/lib/nx-report");
    const rec = recommendNx(
      env(Array.from({ length: 40 }, () => vm({ vcpu: 4, ramGiB: 16, storageConsumedTiB: 1, storageProvisionedTiB: 2 }))),
      settings({ targetUtilization: 0.5 }),
    );
    assert.ok(rec.fit);
    const sr = storageRequirement(rec);
    const st = rec.fit.capacity.storage;
    // Rebuild usable raw from minRaw with the node's own reserves.
    const prop = (st.bufferTiB + st.cvm.cassandraTiB + st.cvm.curatorTiB + st.cvm.ext4TiB) / st.rawTiB;
    const fixed = st.cvm.bootHomeTiB + st.cvm.oplogTiB + st.cvm.hadesTiB;
    const usable = sr.node.minRawTiB * (1 - prop) - fixed;
    close(usable * sr.nodes * 0.5, sr.workloadRawTiB, "min raw lands storage at 50%", 1e-6);
    assert.ok(sr.node.minRawTiB <= sr.node.rawTiB + 1e-9);
    close(sr.workloadRawTiB, sr.dataTiB * 2, "RF2 doubles the data");
  });
});

describe("SQL VMs", () => {
  it("size any VM with SQL in the name at vCPU / 2, ignoring measured use", () => {
    const sql = vm({ name: "prod-SQL01", vcpu: 12, cpuUsed: { average: 0.5, p95: 1, peak: 2 } });
    const web = vm({ name: "web01", vcpu: 12, cpuUsed: { average: 0.5, p95: 1, peak: 2 } });
    const w = buildWorkload(env([sql, web]), settings());
    // SQL: 12 / 2 = 6 cores; web: p95 = 1 core.
    close(w.cpuCores, 7, "SQL at 2:1 plus web at p95");
    assert.equal(w.cpuSqlVms, 1);
    assert.equal(w.cpuMeasuredVms, 1);
    assert.equal(w.cpuFallbackVms, 0);
  });

  it("is off at 0", () => {
    const w = buildWorkload(env([vm({ name: "sql", vcpu: 12, cpuUsed: { average: null, p95: 1, peak: null } })]), settings({ sqlVcpuPerPcore: 0 }));
    close(w.cpuCores, 1, "measured p95");
    assert.equal(w.cpuSqlVms, 0);
  });
});

describe("generic hardware", () => {
  const generic = (over: Partial<NxSizerSettings> = {}) => settings({ modelSku: "Generic", targetUtilization: 0.5, ...over });

  it("is the default", () => {
    assert.equal(DEFAULT_NX_SETTINGS.modelSku, "Generic");
  });

  it("uses the fewest, densest nodes: the RF2 minimum of 3 when one node can be big enough", () => {
    // 200 VMs x 8 vCPU / 4 = 400 cores; small single-socket NX-1175S nodes need many more.
    const vms = Array.from({ length: 200 }, () => vm({ vcpu: 8, ramGiB: 32, storageConsumedTiB: 0.2 }));
    const g = recommendNx(env(vms), generic());
    const nx = recommendNx(env(vms), generic({ modelSku: "NX-1175S-G10" }));
    assert.ok(g.fit && nx.fit);
    assert.ok(g.fit.totalNodes < nx.fit.totalNodes, `${g.fit.totalNodes} generic vs ${nx.fit.totalNodes} NX`);
    assert.equal(g.fit.config.model.socketsPerNode, 2);
    assert.ok(g.utilization!.cpu.allUp <= 50 + 1e-6 && g.utilization!.ram.allUp <= 50 + 1e-6 && g.utilization!.storage.allUp <= 50 + 1e-6);
    assert.ok(g.utilization!.cpu.failover <= 100 + 1e-6);
  });

  it("stays within 256 cores, 2 TiB RAM and 184.32 TB raw per node and adds nodes past that", () => {
    const vms = Array.from({ length: 2000 }, () => vm({ vcpu: 8, ramGiB: 32, storageConsumedTiB: 0.2 }));
    const g = recommendNx(env(vms), generic());
    assert.ok(g.fit);
    assert.ok(g.fit.config.cores <= 256 && g.fit.config.ramGiB <= 2048 && g.fit.config.rawTB <= 184.32 + 1e-9);
    assert.ok(g.fit.totalNodes > 3);
  });

  it("gives every node at least as many physical cores as the largest VM has vCPU", () => {
    const g = recommendNx(env([vm({ vcpu: 40, ramGiB: 64 })]), generic());
    assert.ok(g.fit);
    assert.ok(g.fit.config.cores >= 40);
  });
});
