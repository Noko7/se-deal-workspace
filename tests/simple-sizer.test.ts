import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SIZER_SETTINGS,
  buildSizingPlan,
  emptyPowerSlice,
  environmentWorkload,
  fitOptionsFor,
  sizeWorkload,
  type ParsedCluster,
  type ParsedEnvironment,
  type PowerSlice,
  type SizerSettings,
  type VmRecord,
  type Workload,
} from "@/lib/simple-sizer-core";
import { NODE_PROFILES, chooseNodeProfile, fitProfile, usableCoresPerNode } from "@/lib/node-profiles";
import { SIZING_RULES, splitNodesIntoClusters } from "@/lib/sizing-guidance";

function slice(over: Partial<PowerSlice>): PowerSlice {
  return { ...emptyPowerSlice(), ...over };
}

/**
 * A workload is now the sum of VM records, so fixtures build guests rather than
 * totals. Spreading a slice evenly across identical VMs reproduces the totals
 * exactly while giving the sizer the per-VM list it works from.
 */
function vmsFromSlice(
  clusterId: string,
  clusterName: string,
  s: PowerSlice,
  poweredOn: boolean,
  usedPerVm?: Partial<VmRecord["cpuUsed"]>,
): VmRecord[] {
  const count = s.vms;
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => ({
    id: `${clusterId}-vm-${poweredOn ? "on" : "off"}-${i}`,
    name: `${clusterName}-vm-${i}`,
    clusterId,
    clusterName,
    poweredOn,
    os: "Linux (other)",
    vcpu: s.vcpu / count,
    ramGiB: s.ramGiB / count,
    storageProvisionedTiB: s.partitionConfiguredTiB / count,
    storageConsumedTiB: s.partitionConsumedTiB / count,
    cpuUsed: {
      average: usedPerVm?.average ?? null,
      p95: usedPerVm?.p95 ?? null,
      peak: usedPerVm?.peak ?? null,
    },
    ramUsedGiB: null,
  }));
}

// A Workload built straight from VM records, for the tests that size one
// directly rather than going through a parsed environment.
function workload(over: Partial<Workload> & { vcpu: number; ramGiB: number; storageTiB: number }): Workload {
  return {
    label: "t",
    vmCount: 100,
    excludedVms: 0,
    maxVmVcpu: 8,
    maxVmRamGiB: 64,
    cpu: {
      chosen: over.cpu?.chosen ?? over.vcpu / DEFAULT_SIZER_SETTINGS.vcpuToPcoreRatio,
      statistic: over.cpu?.statistic ?? "allocated",
      available: over.cpu?.available ?? {
        p95: null,
        average: null,
        peak: null,
        allocated: over.vcpu / DEFAULT_SIZER_SETTINGS.vcpuToPcoreRatio,
      },
      vmsWithoutTelemetry: over.cpu?.vmsWithoutTelemetry ?? 0,
      fellBackTo: over.cpu?.fellBackTo ?? null,
    },
    ...over,
  };
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
    observed: null,
    powerStateKnown: true,
    all,
    poweredOn,
    poweredOff,
    ...extra,
  };
}

function environment(
  clusters: ParsedCluster[],
  vmUsage: Map<string, Partial<VmRecord["cpuUsed"]>> = new Map(),
): ParsedEnvironment {
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
  const vms = clusters.flatMap((c) => [
    ...vmsFromSlice(c.id, c.name, c.poweredOn, true, vmUsage.get(c.id)),
    ...vmsFromSlice(c.id, c.name, c.poweredOff, false, vmUsage.get(c.id)),
  ]);
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
    observed: clusters.find((c) => c.observed)?.observed ?? null,
    powerStateKnown: true,
    all,
    poweredOn: sum((c) => c.poweredOn),
    poweredOff: sum((c) => c.poweredOff),
    guestOs: [],
    topVms: [],
    vms,
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
      fitOptionsFor(settings(), 2),
    );
    assert.ok(profile.cores <= 24, `expected a small class, got ${profile.label} (${profile.cores}c)`);
  });

  it("picks a dense class for a large estate instead of sprawling small nodes", () => {
    const profile = chooseNodeProfile(
      [{ pCores: 2800, ramGiB: 69000, rawStorageTiB: 2000, maxVmPCores: 8, maxVmRamGiB: 96 }],
      fitOptionsFor(settings(), 3),
    );
    assert.ok(profile.cores >= 48, `expected a dense class, got ${profile.label} (${profile.cores}c)`);
  });

  it("never picks a node class that cannot host the largest VM", () => {
    const profile = chooseNodeProfile(
      [{ pCores: 60, ramGiB: 900, rawStorageTiB: 20, maxVmPCores: 40, maxVmRamGiB: 700 }],
      fitOptionsFor(settings(), 2),
    );
    assert.ok(usableCoresPerNode(profile) >= 40, `${profile.label} cannot host a 40-pCore VM`);
    assert.ok(profile.maxRamGiB - SIZING_RULES.cvmRamGiBPerNode >= 700, `${profile.label} cannot host a 700 GiB VM`);
  });
});

