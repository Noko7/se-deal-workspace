import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SIZER_SETTINGS,
  buildSizingPlan,
  emptyPowerSlice,
  sizeWorkload,
  type ParsedCluster,
  type ParsedEnvironment,
  type PowerSlice,
  type SizerSettings,
} from "@/lib/simple-sizer-core";
import { NODE_PROFILES, chooseNodeProfile, fitProfile, usableCoresPerNode } from "@/lib/node-profiles";
import { SIZING_RULES, splitNodesIntoClusters } from "@/lib/sizing-guidance";

function slice(over: Partial<PowerSlice>): PowerSlice {
  return { ...emptyPowerSlice(), ...over };
}

function cluster(name: string, on: Partial<PowerSlice>, off: Partial<PowerSlice> = {}, extra: Partial<ParsedCluster> = {}): ParsedCluster {
  const poweredOn = slice(on);
  const poweredOff = slice(off);
  const all = slice({
    vms: poweredOn.vms + poweredOff.vms,
    vcpu: poweredOn.vcpu + poweredOff.vcpu,
    ramGiB: poweredOn.ramGiB + poweredOff.ramGiB,
    diskProvisionedTiB: poweredOn.diskProvisionedTiB + poweredOff.diskProvisionedTiB,
    partitionConfiguredTiB: poweredOn.partitionConfiguredTiB + poweredOff.partitionConfiguredTiB,
    partitionConsumedTiB: poweredOn.partitionConsumedTiB + poweredOff.partitionConsumedTiB,
  });
  return {
    id: `id-${name}`,
    name,
    datacenter: null,
    moid: null,
    hosts: 4,
    hostRecords: [],
    topVms: [],
    hostCpuUtilPct: null,
    hostMemoryUtilPct: null,
    totalVms: all.vms,
    avgVcpuPerVm: all.vms ? all.vcpu / all.vms : 0,
    vcpuPcoreRatio: 3,
    hardwareModels: [],
    aggVcpu: all.vcpu,
    aggRamGiB: all.ramGiB,
    aggStorageProvisionedTiB: all.partitionConfiguredTiB,
    aggStorageConsumedTiB: all.partitionConsumedTiB,
    maxVmVcpu: 8,
    maxVmRamGiB: 64,
    totalCpuCores: 256,
    consumedCpuCores: null,
    totalMemoryGiB: 2048,
    consumedMemoryGiB: null,
    totalStorageTiB: all.partitionConfiguredTiB,
    consumedStorageTiB: all.partitionConsumedTiB,
    powerStateKnown: true,
    all,
    poweredOn,
    poweredOff,
    ...extra,
  };
}

function environment(clusters: ParsedCluster[]): ParsedEnvironment {
  const sum = (pick: (c: ParsedCluster) => PowerSlice): PowerSlice =>
    clusters.reduce(
      (acc, c) =>
        slice({
          vms: acc.vms + pick(c).vms,
          vcpu: acc.vcpu + pick(c).vcpu,
          ramGiB: acc.ramGiB + pick(c).ramGiB,
          diskProvisionedTiB: acc.diskProvisionedTiB + pick(c).diskProvisionedTiB,
          partitionConfiguredTiB: acc.partitionConfiguredTiB + pick(c).partitionConfiguredTiB,
          partitionConsumedTiB: acc.partitionConsumedTiB + pick(c).partitionConsumedTiB,
        }),
      emptyPowerSlice(),
    );
  const all = sum((c) => c.all);
  return {
    source: "collector_excel",
    sourceDetection: "manual",
    fileName: "test.xlsx",
    fileSizeBytes: 1024,
    analyzedAt: new Date().toISOString(),
    datacenters: 1,
    clusters: clusters.length,
    hosts: clusters.reduce((s, c) => s + c.hosts, 0),
    totalVms: all.vms,
    avgVcpuPerVm: all.vms ? all.vcpu / all.vms : 0,
    vcpuPcoreRatio: 3,
    totalCpuCores: clusters.reduce((s, c) => s + c.totalCpuCores, 0),
    consumedCpuCores: null,
    totalMemoryGiB: clusters.reduce((s, c) => s + c.totalMemoryGiB, 0),
    consumedMemoryGiB: null,
    totalStorageTiB: all.partitionConfiguredTiB,
    consumedStorageTiB: all.partitionConsumedTiB,
    aggVcpu: all.vcpu,
    aggRamGiB: all.ramGiB,
    aggStorageProvisionedTiB: all.partitionConfiguredTiB,
    aggStorageConsumedTiB: all.partitionConsumedTiB,
    maxVmVcpu: 8,
    maxVmRamGiB: 64,
    powerStateKnown: true,
    all,
    poweredOn: sum((c) => c.poweredOn),
    poweredOff: sum((c) => c.poweredOff),
    guestOs: [],
    topVms: [],
    snapshots: null,
    hostCpuUtilPct: null,
    hostMemoryUtilPct: null,
    sheetsFound: [],
    audit: [],
    plausibility: [],
    clusterDetails: clusters,
    notes: [],
  };
}

