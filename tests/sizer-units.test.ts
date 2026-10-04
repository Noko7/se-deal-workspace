// Unit handling for the Simple Sizer parser.
//
// Units are never inferred from magnitude. A unit token in the header is
// authoritative; a header with no unit takes the registry entry for that exact
// tool + sheet + header; anything else is unresolved and contributes nothing.
// Magnitude is only a check: an impossible result blocks the build.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { DEFAULT_NX_SETTINGS, recommendNx } from "@/lib/nx-sizer";
import { parseSizerWorkbook } from "@/lib/simple-sizer";
import type { SizerSource } from "@/lib/simple-sizer-core";
import { PLAUSIBLE, checkPlausibility, resolveCapacity, unitFromHeader } from "@/lib/sizer-units";

type Rows = Record<string, unknown>[];

const HOSTS = 8;
const VMS = 200;
const VCPU_PER_VM = 4;
const RAM_GIB_PER_VM = 16;
const DISKS_PER_VM = 2;
const DISK_GIB = 50; // two 50 GiB disks = 100 GiB provisioned per VM
const PARTITION_GIB = 30; // two 30 GiB partitions = 60 GiB consumed per VM
const DECOY_GIB = 99; // a VM-level "used" figure that must lose to partition data
const HOST_RAM_GIB = 768;

const TRUTH = {
  vms: VMS,
  vcpu: VMS * VCPU_PER_VM, // 800
  ramGiB: VMS * RAM_GIB_PER_VM, // 3200
  provisionedTiB: (VMS * DISKS_PER_VM * DISK_GIB) / 1024, // 19.53125
  consumedTiB: (VMS * DISKS_PER_VM * PARTITION_GIB) / 1024, // 11.71875
  hostCores: HOSTS * 24, // 192
};