describe("the workload is the VMs", () => {
  // 180 guests allocated 620 vCPU between them, each drawing a tenth of a core.
  // Allocation says 155 pCores; the guests themselves say 18.
  const quietEstate = (usage: Partial<VmRecord["cpuUsed"]> = { average: 0.1 }) =>
    environment(
      [cluster("QUIET", { vms: 180, vcpu: 620, ramGiB: 1200, partitionConfiguredTiB: 60, partitionConsumedTiB: 30 })],
      new Map([["id-QUIET", usage]]),
    );

  it("sizes CPU from what the guests draw, not from what they were allocated", () => {
    const env = quietEstate();
    const measured = environmentWorkload(env, settings({ cpuStatistic: "average" }));
    const allocated = environmentWorkload(env, settings({ cpuStatistic: "allocated" }));
    assert.equal(measured.cpu.statistic, "average");
    assert.ok(
      measured.cpu.chosen < allocated.cpu.chosen,
      `measured (${measured.cpu.chosen}) should undercut allocated (${allocated.cpu.chosen})`,
    );
    const measuredPlan = buildSizingPlan(env, settings({ cpuStatistic: "average" }));
    const allocatedPlan = buildSizingPlan(env, settings({ cpuStatistic: "allocated" }));
    assert.ok(
      measuredPlan.totalNodes <= allocatedPlan.totalNodes,
      `${measuredPlan.totalNodes} nodes should not exceed ${allocatedPlan.totalNodes}`,
    );
  });

  it("ignores host utilization entirely", () => {
    // Same VMs, wildly different host telemetry. The build must not move.
    const base = quietEstate();
    const withHostLoad = quietEstate();
    withHostLoad.observed = { cpuPCores: 900, ramGiB: 4000, basis: "peak", coverage: 1, source: "test" };
    withHostLoad.clusterDetails[0].observed = withHostLoad.observed;
    withHostLoad.clusterDetails[0].consumedCpuCores = 900;
    assert.equal(
      buildSizingPlan(base, settings()).totalNodes,
      buildSizingPlan(withHostLoad, settings()).totalNodes,
      "host utilization must not reach the build",
    );
  });

  it("never sizes memory from measured usage, however idle the guests are", () => {
    const env = quietEstate();
    for (const vm of env.vms) vm.ramUsedGiB = 0.05;
    const build = buildSizingPlan(env, settings()).consolidated;
    assert.ok(
      build.demand.ramGiB > 1200,
      `memory demand ${build.demand.ramGiB} must be at least the provisioned total plus overhead`,
    );
  });

  it("falls back to allocated vCPU per VM when a guest has no telemetry", () => {
    const env = quietEstate({});
    const cpu = environmentWorkload(env, settings()).cpu;
    assert.equal(cpu.statistic, "allocated");
    assert.equal(cpu.vmsWithoutTelemetry, 180);
  });

  it("prefers a 95th percentile over an average, and reports the peak it did not use", () => {
    const env = quietEstate({ average: 0.1, p95: 0.3, peak: 2 });
    const cpu = environmentWorkload(env, settings()).cpu;
    assert.equal(cpu.statistic, "p95");
    assert.ok(Math.abs(cpu.chosen - 180 * 0.3) < 1, `expected ~54 cores, got ${cpu.chosen}`);
    assert.ok(Math.abs((cpu.available.peak ?? 0) - 180 * 2) < 1, "peak must still be reported");
  });
});