const settings = (over: Partial<SizerSettings> = {}): SizerSettings => ({ ...DEFAULT_SIZER_SETTINGS, ...over });

describe("node class auto-selection", () => {
  it("picks a small class for a ROBO-sized workload", () => {
    const profile = chooseNodeProfile(
      [{ pCores: 12, ramGiB: 180, rawStorageTiB: 3, maxVmPCores: 2, maxVmRamGiB: 16 }],
      { failoverHosts: 1, minNodes: 3 },
    );
    assert.ok(profile.cores <= 24, `expected a small class, got ${profile.label} (${profile.cores}c)`);
  });

  it("picks a dense class for a large estate instead of sprawling small nodes", () => {
    const profile = chooseNodeProfile(
      [{ pCores: 2800, ramGiB: 69000, rawStorageTiB: 2000, maxVmPCores: 8, maxVmRamGiB: 96 }],
      { failoverHosts: 1, minNodes: 5 },
    );
    assert.ok(profile.cores >= 48, `expected a dense class, got ${profile.label} (${profile.cores}c)`);
  });

  it("never picks a node class that cannot host the largest VM", () => {
    const profile = chooseNodeProfile(
      [{ pCores: 60, ramGiB: 900, rawStorageTiB: 20, maxVmPCores: 40, maxVmRamGiB: 700 }],
      { failoverHosts: 1, minNodes: 3 },
    );
    assert.ok(usableCoresPerNode(profile) >= 40, `${profile.label} cannot host a 40-pCore VM`);
    assert.ok(profile.maxRamGiB - SIZING_RULES.cvmRamGiBPerNode >= 700, `${profile.label} cannot host a 700 GiB VM`);
  });
});

describe("per-node right-sizing", () => {
  // The HA spare only helps if the survivors can actually hold the workload.
  it("populates enough RAM that the workload survives losing the failover host(s)", () => {
    for (const profile of NODE_PROFILES) {
      for (const failoverHosts of [1, 2]) {
        const demand = { pCores: 900, ramGiB: 14000, rawStorageTiB: 120, maxVmPCores: 8, maxVmRamGiB: 64 };
        const fit = fitProfile(profile, demand, { failoverHosts, minNodes: 3 });
        const survivors = fit.totalNodes - failoverHosts;
        const usableRam = (fit.ramPerNodeGiB - SIZING_RULES.cvmRamGiBPerNode) * survivors;
        assert.ok(
          usableRam >= demand.ramGiB,
          `${profile.label} N+${failoverHosts}: ${survivors} survivors hold ${usableRam} GiB, need ${demand.ramGiB}`,
        );
      }
    }
  });

  it("populates at least enough RAM for the largest single VM plus the CVM", () => {
    const demand = { pCores: 200, ramGiB: 1000, rawStorageTiB: 20, maxVmPCores: 16, maxVmRamGiB: 512 };
    const fit = fitProfile(NODE_PROFILES.find((p) => p.id === "memory")!, demand, { failoverHosts: 1, minNodes: 3 });
    assert.ok(fit.ramPerNodeGiB - SIZING_RULES.cvmRamGiBPerNode >= 512, `only ${fit.ramPerNodeGiB} GiB populated`);
  });

  it("takes a custom node spec literally rather than right-sizing it", () => {
    const build = sizeWorkload(
      { label: "t", vmCount: 100, vcpu: 400, ramGiB: 1000, storageTiB: 20, maxVmVcpu: 8, maxVmRamGiB: 64 },
      settings({ nodeProfileId: "custom", customCores: 56, customRamGiB: 1536, customStorageTiB: 60 }),
    );
    assert.equal(build.perNode.cores, 56);
    assert.equal(build.perNode.ramGiB, 1536);
  });
});

