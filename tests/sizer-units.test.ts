// Regression cover for the unit/column resolution that once turned a 20 TiB
// estate into 25,000,000 TiB and a 341,000-node recommendation.
//
// Every case below describes THE SAME environment in a different export dialect.
// If any of them drifts from the truth, an SE gets a wrong quote.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { parseSizerWorkbook } from "@/lib/simple-sizer";
import { DEFAULT_SIZER_SETTINGS, buildSizingPlan, type SizerSource } from "@/lib/simple-sizer-core";
import { checkPlausibility, resolveCapacity, unitFromHeader, PLAUSIBLE } from "@/lib/sizer-units";

const HOSTS = 8;
const VMS = 200;
const VCPU_PER_VM = 4;
const RAM_GIB_PER_VM = 16;
const DISK_GIB_PER_VM = 100;

const TRUTH = {
  vms: VMS,
  vcpu: VMS * VCPU_PER_VM, // 800
  ramGiB: VMS * RAM_GIB_PER_VM, // 3200
  provisionedTiB: (VMS * DISK_GIB_PER_VM) / 1024, // 19.53
  coresPerHost: 24,
};

function workbook(sheets: Record<string, Record<string, unknown>[]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function parse(source: SizerSource, sheets: Record<string, Record<string, unknown>[]>) {
  return parseSizerWorkbook(workbook(sheets), source, "test.xlsx", 1024);
}

// Within 5% of truth — enough slack for rounding, nowhere near a unit slip.
function assertClose(actual: number, expected: number, what: string) {
  const ratio = expected === 0 ? (actual === 0 ? 1 : Infinity) : actual / expected;
  assert.ok(
    ratio > 0.95 && ratio < 1.05,
    `${what}: got ${actual.toLocaleString()}, expected ~${expected.toLocaleString()} (off by ${ratio.toFixed(2)}x)`,
  );
}

// --- fixtures ---------------------------------------------------------------

const rvHosts = Array.from({ length: HOSTS }, (_, i) => ({
  Host: `esx-${i}.corp.local`,
  Cluster: "PROD",
  "# CPU": 2,
  "Cores per CPU": 12,
  "# Cores": 24,
  "# Memory": 786432, // MiB
  Model: "PowerEdge R750",
  Vendor: "Dell Inc.",
}));

const rvVms = Array.from({ length: VMS }, (_, i) => ({
  VM: `vm-${i}`,
  Cluster: "PROD",
  Powerstate: i % 10 === 0 ? "poweredOff" : "poweredOn",
  CPUs: VCPU_PER_VM,
  Memory: RAM_GIB_PER_VM * 1024, // MiB, header carries no unit
  "Provisioned MiB": DISK_GIB_PER_VM * 1024,
  "In Use MiB": DISK_GIB_PER_VM * 1024 * 0.6,
  "OS according to the configuration file": "Microsoft Windows Server 2019 (64-bit)",
}));

const colHosts = Array.from({ length: HOSTS }, (_, i) => ({
  MOID: `host-${i}`,
  Cluster: "domain-c1",
  Name: `esx-${i}`,
  CPUs: 2,
  "Cores per CPU": 12,
  "CPU Cores": 24,
  "Memory Size": 824.6, // decimal GB
  Model: "PowerEdge R750",
  Vendor: "Dell Inc.",
}));

const colInfo = Array.from({ length: VMS }, (_, i) => ({
  UUID: `u-${i}`,
  "VM Name": `vm-${i}`,
  "Host MOID": `host-${i % HOSTS}`,
  "Power State": i % 10 === 0 ? "poweredOff" : "poweredOn",
  "Guest OS": "Microsoft Windows Server 2019 (64-bit)",
}));

const collectorSheets = (overrides: Record<string, Record<string, unknown>[]> = {}) => ({
  vCluster: [{ MOID: "domain-c1", "Cluster Name": "PROD" }],
  vHosts: colHosts,
  vInfo: colInfo,
  vCPU: colInfo.map((v) => ({ UUID: v.UUID, vCPUs: VCPU_PER_VM })),
  vMemory: colInfo.map((v) => ({ UUID: v.UUID, "Size (MiB)": RAM_GIB_PER_VM * 1024 })),
  vDisk: colInfo.map((v) => ({ UUID: v.UUID, "Capacity (MiB)": DISK_GIB_PER_VM * 1024 })),
  vPartition: colInfo.map((v) => ({
    UUID: v.UUID,
    "Capacity (MiB)": DISK_GIB_PER_VM * 1024,
    "Consumed (MiB)": DISK_GIB_PER_VM * 1024 * 0.6,
  })),
  ...overrides,
});

// --- the dialects -----------------------------------------------------------

const DIALECTS: { name: string; source: SizerSource; sheets: Record<string, Record<string, unknown>[]> }[] = [
  { name: "RVTools canonical", source: "rvtools", sheets: { vHost: rvHosts, vInfo: rvVms } },
  {
    name: "RVTools with vDatastore present",
    source: "rvtools",
    sheets: {
      vHost: rvHosts,
      vInfo: rvVms,
      vDatastore: [
        { Name: "ds-01", "Capacity MiB": 12 * 1024 * 1024, "In Use MiB": 7 * 1024 * 1024 },
        { Name: "ds-02", "Capacity MiB": 10 * 1024 * 1024, "In Use MiB": 5 * 1024 * 1024 },
      ],
    },
  },
  {
    name: "RVTools with guest vPartition",
    source: "rvtools",
    sheets: {
      vHost: rvHosts,
      vInfo: rvVms,
      vPartition: Array.from({ length: VMS * 2 }, (_, i) => ({
        VM: `vm-${Math.floor(i / 2)}`,
        "Capacity MiB": (DISK_GIB_PER_VM / 2) * 1024,
        "Consumed MiB": (DISK_GIB_PER_VM / 2) * 1024 * 0.6,
      })),
    },
  },
  {
    name: "bare 'Capacity' header in MiB",
    source: "rvtools",
    sheets: {
      vHost: rvHosts,
      vInfo: rvVms.map(({ "Provisioned MiB": p, "In Use MiB": u, ...rest }) => ({ ...rest, Capacity: p, Consumed: u })),
    },
  },
  {
    // The exact shape that produced the 341,000-node recommendation.
    name: "bare 'Capacity' header in bytes",
    source: "rvtools",
    sheets: {
      vHost: rvHosts,
      vInfo: rvVms.map(({ "Provisioned MiB": p, "In Use MiB": u, ...rest }) => ({
        ...rest,
        Capacity: p * 1024 * 1024,
        Consumed: u * 1024 * 1024,
      })),
    },
  },
  {
    name: "host memory relabelled to GiB",
    source: "rvtools",
    sheets: { vHost: rvHosts.map(({ "# Memory": m, ...rest }) => ({ ...rest, "Memory (GiB)": m / 1024 })), vInfo: rvVms },
  },
  {
    name: "LiveOptics with byte capacities",
    source: "liveoptics",
    sheets: { "ESX Hosts": rvHosts.map((h) => ({ ...h, Capacity: 3 * 1024 ** 4 })), VMs: rvVms },
  },
  { name: "Collector canonical", source: "collector_excel", sheets: collectorSheets() },
  {
    name: "Collector keyed on VM name only",
    source: "collector_excel",
    sheets: collectorSheets({
      vCPU: colInfo.map((v) => ({ "VM Name": v["VM Name"], vCPUs: VCPU_PER_VM })),
      vMemory: colInfo.map((v) => ({ "VM Name": v["VM Name"], "Size (MiB)": RAM_GIB_PER_VM * 1024 })),
      vPartition: colInfo.map((v) => ({
        "VM Name": v["VM Name"],
        "Capacity (MiB)": DISK_GIB_PER_VM * 1024,
        "Consumed (MiB)": DISK_GIB_PER_VM * 1024 * 0.6,
      })),
    }),
  },
  {
    name: "Collector host memory in bytes",
    source: "collector_excel",
    sheets: collectorSheets({ vHosts: colHosts.map((h) => ({ ...h, "Memory Size": 824.6 * 1000 ** 3 })) }),
  },
  {
    name: "Collector vMemory relabelled to GiB",
    source: "collector_excel",
    sheets: collectorSheets({ vMemory: colInfo.map((v) => ({ UUID: v.UUID, "Size (GiB)": RAM_GIB_PER_VM })) }),
  },
];

describe("export dialects all resolve to the same environment", () => {
  for (const dialect of DIALECTS) {
    it(dialect.name, () => {
      const parsed = parse(dialect.source, dialect.sheets);
      assert.equal(parsed.all.vms, TRUTH.vms, "VM count");
      assertClose(parsed.all.vcpu, TRUTH.vcpu, "total vCPU");
      assertClose(parsed.all.ramGiB, TRUTH.ramGiB, "total VM RAM (GiB)");
      assertClose(parsed.aggStorageProvisionedTiB, TRUTH.provisionedTiB, "provisioned storage (TiB)");
      assertClose(parsed.totalCpuCores, HOSTS * TRUTH.coresPerHost, "host cores");
      assert.deepEqual(parsed.plausibility, [], `plausibility issues: ${JSON.stringify(parsed.plausibility)}`);

      const plan = buildSizingPlan(parsed, DEFAULT_SIZER_SETTINGS);
      assert.deepEqual(plan.blockers, [], "build should not be blocked");
      assert.ok(plan.totalNodes > 0 && plan.totalNodes <= 32, `implausible node count: ${plan.totalNodes}`);
    });
  }
});

describe("host core resolution", () => {
  it("does not double-count when '# Cores' is already the socket total", () => {
    // RVTools' "# Cores" is total cores; multiplying it by "# CPU" doubles the estate.
    const parsed = parse("rvtools", {
      vHost: rvHosts.map(({ "Cores per CPU": _cps, ...rest }) => rest),
      vInfo: rvVms,
    });
    assertClose(parsed.totalCpuCores, HOSTS * TRUTH.coresPerHost, "host cores without a cores-per-CPU column");
  });
});

describe("obfuscated exports", () => {
  it("keeps clusters distinct when their names collide", () => {
    const parsed = parse("rvtools", {
      vHost: [
        { Host: "a", Cluster: "##h", "# CPU": 2, "Cores per CPU": 12, "# Memory": 786432 },
        { Host: "b", Cluster: "##h", "# CPU": 2, "Cores per CPU": 12, "# Memory": 786432 },
      ],
      vInfo: rvVms.map((v) => ({ ...v, Cluster: "##h" })),
    });
    // Same name genuinely means the same cluster here — one cluster, both hosts.
    assert.equal(parsed.clusterDetails.length, 1);
    assert.equal(parsed.clusterDetails[0].hosts, 2);
    assert.ok(parsed.clusterDetails[0].id, "cluster must carry an id");
  });

  it("gives every cluster a unique id even when display names repeat", () => {
    const parsed = parse("collector_excel", {
      vCluster: [
        { MOID: "domain-c1", "Cluster Name": "########sat.com" },
        { MOID: "domain-c2", "Cluster Name": "########sat.com" },
      ],
      vHosts: [
        { MOID: "h1", Cluster: "domain-c1", Name: "a", CPUs: 2, "Cores per CPU": 12, "Memory Size": 824.6 },
        { MOID: "h2", Cluster: "domain-c2", Name: "b", CPUs: 2, "Cores per CPU": 12, "Memory Size": 824.6 },
      ],
      vInfo: colInfo.map((v, i) => ({ ...v, "Host MOID": i % 2 === 0 ? "h1" : "h2" })),
      vCPU: colInfo.map((v) => ({ UUID: v.UUID, vCPUs: VCPU_PER_VM })),
      vMemory: colInfo.map((v) => ({ UUID: v.UUID, "Size (MiB)": RAM_GIB_PER_VM * 1024 })),
      vPartition: colInfo.map((v) => ({ UUID: v.UUID, "Capacity (MiB)": DISK_GIB_PER_VM * 1024, "Consumed (MiB)": 0 })),
    });
    assert.equal(parsed.clusterDetails.length, 2);
    const ids = parsed.clusterDetails.map((c) => c.id);
    assert.equal(new Set(ids).size, 2, "cluster ids must be unique");
    const names = parsed.clusterDetails.map((c) => c.name);
    assert.equal(new Set(names).size, 2, "colliding names must be disambiguated for display");
  });
});

describe("unit resolution primitives", () => {
  it("reads an explicit unit from the header", () => {
    assert.equal(unitFromHeader("Capacity (MiB)"), "MiB");
    assert.equal(unitFromHeader("Provisioned MB"), "MB");
    assert.equal(unitFromHeader("Memory (GiB)"), "GiB");
    assert.equal(unitFromHeader("Size B"), "B");
    assert.equal(unitFromHeader("Capacity"), null);
  });

  it("overrides a header whose declared unit is physically impossible", () => {
    // 200 VMs x 100 GiB each, but the column is mislabelled TiB.
    const rows = Array.from({ length: 200 }, () => 100 * 1024); // MiB
    const res = resolveCapacity("Capacity (TiB)", rows, 200, PLAUSIBLE.vmStorage);
    assert.equal(res.confidence, "header-overridden");
    assert.equal(res.unit, "MiB");
  });

  it("ignores a corrupt outlier when inferring the unit", () => {
    // A real masked Collector export carries one partition of 8,796,093,022,208
    // MiB (8.4 EiB) — 99.99% of the column. Mean-based inference lets that single
    // row flip the unit for the whole estate; the median must not budge.
    const rows = Array.from({ length: 714 }, () => 100 * 1024); // 100 GiB each, in MiB
    rows.push(8_796_093_022_208);
    const res = resolveCapacity("Capacity (MiB)", rows, 714, PLAUSIBLE.vmStorage);
    assert.equal(res.unit, "MiB", `outlier flipped the unit to ${res.unit}`);
    assert.equal(res.confidence, "header");
  });

  it("refuses to invent a value when nothing is plausible", () => {
    const res = resolveCapacity("Capacity", [1e30], 200, PLAUSIBLE.vmStorage);
    assert.equal(res.confidence, "unresolved");
    assert.equal(res.totalGiB, null);
  });
});

describe("plausibility gate", () => {
  it("passes a normal environment", () => {
    assert.deepEqual(
      checkPlausibility({
        vms: 200,
        hosts: 8,
        vcpu: 800,
        vmRamGiB: 3200,
        vmStorageProvisionedTiB: 19.5,
        vmStorageConsumedTiB: 11.7,
        hostCores: 192,
        hostRamGiB: 6144,
      }),
      [],
    );
  });

  it("catches storage inflated by a unit slip", () => {
    const issues = checkPlausibility({
      vms: 200,
      hosts: 8,
      vcpu: 800,
      vmRamGiB: 3200,
      vmStorageProvisionedTiB: 25_165_824,
      vmStorageConsumedTiB: 15_000_000,
      hostCores: 192,
      hostRamGiB: 6144,
    });
    assert.ok(issues.some((i) => i.field === "Storage per VM"), JSON.stringify(issues));
  });

  it("catches consumed exceeding provisioned", () => {
    const issues = checkPlausibility({
      vms: 200,
      hosts: 8,
      vcpu: 800,
      vmRamGiB: 3200,
      vmStorageProvisionedTiB: 19.5,
      vmStorageConsumedTiB: 19_500,
      hostCores: 192,
      hostRamGiB: 6144,
    });
    assert.ok(issues.some((i) => i.field.startsWith("Consumed")), JSON.stringify(issues));
  });

  it("catches doubled host cores", () => {
    const issues = checkPlausibility({
      vms: 200,
      hosts: 8,
      vcpu: 800,
      vmRamGiB: 3200,
      vmStorageProvisionedTiB: 19.5,
      vmStorageConsumedTiB: 11.7,
      hostCores: 8000,
      hostRamGiB: 6144,
    });
    assert.ok(issues.some((i) => i.field === "Cores per host"), JSON.stringify(issues));
  });
});

describe("build suppression", () => {
  it("blocks the recommendation when the parse is implausible", () => {
    const parsed = parse("collector_excel", collectorSheets());
    // Simulate a column that slipped through as 1000x too large.
    parsed.plausibility = [
      { field: "Storage per VM", observed: "1,200 TiB", expected: "≤ 256 TiB", detail: "unit slip" },
    ];
    const plan = buildSizingPlan(parsed, DEFAULT_SIZER_SETTINGS);
    assert.ok(plan.blockers.length > 0, "blockers must propagate to the plan");
  });
});