describe("excluding and editing VMs", () => {
  const estate = () =>
    environment(
      [cluster("EDIT", { vms: 10, vcpu: 100, ramGiB: 500, partitionConfiguredTiB: 20, partitionConsumedTiB: 10 })],
      new Map([["id-EDIT", { average: 1 }]]),
    );

  it("drops an excluded VM from every dimension", () => {
    const env = estate();
    const before = environmentWorkload(env, settings());
    const after = environmentWorkload(env, settings({ vmAdjustments: { [env.vms[0].id]: { excluded: true } } }));
    assert.equal(after.vmCount, before.vmCount - 1);
    assert.equal(after.excludedVms, 1);
    assert.ok(after.vcpu < before.vcpu, "vCPU must drop");
    assert.ok(after.ramGiB < before.ramGiB, "memory must drop");
    assert.ok(after.storageTiB < before.storageTiB, "storage must drop");
    assert.ok(after.cpu.chosen < before.cpu.chosen, "measured CPU must drop");
  });

  it("honours an edited vCPU, memory and storage figure", () => {
    const env = estate();
    const id = env.vms[0].id;
    const edited = environmentWorkload(env, settings({ vmAdjustments: { [id]: { vcpu: 64, ramGiB: 512, storageTiB: 8 } } }));
    const base = environmentWorkload(env, settings());
    assert.equal(edited.vcpu, base.vcpu - env.vms[0].vcpu + 64);
    assert.ok(Math.abs(edited.ramGiB - (base.ramGiB - env.vms[0].ramGiB + 512)) < 0.01);
    assert.ok(Math.abs(edited.storageTiB - (base.storageTiB - env.vms[0].storageConsumedTiB + 8)) < 0.01);
    assert.equal(edited.maxVmVcpu, 64, "an edited VM becomes the largest");
  });

  it("scales a VM's measured usage with an edited vCPU count", () => {
    const env = estate();
    const id = env.vms[0].id;
    const original = env.vms[0].vcpu;
    const doubled = environmentWorkload(env, settings({ cpuStatistic: "average", vmAdjustments: { [id]: { vcpu: original * 2 } } }));
    const base = environmentWorkload(env, settings({ cpuStatistic: "average" }));
    assert.ok(doubled.cpu.chosen > base.cpu.chosen, "doubling a VM's vCPU should raise its measured draw");
  });

  it("shrinks the build when enough VMs are excluded", () => {
    const env = environment(
      [cluster("BIG", { vms: 400, vcpu: 3200, ramGiB: 24000, partitionConfiguredTiB: 400, partitionConsumedTiB: 240 })],
      new Map([["id-BIG", { average: 1.5 }]]),
    );
    const full = buildSizingPlan(env, settings());
    const half: SizerSettings = settings({
      vmAdjustments: Object.fromEntries(env.vms.slice(0, 200).map((vm) => [vm.id, { excluded: true }])),
    });
    const trimmed = buildSizingPlan(env, half);
    assert.ok(trimmed.totalNodes < full.totalNodes, `${trimmed.totalNodes} should be fewer than ${full.totalNodes}`);
    assert.ok(trimmed.warnings.some((w) => w.includes("excluded")), "the build must say VMs were excluded");
  });
});