function workbook(sheets: Record<string, Rows>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function parse(source: SizerSource, sheets: Record<string, Rows>) {
  return parseSizerWorkbook(workbook(sheets), source, "test.xlsx", 1024);
}

const MIB = 1024;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const power = (i: number) => (i % 10 === 0 ? "poweredOff" : "poweredOn");
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

function assertTruth(parsed: ReturnType<typeof parse>, what: string, opts: { consumedSource?: string } = {}) {
  assert.equal(parsed.vms.length, TRUTH.vms, `${what}: VM count`);
  assert.equal(sum(parsed.vms.map((v) => v.vcpu)), TRUTH.vcpu, `${what}: vCPU`);
  assert.equal(sum(parsed.vms.map((v) => v.ramGiB)), TRUTH.ramGiB, `${what}: RAM`);
  const prov = sum(parsed.vms.map((v) => v.storageProvisionedTiB));
  const cons = sum(parsed.vms.map((v) => v.storageConsumedTiB));
  assert.ok(Math.abs(prov - TRUTH.provisionedTiB) < 1e-9, `${what}: provisioned ${prov} vs ${TRUTH.provisionedTiB}`);
  assert.ok(Math.abs(cons - TRUTH.consumedTiB) < 1e-9, `${what}: consumed ${cons} vs ${TRUTH.consumedTiB}`);
  assert.equal(parsed.all.vcpu, TRUTH.vcpu);
  assert.equal(parsed.all.ramGiB, TRUTH.ramGiB);
  assert.ok(Math.abs(parsed.aggStorageProvisionedTiB - TRUTH.provisionedTiB) < 0.006);
  assert.ok(Math.abs(parsed.aggStorageConsumedTiB - TRUTH.consumedTiB) < 0.006);
  assert.equal(parsed.totalCpuCores, TRUTH.hostCores, `${what}: host cores`);
  assert.equal(parsed.totalMemoryGiB, HOSTS * HOST_RAM_GIB, `${what}: host RAM`);
  assert.equal(parsed.poweredOff.vms, VMS / 10, `${what}: powered-off VMs`);
  assert.deepEqual(parsed.plausibility, [], `${what}: ${JSON.stringify(parsed.plausibility)}`);
  if (opts.consumedSource) {
    assert.ok(parsed.vms.every((v) => v.consumedSource === opts.consumedSource), `${what}: consumedSource`);
  }
}

// --- the same environment in each tool's real sheets and columns -------------

const collectorHosts: Rows = range(HOSTS).map((i) => ({
  MOID: `host-${i}`,
  Cluster: "domain-c1",
  Name: `esx-${i}`,
  CPUs: 2,
  "Cores per CPU": 12,
  "CPU Cores": 24,
  "Memory Size": HOST_RAM_GIB, // registry: GiB
  Model: "PowerEdge R750",
  Vendor: "Dell Inc.",
}));
const colVm = (i: number) => ({ UUID: `u-${i}`, "VM Name": `vm-${i}` });
const collectorInfo: Rows = range(VMS).map((i) => ({
  ...colVm(i),
  "Host MOID": `host-${i % HOSTS}`,
  "Power State": power(i),
  "Guest OS": "Microsoft Windows Server 2019 (64-bit)",
}));
const perDisk = (key: string, col: string, gib: number): Rows =>
  range(VMS).flatMap((i) => range(DISKS_PER_VM).map(() => ({ [key]: `u-${i}`, [col]: gib * MIB })));

function collectorSheets(over: Record<string, Rows> = {}): Record<string, Rows> {
  return {
    vCluster: [{ MOID: "domain-c1", "Cluster Name": "PROD" }],
    vHosts: collectorHosts,
    vInfo: collectorInfo,
    vCPU: range(VMS).map((i) => ({ UUID: `u-${i}`, vCPUs: VCPU_PER_VM })),
    vMemory: range(VMS).map((i) => ({ UUID: `u-${i}`, "Size (MiB)": RAM_GIB_PER_VM * MIB })),
    vDisk: perDisk("UUID", "Capacity (MiB)", DISK_GIB),
    vPartition: perDisk("UUID", "Consumed (MiB)", PARTITION_GIB),
    // A VM-level figure that disagrees with the partitions: partitions must win.
    vmList: range(VMS).map((i) => ({ "VM Name": `vm-${i}`, "Consumed (MiB)": DECOY_GIB * MIB })),
    ...over,
  };
}

const rvHosts: Rows = range(HOSTS).map((i) => ({
  Host: `esx-${i}.corp.local`,
  Cluster: "PROD",
  "# CPU": 2,
  "Cores per CPU": 12,
  "# Cores": 24,
  "# Memory": HOST_RAM_GIB * MIB, // registry: MiB
  Model: "PowerEdge R750",
  Vendor: "Dell Inc.",
}));
const rvInfo = (inUseGiB: number): Rows =>
  range(VMS).map((i) => ({
    VM: `vm-${i}`,
    "VM UUID": `u-${i}`,
    Cluster: "PROD",
    Powerstate: power(i),
    CPUs: VCPU_PER_VM,
    Memory: RAM_GIB_PER_VM * MIB, // registry: MiB
    "In Use MiB": inUseGiB * MIB,
    "OS according to the configuration file": "Microsoft Windows Server 2019 (64-bit)",
  }));

const loHosts: Rows = range(HOSTS).map((i) => ({
  Host: `esx-${i}.corp.local`,
  Cluster: "PROD",
  "# CPU": 2,
  "Cores per CPU": 12,
  "# Cores": 24,
  "Memory (KiB)": HOST_RAM_GIB * MIB * MIB,
  Model: "PowerEdge R750",
}));
const loVms = (usedGiB: number): Rows =>
  range(VMS).map((i) => ({
    VM: `vm-${i}`,
    InstanceUUID: `u-${i}`,
    Cluster: "PROD",
    Powerstate: power(i),
    CPUs: VCPU_PER_VM,
    "Provisioned Memory (MiB)": RAM_GIB_PER_VM * MIB,
    "Virtual Disk Size (MiB)": DISKS_PER_VM * DISK_GIB * MIB,
    "Virtual Disk Used (MiB)": usedGiB * MIB,
  }));
const loVmDisks: Rows = range(VMS).flatMap((i) =>
  range(DISKS_PER_VM).map(() => ({ VM: `vm-${i}`, InstanceUUID: `u-${i}`, "Used (MiB)": PARTITION_GIB * MIB })),
);

const DIALECTS: { name: string; source: SizerSource; sheets: Record<string, Rows>; consumedSource: string }[] = [
  { name: "Collector canonical", source: "collector_excel", sheets: collectorSheets(), consumedSource: "partition" },
  {
    name: "Collector with disk, partition, vCPU and memory keyed on VM name only",
    source: "collector_excel",
    sheets: collectorSheets({
      vCPU: range(VMS).map((i) => ({ "VM Name": `vm-${i}`, vCPUs: VCPU_PER_VM })),
      vMemory: range(VMS).map((i) => ({ "VM Name": `vm-${i}`, "Size (MiB)": RAM_GIB_PER_VM * MIB })),
      vDisk: perDisk("VM Name", "Capacity (MiB)", DISK_GIB).map((r, n) => ({ ...r, "VM Name": `vm-${Math.floor(n / DISKS_PER_VM)}` })),
      vPartition: perDisk("VM Name", "Consumed (MiB)", PARTITION_GIB).map((r, n) => ({ ...r, "VM Name": `vm-${Math.floor(n / DISKS_PER_VM)}` })),
    }),
    consumedSource: "partition",
  },
  {
    name: "Collector with no vPartition: vmList Consumed (MiB) fallback",
    source: "collector_excel",
    sheets: collectorSheets({
      vPartition: [],
      vmList: range(VMS).map((i) => ({ "VM Name": `vm-${i}`, "Consumed (MiB)": DISKS_PER_VM * PARTITION_GIB * MIB })),
    }),
    consumedSource: "vm-level",
  },
  {
    name: "Collector host memory with the unit in the header",
    source: "collector_excel",
    sheets: collectorSheets({ vHosts: collectorHosts.map(({ "Memory Size": m, ...rest }) => ({ ...rest, "Memory Size (MiB)": Number(m) * MIB })) }),
    consumedSource: "partition",
  },
  {
    name: "Collector VM memory with GiB in the header",
    source: "collector_excel",
    sheets: collectorSheets({ vMemory: range(VMS).map((i) => ({ UUID: `u-${i}`, "Size (GiB)": RAM_GIB_PER_VM })) }),
    consumedSource: "partition",
  },
  {
    name: "RVTools canonical",
    source: "rvtools",
    sheets: {
      vHost: rvHosts,
      vInfo: rvInfo(DECOY_GIB),
      vDisk: range(VMS).flatMap((i) => range(DISKS_PER_VM).map(() => ({ VM: `vm-${i}`, "VM UUID": `u-${i}`, "Capacity MiB": DISK_GIB * MIB }))),
      vPartition: range(VMS).flatMap((i) => range(DISKS_PER_VM).map(() => ({ VM: `vm-${i}`, "VM UUID": `u-${i}`, "Consumed MiB": PARTITION_GIB * MIB }))),
    },
    consumedSource: "partition",
  },
  {
    name: "RVTools with no vPartition: vInfo In Use MiB fallback, extra sheets ignored",
    source: "rvtools",
    sheets: {
      vHost: rvHosts,
      vInfo: rvInfo(DISKS_PER_VM * PARTITION_GIB),
      vDisk: range(VMS).flatMap((i) => range(DISKS_PER_VM).map(() => ({ VM: `vm-${i}`, "VM UUID": `u-${i}`, "Capacity MiB": DISK_GIB * MIB }))),
      vDatastore: [{ Name: "ds-01", "Capacity MiB": 12 * 1024 * MIB, "In Use MiB": 7 * 1024 * MIB }],
    },
    consumedSource: "vm-level",
  },
  {
    name: "LiveOptics canonical",
    source: "liveoptics",
    sheets: { "ESX Hosts": loHosts, VMs: loVms(DECOY_GIB), "VM Disks": loVmDisks },
    consumedSource: "partition",
  },
  {
    name: "LiveOptics with no VM Disks sheet: Virtual Disk Used (MiB) fallback",
    source: "liveoptics",
    sheets: { "ESX Hosts": loHosts, VMs: loVms(DISKS_PER_VM * PARTITION_GIB) },
    consumedSource: "vm-level",
  },
];

describe("every tool resolves the same environment to the same totals", () => {
  for (const d of DIALECTS) {
    it(d.name, () => {
      const parsed = parse(d.source, d.sheets);
      assertTruth(parsed, d.name, { consumedSource: d.consumedSource });
      const rec = recommendNx(parsed, DEFAULT_NX_SETTINGS);
      assert.deepEqual(rec.blockers, [], "build must not be blocked");
      assert.ok(rec.fit && rec.fit.totalNodes > 0, "a build is produced");
    });
  }

  it("the nine dialects agree with each other, not just with the constants", () => {
    const totals = DIALECTS.map((d) => {
      const p = parse(d.source, d.sheets);
      return [sum(p.vms.map((v) => v.vcpu)), sum(p.vms.map((v) => v.ramGiB)), p.aggStorageProvisionedTiB, p.aggStorageConsumedTiB].join("|");
    });
    assert.equal(new Set(totals).size, 1, totals.join("\n"));
  });
});

// --- header unit is authoritative; whole-word tokens --------------------------

describe("unit tokens in headers", () => {
  it("reads an explicit unit as a whole-word token", () => {
    assert.equal(unitFromHeader("Capacity (MiB)"), "MiB");
    assert.equal(unitFromHeader("Capacity MiB"), "MiB");
    assert.equal(unitFromHeader("Size MiB (vmsn)"), "MiB");
    assert.equal(unitFromHeader("Memory (KiB)"), "KiB");
    assert.equal(unitFromHeader("Disk (TiB)"), "TiB");
    assert.equal(unitFromHeader("Provisioned MB"), "MB");
    assert.equal(unitFromHeader("Memory (GiB)"), "GiB");
    assert.equal(unitFromHeader("Total KB"), "KB");
    assert.equal(unitFromHeader("Size (bytes)"), "B");
  });

  it("does not match a unit inside a longer word", () => {
    assert.equal(unitFromHeader("Number of Reads"), null);
    assert.equal(unitFromHeader("Memory"), null);
    assert.equal(unitFromHeader("Capacity"), null);
    assert.equal(unitFromHeader("Throughput GBps"), null);
    assert.equal(unitFromHeader("Subtotal"), null);
    assert.equal(unitFromHeader("# Memory"), null);
  });

  it("lets the header unit win over a registry unit", () => {
    const r = resolveCapacity("Memory (GiB)", [768, 768], 2, PLAUSIBLE.hostMemory, "MiB");
    assert.equal(r.unit, "GiB");
    assert.equal(r.confidence, "header");
    assert.equal(r.totalGiB, 1536);
  });

  it("uses the registry unit only for a header that prints none", () => {
    const r = resolveCapacity("Memory", [786432, 786432], 2, PLAUSIBLE.hostMemory, "MiB");
    assert.equal(r.unit, "MiB");
    assert.equal(r.confidence, "registry");
    assert.equal(r.totalGiB, 1536);
  });

  it("leaves a unit-less column with no registry unit unresolved", () => {
    const r = resolveCapacity("Capacity", [100 * MIB], 1, PLAUSIBLE.vmStorage);
    assert.equal(r.confidence, "unresolved");
    assert.equal(r.unit, null);
    assert.equal(r.totalGiB, null);
  });

  it("never re-reads the unit from magnitude", () => {
    // 100 GiB per VM, in MiB, mislabelled TiB. Old behaviour re-read it as MiB.
    const r = resolveCapacity("Capacity (TiB)", Array.from({ length: 200 }, () => 100 * MIB), 200, PLAUSIBLE.vmStorage);
    assert.equal(r.unit, "TiB");
    assert.equal(r.confidence, "header");
    assert.match(r.note, /impossible/);
  });

  it("keeps the declared unit when the result is impossibly small too", () => {
    const r = resolveCapacity("Capacity (KiB)", Array.from({ length: 200 }, () => 100 * MIB), 200, PLAUSIBLE.vmStorage);
    assert.equal(r.unit, "KiB");
    assert.match(r.note, /impossible/);
  });

  it("calls a plausible result plausible", () => {
    const r = resolveCapacity("Capacity (MiB)", Array.from({ length: 200 }, () => 100 * MIB), 200, PLAUSIBLE.vmStorage);
    assert.equal(r.unit, "MiB");
    assert.ok(!/impossible/.test(r.note));
    assert.equal(r.totalGiB, 200 * 100);
  });

  it("ignores a corrupt outlier row when checking plausibility", () => {
    // A masked Collector export carries one 8.4 EiB partition. The check uses the
    // median, so it neither flips the unit nor trips the gate.
    const rows = Array.from({ length: 714 }, () => 100 * MIB);
    rows.push(8_796_093_022_208);
    const r = resolveCapacity("Capacity (MiB)", rows, 714, PLAUSIBLE.vmStorage);
    assert.equal(r.unit, "MiB");
    assert.equal(r.confidence, "header");
    assert.ok(!/impossible/.test(r.note));
  });

  it("returns unresolved when there is no column", () => {
    assert.equal(resolveCapacity(null, [], 0, PLAUSIBLE.vmStorage).confidence, "unresolved");
  });
});

// --- registry: exact tool + sheet + header ------------------------------------

describe("registry", () => {
  it("reads Collector vHosts 'Memory Size' as GiB", () => {
    const parsed = parse("collector_excel", collectorSheets());
    const audit = parsed.audit.find((a) => a.field === "Host memory");
    assert.equal(audit?.column, "Memory Size");
    assert.equal(audit?.unit, "GiB");
    assert.equal(audit?.confidence, "registry");
    assert.equal(parsed.clusterDetails[0].hostRecords[0].ramGiB, HOST_RAM_GIB);
  });

  it("reads RVTools vHost '# Memory' and vInfo 'Memory' as MiB", () => {
    const parsed = parse("rvtools", DIALECTS.find((d) => d.name === "RVTools canonical")!.sheets);
    const host = parsed.audit.find((a) => a.field === "Host memory");
    const vmMem = parsed.audit.find((a) => a.field === "VM memory (configured)");
    assert.deepEqual([host?.unit, host?.confidence], ["MiB", "registry"]);
    assert.deepEqual([vmMem?.unit, vmMem?.confidence], ["MiB", "registry"]);
  });

  const rvWithHostHeader = (header: string) => {
    const sheets = DIALECTS.find((d) => d.name === "RVTools canonical")!.sheets;
    return { ...sheets, vHost: rvHosts.map(({ "# Memory": m, ...rest }) => ({ ...rest, [header]: m })) };
  };

  it("does not apply another tool's registry entry to the same header", () => {
    // "Memory Size" is registered for Collector vHosts only. In an RVTools vHost sheet it is unresolved.
    const parsed = parse("rvtools", rvWithHostHeader("Memory Size"));
    const audit = parsed.audit.find((a) => a.field === "Host memory");
    assert.equal(audit?.column, "Memory Size");
    assert.equal(audit?.confidence, "unresolved");
    assert.equal(audit?.unit, null);
  });

  it("an unresolved column contributes 0 and never blocks on its own", () => {
    const parsed = parse("rvtools", rvWithHostHeader("Memory Size"));
    assert.equal(parsed.totalMemoryGiB, 0);
    assert.ok(parsed.clusterDetails.every((c) => c.hostRecords.every((h) => h.ramGiB === 0)));
    assert.ok(parsed.notes.some((n) => /could not be read reliably/.test(n)));
    assert.equal(parsed.audit.find((a) => a.field === "Host memory")?.implausible, false);
    // VM figures from other, resolved columns are unaffected.
    assert.equal(sum(parsed.vms.map((v) => v.ramGiB)), TRUTH.ramGiB);
  });

  it("does not read a unit-less VM memory column that is not in the registry", () => {
    // Collector vMemory has no registry entry; a bare "Size" column is not guessed.
    const parsed = parse("collector_excel", collectorSheets({ vMemory: range(VMS).map((i) => ({ UUID: `u-${i}`, Size: RAM_GIB_PER_VM * MIB })) }));
    assert.equal(sum(parsed.vms.map((v) => v.ramGiB)), 0);
    const audit = parsed.audit.find((a) => a.field === "VM memory (configured)");
    assert.equal(audit?.column, null);
    assert.equal(audit?.confidence, "unresolved");
  });

  it("lets a header unit beat the registry in the parser", () => {
    // "Memory Size (MiB)" holding 786432 is 768 GiB, not 786432 GiB.
    const parsed = parse(
      "collector_excel",
      collectorSheets({ vHosts: collectorHosts.map(({ "Memory Size": m, ...rest }) => ({ ...rest, "Memory Size (MiB)": Number(m) * MIB })) }),
    );
    const audit = parsed.audit.find((a) => a.field === "Host memory");
    assert.deepEqual([audit?.unit, audit?.confidence], ["MiB", "header"]);
    assert.equal(parsed.totalMemoryGiB, HOSTS * HOST_RAM_GIB);
  });
});

// --- impossible values block the build ----------------------------------------

describe("impossible values", () => {
  it("flag the audit, add a plausibility issue and block the build, keeping the declared unit", () => {
    // 512,000 per disk with the header saying GiB: 1,024,000 GiB per VM, past the 262,144 GiB ceiling.
    const parsed = parse("collector_excel", collectorSheets({ vDisk: perDisk("UUID", "Capacity (GiB)", DISK_GIB * 10) }));
    const audit = parsed.audit.find((a) => a.field.startsWith("VM storage, provisioned"));
    assert.equal(audit?.unit, "GiB", "declared unit is kept");
    assert.equal(audit?.confidence, "header");
    assert.equal(audit?.implausible, true);
    assert.match(audit?.note ?? "", /impossible/);
    const issue = parsed.plausibility.find((p) => p.field.startsWith("VM storage, provisioned"));
    assert.ok(issue, JSON.stringify(parsed.plausibility));
    assert.match(issue.observed, /GiB/);

    const rec = recommendNx(parsed, DEFAULT_NX_SETTINGS);
    assert.ok(rec.blockers.some((b) => b.startsWith("VM storage, provisioned")), JSON.stringify(rec.blockers));
  });

  it("do not flag a plausible column", () => {
    const parsed = parse("collector_excel", collectorSheets());
    assert.ok(parsed.audit.every((a) => !a.implausible));
  });

  it("block a host memory slip (768 'GiB' that is really MiB-sized values)", () => {
    // Header says GiB but the values are 786,432: 786 TiB per host, past any real host.
    const parsed = parse(
      "collector_excel",
      collectorSheets({ vHosts: collectorHosts.map(({ "Memory Size": m, ...rest }) => ({ ...rest, "Memory (GiB)": Number(m) * MIB })) }),
    );
    assert.ok(parsed.audit.some((a) => a.field === "Host memory" && a.implausible));
    assert.ok(parsed.plausibility.some((p) => p.field === "Host memory"));
  });
});

// --- percentages are never rescaled -------------------------------------------

describe("percent usage columns", () => {
  const hostsWith = (cpu: number, mem: number): Rows =>
    collectorHosts.map((h) => ({ ...h, "CPU Usage": cpu, "Memory Usage": mem }));

  it("keep 0.69 as 0.69%, not 69%, when the registry says percent", () => {
    const parsed = parse("collector_excel", collectorSheets({ vHosts: hostsWith(0.69, 1.2) }));
    const host = parsed.clusterDetails[0].hostRecords[0];
    assert.equal(host.cpuUtilPct, 0.69);
    assert.equal(host.memoryUtilPct, 1.2);
    assert.equal(parsed.hostCpuUtilPct, 0.7); // average rounded to 1 dp
    const audit = parsed.audit.find((a) => a.field === "Host CPU usage");
    assert.deepEqual([audit?.unit, audit?.confidence], ["%", "registry"]);
  });

  it("read a header containing % as a percentage", () => {
    const parsed = parse(
      "collector_excel",
      collectorSheets({ vHosts: collectorHosts.map((h) => ({ ...h, "CPU Usage %": 0.5 })) }),
    );
    assert.equal(parsed.clusterDetails[0].hostRecords[0].cpuUtilPct, 0.5);
    assert.equal(parsed.audit.find((a) => a.field === "Host CPU usage")?.confidence, "header");
  });

  it("drop a value over 100 instead of rescaling it", () => {
    const parsed = parse("collector_excel", collectorSheets({ vHosts: hostsWith(150, 73.46) }));
    assert.equal(parsed.clusterDetails[0].hostRecords[0].cpuUtilPct, null);
    assert.equal(parsed.clusterDetails[0].hostRecords[0].memoryUtilPct, 73.46);
  });

  it("keep VM CPU p95 from the vCPU sheet as a percentage of vCPU", () => {
    // 95th percentile 0.5 on a 4 vCPU VM = 0.02 cores, not 2.
    const parsed = parse(
      "collector_excel",
      collectorSheets({ vCPU: range(VMS).map((i) => ({ UUID: `u-${i}`, vCPUs: VCPU_PER_VM, "95th Percentile % (Recommended)": 0.5 })) }),
    );
    assert.ok(Math.abs((parsed.vms[0].cpuUsed.p95 ?? -1) - 0.02) < 1e-9);
  });
});

// --- Collector per-VM rules ---------------------------------------------------

describe("Collector VM rows", () => {
  it("takes the largest Size per VM UUID for RAM and the largest row for vCPU, never the sum", () => {
    const parsed = parse(
      "collector_excel",
      collectorSheets({
        vCPU: [
          ...range(VMS).map((i) => ({ UUID: `u-${i}`, vCPUs: VCPU_PER_VM })),
          ...range(VMS).map((i) => ({ UUID: `u-${i}`, vCPUs: 2 })),
        ],
        vMemory: [
          ...range(VMS).map((i) => ({ UUID: `u-${i}`, "Size (MiB)": RAM_GIB_PER_VM * MIB })),
          ...range(VMS).map((i) => ({ UUID: `u-${i}`, "Size (MiB)": 8 * MIB })),
        ],
      }),
    );
    assertTruth(parsed, "repeated rows");
  });

  it("falls back per VM: partitions win, then vmList by unique name, then none", () => {
    const sheets = collectorSheets({
      vInfo: [
        { UUID: "a", "VM Name": "has-partitions", "Host MOID": "host-0", "Power State": "poweredOn" },
        { UUID: "b", "VM Name": "no-partitions", "Host MOID": "host-0", "Power State": "poweredOn" },
        { UUID: "c", "VM Name": "dup", "Host MOID": "host-0", "Power State": "poweredOn" },
        { UUID: "d", "VM Name": "dup", "Host MOID": "host-0", "Power State": "poweredOn" },
      ],
      vCPU: ["a", "b", "c", "d"].map((u) => ({ UUID: u, vCPUs: 2 })),
      vMemory: ["a", "b", "c", "d"].map((u) => ({ UUID: u, "Size (MiB)": 8 * MIB })),
      vDisk: ["a", "b", "c", "d"].map((u) => ({ UUID: u, "Capacity (MiB)": 100 * MIB })),
      vPartition: [{ UUID: "a", "Consumed (MiB)": 40 * MIB }],
      vmList: [
        { "VM Name": "has-partitions", "Consumed (MiB)": 99 * MIB },
        { "VM Name": "no-partitions", "Consumed (MiB)": 25 * MIB },
        { "VM Name": "dup", "Consumed (MiB)": 77 * MIB },
        { "VM Name": "dup", "Consumed (MiB)": 78 * MIB },
      ],
    });
    const byId = new Map(parse("collector_excel", sheets).vms.map((v) => [v.id, v]));
    assert.equal(byId.get("a")?.consumedSource, "partition");
    assert.ok(Math.abs((byId.get("a")?.storageConsumedTiB ?? 0) - 40 / 1024) < 1e-12);
    assert.equal(byId.get("b")?.consumedSource, "vm-level");
    assert.ok(Math.abs((byId.get("b")?.storageConsumedTiB ?? 0) - 25 / 1024) < 1e-12);
    // A duplicated name cannot be used as a join key.
    assert.equal(byId.get("c")?.consumedSource, "none");
    assert.equal(byId.get("c")?.storageConsumedTiB, 0);
    assert.equal(byId.get("d")?.consumedSource, "none");
  });

  it("keeps volume-group disks and partitions with no VM in vInfo as volume groups", () => {
    const parsed = parse(
      "collector_excel",
      collectorSheets({
        vDisk: [
          ...perDisk("UUID", "Capacity (MiB)", DISK_GIB),
          { UUID: "vg-1", "VM Name": "k8s-owner", "Volume Group Name": "pvc-data", "Capacity (MiB)": 2 * 1024 * MIB, "Volume Group Disk": "True" },
          { UUID: "vg-1", "VM Name": "k8s-owner", "Volume Group Name": "pvc-data", "Capacity (MiB)": 1 * 1024 * MIB, "Volume Group Disk": "True" },
          // Not a volume group and not in vInfo: counted nowhere, reported.
          { UUID: "ghost", "VM Name": "ghost", "Capacity (MiB)": 500 * MIB, "Volume Group Disk": "False" },
        ],
        vPartition: [
          ...perDisk("UUID", "Consumed (MiB)", PARTITION_GIB),
          { UUID: "vg-1", "VM Name": "k8s-owner", "Consumed (MiB)": 1024 * MIB, "Volume Group Partition": "True" },
        ],
      }),
    );
    assert.equal(parsed.volumeGroups?.length, 1);
    const vg = parsed.volumeGroups![0];
    assert.equal(vg.owner, "k8s-owner");
    assert.equal(vg.provisionedTiB, 3); // 2 TiB + 1 TiB of virtual disk
    assert.equal(vg.consumedTiB, 1); // 1 TiB of partition used
    // They do not leak into per-VM totals, and the orphan row is reported.
    assert.ok(Math.abs(sum(parsed.vms.map((v) => v.storageProvisionedTiB)) - TRUTH.provisionedTiB) < 1e-9);
    assert.ok(parsed.notes.some((n) => /not part of a volume group/.test(n)));
    assert.ok(parsed.notes.some((n) => /volume group/.test(n)));
  });

  it("does not make a volume group of a disk whose VM is in vInfo", () => {
    const parsed = parse("collector_excel", collectorSheets({ vDisk: perDisk("UUID", "Capacity (MiB)", DISK_GIB).map((r) => ({ ...r, "Volume Group Disk": "True" })) }));
    assert.deepEqual(parsed.volumeGroups, []);
    assertTruth(parsed, "owned disks flagged as volume groups");
  });
});

// --- host core resolution -----------------------------------------------------

describe("host core resolution", () => {
  it("does not double-count when '# Cores' is already the socket total", () => {
    const sheets = DIALECTS.find((d) => d.name === "RVTools canonical")!.sheets;
    const parsed = parse("rvtools", {
      ...sheets,
      vHost: rvHosts.map(({ "Cores per CPU": _cps, ...rest }) => rest),
    });
    assert.equal(parsed.totalCpuCores, TRUTH.hostCores);
  });
});

// --- obfuscated exports -------------------------------------------------------

describe("obfuscated exports", () => {
  const rvSheets = DIALECTS.find((d) => d.name === "RVTools canonical")!.sheets;

  it("keeps clusters distinct when their names collide", () => {
    const parsed = parse("rvtools", {
      ...rvSheets,
      vHost: [
        { Host: "a", Cluster: "##h", "# CPU": 2, "Cores per CPU": 12, "# Memory": 786432 },
        { Host: "b", Cluster: "##h", "# CPU": 2, "Cores per CPU": 12, "# Memory": 786432 },
      ],
      vInfo: rvInfo(DECOY_GIB).map((v) => ({ ...v, Cluster: "##h" })),
    });
    assert.equal(parsed.clusterDetails.length, 1);
    assert.equal(parsed.clusterDetails[0].hosts, 2);
    assert.ok(parsed.clusterDetails[0].id, "cluster must carry an id");
  });

  it("does not merge same-named clusters that live in different datacenters", () => {
    const host = (name: string, dc: string) => ({
      Host: name,
      Cluster: "Production",
      Datacenter: dc,
      "# CPU": 2,
      "Cores per CPU": 12,
      "# Memory": 786432,
    });
    const parsed = parse("rvtools", {
      ...rvSheets,
      vHost: [
        host("east-1", "East"),
        host("east-2", "East"),
        host("east-3", "East"),
        host("east-4", "East"),
        host("west-1", "West"),
        host("west-2", "West"),
        host("west-3", "West"),
        host("west-4", "West"),
      ],
      vInfo: rvInfo(DECOY_GIB).map((v, i) => ({
        ...v,
        Cluster: "Production",
        Datacenter: i % 2 === 0 ? "East" : "West",
        Host: i % 2 === 0 ? "east-1" : "west-1",
      })),
    });
    assert.equal(parsed.clusterDetails.length, 2, "two datacenters must stay two clusters");
    for (const cluster of parsed.clusterDetails) assert.equal(cluster.hosts, 4);
    assert.equal(new Set(parsed.clusterDetails.map((c) => c.name)).size, 2, "labels must be distinguishable");
  });

  it("gives every cluster a unique id even when display names repeat", () => {
    const parsed = parse(
      "collector_excel",
      collectorSheets({
        vCluster: [
          { MOID: "domain-c1", "Cluster Name": "########sat.com" },
          { MOID: "domain-c2", "Cluster Name": "########sat.com" },
        ],
        vHosts: [
          { MOID: "h1", Cluster: "domain-c1", Name: "a", CPUs: 2, "Cores per CPU": 12, "Memory Size": HOST_RAM_GIB },
          { MOID: "h2", Cluster: "domain-c2", Name: "b", CPUs: 2, "Cores per CPU": 12, "Memory Size": HOST_RAM_GIB },
        ],
        vInfo: collectorInfo.map((v, i) => ({ ...v, "Host MOID": i % 2 === 0 ? "h1" : "h2" })),
      }),
    );
    assert.equal(parsed.clusterDetails.length, 2);
    assert.equal(new Set(parsed.clusterDetails.map((c) => c.id)).size, 2, "cluster ids must be unique");
    assert.equal(new Set(parsed.clusterDetails.map((c) => c.name)).size, 2, "colliding names must be disambiguated");
  });
});

// --- whole-environment gate ---------------------------------------------------

describe("plausibility gate", () => {
  const base = {
    vms: 200,
    hosts: 8,
    vcpu: 800,
    vmRamGiB: 3200,
    vmStorageProvisionedTiB: 19.5,
    vmStorageConsumedTiB: 11.7,
    hostCores: 192,
    hostRamGiB: 6144,
  };

  it("passes a normal environment", () => {
    assert.deepEqual(checkPlausibility(base), []);
  });

  it("catches storage inflated by a unit slip", () => {
    const issues = checkPlausibility({ ...base, vmStorageProvisionedTiB: 25_165_824, vmStorageConsumedTiB: 15_000_000 });
    assert.ok(issues.some((i) => i.field === "Storage per VM"), JSON.stringify(issues));
  });

  it("catches consumed exceeding provisioned", () => {
    const issues = checkPlausibility({ ...base, vmStorageConsumedTiB: 19_500 });
    assert.ok(issues.some((i) => i.field.startsWith("Consumed")), JSON.stringify(issues));
  });

  it("catches doubled host cores", () => {
    const issues = checkPlausibility({ ...base, hostCores: 8000 });
    assert.ok(issues.some((i) => i.field === "Cores per host"), JSON.stringify(issues));
  });
});

describe("build suppression", () => {
  it("blocks the recommendation when the parse carries a plausibility issue", () => {
    const parsed = parse("collector_excel", collectorSheets());
    parsed.plausibility = [{ field: "Storage per VM", observed: "1,200 TiB", expected: "<= 256 TiB", detail: "unit slip" }];
    const rec = recommendNx(parsed, DEFAULT_NX_SETTINGS);
    assert.ok(rec.blockers.length > 0, "blockers must propagate to the recommendation");
  });
});
