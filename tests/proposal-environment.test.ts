import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  environmentClusters,
  environmentRollup,
  hostGroups,
  migrationComparison,
  osDistribution,
} from "@/lib/proposal-environment";
import { emptyPowerSlice, type ClusterHardwareModel, type ParsedCluster, type ParsedEnvironment, type PowerSlice } from "@/lib/simple-sizer-core";
import type { CurrentEnvironment } from "@/lib/proposal-doc";
import type { ProposalScenario } from "@/lib/sizer-import";

// A slide must never carry an em dash (product constraint), so tests assert its
// absence directly rather than trusting review to catch one.
const EM_DASH = "\u2014";

function slice(over: Partial<PowerSlice>): PowerSlice {
  return { ...emptyPowerSlice(), ...over };
}

// Group totals are derived from the per-host spec so a fixture can't quietly
// disagree with itself; override them explicitly only to test a mismatch.
function hw(over: Partial<ClusterHardwareModel> = {}): ClusterHardwareModel {
  const m = {
    model: "PowerEdge R740",
    vendor: "Dell" as string | null,
    cpuModel: "Intel Xeon Gold 6248" as string | null,
    hostCount: 4,
    socketsPerHost: 2,
    coresPerSocket: 20,
    coresPerHost: 40,
    ramPerHostGiB: 512,
    storagePerHostTiB: 10,
    ...over,
  };
  return {
    ...m,
    cpuCores: over.cpuCores ?? m.hostCount * m.coresPerHost,
    memoryGiB: over.memoryGiB ?? m.hostCount * m.ramPerHostGiB,
    storageTiB: over.storageTiB ?? m.hostCount * m.storagePerHostTiB,
  };
}

function pcluster(over: Partial<ParsedCluster> = {}): ParsedCluster {
  const s = emptyPowerSlice();
  return {
    id: "c1",
    name: "Cluster",
    datacenter: null,
    moid: null,
    hosts: 4,
    hostRecords: [],
    topVms: [],
    hostCpuUtilPct: null,
    hostMemoryUtilPct: null,
    totalVms: 0,
    avgVcpuPerVm: 0,
    vcpuPcoreRatio: 0,
    hardwareModels: [],
    aggVcpu: 0,
    aggRamGiB: 0,
    aggStorageProvisionedTiB: 0,
    aggStorageConsumedTiB: 0,
    maxVmVcpu: null,
    maxVmRamGiB: null,
    totalCpuCores: 0,
    consumedCpuCores: null,
    totalMemoryGiB: 0,
    consumedMemoryGiB: null,
    totalStorageTiB: 0,
    consumedStorageTiB: null,
    observed: null,
    powerStateKnown: true,
    all: s,
    poweredOn: s,
    poweredOff: s,
    ...over,
  };
}

function penv(over: Partial<ParsedEnvironment> = {}): ParsedEnvironment {
  const s = emptyPowerSlice();
  return {
    source: "collector_excel",
    sourceDetection: "manual",
    fileName: "test.xlsx",
    fileSizeBytes: null,
    analyzedAt: "2026-01-01T00:00:00.000Z",
    datacenters: 1,
    clusters: 0,
    hosts: 0,
    totalVms: 0,
    avgVcpuPerVm: 0,
    vcpuPcoreRatio: 0,
    totalCpuCores: 0,
    consumedCpuCores: null,
    totalMemoryGiB: 0,
    consumedMemoryGiB: null,
    totalStorageTiB: 0,
    consumedStorageTiB: null,
    aggVcpu: 0,
    aggRamGiB: 0,
    aggStorageProvisionedTiB: 0,
    aggStorageConsumedTiB: 0,
    maxVmVcpu: null,
    maxVmRamGiB: null,
    observed: null,
    powerStateKnown: true,
    all: s,
    poweredOn: s,
    poweredOff: s,
    guestOs: [],
    topVms: [],
    vms: [],
    snapshots: null,
    hostCpuUtilPct: null,
    hostMemoryUtilPct: null,
    sheetsFound: [],
    audit: [],
    plausibility: [],
    clusterDetails: [],
    notes: [],
    ...over,
  };
}

function currentEnv(parsed: ParsedEnvironment): CurrentEnvironment {
  return { parsed, sourceFile: parsed.fileName, source: parsed.source };
}

function scenario(totals: Partial<ProposalScenario["totals"]> = {}): ProposalScenario {
  return {
    source: "nutanix_sizer",
    meta: {
      customer: "Acme",
      environmentName: "Env",
      opportunityName: null,
      se: "SE",
      seEmail: null,
      installCountry: null,
      sizerVersion: null,
      permalink: null,
      createdDate: null,
    },
    totals: {
      clusters: 1,
      nodes: 10,
      cores: 480,
      ramGiB: 5120,
      ssdTiB: 50,
      hddTiB: 0,
      vmCount: 200,
      vCpus: null,
      ...totals,
    },
    clusters: [],
    externalStorage: null,
  };
}