describe("cluster splitting", () => {
  it("keeps every cluster within the planning maximum and within one node of each other", () => {
    for (const total of [1, 3, 32, 33, 70, 100, 257]) {
      const sizes = splitNodesIntoClusters(total);
      assert.equal(sizes.reduce((s, n) => s + n, 0), total, `sizes must sum to ${total}`);
      assert.ok(Math.max(...sizes) <= SIZING_RULES.maxNodesPerCluster, `${total} nodes produced an oversized cluster`);
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `${total} nodes produced uneven clusters`);
    }
  });

  it("splits a consolidated build that exceeds one cluster and flags it", () => {
    const env = environment([
      cluster("BIG", { vms: 4000, vcpu: 16000, ramGiB: 80000, partitionConfiguredTiB: 900, partitionConsumedTiB: 600 }),
    ]);
    const plan = buildSizingPlan(env, settings());
    assert.ok(plan.totalNodes > SIZING_RULES.maxNodesPerCluster);
    assert.ok(plan.totalClusters > 1);
    assert.equal(plan.targets.reduce((s, t) => s + t.nodes, 0), plan.totalNodes);
    assert.ok(
      plan.warnings.some((w) => w.includes(`${SIZING_RULES.maxNodesPerCluster}-node`)),
      `expected a ${SIZING_RULES.maxNodesPerCluster}-node planning-maximum warning, got: ${JSON.stringify(plan.warnings)}`,
    );
  });
});

describe("multi-cluster planning", () => {
  const env = environment([
    cluster("PROD", { vms: 800, vcpu: 3200, ramGiB: 16000, partitionConfiguredTiB: 200, partitionConsumedTiB: 120 }),
    cluster("DR", { vms: 400, vcpu: 1200, ramGiB: 6000, partitionConfiguredTiB: 150, partitionConsumedTiB: 60 }),
    cluster("DEV", { vms: 200, vcpu: 600, ramGiB: 2000, partitionConfiguredTiB: 40, partitionConsumedTiB: 15 }),
  ]);

  it("standardises one node class across every cluster", () => {
    const plan = buildSizingPlan(env, settings({ planMode: "per-cluster" }));
    for (const build of plan.perCluster) {
      assert.equal(build.build.profile.id, plan.profile.id, `${build.source.name} got a different node class`);
    }
  });

  it("emits one target per source cluster in per-cluster mode", () => {
    const plan = buildSizingPlan(env, settings({ planMode: "per-cluster" }));
    // Each source cluster contributes at least one target; oversized ones split.
    for (const source of env.clusterDetails) {
      assert.ok(plan.targets.some((t) => t.origin.includes(source.name)), `${source.name} has no target cluster`);
    }
  });

  it("costs no fewer nodes per-cluster than consolidated, and says so", () => {
    const consolidated = buildSizingPlan(env, settings({ planMode: "consolidated" }));
    const split = buildSizingPlan(env, settings({ planMode: "per-cluster" }));
    assert.ok(
      split.totalNodes >= consolidated.totalNodes,
      `splitting produced fewer nodes (${split.totalNodes}) than consolidating (${consolidated.totalNodes})`,
    );
    if (split.totalNodes > consolidated.totalNodes) {
      assert.ok(split.warnings.some((w) => w.includes("more node")), "expected a node-cost warning");
    }
  });

  it("does not repeat an identical warning once per cluster", () => {
    const plan = buildSizingPlan(env, settings({ planMode: "per-cluster" }));
    assert.equal(new Set(plan.warnings).size, plan.warnings.length, "warnings contain duplicates");
    const blockWarnings = plan.warnings.filter((w) => w.includes("block (chassis) awareness"));
    assert.ok(blockWarnings.length <= 2, `block-awareness warning repeated ${blockWarnings.length} times`);
  });
});

describe("workload basis", () => {
  const env = environment([
    cluster(
      "PROD",
      { vms: 100, vcpu: 400, ramGiB: 4000, partitionConfiguredTiB: 40, partitionConsumedTiB: 20 },
      { vms: 100, vcpu: 400, ramGiB: 4000, partitionConfiguredTiB: 40, partitionConsumedTiB: 20 },
    ),
  ]);

  it("sizes CPU and memory on powered-on VMs by default", () => {
    const build = buildSizingPlan(env, settings()).consolidated;
    assert.equal(build.workload.vcpu, 400);
    assert.equal(build.workload.ramGiB, 4000);
  });

  it("counts every VM's storage even when sizing compute on powered-on VMs", () => {
    // Powered-off VMs still occupy capacity and still have to be migrated.
    const build = buildSizingPlan(env, settings()).consolidated;
    assert.equal(build.workload.storageTiB, 40);
  });

  it("switches to the full estate when asked", () => {
    const build = buildSizingPlan(env, settings({ workloadBasis: "all" })).consolidated;
    assert.equal(build.workload.vcpu, 800);
    assert.equal(build.workload.ramGiB, 8000);
  });

  it("falls back to all VMs when the export carries no power state", () => {
    const noPower = environment([
      cluster("PROD", { vms: 100, vcpu: 400, ramGiB: 4000, partitionConfiguredTiB: 40, partitionConsumedTiB: 20 }),
    ]);
    noPower.powerStateKnown = false;
    noPower.clusterDetails[0].powerStateKnown = false;
    const plan = buildSizingPlan(noPower, settings());
    assert.equal(plan.consolidated.workload.vcpu, noPower.all.vcpu);
    assert.ok(plan.warnings.some((w) => w.includes("power state")), "expected a missing-power-state note");
  });
});