describe("target utilization", () => {
  const estate = () =>
    environment(
      [cluster("T", { vms: 200, vcpu: 1600, ramGiB: 8000, partitionConfiguredTiB: 200, partitionConsumedTiB: 120 })],
      new Map([["id-T", { average: 1 }]]),
    );

  it("lands the finished cluster near the requested utilization on every dimension", () => {
    for (const targetUtilizationPct of [40, 50, 70]) {
      const plan = buildSizingPlan(estate(), settings({ targetUtilizationPct }));
      const { cpuPct, ramPct } = plan.consolidated.headroom;
      // Whole nodes mean the landing point overshoots downward, never upward.
      assert.ok(cpuPct <= targetUtilizationPct + 1, `CPU landed at ${cpuPct}% for a ${targetUtilizationPct}% target`);
      assert.ok(ramPct <= targetUtilizationPct + 1, `RAM landed at ${ramPct}% for a ${targetUtilizationPct}% target`);
    }
  });

  it("counts the CVM against the target rather than hiding it", () => {
    const plan = buildSizingPlan(estate(), settings({ targetUtilizationPct: 50 }));
    const build = plan.consolidated;
    const cvmShare = (build.overhead.cvmTotalCores / (build.profile.cores * build.nodes)) * 100;
    assert.ok(cvmShare > 0, "the build must carry a CVM");
    assert.ok(
      build.headroom.cpuPct >= cvmShare,
      `reported CPU use ${build.headroom.cpuPct}% must include the ${cvmShare.toFixed(1)}% the CVMs take`,
    );
  });

  it("buys more nodes for a lower target", () => {
    const relaxed = buildSizingPlan(estate(), settings({ targetUtilizationPct: 40 }));
    const packed = buildSizingPlan(estate(), settings({ targetUtilizationPct: 80 }));
    assert.ok(relaxed.totalNodes > packed.totalNodes, `${relaxed.totalNodes} should exceed ${packed.totalNodes}`);
  });
});

describe("cluster topology", () => {
  const estate = () =>
    environment(
      [cluster("EDGE", { vms: 300, vcpu: 2400, ramGiB: 12000, partitionConfiguredTiB: 300, partitionConsumedTiB: 150 })],
      new Map([["id-EDGE", { average: 1 }]]),
    );

  it("builds many small clusters when the size is pinned", () => {
    for (const nodesPerCluster of [2, 3, 4, 8]) {
      const plan = buildSizingPlan(estate(), settings({ nodesPerCluster }));
      assert.ok(plan.targets.length >= 1);
      for (const target of plan.targets) {
        assert.equal(target.nodes, nodesPerCluster, `expected ${nodesPerCluster}-node clusters, got ${target.nodes}`);
      }
      assert.equal(plan.totalNodes, plan.targets.length * nodesPerCluster);
    }
  });

  it("costs more nodes in small clusters than in large ones, because each carries its own CVMs", () => {
    const small = buildSizingPlan(estate(), settings({ nodesPerCluster: 2 }));
    const large = buildSizingPlan(estate(), settings({ nodesPerCluster: 12 }));
    assert.ok(
      small.totalNodes >= large.totalNodes,
      `two-node clusters (${small.totalNodes}) should not need fewer nodes than twelve-node ones (${large.totalNodes})`,
    );
  });

  it("raises the Witness requirement for a two-node cluster instead of rounding it away", () => {
    const plan = buildSizingPlan(estate(), settings({ nodesPerCluster: 2 }));
    assert.ok(plan.warnings.some((w) => w.includes("Witness")), `expected a Witness warning, got ${plan.warnings.join(" | ")}`);
  });

  it("never emits a cluster above the Nutanix maximum", () => {
    for (const nodesPerCluster of ["auto" as const, 24, 30]) {
      const plan = buildSizingPlan(estate(), settings({ nodesPerCluster }));
      for (const target of plan.targets) {
        assert.ok(
          target.nodes <= SIZING_RULES.maxNodesPerCluster,
          `${target.nodes}-node cluster exceeds the ${SIZING_RULES.maxNodesPerCluster}-node maximum`,
        );
      }
    }
  });
});