describe("environmentRollup", () => {
  it("reads every headline figure straight from the parse", () => {
    const parsed = penv({
      datacenters: 2,
      clusters: 3,
      hosts: 12,
      totalVms: 300,
      poweredOn: slice({ vms: 250 }),
      poweredOff: slice({ vms: 50 }),
      totalCpuCores: 480,
      totalMemoryGiB: 6144,
      totalStorageTiB: 100,
      aggVcpu: 1200,
      vcpuPcoreRatio: 2.5,
      hostCpuUtilPct: 35,
      hostMemoryUtilPct: 60,
      snapshots: 42,
    });
    const r = environmentRollup(currentEnv(parsed));
    assert.equal(r.datacenters, 2);
    assert.equal(r.clusters, 3);
    assert.equal(r.hosts, 12);
    assert.equal(r.vms, 300);
    assert.equal(r.poweredOnVms, 250);
    assert.equal(r.poweredOffVms, 50);
    assert.equal(r.cpuCores, 480);
    assert.equal(r.memoryGiB, 6144);
    assert.equal(r.storageTiB, 100);
    assert.equal(r.vcpuAllocated, 1200);
    assert.equal(r.vcpuPerCoreRatio, 2.5);
    assert.equal(r.cpuUtilPct, 35);
    assert.equal(r.memoryUtilPct, 60);
    assert.equal(r.snapshots, 42);
  });

  it("propagates null when a figure was unknown in the export, never a zero", () => {
    const r = environmentRollup(
      currentEnv(penv({ datacenters: null, hostCpuUtilPct: null, hostMemoryUtilPct: null, snapshots: null })),
    );
    assert.equal(r.datacenters, null);
    assert.equal(r.cpuUtilPct, null);
    assert.equal(r.memoryUtilPct, null);
    assert.equal(r.snapshots, null);
  });
});

describe("hostGroups", () => {
  it("merges identical hardware across clusters and orders by host count", () => {
    const r740a = hw({ hostCount: 4 });
    const r750 = hw({
      model: "PowerEdge R750",
      cpuModel: "Intel Xeon Gold 6338",
      hostCount: 2,
      coresPerHost: 64,
      coresPerSocket: 32,
    });
    const r740b = hw({ hostCount: 6 });
    const groups = hostGroups(
      currentEnv(
        penv({
          clusterDetails: [
            pcluster({ id: "c1", hardwareModels: [r740a, r750] }),
            pcluster({ id: "c2", hardwareModels: [r740b] }),
          ],
        }),
      ),
    );

    assert.equal(groups.length, 2);
    // R740 across both clusters (4 + 6) leads a smaller R750 group.
    assert.equal(groups[0].vendorModel, "Dell PowerEdge R740");
    assert.equal(groups[0].cpuModel, "Intel Xeon Gold 6248");
    assert.equal(groups[0].hosts, 10);
    assert.equal(groups[0].totalCores, 400);
    assert.equal(groups[0].totalMemoryGiB, 5120);
    assert.equal(groups[1].vendorModel, "Dell PowerEdge R750");
    assert.equal(groups[1].hosts, 2);
  });

  it("does not merge the same model when the per-host spec differs", () => {
    const groups = hostGroups(
      currentEnv(
        penv({
          clusterDetails: [
            pcluster({
              hardwareModels: [
                hw({ hostCount: 3, ramPerHostGiB: 512 }),
                hw({ hostCount: 2, ramPerHostGiB: 1024 }),
              ],
            }),
          ],
        }),
      ),
    );
    assert.equal(groups.length, 2, "different DIMM ladders are distinct groups");
  });

  it("labels a whitebox with no vendor by model, and an unknown CPU as Unknown", () => {
    const groups = hostGroups(
      currentEnv(penv({ clusterDetails: [pcluster({ hardwareModels: [hw({ vendor: null, model: "Whitebox", cpuModel: null })] })] })),
    );
    assert.equal(groups[0].vendorModel, "Whitebox");
    assert.equal(groups[0].cpuModel, "Unknown");
  });
});

describe("osDistribution", () => {
  const parsed = penv({
    guestOs: [
      { name: "Windows Server 2019", count: 100 },
      { name: "RHEL 8", count: 60 },
      { name: "Ubuntu 22.04", count: 30 },
      { name: "Windows Server 2016", count: 10 },
    ],
  });

  it("rolls the tail past topN into Other and keeps shares summing to 100", () => {
    const dist = osDistribution(currentEnv(parsed), 2);
    assert.equal(dist.length, 3);
    assert.equal(dist[dist.length - 1].name, "Other");
    assert.equal(dist[dist.length - 1].count, 40);
    assert.equal(dist[dist.length - 1].pct, 20);
    const sum = dist.reduce((s, o) => s + o.pct, 0);
    assert.ok(Math.abs(sum - 100) < 0.5, `shares should sum to ~100, got ${sum}`);
    for (const o of dist) assert.ok(o.pct >= 0 && o.pct <= 100);
  });

  it("adds no Other tail when topN covers every OS", () => {
    const dist = osDistribution(currentEnv(parsed), 10);
    assert.equal(dist.length, 4);
    assert.ok(!dist.some((o) => o.name === "Other"));
  });

  it("returns nothing when the export listed no guest OS", () => {
    assert.deepEqual(osDistribution(currentEnv(penv())), []);
  });
});