describe("replication factor resolution", () => {
  const small = { label: "t", vmCount: 20, vcpu: 40, ramGiB: 200, storageTiB: 2, maxVmVcpu: 4, maxVmRamGiB: 16 };

  it("keeps RF2 for a small cluster on auto", () => {
    const build = sizeWorkload(small, settings());
    assert.equal(build.effectiveRf, 2);
    assert.ok(build.nodes >= 3, "RF2 needs at least 3 nodes");
  });

  it("steps up to RF3 at 5+ nodes on auto", () => {
    const build = sizeWorkload(
      { label: "t", vmCount: 500, vcpu: 2000, ramGiB: 12000, storageTiB: 100, maxVmVcpu: 8, maxVmRamGiB: 64 },
      settings(),
    );
    assert.equal(build.effectiveRf, 3);
    assert.ok(build.rfUpgraded);
    assert.ok(build.nodes >= 5, "RF3 needs at least 5 nodes");
  });

  it("honours an explicit RF2 request at scale", () => {
    const build = sizeWorkload(
      { label: "t", vmCount: 500, vcpu: 2000, ramGiB: 12000, storageTiB: 100, maxVmVcpu: 8, maxVmRamGiB: 64 },
      settings({ rf: 2 }),
    );
    assert.equal(build.effectiveRf, 2);
    assert.equal(build.rfUpgraded, false);
  });

  it("raises a forced RF3 build to the 5-node minimum", () => {
    const build = sizeWorkload(small, settings({ rf: 3 }));
    assert.equal(build.effectiveRf, 3);
    assert.ok(build.nodes >= 5, `RF3 floor not applied, got ${build.nodes} nodes`);
  });

  it("expands raw capacity with the replication factor", () => {
    const rf2 = sizeWorkload(small, settings({ rf: 2 })).totals.rawStorageTiB;
    const rf3 = sizeWorkload(small, settings({ rf: 3 })).totals.rawStorageTiB;
    assert.ok(rf3 > rf2, `RF3 (${rf3} TiB) should need more raw capacity than RF2 (${rf2} TiB)`);
  });
});

describe("build sanity", () => {
  it("always reserves the requested HA headroom", () => {
    for (const failoverHosts of [1, 2]) {
      const build = sizeWorkload(
        { label: "t", vmCount: 300, vcpu: 1200, ramGiB: 8000, storageTiB: 60, maxVmVcpu: 8, maxVmRamGiB: 64 },
        settings({ failoverHosts }),
      );
      assert.ok(build.nodes >= build.workingNodes + failoverHosts, "failover hosts were not added");
    }
  });

  it("flags a VM too large for the chosen node class", () => {
    const build = sizeWorkload(
      { label: "t", vmCount: 10, vcpu: 60, ramGiB: 300, storageTiB: 5, maxVmVcpu: 8, maxVmRamGiB: 4096 },
      settings({ nodeProfileId: "edge" }),
    );
    assert.ok(build.monsterVmRisk);
    assert.ok(build.monsterVmReason?.includes("RAM"));
  });

  it("returns whole nodes and whole physical cores", () => {
    const build = sizeWorkload(
      { label: "t", vmCount: 137, vcpu: 613, ramGiB: 3771.5, storageTiB: 41.3, maxVmVcpu: 12, maxVmRamGiB: 96 },
      settings(),
    );
    assert.ok(Number.isInteger(build.nodes), "node count must be a whole number");
    assert.ok(Number.isInteger(build.demand.pCores), "physical cores must be whole");
    assert.ok(Number.isInteger(build.totals.cores), "total cores must be whole");
  });
});