describe("per-node right-sizing", () => {
  // The HA spare only helps if the survivors can actually hold the workload.
  it("populates enough RAM that the workload survives losing the failover host(s)", () => {
    for (const profile of NODE_PROFILES) {
      for (const failoverHosts of [1, 2]) {
        const demand = { pCores: 900, ramGiB: 14000, rawStorageTiB: 120, maxVmPCores: 8, maxVmRamGiB: 64 };
        const fit = fitProfile(profile, demand, fitOptionsFor(settings({ failoverHosts }), 2));
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
    const fit = fitProfile(NODE_PROFILES.find((p) => p.id === "memory")!, demand, fitOptionsFor(settings(), 2));
    assert.ok(fit.ramPerNodeGiB - SIZING_RULES.cvmRamGiBPerNode >= 512, `only ${fit.ramPerNodeGiB} GiB populated`);
  });

  it("takes a custom node spec literally rather than right-sizing it", () => {
    const build = sizeWorkload(
      workload({ vmCount: 100, vcpu: 400, ramGiB: 1000, storageTiB: 20 }),
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
  const small = workload({ vmCount: 20, vcpu: 40, ramGiB: 200, storageTiB: 2, maxVmVcpu: 4, maxVmRamGiB: 16 });

  it("keeps RF2 for a small cluster on auto", () => {
    const build = sizeWorkload(small, settings());
    assert.equal(build.effectiveRf, 2);
    assert.ok(build.nodes >= 3, "RF2 needs at least 3 nodes");
  });

  it("keeps RF2 through the mid-sizes rather than stepping up the moment RF3 becomes legal", () => {
    const build = sizeWorkload(
      workload({ vmCount: 500, vcpu: 2000, ramGiB: 12000, storageTiB: 100 }),
      settings(),
    );
    assert.ok(build.nodes >= 5, "this workload should need more than the RF3 minimum");
    assert.ok(
      build.nodes < SIZING_RULES.autoRf3AtNodes,
      `test workload must sit below the auto-RF3 threshold, got ${build.nodes} nodes`,
    );
    assert.equal(build.effectiveRf, 2);
    assert.equal(build.rfUpgraded, false);
  });

  it("steps up to RF3 once the cluster is large enough for a rebuild to be risky", () => {
    const build = sizeWorkload(
      workload({ vmCount: 6000, vcpu: 32000, ramGiB: 160000, storageTiB: 1400, maxVmVcpu: 16, maxVmRamGiB: 256 }),
      settings(),
    );
    assert.ok(build.nodes >= SIZING_RULES.autoRf3AtNodes, `expected a large build, got ${build.nodes} nodes`);
    assert.equal(build.effectiveRf, 3);
    assert.ok(build.rfUpgraded);
  });

  it("honours an explicit RF2 request at scale", () => {
    const build = sizeWorkload(
      workload({ vmCount: 500, vcpu: 2000, ramGiB: 12000, storageTiB: 100 }),
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
  // A cluster built to a utilization target already has the spare capacity N+1
  // reserves, so the build does not bolt an extra node on top. What matters is
  // the property the reservation exists for: the survivors must still hold the
  // whole workload after the failures.
  it("survives the requested number of host failures without adding a spare node", () => {
    for (const failoverHosts of [1, 2]) {
      const build = sizeWorkload(
        workload({ vmCount: 300, vcpu: 1200, ramGiB: 8000, storageTiB: 60 }),
        settings({ failoverHosts }),
      );
      const survivors = build.nodes - failoverHosts;
      assert.ok(survivors >= 1, `N+${failoverHosts} left no working node`);
      const usableCores = usableCoresPerNode(build.profile) * survivors;
      const usableRam = (build.perNode.ramGiB - build.overhead.cvm.ramGiB) * survivors;
      assert.ok(
        usableCores >= build.demand.pCores,
        `N+${failoverHosts}: ${survivors} survivors hold ${usableCores} cores, need ${build.demand.pCores}`,
      );
      assert.ok(
        usableRam >= build.demand.ramGiB,
        `N+${failoverHosts}: ${survivors} survivors hold ${usableRam} GiB, need ${build.demand.ramGiB}`,
      );
    }
  });

  it("flags a VM too large for the chosen node class", () => {
    const build = sizeWorkload(
      workload({ vmCount: 10, vcpu: 60, ramGiB: 300, storageTiB: 5, maxVmVcpu: 8, maxVmRamGiB: 4096 }),
      settings({ nodeProfileId: "edge" }),
    );
    assert.ok(build.monsterVmRisk);
    assert.ok(build.monsterVmReason?.includes("RAM"));
  });

  it("returns whole nodes and whole physical cores", () => {
    const build = sizeWorkload(
      workload({ vmCount: 137, vcpu: 613, ramGiB: 3771.5, storageTiB: 41.3, maxVmVcpu: 12, maxVmRamGiB: 96 }),
      settings(),
    );
    assert.ok(Number.isInteger(build.nodes), "node count must be a whole number");
    assert.ok(Number.isInteger(build.demand.pCores), "physical cores must be whole");
    assert.ok(Number.isInteger(build.totals.cores), "total cores must be whole");
  });
});