describe("migrationComparison", () => {
  const parsed = penv({
    hosts: 24,
    clusters: 4,
    totalVms: 400,
    totalCpuCores: 960,
    totalMemoryGiB: 12288,
    totalStorageTiB: 200,
  });

  it("computes the consolidation ratio from hosts to nodes", () => {
    const rows = migrationComparison(currentEnv(parsed), scenario({ nodes: 10, vmCount: 400 }));
    const cons = rows.find((r) => r.metric === "Consolidation");
    assert.equal(cons?.delta, "2.4x consolidation");
  });

  it("states a larger proposed side honestly rather than spinning it", () => {
    const rows = migrationComparison(currentEnv(penv({ hosts: 4, totalCpuCores: 100 })), scenario({ nodes: 10, cores: 480 }));
    assert.equal(rows.find((r) => r.metric === "Servers")?.delta, "6 more servers");
    assert.equal(rows.find((r) => r.metric === "CPU cores")?.delta, "380 more cores");
    // Fewer hosts than nodes is an expansion, not a consolidation.
    assert.equal(rows.find((r) => r.metric === "Consolidation")?.delta, "2.5x more servers");
  });

  it("drops the VM row when the Sizer export carried no VM count", () => {
    const rows = migrationComparison(currentEnv(parsed), scenario({ vmCount: null }));
    assert.ok(!rows.some((r) => r.metric === "Virtual machines"));
  });

  it("omits the consolidation row when either side has no servers", () => {
    const rows = migrationComparison(currentEnv(penv({ hosts: 0 })), scenario({ nodes: 10 }));
    assert.ok(!rows.some((r) => r.metric === "Consolidation"));
  });
});

describe("environmentClusters", () => {
  it("summarises a single-model cluster with its vendor", () => {
    const lines = environmentClusters(
      currentEnv(
        penv({
          clusterDetails: [
            pcluster({
              name: "Prod",
              datacenter: "DC1",
              hosts: 8,
              totalVms: 200,
              totalCpuCores: 320,
              totalMemoryGiB: 4096,
              hostCpuUtilPct: 45,
              hostMemoryUtilPct: 70,
              hardwareModels: [hw({ hostCount: 8 })],
            }),
          ],
        }),
      ),
    );
    assert.equal(lines[0].hardware, "8x Dell PowerEdge R740");
    assert.equal(lines[0].datacenter, "DC1");
    assert.equal(lines[0].cpuUtilPct, 45);
    assert.equal(lines[0].memoryUtilPct, 70);
  });

  it("summarises a mixed cluster compactly and propagates unknown utilization", () => {
    const lines = environmentClusters(
      currentEnv(
        penv({
          clusterDetails: [
            pcluster({
              hardwareModels: [
                hw({ model: "R740", hostCount: 4 }),
                hw({ model: "R750", hostCount: 2, coresPerHost: 64, coresPerSocket: 32 }),
              ],
            }),
          ],
        }),
      ),
    );
    assert.equal(lines[0].hardware, "4x R740 + 2x R750");
    assert.equal(lines[0].cpuUtilPct, null);
    assert.equal(lines[0].memoryUtilPct, null);
  });

  it("says Unknown when the export listed no per-model hardware", () => {
    const lines = environmentClusters(currentEnv(penv({ clusterDetails: [pcluster({})] })));
    assert.equal(lines[0].hardware, "Unknown");
  });
});

describe("no em dash reaches a slide", () => {
  it("emits no U+2014 in any output string", () => {
    const parsed = penv({
      datacenters: 2,
      clusters: 4,
      hosts: 24,
      totalVms: 400,
      totalCpuCores: 960,
      totalMemoryGiB: 12288,
      totalStorageTiB: 200,
      guestOs: [
        { name: "Windows Server 2019", count: 100 },
        { name: "RHEL 8", count: 60 },
        { name: "Ubuntu 22.04", count: 30 },
        { name: "Photon OS", count: 10 },
      ],
      clusterDetails: [
        pcluster({ name: "Prod", datacenter: "DC1", hardwareModels: [hw({ hostCount: 8 })] }),
        pcluster({ name: "Edge", hardwareModels: [hw({ model: "R740", hostCount: 4 }), hw({ model: "R750", hostCount: 2, coresPerHost: 64, coresPerSocket: 32 })] }),
      ],
    });
    const env = currentEnv(parsed);
    const strings: string[] = [
      ...hostGroups(env).flatMap((g) => [g.vendorModel, g.cpuModel]),
      ...osDistribution(env).map((o) => o.name),
      ...migrationComparison(env, scenario()).flatMap((r) => [r.metric, r.current, r.proposed, r.delta ?? ""]),
      ...environmentClusters(env).flatMap((c) => [c.name, c.datacenter ?? "", c.hardware]),
    ];
    for (const s of strings) assert.ok(!s.includes(EM_DASH), `em dash found in: ${s}`);
  });
});
