// Workbook readers for Nutanix Collector, RVTools and LiveOptics exports.
//
// Column names and units vary by tool and by version, and obfuscated exports
// repeat cluster and VM names. Two rules follow from that:
//   * units are resolved through `sizer-units` (magnitude-checked), never from a
//     header alone, and every decision is recorded in the parse audit;
//   * identity is never a name — clusters carry generated ids.

import * as XLSX from "xlsx";
import {
  emptyPowerSlice,
  type HostNic,
  type HostRecord,
  type ObservedLoad,
  type ParseAudit,
  type ParsedCluster,
  type ParsedEnvironment,
  type PowerSlice,
  type SizerSource,
  type TopVm,
  type UtilizationBasis,
  type VmCpuUsage,
  type VmRecord,
  type VolumeGroupRecord,
} from "@/lib/simple-sizer-core";
import {
  GIB_PER_TIB,
  PLAUSIBLE,
  checkPlausibility,
  resolveCapacity,
  toGiB,
  type Plausibility,
  type Unit,
  type UnitResolution,
} from "@/lib/sizer-units";

class ParseWorkbookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseWorkbookError";
  }
}

const TOP_VM_COUNT = 8;
const TOP_VM_PER_CLUSTER = 5;
const GUEST_OS_COUNT = 6;

// "%" is preserved as a token rather than stripped. Without this, the candidate
// "% Memory" collapses to "memory" and happily matches the *capacity* column
// "Memory (KiB)" — which is how a host once reported 536,576,864% memory used.
function norm(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/%/g, "pct")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function toNum(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // Strip thousands separators and any trailing unit text ("1,024 MiB").
  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .replace(/[^0-9.eE+-]/g, "")
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string {
  return String(value ?? "").trim();
}

function headersFor(rows: Record<string, unknown>[]): string[] {
  // Later rows can carry keys the first row lacks when cells were blank.
  const seen = new Set<string>();
  for (const row of rows.slice(0, 25)) {
    for (const key of Object.keys(row)) seen.add(key);
  }
  return Array.from(seen);
}

// Physical NICs per host. Optional and additive: no export is required to carry
// them, and nothing here feeds the sizing maths.
const NIC_COUNT_HEADERS = ["# NICs", "NICs", "NIC Count", "Number of NICs", "Num NICs", "# Network Adapters", "Network Adapters"];
const NIC_SHEETS = ["vNIC", "vNICs", "vPNIC", "vHostNIC", "vPhysicalNIC", "Host NICs", "NICs"];

function buildNicLookup(workbook: XLSX.WorkBook): (hostKeys: string[]) => HostNic[] {
  const sheet = rowsFromSheet(workbook, NIC_SHEETS);
  if (!sheet.rows.length) return () => [];
  const headers = headersFor(sheet.rows);
  const hostCol = firstHeader(headers, ["Host", "Host Name", "Hostname", "Host MOID"]);
  const nameCol = firstHeader(headers, ["Device", "Network Adapter", "Adapter", "NIC", "Name"]);
  const speedCol = firstHeader(headers, ["Speed (Mbps)", "Link Speed", "Speed"]);
  const driverCol = firstHeader(headers, ["Driver"]);
  const macCol = firstHeader(headers, ["MAC", "MAC Address"]);
  if (!hostCol) return () => [];
  const byHost = new Map<string, HostNic[]>();
  for (const row of sheet.rows) {
    const key = str(row[hostCol]).toLowerCase();
    if (!key) continue;
    const speed = speedCol ? toNum(row[speedCol]) : 0;
    const nic: HostNic = {
      name: str(nameCol ? row[nameCol] : "") || `nic-${(byHost.get(key)?.length ?? 0) + 1}`,
      speedMbps: speed > 0 ? speed : null,
      driver: str(driverCol ? row[driverCol] : "") || null,
      mac: str(macCol ? row[macCol] : "") || null,
    };
    byHost.set(key, [...(byHost.get(key) ?? []), nic]);
  }
  return (hostKeys) => {
    for (const k of hostKeys) {
      const hit = byHost.get(k.toLowerCase());
      if (hit) return hit;
    }
    return [];
  };
}

function hostNics(
  count: number,
  adapters: HostNic[],
): { count: number | null; adapters: HostNic[] } | null {
  const n = count > 0 ? count : adapters.length > 0 ? adapters.length : null;
  return n == null ? null : { count: n, adapters };
}

function firstHeader(headers: string[], candidates: string[]): string | null {
  const normalized = headers.map((h) => [norm(h), h] as const);
  // Exact match first, then a contains-match so "Capacity (MiB) " style
  // variations and prefixed columns still land.
  for (const candidate of candidates) {
    const target = norm(candidate);
    const hit = normalized.find(([n]) => n === target);
    if (hit) return hit[1];
  }
  for (const candidate of candidates) {
    const target = norm(candidate);
    if (target.length < 4) continue;
    // A percentage candidate may only land on a percentage header, and vice
    // versa. Otherwise a loose substring lets a rate match a capacity.
    const wantsPct = target.includes("pct");
    const hit = normalized.find(([n]) => n.includes(target) && n.includes("pct") === wantsPct);
    if (hit) return hit[1];
  }
  return null;
}

function sheetByName(workbook: XLSX.WorkBook, names: string[]): { sheet: XLSX.WorkSheet; name: string } | null {
  const normalized = new Map(workbook.SheetNames.map((n) => [norm(n), n]));
  for (const name of names) {
    const found = normalized.get(norm(name));
    if (found) return { sheet: workbook.Sheets[found], name: found };
  }
  return null;
}

function rowsFromSheet(workbook: XLSX.WorkBook, names: string[]): { rows: Record<string, unknown>[]; name: string } {
  const found = sheetByName(workbook, names);
  if (!found) return { rows: [], name: names[0] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(found.sheet, { defval: "" });
  return { rows, name: found.name };
}

// "poweredOn" / "Running" / "on" all mean the same thing across export formats.
// Anything unrecognised returns null so the caller can report "not in the export"
// instead of silently counting every VM as running.
function parsePowerState(raw: unknown): boolean | null {
  const s = String(raw ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return null;
  if (s === "on" || s === "poweredon" || s === "running" || s === "true" || s === "up") return true;
  if (s === "off" || s === "poweredoff" || s === "stopped" || s === "false" || s === "down") return false;
  if (s.includes("poweredon")) return true;
  if (s.includes("poweredoff") || s.includes("suspend")) return false;
  return null;
}

// ---------------------------------------------------------------------------
// Unit registry and unit-resolved column reader
// ---------------------------------------------------------------------------

/**
 * Units for columns whose header prints none, keyed by tool, sheet and exact
 * header. Each entry is documented from a real export; anything absent here and
 * unlabelled in the header is left unresolved rather than guessed.
 */
const UNIT_REGISTRY: { source: SizerSource; sheet: string; header: string; unit: Unit; evidence: string }[] = [
  {
    source: "collector_excel",
    sheet: "vhosts",
    header: "Memory Size",
    unit: "GiB",
    evidence: "NX-8035-G7 hosts with 384 GiB of DIMMs report 376.07; hosts with 256/384 GiB report 255.873/383.873",
  },
  { source: "rvtools", sheet: "vhost", header: "# Memory", unit: "MiB", evidence: "RVTools reports host memory in MiB" },
  { source: "rvtools", sheet: "vinfo", header: "Memory", unit: "MiB", evidence: "RVTools reports VM memory in MiB" },
];

// Usage columns that print no "%" but hold percentages.
const PERCENT_REGISTRY: { source: SizerSource; sheet: string; header: string }[] = [
  { source: "collector_excel", sheet: "vhosts", header: "CPU Usage" },
  { source: "collector_excel", sheet: "vhosts", header: "Memory Usage" },
];

function registryUnit(source: SizerSource, sheet: string, header: string | null): Unit | undefined {
  if (!header) return undefined;
  return UNIT_REGISTRY.find((r) => r.source === source && norm(r.sheet) === norm(sheet) && norm(r.header) === norm(header))?.unit;
}

function isPercentColumn(source: SizerSource, sheet: string, header: string | null): boolean {
  if (!header) return false;
  if (header.includes("%")) return true;
  return PERCENT_REGISTRY.some((r) => r.source === source && norm(r.sheet) === norm(sheet) && norm(r.header) === norm(header));
}

type Capacity = {
  resolution: UnitResolution;
  // Convert one raw cell of this column to GiB.
  valueGiB: (row: Record<string, unknown>) => number;
};

const NO_CAPACITY: Capacity = {
  resolution: { header: null, unit: null, totalGiB: null, perEntityGiB: null, confidence: "unresolved", note: "" },
  valueGiB: () => 0,
};

/**
 * Find a capacity column and settle its unit from the header, or from the
 * registry when the header prints none. Magnitude never changes the unit; an
 * impossible result is flagged so the build is blocked.
 */
function readCapacity(
  rows: Record<string, unknown>[],
  candidates: string[],
  band: Plausibility,
  entities: number,
  audit: ParseAudit[],
  field: string,
  sheet: string,
  source: SizerSource,
): Capacity {
  const header = firstHeader(headersFor(rows), candidates);
  if (!header) {
    audit.push({ field, sheet, column: null, unit: null, confidence: "unresolved", note: `No column matched for ${field}.` });
    return NO_CAPACITY;
  }
  const values = rows.map((row) => toNum(row[header]));
  const resolution = resolveCapacity(header, values, entities, band, registryUnit(source, sheet, header));
  const unit: Unit | null = resolution.unit;
  const implausible = resolution.note.includes("impossible");

  // Real exports carry corrupt rows. A single row beyond what one entity could
  // physically hold is excluded from the totals, and the exclusion is reported.
  const ceilingGiB = band.max;
  let dropped = 0;
  let droppedGiB = 0;
  if (unit) {
    for (const value of values) {
      const gib = toGiB(value, unit);
      if (gib > ceilingGiB) {
        dropped += 1;
        droppedGiB += gib;
      }
    }
  }

  audit.push({
    field,
    sheet,
    column: resolution.header,
    unit: resolution.unit,
    confidence: resolution.confidence,
    implausible,
    note:
      dropped > 0
        ? `${resolution.note} Excluded ${dropped} corrupt row${dropped === 1 ? "" : "s"} above ${Math.round((ceilingGiB * GIB_TO_DECIMAL_GB) / 1000).toLocaleString()} TB (${Math.round((droppedGiB * GIB_TO_DECIMAL_GB) / 1000).toLocaleString()} TB of impossible values).`
        : resolution.note,
  });

  return {
    resolution,
    valueGiB: unit
      ? (row) => {
          const gib = toGiB(toNum(row[header]), unit);
          return gib > ceilingGiB ? 0 : gib;
        }
      : () => 0,
  };
}

const GIB_TO_DECIMAL_GB = 1024 ** 3 / 1e9;

function distinctCount(rows: Record<string, unknown>[], key: (row: Record<string, unknown>) => string): number {
  const seen = new Set<string>();
  for (const row of rows) {
    const k = key(row);
    if (k) seen.add(k);
  }
  return seen.size;
}

// ---------------------------------------------------------------------------
// Shared shaping helpers
// ---------------------------------------------------------------------------

type VmFacts = { vcpu: number; ramGiB: number; provisionedTiB: number; consumedTiB: number };

function addToSlice(slice: PowerSlice, vm: VmFacts): void {
  slice.vms += 1;
  slice.vcpu += vm.vcpu;
  slice.ramGiB += vm.ramGiB;
  slice.diskProvisionedTiB += vm.provisionedTiB;
  slice.partitionConfiguredTiB += vm.provisionedTiB;
  slice.partitionConsumedTiB += vm.consumedTiB;
}

function roundSlice(slice: PowerSlice): PowerSlice {
  return {
    vms: slice.vms,
    vcpu: Math.round(slice.vcpu),
    ramGiB: Number(slice.ramGiB.toFixed(2)),
    diskProvisionedTiB: Number(slice.diskProvisionedTiB.toFixed(2)),
    partitionConfiguredTiB: Number(slice.partitionConfiguredTiB.toFixed(2)),
    partitionConsumedTiB: Number(slice.partitionConsumedTiB.toFixed(2)),
  };
}

function sumSlices(slices: PowerSlice[]): PowerSlice {
  return slices.reduce((acc, s) => {
    acc.vms += s.vms;
    acc.vcpu += s.vcpu;
    acc.ramGiB += s.ramGiB;
    acc.diskProvisionedTiB += s.diskProvisionedTiB;
    acc.partitionConfiguredTiB += s.partitionConfiguredTiB;
    acc.partitionConsumedTiB += s.partitionConsumedTiB;
    return acc;
  }, emptyPowerSlice());
}

// Guest OS strings are long and inconsistent ("Microsoft Windows Server 2019
// (64-bit)"). Collapse to a family so the mix reads at a glance.
function osFamily(raw: unknown): string {
  const s = str(raw);
  if (!s) return "Unknown";
  const l = s.toLowerCase();
  if (l.includes("windows")) {
    const server = l.match(/server\s*(\d{4})/);
    if (server) return `Windows Server ${server[1]}`;
    const desktop = l.match(/windows\s*(\d+|xp|vista)/);
    if (desktop) return `Windows ${desktop[1] === "xp" ? "XP" : desktop[1]}`;
    return "Windows (other)";
  }
  if (l.includes("rhel") || l.includes("red hat")) return "Red Hat Enterprise Linux";
  if (l.includes("ubuntu")) return "Ubuntu";
  if (l.includes("centos")) return "CentOS";
  if (l.includes("suse") || l.includes("sles")) return "SUSE";
  if (l.includes("oracle")) return "Oracle Linux";
  if (l.includes("debian")) return "Debian";
  if (l.includes("photon")) return "VMware Photon";
  if (l.includes("freebsd")) return "FreeBSD";
  if (l.includes("linux")) return "Linux (other)";
  return s.length > 32 ? `${s.slice(0, 32)}…` : s;
}

function rankGuestOs(counts: Map<string, number>): { name: string; count: number }[] {
  const sorted = Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  if (sorted.length <= GUEST_OS_COUNT) return sorted;
  const head = sorted.slice(0, GUEST_OS_COUNT);
  const tail = sorted.slice(GUEST_OS_COUNT).reduce((sum, o) => sum + o.count, 0);
  return [...head, { name: `Other (${sorted.length - GUEST_OS_COUNT} types)`, count: tail }];
}

function rankTopVms(vms: TopVm[], limit = TOP_VM_COUNT): TopVm[] {
  return [...vms].sort((a, b) => b.vcpu - a.vcpu || b.ramGiB - a.ramGiB).slice(0, limit);
}

/**
 * Reader for a percentage usage column. The scale is fixed by the header ("%")
 * or the registry, never by magnitude: a column whose every value is under
 * 1.5% is still a percentage. Values outside 0-100 are dropped, not rescaled.
 */
function makeUtilization(
  rows: Record<string, unknown>[],
  header: string | null,
  isPercent: boolean,
): { perRow: (row: Record<string, unknown>) => number | null; average: number | null; dropped: number } {
  let dropped = 0;
  const perRow = (row: Record<string, unknown>): number | null => {
    if (!header || !isPercent) return null;
    const raw = row[header];
    if (raw === "" || raw == null) return null;
    const pct = toNum(raw);
    if (!Number.isFinite(pct) || pct < 0) return null;
    if (pct > 100) return null;
    return pct;
  };
  const values: number[] = [];
  for (const row of rows) {
    const v = perRow(row);
    if (v != null) values.push(v);
    else if (header && isPercent && toNum(row[header]) > 100) dropped += 1;
  }
  const average = values.length ? Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(1)) : null;
  return { perRow, average, dropped };
}

function hasValues(rows: Record<string, unknown>[], header: string | null): boolean {
  return !!header && rows.some((row) => row[header] !== "" && row[header] != null && toNum(row[header]) > 0);
}

// Cluster names collide constantly in obfuscated exports ("##h" twice). Names
// stay as-is for display; a suffix disambiguates only when there's a genuine
// clash, and identity always comes from the generated id.
function labelCollisions(names: string[]): string[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const seen = new Map<string, number>();
  return names.map((name) => {
    if ((counts.get(name) ?? 0) <= 1) return name;
    const n = (seen.get(name) ?? 0) + 1;
    seen.set(name, n);
    return `${name} (${n})`;
  });
}

// Sockets x cores-per-socket, or a total-cores column — whichever produces a
// believable host. RVTools' "# Cores" is already the total, so multiplying it by
// the socket count silently doubles every core in the estate.
function resolveHostCores(sockets: number, coresPerSocket: number, totalCores: number): { cores: number; sockets: number; coresPerSocket: number } {
  const believable = (v: number) => v >= 2 && v <= 512;
  const fromSockets = sockets > 0 && coresPerSocket > 0 ? sockets * coresPerSocket : 0;
  if (believable(fromSockets)) {
    return { cores: fromSockets, sockets, coresPerSocket };
  }
  if (believable(totalCores)) {
    const s = sockets > 0 ? sockets : 2;
    return { cores: totalCores, sockets: s, coresPerSocket: Math.round(totalCores / s) };
  }
  if (fromSockets > 0) return { cores: fromSockets, sockets, coresPerSocket };
  return { cores: totalCores, sockets: sockets || 0, coresPerSocket: coresPerSocket || 0 };
}

function buildHardwareGroups(hosts: HostRecord[], clusterStorageTiB: number) {
  const map = new Map<string, HostRecord[]>();
  for (const host of hosts) {
    // Group by the full spec, not just the model — a cluster can hold two
    // batches of the same model with different CPUs or memory.
    const key = [host.vendor ?? "", host.model, host.cpuModel ?? "", host.sockets, host.coresPerSocket, Math.round(host.ramGiB)].join("|");
    map.set(key, [...(map.get(key) ?? []), host]);
  }
  const totalHosts = Math.max(1, hosts.length);
  return Array.from(map.values()).map((group) => {
    const first = group[0];
    const cores = group.reduce((s, h) => s + h.cores, 0);
    const ram = group.reduce((s, h) => s + h.ramGiB, 0);
    const storage = (clusterStorageTiB * group.length) / totalHosts;
    return {
      model: first.model,
      vendor: first.vendor,
      cpuModel: first.cpuModel,
      hostCount: group.length,
      socketsPerHost: first.sockets,
      coresPerSocket: first.coresPerSocket,
      coresPerHost: Number((cores / group.length).toFixed(1)),
      ramPerHostGiB: Number((ram / group.length).toFixed(1)),
      storagePerHostTiB: Number((storage / group.length).toFixed(2)),
      cpuCores: Number(cores.toFixed(1)),
      memoryGiB: Number(ram.toFixed(1)),
      storageTiB: Number(storage.toFixed(2)),
    };
  });
}

function averageOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!present.length) return null;
  return Number((present.reduce((s, v) => s + v, 0) / present.length).toFixed(1));
}

/**
 * Turn per-host utilization into the load the estate actually places on its
 * hardware: physical cores busy, and guest memory touched.
 *
 * Coverage is measured in cores rather than host count, because one unreported
 * 96-core host matters more than one unreported 16-core host. Reporting hosts
 * are extrapolated to the whole cluster, which is only sound while coverage is
 * high — the sizer refuses to use the figure below `MIN_OBSERVED_COVERAGE`.
 */
function observedFromHosts(hosts: HostRecord[], basis: UtilizationBasis, source: string): ObservedLoad | null {
  const totalCores = hosts.reduce((s, h) => s + h.cores, 0);
  const totalRam = hosts.reduce((s, h) => s + h.ramGiB, 0);
  const withCpu = hosts.filter((h) => h.cpuUtilPct != null && h.cores > 0);
  const withMem = hosts.filter((h) => h.memoryUtilPct != null && h.ramGiB > 0);
  if (!withCpu.length && !withMem.length) return null;

  const cpuCovered = withCpu.reduce((s, h) => s + h.cores, 0);
  const cpuCoverage = totalCores > 0 ? cpuCovered / totalCores : 0;
  const busyCores = withCpu.reduce((s, h) => s + h.cores * ((h.cpuUtilPct ?? 0) / 100), 0);

  const memCovered = withMem.reduce((s, h) => s + h.ramGiB, 0);
  const memCoverage = totalRam > 0 ? memCovered / totalRam : 0;
  const busyRam = withMem.reduce((s, h) => s + h.ramGiB * ((h.memoryUtilPct ?? 0) / 100), 0);

  return {
    cpuPCores: cpuCoverage > 0 ? Number((busyCores / cpuCoverage).toFixed(2)) : null,
    ramGiB: memCoverage > 0 ? Number((busyRam / memCoverage).toFixed(2)) : null,
    basis,
    coverage: Number(cpuCoverage.toFixed(3)),
    source,
  };
}

// ---------------------------------------------------------------------------
// Shared VM storage assembly
// ---------------------------------------------------------------------------

/**
 * Storage per VM, the same way for every tool:
 *   provisioned = sum of the VM's virtual disk capacities;
 *   consumed    = sum of the VM's guest partition used space, or, when the guest
 *                 reported no partitions, the tool's VM-level used column.
 * Rows whose VM is not in the inventory but which belong to a volume group are
 * kept as unowned volume groups; any other unmatched row is counted and reported.
 */
type StorageTotals = { provisionedGiB: number; consumedGiB: number; hasPartitions: boolean; hasDisks: boolean };

function emptyStorage(): StorageTotals {
  return { provisionedGiB: 0, consumedGiB: 0, hasPartitions: false, hasDisks: false };
}

function isTrue(value: unknown): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

// A name is only a usable join key when it identifies exactly one VM.
function uniqueNameIndex<T>(items: T[], name: (item: T) => string): Map<string, T> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = name(item).toLowerCase();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const index = new Map<string, T>();
  for (const item of items) {
    const key = name(item).toLowerCase();
    if (key && counts.get(key) === 1) index.set(key, item);
  }
  return index;
}

// ---------------------------------------------------------------------------
// Nutanix Collector (Excel export)
// ---------------------------------------------------------------------------

type CollectorVm = {
  uuid: string;
  name: string;
  clusterMoid: string | null;
  poweredOn: boolean | null;
  os: string;
  vcpu: number;
  ramGiB: number;
  storage: StorageTotals;
  consumedSource: "partition" | "vm-level" | "none";
  // Telemetry, when the collection carried any. null means "not measured".
  cpuUsed: VmCpuUsage;
  observedRamGiB: number | null;
};

function emptyCpuUsage(): VmCpuUsage {
  return { average: null, p95: null, peak: null };
}

function maxOrNull(current: number | null, value: number | null): number | null {
  if (value == null) return current;
  return current == null ? value : Math.max(current, value);
}

function parseCollector(workbook: XLSX.WorkBook, fileName: string, fileSizeBytes: number | null): ParsedEnvironment {
  const source: SizerSource = "collector_excel";
  const audit: ParseAudit[] = [];
  const notes: string[] = [];
  const vhosts = rowsFromSheet(workbook, ["vHosts", "vHost"]);
  const vcluster = rowsFromSheet(workbook, ["vCluster"]);
  const vdatacenter = rowsFromSheet(workbook, ["vDataCenter", "vDatacenter"]);
  const vinfo = rowsFromSheet(workbook, ["vInfo"]);
  const vmlist = rowsFromSheet(workbook, ["vmList"]);
  const vcpu = rowsFromSheet(workbook, ["vCPU"]);
  const vmemory = rowsFromSheet(workbook, ["vMemory"]);
  const vpartition = rowsFromSheet(workbook, ["vPartition"]);
  const vdisk = rowsFromSheet(workbook, ["vDisk"]);
  const vsnapshot = rowsFromSheet(workbook, ["vSnapshot"]);

  if (!vhosts.rows.length || !vinfo.rows.length) {
    throw new ParseWorkbookError("Collector Excel requires vHosts and vInfo sheets with data.");
  }

  // --- cluster + host topology ---------------------------------------------
  const hostHeaders = headersFor(vhosts.rows);
  const hostMoidCol = firstHeader(hostHeaders, ["MOID", "Host MOID"]);
  const hostClusterCol = firstHeader(hostHeaders, ["Cluster", "Cluster MOID"]);
  const hostNameCol = firstHeader(hostHeaders, ["Host Name", "Name", "Host", "Hostname"]);
  const hostModelCol = firstHeader(hostHeaders, ["Model", "Host Model", "Server Model"]);
  const hostVendorCol = firstHeader(hostHeaders, ["Vendor", "Manufacturer"]);
  const hostCpuModelCol = firstHeader(hostHeaders, ["CPU Model", "Processor", "CPU Type"]);
  const hostSocketsCol = firstHeader(hostHeaders, ["CPUs", "# CPU", "Sockets", "CPU Sockets"]);
  const hostCoresPerCpuCol = firstHeader(hostHeaders, ["Cores per CPU", "Cores/CPU", "Cores per Socket"]);
  const hostTotalCoresCol = firstHeader(hostHeaders, ["CPU Cores", "# Cores", "Total Cores"]);
  const hostCpuPctCol = firstHeader(hostHeaders, ["CPU Usage %", "CPU Usage"]);
  const hostMemPctCol = firstHeader(hostHeaders, ["Memory Usage %", "Memory Usage"]);
  const hostNicCountCol = firstHeader(hostHeaders, NIC_COUNT_HEADERS);
  const nicsFor = buildNicLookup(workbook);

  const hostMemory = readCapacity(
    vhosts.rows,
    ["Memory Size", "Memory (GiB)", "Memory (MiB)", "Memory (GB)"],
    PLAUSIBLE.hostMemory,
    vhosts.rows.length,
    audit,
    "Host memory",
    vhosts.name,
    source,
  );
  const hostCpuUtil = makeUtilization(vhosts.rows, hostCpuPctCol, isPercentColumn(source, vhosts.name, hostCpuPctCol));
  const hostMemUtil = makeUtilization(vhosts.rows, hostMemPctCol, isPercentColumn(source, vhosts.name, hostMemPctCol));
  for (const [field, col, util] of [
    ["Host CPU usage", hostCpuPctCol, hostCpuUtil],
    ["Host memory usage", hostMemPctCol, hostMemUtil],
  ] as const) {
    audit.push({
      field,
      sheet: vhosts.name,
      column: col,
      unit: col ? "%" : null,
      confidence: !col ? "unresolved" : col.includes("%") ? "header" : "registry",
      note: !col
        ? `No ${field.toLowerCase()} column. Inventory context only; not used for sizing.`
        : `"${col}" read as a percentage${col.includes("%") ? "" : " (the export prints no unit; Collector documents a percentage)"}. Inventory context only; not used for sizing.${util.dropped ? ` ${util.dropped} value(s) above 100 were dropped.` : ""}`,
    });
  }

  const clusterNameByMoid = new Map<string, string>();
  const clusterDcByMoid = new Map<string, string>();
  const clusterHeaders = headersFor(vcluster.rows);
  const clusterMoidCol = firstHeader(clusterHeaders, ["MOID", "Cluster MOID"]);
  const clusterNameCol = firstHeader(clusterHeaders, ["Cluster Name", "Name", "Cluster"]);
  const clusterDcCol = firstHeader(clusterHeaders, ["Datacenter", "DataCenter", "Datacenter Name"]);
  for (const row of vcluster.rows) {
    const moid = str(clusterMoidCol ? row[clusterMoidCol] : "");
    if (!moid) continue;
    clusterNameByMoid.set(moid, str(clusterNameCol ? row[clusterNameCol] : "") || moid);
    const dc = str(clusterDcCol ? row[clusterDcCol] : "");
    if (dc) clusterDcByMoid.set(moid, dc);
  }

  const hostToCluster = new Map<string, string>();
  const hostsByCluster = new Map<string, HostRecord[]>();
  for (const row of vhosts.rows) {
    const hostMoid = str(hostMoidCol ? row[hostMoidCol] : "");
    const clusterMoid = str(hostClusterCol ? row[hostClusterCol] : "") || "__unassigned__";
    if (hostMoid) hostToCluster.set(hostMoid, clusterMoid);
    const { cores, sockets, coresPerSocket } = resolveHostCores(
      hostSocketsCol ? toNum(row[hostSocketsCol]) : 0,
      hostCoresPerCpuCol ? toNum(row[hostCoresPerCpuCol]) : 0,
      hostTotalCoresCol ? toNum(row[hostTotalCoresCol]) : 0,
    );
    const record: HostRecord = {
      name: str(hostNameCol ? row[hostNameCol] : "") || hostMoid || `host-${hostsByCluster.size}`,
      model: str(hostModelCol ? row[hostModelCol] : "") || "Unknown",
      vendor: str(hostVendorCol ? row[hostVendorCol] : "") || null,
      cpuModel: str(hostCpuModelCol ? row[hostCpuModelCol] : "") || null,
      sockets,
      coresPerSocket,
      cores,
      ramGiB: Number(hostMemory.valueGiB(row).toFixed(3)),
      cpuUtilPct: hostCpuUtil.perRow(row),
      memoryUtilPct: hostMemUtil.perRow(row),
      nics: hostNics(
        hostNicCountCol ? toNum(row[hostNicCountCol]) : 0,
        nicsFor([str(hostNameCol ? row[hostNameCol] : ""), hostMoid]),
      ),
    };
    hostsByCluster.set(clusterMoid, [...(hostsByCluster.get(clusterMoid) ?? []), record]);
  }

  // --- VM inventory (vInfo, keyed by UUID) ----------------------------------
  const infoHeaders = headersFor(vinfo.rows);
  const infoUuidCol = firstHeader(infoHeaders, ["UUID", "VM UUID"]);
  const infoNameCol = firstHeader(infoHeaders, ["VM Name", "Name", "VM"]);
  const infoHostCol = firstHeader(infoHeaders, ["Host MOID"]);
  const infoPowerCol = firstHeader(infoHeaders, ["Power State", "Powerstate"]);
  const infoOsCol = firstHeader(infoHeaders, ["Guest OS", "Guest Operating System", "Operating System"]);
  if (!infoUuidCol) throw new ParseWorkbookError("vInfo has no UUID column, so VMs cannot be joined to their resources.");

  const vms = new Map<string, CollectorVm>();
  for (const row of vinfo.rows) {
    const uuid = str(row[infoUuidCol]);
    if (!uuid || vms.has(uuid)) continue;
    const hostMoid = str(infoHostCol ? row[infoHostCol] : "");
    vms.set(uuid, {
      uuid,
      name: str(infoNameCol ? row[infoNameCol] : "") || uuid,
      clusterMoid: hostToCluster.get(hostMoid) ?? null,
      poweredOn: infoPowerCol ? parsePowerState(row[infoPowerCol]) : null,
      os: osFamily(infoOsCol ? row[infoOsCol] : ""),
      vcpu: 0,
      ramGiB: 0,
      storage: emptyStorage(),
      consumedSource: "none",
      cpuUsed: emptyCpuUsage(),
      observedRamGiB: null,
    });
  }
  const vmByName = uniqueNameIndex(Array.from(vms.values()), (vm) => vm.name);

  // vmList names are only trusted where they are unique in vInfo.
  const listHeaders = headersFor(vmlist.rows);
  const listNameCol = firstHeader(listHeaders, ["VM Name", "Name", "VM"]);
  const listPowerCol = firstHeader(listHeaders, ["Power State", "Powerstate"]);
  if (!infoPowerCol && listNameCol && listPowerCol) {
    for (const row of vmlist.rows) {
      const vm = vmByName.get(str(row[listNameCol]).toLowerCase());
      if (vm) vm.poweredOn = parsePowerState(row[listPowerCol]);
    }
  }

  // Resource sheets join on UUID; a name is used only when it is unique.
  const linker = (rows: Record<string, unknown>[]) => {
    const headers = headersFor(rows);
    const uuidCol = firstHeader(headers, ["UUID", "VM UUID"]);
    const nameCol = firstHeader(headers, ["VM Name", "Name", "VM"]);
    return {
      uuidCol,
      nameCol,
      resolve: (row: Record<string, unknown>): CollectorVm | undefined => {
        const uuid = uuidCol ? str(row[uuidCol]) : "";
        if (uuid) return vms.get(uuid);
        return nameCol ? vmByName.get(str(row[nameCol]).toLowerCase()) : undefined;
      },
    };
  };

  // --- vCPU -------------------------------------------------------------------
  const cpuLink = linker(vcpu.rows);
  const cpuHeaders = headersFor(vcpu.rows);
  const cpuCol = firstHeader(cpuHeaders, ["vCPUs", "vCPU", "Num vCPU"]);
  // "CPU Readiness 95th Percentile %" is contention, not usage.
  const notReadiness = (col: string | null) => (col && !norm(col).includes("readiness") ? col : null);
  const cpuStatColumns = {
    p95: notReadiness(firstHeader(cpuHeaders, ["95th Percentile % (Recommended)", "95th Percentile %"])),
    peak: notReadiness(firstHeader(cpuHeaders, ["Peak %"])),
    average: notReadiness(firstHeader(cpuHeaders, ["Average %"])),
  } as const;
  const cpuStatUtil = {
    p95: makeUtilization(vcpu.rows, cpuStatColumns.p95, true),
    peak: makeUtilization(vcpu.rows, cpuStatColumns.peak, true),
    average: makeUtilization(vcpu.rows, cpuStatColumns.average, true),
  };
  if (cpuCol) {
    for (const row of vcpu.rows) {
      const vm = cpuLink.resolve(row);
      if (!vm) continue;
      const rowVcpu = toNum(row[cpuCol]);
      // One row per VM is expected; a repeated row must not double the VM.
      vm.vcpu = Math.max(vm.vcpu, rowVcpu);
      const cores = (util: { perRow: (r: Record<string, unknown>) => number | null }) => {
        const pct = util.perRow(row);
        return pct == null ? null : (rowVcpu * pct) / 100;
      };
      vm.cpuUsed = {
        p95: maxOrNull(vm.cpuUsed.p95, cores(cpuStatUtil.p95)),
        peak: maxOrNull(vm.cpuUsed.peak, cores(cpuStatUtil.peak)),
        average: maxOrNull(vm.cpuUsed.average, cores(cpuStatUtil.average)),
      };
    }
    audit.push({ field: "VM vCPU", sheet: vcpu.name, column: cpuCol, unit: "count", confidence: "header", note: `"${cpuCol}" read as a vCPU count (largest row per VM UUID).` });
  } else {
    audit.push({ field: "VM vCPU", sheet: vcpu.name, column: null, unit: null, confidence: "unresolved", note: "No vCPU column found." });
  }
  const allVmList = Array.from(vms.values());
  const p95Measured = allVmList.filter((vm) => vm.cpuUsed.p95 != null).length;
  audit.push({
    field: "VM CPU usage (95th percentile)",
    sheet: vcpu.name,
    column: cpuStatColumns.p95,
    unit: cpuStatColumns.p95 ? "%" : null,
    confidence: cpuStatColumns.p95 ? "header" : "unresolved",
    note: cpuStatColumns.p95
      ? `vCPU x "${cpuStatColumns.p95}" / 100 = cores used. Measured for ${p95Measured} of ${allVmList.length} VMs; the rest fall back to vCPU / ratio.`
      : "No 95th-percentile CPU column, so every VM falls back to vCPU / ratio.",
  });

  // --- vMemory ------------------------------------------------------------------
  const memLink = linker(vmemory.rows);
  const vmMemory = readCapacity(
    vmemory.rows,
    ["Size (MiB)", "Size (GiB)", "Memory (MiB)", "Memory (GiB)"],
    PLAUSIBLE.vmMemory,
    distinctCount(vmemory.rows, (r) => str(memLink.uuidCol ? r[memLink.uuidCol] : r[memLink.nameCol ?? ""])),
    audit,
    "VM memory (configured)",
    vmemory.name,
    source,
  );
  const memHeaders = headersFor(vmemory.rows);
  const memP95Col = firstHeader(memHeaders, ["95th Percentile % (Recommended)", "95th Percentile %"]);
  const memP95 = makeUtilization(vmemory.rows, memP95Col, true);
  for (const row of vmemory.rows) {
    const vm = memLink.resolve(row);
    if (!vm) continue;
    const sizeGiB = vmMemory.valueGiB(row);
    // Matches the Collector formatter: the largest Size per VM UUID.
    vm.ramGiB = Math.max(vm.ramGiB, sizeGiB);
    const pct = memP95.perRow(row);
    if (pct != null) vm.observedRamGiB = Math.max(vm.observedRamGiB ?? 0, (sizeGiB * pct) / 100);
  }

  // --- storage --------------------------------------------------------------
  type Unowned = { owner: string; name: string; clusterName: string; provisionedGiB: number; consumedGiB: number };
  const unowned = new Map<string, Unowned>();
  let orphanRows = 0;
  const unownedKey = (row: Record<string, unknown>, uuidCol: string | null, nameCol: string | null) =>
    `${uuidCol ? str(row[uuidCol]) : ""}|${nameCol ? str(row[nameCol]) : ""}`;

  const diskLink = linker(vdisk.rows);
  const diskHeaders = headersFor(vdisk.rows);
  const diskVgCol = firstHeader(diskHeaders, ["Volume Group Disk"]);
  const diskVgNameCol = firstHeader(diskHeaders, ["Volume Group Name"]);
  const diskClusterCol = firstHeader(diskHeaders, ["Cluster Name"]);
  const diskCapacity = readCapacity(
    vdisk.rows,
    ["Capacity (MiB)", "Capacity (GiB)"],
    PLAUSIBLE.vmStorage,
    distinctCount(vdisk.rows, (r) => str(diskLink.uuidCol ? r[diskLink.uuidCol] : "")),
    audit,
    "VM storage, provisioned (virtual disk capacity)",
    vdisk.name,
    source,
  );
  for (const row of vdisk.rows) {
    const gib = diskCapacity.valueGiB(row);
    const vm = diskLink.resolve(row);
    if (vm) {
      vm.storage.provisionedGiB += gib;
      vm.storage.hasDisks = true;
      continue;
    }
    if (diskVgCol && isTrue(row[diskVgCol])) {
      const key = unownedKey(row, diskLink.uuidCol, diskLink.nameCol);
      const entry = unowned.get(key) ?? {
        owner: str(diskLink.nameCol ? row[diskLink.nameCol] : "") || "Unknown owner",
        name: str(diskVgNameCol ? row[diskVgNameCol] : ""),
        clusterName: str(diskClusterCol ? row[diskClusterCol] : ""),
        provisionedGiB: 0,
        consumedGiB: 0,
      };
      entry.provisionedGiB += gib;
      unowned.set(key, entry);
    } else if (gib > 0) {
      orphanRows += 1;
    }
  }

  const partLink = linker(vpartition.rows);
  const partHeaders = headersFor(vpartition.rows);
  const partVgCol = firstHeader(partHeaders, ["Volume Group Partition"]);
  const partClusterCol = firstHeader(partHeaders, ["Cluster Name"]);
  const partConsumed = readCapacity(
    vpartition.rows,
    ["Consumed (MiB)", "Consumed (GiB)"],
    PLAUSIBLE.vmStorage,
    distinctCount(vpartition.rows, (r) => str(partLink.uuidCol ? r[partLink.uuidCol] : "")),
    audit,
    "VM storage, consumed (guest partitions)",
    vpartition.name,
    source,
  );
  for (const row of vpartition.rows) {
    const gib = partConsumed.valueGiB(row);
    const vm = partLink.resolve(row);
    if (vm) {
      vm.storage.consumedGiB += gib;
      vm.storage.hasPartitions = true;
      continue;
    }
    if (partVgCol && isTrue(row[partVgCol])) {
      const key = unownedKey(row, partLink.uuidCol, partLink.nameCol);
      const entry = unowned.get(key) ?? {
        owner: str(partLink.nameCol ? row[partLink.nameCol] : "") || "Unknown owner",
        name: "",
        clusterName: str(partClusterCol ? row[partClusterCol] : ""),
        provisionedGiB: 0,
        consumedGiB: 0,
      };
      entry.consumedGiB += gib;
      unowned.set(key, entry);
    } else if (gib > 0) {
      orphanRows += 1;
    }
  }

  // Guests with no partition rows fall back to vmList "Consumed (MiB)".
  const listConsumed = readCapacity(
    vmlist.rows,
    ["Consumed (MiB)", "Consumed (GiB)"],
    PLAUSIBLE.vmStorage,
    vmlist.rows.length,
    audit,
    "VM storage, consumed fallback (VM level)",
    vmlist.name,
    source,
  );
  const listByName = new Map<string, Record<string, unknown>>();
  if (listNameCol) {
    const counts = new Map<string, number>();
    for (const row of vmlist.rows) {
      const k = str(row[listNameCol]).toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    for (const row of vmlist.rows) {
      const k = str(row[listNameCol]).toLowerCase();
      if (counts.get(k) === 1) listByName.set(k, row);
    }
  }
  for (const vm of vms.values()) {
    if (vm.storage.hasPartitions) {
      vm.consumedSource = "partition";
      continue;
    }
    const row = vmByName.has(vm.name.toLowerCase()) ? listByName.get(vm.name.toLowerCase()) : undefined;
    if (row && listConsumed.resolution.unit) {
      vm.storage.consumedGiB = listConsumed.valueGiB(row);
      vm.consumedSource = "vm-level";
    }
  }
  if (orphanRows) notes.push(`${orphanRows} disk/partition row(s) reference a VM missing from vInfo and are not part of a volume group; they are not counted.`);

  // --- aggregate per cluster ------------------------------------------------
  const allVms = Array.from(vms.values());
  const powerStateKnown = allVms.some((vm) => vm.poweredOn != null);
  const clusterMoids = new Set<string>([...hostsByCluster.keys()]);
  for (const vm of allVms) if (vm.clusterMoid) clusterMoids.add(vm.clusterMoid);

  const guestOsCounts = new Map<string, number>();
  const topVmCandidates: TopVm[] = [];
  const vmsByCluster = new Map<string, CollectorVm[]>();
  for (const vm of allVms) {
    guestOsCounts.set(vm.os, (guestOsCounts.get(vm.os) ?? 0) + 1);
    const key = vm.clusterMoid ?? "__unassigned__";
    vmsByCluster.set(key, [...(vmsByCluster.get(key) ?? []), vm]);
  }

  const orderedMoids = Array.from(clusterMoids);
  if (vmsByCluster.has("__unassigned__") && !orderedMoids.includes("__unassigned__")) orderedMoids.push("__unassigned__");
  const displayNames = labelCollisions(
    orderedMoids.map((moid) => clusterNameByMoid.get(moid) ?? (moid === "__unassigned__" ? "Unassigned hosts" : moid)),
  );
  const clusterIdByMoid = new Map(orderedMoids.map((moid, index) => [moid, `cluster-${index}-${moid}`]));
  const vmRecords: VmRecord[] = [];

  const clusterDetails: ParsedCluster[] = orderedMoids.map((moid, index) => {
    const hosts = hostsByCluster.get(moid) ?? [];
    const clusterVms = vmsByCluster.get(moid) ?? [];
    const clusterId = clusterIdByMoid.get(moid)!;
    const slices = { all: emptyPowerSlice(), on: emptyPowerSlice(), off: emptyPowerSlice() };
    let maxVmVcpu = 0;
    let maxVmRamGiB = 0;
    const clusterTopVms: TopVm[] = [];

    for (const vm of clusterVms) {
      const provisionedTiB = vm.storage.provisionedGiB / GIB_PER_TIB;
      const consumedTiB = vm.storage.consumedGiB / GIB_PER_TIB;
      vmRecords.push({
        id: vm.uuid,
        name: vm.name,
        clusterId,
        clusterName: displayNames[index],
        poweredOn: vm.poweredOn,
        os: vm.os,
        vcpu: vm.vcpu,
        ramGiB: vm.ramGiB,
        storageProvisionedTiB: provisionedTiB,
        storageConsumedTiB: consumedTiB,
        consumedSource: vm.consumedSource,
        cpuUsed: vm.cpuUsed,
        ramUsedGiB: vm.observedRamGiB,
      });
      const facts: VmFacts = { vcpu: vm.vcpu, ramGiB: vm.ramGiB, provisionedTiB, consumedTiB };
      addToSlice(slices.all, facts);
      addToSlice(vm.poweredOn === false ? slices.off : slices.on, facts);
      if (vm.vcpu > maxVmVcpu) maxVmVcpu = vm.vcpu;
      if (vm.ramGiB > maxVmRamGiB) maxVmRamGiB = vm.ramGiB;
      const entry: TopVm = {
        name: vm.name,
        cluster: displayNames[index],
        vcpu: Math.round(vm.vcpu),
        ramGiB: vm.ramGiB,
        storageTiB: provisionedTiB,
        poweredOn: vm.poweredOn !== false,
      };
      clusterTopVms.push(entry);
      topVmCandidates.push(entry);
    }

    const all = roundSlice(slices.all);
    const totalCpuCores = hosts.reduce((s, h) => s + h.cores, 0);
    const totalMemoryGiB = hosts.reduce((s, h) => s + h.ramGiB, 0);
    const observed = observedFromHosts(hosts, "average", `${vhosts.name} · host usage columns`);

    return {
      id: clusterId,
      name: displayNames[index],
      datacenter: clusterDcByMoid.get(moid) ?? null,
      moid: moid === "__unassigned__" ? null : moid,
      hosts: hosts.length,
      hostRecords: hosts,
      topVms: rankTopVms(clusterTopVms, TOP_VM_PER_CLUSTER),
      hostCpuUtilPct: averageOrNull(hosts.map((h) => h.cpuUtilPct)),
      hostMemoryUtilPct: averageOrNull(hosts.map((h) => h.memoryUtilPct)),
      totalVms: all.vms,
      avgVcpuPerVm: all.vms > 0 ? Number((all.vcpu / all.vms).toFixed(2)) : 0,
      vcpuPcoreRatio: totalCpuCores > 0 ? Number((all.vcpu / totalCpuCores).toFixed(2)) : 0,
      hardwareModels: buildHardwareGroups(hosts, all.partitionConfiguredTiB),
      aggVcpu: all.vcpu,
      aggRamGiB: all.ramGiB,
      aggStorageProvisionedTiB: all.partitionConfiguredTiB,
      aggStorageConsumedTiB: all.partitionConsumedTiB,
      maxVmVcpu,
      maxVmRamGiB,
      totalCpuCores,
      consumedCpuCores: observed?.cpuPCores ?? null,
      totalMemoryGiB,
      consumedMemoryGiB: observed?.ramGiB ?? null,
      totalStorageTiB: all.partitionConfiguredTiB,
      consumedStorageTiB: all.partitionConsumedTiB,
      observed,
      powerStateKnown,
      all,
      poweredOn: roundSlice(slices.on),
      poweredOff: roundSlice(slices.off),
    };
  });

  // Unowned volume groups attach to a cluster only when its name is unambiguous.
  const clusterIdByName = uniqueNameIndex(
    orderedMoids.map((moid) => ({ moid, name: clusterNameByMoid.get(moid) ?? "" })),
    (c) => c.name,
  );
  const volumeGroups: VolumeGroupRecord[] = Array.from(unowned.values()).map((vg) => ({
    name: vg.name || "Volume group",
    owner: vg.owner,
    clusterId: clusterIdByMoid.get(clusterIdByName.get(vg.clusterName.toLowerCase())?.moid ?? "") ?? null,
    provisionedTiB: vg.provisionedGiB / GIB_PER_TIB,
    consumedTiB: vg.consumedGiB / GIB_PER_TIB,
  }));
  if (volumeGroups.length) {
    notes.push(`${volumeGroups.length} volume group disk set(s) have no VM in vInfo (owner "${volumeGroups[0].owner}"); their storage is included in the build.`);
  }

  notes.unshift("Collector parsed with UUID / Host MOID joins, matching the Collector formatter's Cluster Summary.");
  if (!powerStateKnown) notes.push("No VM power state column found, so every VM is treated as running.");
  const orphans = allVms.filter((vm) => !vm.clusterMoid).length;
  if (orphans > 0) notes.push(`${orphans} VM(s) had no resolvable host and are grouped under "Unassigned hosts".`);

  return finalize({
    source,
    fileName,
    fileSizeBytes,
    datacenters: vdatacenter.rows.length || clusterDcByMoid.size || null,
    snapshots: vsnapshot.rows.length || null,
    guestOs: rankGuestOs(guestOsCounts),
    topVms: rankTopVms(topVmCandidates),
    vms: vmRecords,
    volumeGroups,
    hostCpuUtilPct: hostCpuUtil.average,
    hostMemoryUtilPct: hostMemUtil.average,
    hostCount: vhosts.rows.length,
    powerStateKnown,
    clusterDetails,
    sheetsFound: workbook.SheetNames.slice(),
    audit,
    notes,
  });
}

// ---------------------------------------------------------------------------
// RVTools / LiveOptics
// ---------------------------------------------------------------------------

// Exact sheets and columns per tool, taken from real exports. Each tool's
// storage follows the shared definition (see "Shared VM storage assembly").
type GenericSpec = {
  hostSheets: string[];
  vmSheets: string[];
  vmIdCols: string[];
  vmMemoryCols: string[];
  // Provisioned: a per-disk sheet summed per VM, or a per-VM column.
  diskSheet: { names: string[]; idCols: string[]; capacityCols: string[] } | null;
  vmProvisionedCols: string[];
  // Consumed: guest partitions summed per VM, falling back to a VM-level column.
  partitionSheet: { names: string[]; idCols: string[]; consumedCols: string[] };
  vmUsedCols: string[];
  hostMemoryCols: string[];
};

const GENERIC_SPECS: Record<Exclude<SizerSource, "collector_excel">, GenericSpec> = {
  rvtools: {
    hostSheets: ["vHost"],
    vmSheets: ["vInfo"],
    vmIdCols: ["VM UUID", "VM ID"],
    vmMemoryCols: ["Memory"],
    diskSheet: { names: ["vDisk"], idCols: ["VM UUID", "VM ID"], capacityCols: ["Capacity MiB"] },
    vmProvisionedCols: [],
    partitionSheet: { names: ["vPartition"], idCols: ["VM UUID", "VM ID"], consumedCols: ["Consumed MiB"] },
    vmUsedCols: ["In Use MiB"],
    hostMemoryCols: ["# Memory"],
  },
  liveoptics: {
    hostSheets: ["ESX Hosts"],
    vmSheets: ["VMs"],
    vmIdCols: ["InstanceUUID", "MOB ID"],
    vmMemoryCols: ["Provisioned Memory (MiB)"],
    diskSheet: null,
    vmProvisionedCols: ["Virtual Disk Size (MiB)"],
    partitionSheet: { names: ["VM Disks"], idCols: ["InstanceUUID", "MOB ID"], consumedCols: ["Used (MiB)"] },
    vmUsedCols: ["Virtual Disk Used (MiB)"],
    hostMemoryCols: ["Memory (KiB)"],
  },
};

// Exact-header lookup: tool specs name real columns, so no fuzzy matching.
function exactHeader(headers: string[], candidates: string[]): string | null {
  for (const candidate of candidates) {
    const hit = headers.find((h) => norm(h) === norm(candidate));
    if (hit) return hit;
  }
  return null;
}

function parseGeneric(
  workbook: XLSX.WorkBook,
  source: Exclude<SizerSource, "collector_excel">,
  fileName: string,
  fileSizeBytes: number | null,
): ParsedEnvironment {
  const spec = GENERIC_SPECS[source];
  const audit: ParseAudit[] = [];
  const notes: string[] = [];
  const hostSheet = rowsFromSheet(workbook, spec.hostSheets);
  const vmSheet = rowsFromSheet(workbook, spec.vmSheets);
  const snapshotSheet = rowsFromSheet(workbook, ["vSnapshot"]);
  const datacenterSheet = rowsFromSheet(workbook, ["vDatacenter"]);

  if (!hostSheet.rows.length) {
    throw new ParseWorkbookError(
      `${source === "rvtools" ? "RVTools" : "LiveOptics"} export needs a "${spec.hostSheets[0]}" sheet with data. Sheets found: ${workbook.SheetNames.join(", ")}`,
    );
  }
  if (!vmSheet.rows.length) {
    throw new ParseWorkbookError(
      `${source === "rvtools" ? "RVTools" : "LiveOptics"} export needs a "${spec.vmSheets[0]}" sheet with data. Sheets found: ${workbook.SheetNames.join(", ")}`,
    );
  }

  // --- hosts ---------------------------------------------------------------
  const hostHeaders = headersFor(hostSheet.rows);
  const hostNameCol = firstHeader(hostHeaders, ["Host", "Host Name", "Hostname"]);
  const hostClusterCol = firstHeader(hostHeaders, ["Cluster", "Cluster Name"]);
  const hostDcCol = firstHeader(hostHeaders, ["Datacenter"]);
  const hostVcenterCol = firstHeader(hostHeaders, ["vCenter", "VI SDK Server"]);
  const hostModelCol = firstHeader(hostHeaders, ["Model"]);
  const hostVendorCol = firstHeader(hostHeaders, ["Vendor", "Manufacturer"]);
  const hostCpuModelCol = firstHeader(hostHeaders, ["CPU Model", "CPU Description"]);
  const hostSocketsCol = firstHeader(hostHeaders, ["# CPU", "CPU Sockets"]);
  const hostCoresPerCpuCol = firstHeader(hostHeaders, ["Cores per CPU"]);
  const hostTotalCoresCol = firstHeader(hostHeaders, ["# Cores", "CPU Cores"]);
  const hostCpuPctCol = firstHeader(hostHeaders, ["CPU usage %"]);
  const hostMemPctCol = firstHeader(hostHeaders, ["Memory usage %"]);
  const hostNicCountCol = firstHeader(hostHeaders, NIC_COUNT_HEADERS);
  const nicsFor = buildNicLookup(workbook);
  const hostMemory = readCapacity(
    hostSheet.rows,
    spec.hostMemoryCols,
    PLAUSIBLE.hostMemory,
    hostSheet.rows.length,
    audit,
    "Host memory",
    hostSheet.name,
    source,
  );

  // LiveOptics keeps host utilization on its own sheet; join it per host.
  const perfSheet = source === "liveoptics" ? rowsFromSheet(workbook, ["ESX Performance"]) : { rows: [], name: "" };
  const perfHeaders = headersFor(perfSheet.rows);
  const perfHostCol = firstHeader(perfHeaders, ["Host"]);
  const perfCpuCol = firstHeader(perfHeaders, ["Peak CPU %"]);
  const perfMemCol = firstHeader(perfHeaders, ["Peak Memory %"]);
  const hostCpuUtil = makeUtilization(hostSheet.rows, hostCpuPctCol, isPercentColumn(source, hostSheet.name, hostCpuPctCol));
  const hostMemUtil = makeUtilization(hostSheet.rows, hostMemPctCol, isPercentColumn(source, hostSheet.name, hostMemPctCol));
  const perfCpuUtil = makeUtilization(perfSheet.rows, perfCpuCol, true);
  const perfMemUtil = makeUtilization(perfSheet.rows, perfMemCol, true);
  const perfByHost = new Map<string, { cpu: number | null; mem: number | null }>();
  if (perfHostCol) {
    for (const row of perfSheet.rows) {
      const key = str(row[perfHostCol]).toLowerCase();
      if (key) perfByHost.set(key, { cpu: perfCpuUtil.perRow(row), mem: perfMemUtil.perRow(row) });
    }
  }
  const utilBasis: UtilizationBasis = hostCpuUtil.average != null ? "average" : perfCpuCol ? "peak" : "average";
  const utilSource =
    hostCpuUtil.average != null
      ? `${hostSheet.name} · ${hostCpuPctCol}`
      : perfCpuCol
        ? `${perfSheet.name} · ${perfCpuCol}`
        : `${hostSheet.name} · host usage columns`;
  audit.push({
    field: "Host CPU usage",
    sheet: hostCpuUtil.average != null ? hostSheet.name : perfSheet.name || hostSheet.name,
    column: hostCpuUtil.average != null ? hostCpuPctCol : perfCpuCol,
    unit: "%",
    confidence: hostCpuUtil.average != null || perfCpuCol ? "header" : "unresolved",
    note: "Inventory context only; not used for sizing.",
  });

  // A cluster's identity is the vCenter/datacenter/name triple, not the name.
  const clusterKeyOf = (vcenter: string, datacenter: string, name: string) =>
    [vcenter, datacenter, name].map((part) => part.trim().toLowerCase()).join(" ");
  const hostsByCluster = new Map<string, HostRecord[]>();
  const clusterMeta = new Map<string, { name: string; datacenter: string | null }>();
  const clusterKeyByHostName = new Map<string, string>();
  const keysByClusterName = new Map<string, Set<string>>();

  for (const row of hostSheet.rows) {
    const clusterName = str(hostClusterCol ? row[hostClusterCol] : "") || "Environment";
    const datacenter = str(hostDcCol ? row[hostDcCol] : "");
    const vcenter = str(hostVcenterCol ? row[hostVcenterCol] : "");
    const clusterKey = clusterKeyOf(vcenter, datacenter, clusterName);
    const { cores, sockets, coresPerSocket } = resolveHostCores(
      hostSocketsCol ? toNum(row[hostSocketsCol]) : 0,
      hostCoresPerCpuCol ? toNum(row[hostCoresPerCpuCol]) : 0,
      hostTotalCoresCol ? toNum(row[hostTotalCoresCol]) : 0,
    );
    const hostName = str(hostNameCol ? row[hostNameCol] : "") || `host-${hostsByCluster.size}`;
    const perf = perfByHost.get(hostName.toLowerCase());
    const record: HostRecord = {
      name: hostName,
      model: str(hostModelCol ? row[hostModelCol] : "") || "Unknown",
      vendor: str(hostVendorCol ? row[hostVendorCol] : "") || null,
      cpuModel: str(hostCpuModelCol ? row[hostCpuModelCol] : "") || null,
      sockets,
      coresPerSocket,
      cores,
      ramGiB: Number(hostMemory.valueGiB(row).toFixed(3)),
      cpuUtilPct: hostCpuUtil.perRow(row) ?? perf?.cpu ?? null,
      memoryUtilPct: hostMemUtil.perRow(row) ?? perf?.mem ?? null,
      nics: hostNics(hostNicCountCol ? toNum(row[hostNicCountCol]) : 0, nicsFor([hostName])),
    };
    hostsByCluster.set(clusterKey, [...(hostsByCluster.get(clusterKey) ?? []), record]);
    if (!clusterMeta.has(clusterKey)) clusterMeta.set(clusterKey, { name: clusterName, datacenter: datacenter || null });
    if (hostName) clusterKeyByHostName.set(hostName.toLowerCase(), clusterKey);
    const nameKey = clusterName.toLowerCase();
    keysByClusterName.set(nameKey, (keysByClusterName.get(nameKey) ?? new Set()).add(clusterKey));
  }

  // --- VMs ------------------------------------------------------------------
  const vmHeaders = headersFor(vmSheet.rows);
  const vmNameCol = firstHeader(vmHeaders, ["VM", "VM Name"]);
  const vmIdCol = exactHeader(vmHeaders, spec.vmIdCols);
  const vmClusterCol = firstHeader(vmHeaders, ["Cluster"]);
  const vmDcCol = firstHeader(vmHeaders, ["Datacenter"]);
  const vmVcenterCol = firstHeader(vmHeaders, ["vCenter", "VI SDK Server"]);
  const vmHostCol = firstHeader(vmHeaders, ["Host"]);
  const vmPowerCol = firstHeader(vmHeaders, ["Powerstate", "Power State"]);
  const vmOsCol = firstHeader(vmHeaders, ["OS according to the configuration file", "OS according to the VMware Tools", "VM OS"]);
  const vmVcpuCol = exactHeader(vmHeaders, ["CPUs", "Virtual CPU"]);
  audit.push(
    vmVcpuCol
      ? { field: "VM vCPU", sheet: vmSheet.name, column: vmVcpuCol, unit: "count", confidence: "header", note: `"${vmVcpuCol}" read as a vCPU count.` }
      : { field: "VM vCPU", sheet: vmSheet.name, column: null, unit: null, confidence: "unresolved", note: "No vCPU column found." },
  );
  const vmMemory = readCapacity(
    vmSheet.rows,
    spec.vmMemoryCols,
    PLAUSIBLE.vmMemory,
    vmSheet.rows.length,
    audit,
    "VM memory (configured)",
    vmSheet.name,
    source,
  );
  const vmProvisioned = spec.vmProvisionedCols.length
    ? readCapacity(vmSheet.rows, spec.vmProvisionedCols, PLAUSIBLE.vmStorage, vmSheet.rows.length, audit, "VM storage, provisioned (virtual disk capacity)", vmSheet.name, source)
    : null;
  const vmUsed = readCapacity(
    vmSheet.rows,
    spec.vmUsedCols,
    PLAUSIBLE.vmStorage,
    vmSheet.rows.length,
    audit,
    "VM storage, consumed fallback (VM level)",
    vmSheet.name,
    source,
  );

  // Join key: the VM's id where every sheet carries one, else a unique name.
  const nameCounts = new Map<string, number>();
  for (const row of vmSheet.rows) {
    const n = str(vmNameCol ? row[vmNameCol] : "").toLowerCase();
    nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
  }
  const vmKey = (id: string, name: string): string | null => {
    if (id) return `id:${id}`;
    const n = name.toLowerCase();
    return n && nameCounts.get(n) === 1 ? `name:${n}` : null;
  };

  const sumPerVm = (
    sheet: { rows: Record<string, unknown>[]; name: string },
    idCols: string[],
    capacityCols: string[],
    field: string,
  ): Map<string, number> => {
    const out = new Map<string, number>();
    if (!sheet.rows.length) {
      audit.push({ field, sheet: sheet.name, column: null, unit: null, confidence: "unresolved", note: `Sheet "${sheet.name}" is missing or empty.` });
      return out;
    }
    const headers = headersFor(sheet.rows);
    const idCol = exactHeader(headers, idCols);
    const nameCol = firstHeader(headers, ["VM", "VM Name"]);
    const vmCount = distinctCount(sheet.rows, (r) => str(idCol ? r[idCol] : nameCol ? r[nameCol] : ""));
    const cap = readCapacity(sheet.rows, capacityCols, PLAUSIBLE.vmStorage, vmCount, audit, field, sheet.name, source);
    for (const row of sheet.rows) {
      const key = vmKey(str(idCol ? row[idCol] : ""), str(nameCol ? row[nameCol] : ""));
      if (!key) continue;
      out.set(key, (out.get(key) ?? 0) + cap.valueGiB(row));
    }
    return out;
  };

  const diskGiBByVm = spec.diskSheet
    ? sumPerVm(rowsFromSheet(workbook, spec.diskSheet.names), spec.diskSheet.idCols, spec.diskSheet.capacityCols, "VM storage, provisioned (virtual disk capacity)")
    : null;
  const partGiBByVm = sumPerVm(
    rowsFromSheet(workbook, spec.partitionSheet.names),
    spec.partitionSheet.idCols,
    spec.partitionSheet.consumedCols,
    "VM storage, consumed (guest partitions)",
  );

  const guestOsCounts = new Map<string, number>();
  const topVmCandidates: TopVm[] = [];
  const vmRecords: VmRecord[] = [];
  const vmsByCluster = new Map<string, { facts: VmFacts; entry: TopVm; poweredOn: boolean | null }[]>();
  const soleCluster = hostsByCluster.size === 1 ? Array.from(hostsByCluster.keys())[0] : null;
  let powerStateKnown = false;
  let ambiguousClusterVms = 0;
  let unjoinable = 0;

  function resolveVmClusterKey(row: Record<string, unknown>, clusterName: string): string {
    const hostName = str(vmHostCol ? row[vmHostCol] : "").toLowerCase();
    const viaHost = hostName ? clusterKeyByHostName.get(hostName) : undefined;
    if (viaHost) return viaHost;
    if (clusterName) {
      const triple = clusterKeyOf(str(vmVcenterCol ? row[vmVcenterCol] : ""), str(vmDcCol ? row[vmDcCol] : ""), clusterName);
      if (hostsByCluster.has(triple)) return triple;
      const candidates = keysByClusterName.get(clusterName.toLowerCase());
      if (candidates?.size === 1) return Array.from(candidates)[0];
      if (candidates && candidates.size > 1) ambiguousClusterVms += 1;
      return triple;
    }
    return soleCluster ?? clusterKeyOf("", "", "Environment");
  }

  vmSheet.rows.forEach((row, rowIndex) => {
    const name = str(vmNameCol ? row[vmNameCol] : "") || "Unnamed VM";
    const id = str(vmIdCol ? row[vmIdCol] : "");
    const key = vmKey(id, name);
    if (!key) unjoinable += 1;
    const vmClusterName = str(vmClusterCol ? row[vmClusterCol] : "");
    const clusterKey = resolveVmClusterKey(row, vmClusterName);
    const clusterName = clusterMeta.get(clusterKey)?.name ?? (vmClusterName || "Environment");
    const poweredOn = vmPowerCol ? parsePowerState(row[vmPowerCol]) : null;
    if (poweredOn != null) powerStateKnown = true;

    const provisionedGiB = diskGiBByVm
      ? key
        ? (diskGiBByVm.get(key) ?? 0)
        : 0
      : vmProvisioned
        ? vmProvisioned.valueGiB(row)
        : 0;
    let consumedGiB = 0;
    let consumedSource: VmRecord["consumedSource"] = "none";
    if (key && partGiBByVm.has(key)) {
      consumedGiB = partGiBByVm.get(key) ?? 0;
      consumedSource = "partition";
    } else if (vmUsed.resolution.unit && hasValues([row], vmUsed.resolution.header)) {
      consumedGiB = vmUsed.valueGiB(row);
      consumedSource = "vm-level";
    }

    const facts: VmFacts = {
      vcpu: vmVcpuCol ? toNum(row[vmVcpuCol]) : 0,
      ramGiB: vmMemory.valueGiB(row),
      provisionedTiB: provisionedGiB / GIB_PER_TIB,
      consumedTiB: consumedGiB / GIB_PER_TIB,
    };
    const os = osFamily(vmOsCol ? row[vmOsCol] : "");
    guestOsCounts.set(os, (guestOsCounts.get(os) ?? 0) + 1);
    const entry: TopVm = {
      name,
      cluster: clusterName,
      vcpu: Math.round(facts.vcpu),
      ramGiB: facts.ramGiB,
      storageTiB: facts.provisionedTiB,
      poweredOn: poweredOn !== false,
    };
    topVmCandidates.push(entry);
    vmsByCluster.set(clusterKey, [...(vmsByCluster.get(clusterKey) ?? []), { facts, entry, poweredOn }]);
    vmRecords.push({
      id: `${id || name}#${rowIndex}`,
      name,
      clusterId: clusterKey,
      clusterName,
      poweredOn,
      os,
      vcpu: facts.vcpu,
      ramGiB: facts.ramGiB,
      storageProvisionedTiB: facts.provisionedTiB,
      storageConsumedTiB: facts.consumedTiB,
      consumedSource,
      // Neither RVTools nor LiveOptics carries a 95th-percentile CPU figure.
      cpuUsed: emptyCpuUsage(),
      ramUsedGiB: null,
    });
  });

  audit.push({
    field: "VM CPU usage (95th percentile)",
    sheet: vmSheet.name,
    column: null,
    unit: null,
    confidence: "unresolved",
    note: `${source === "rvtools" ? "RVTools" : "LiveOptics"} exports carry no 95th-percentile CPU figure, so every VM is sized at vCPU / ratio.`,
  });
  if (unjoinable) notes.push(`${unjoinable} VM(s) have no id and share a name with another VM, so their disks and partitions could not be joined.`);
  if (ambiguousClusterVms) notes.push(`${ambiguousClusterVms} VM(s) named a cluster that exists in more than one datacenter and gave no host to join through.`);

  const clusterKeys = Array.from(new Set([...hostsByCluster.keys(), ...vmsByCluster.keys()]));
  const displayNames = labelCollisions(
    clusterKeys.map((key) => clusterMeta.get(key)?.name ?? vmsByCluster.get(key)?.[0]?.entry.cluster ?? "Environment"),
  );
  const clusterIdByKey = new Map(clusterKeys.map((key, index) => [key, `cluster-${index}-${key}`]));
  for (const vm of vmRecords) {
    const rawKey = vm.clusterId ?? "";
    vm.clusterId = clusterIdByKey.get(rawKey) ?? null;
    const index = clusterKeys.indexOf(rawKey);
    if (index >= 0) vm.clusterName = displayNames[index];
  }

  const clusterDetails: ParsedCluster[] = clusterKeys.map((clusterKey, index) => {
    const hosts = hostsByCluster.get(clusterKey) ?? [];
    const members = vmsByCluster.get(clusterKey) ?? [];
    const slices = { all: emptyPowerSlice(), on: emptyPowerSlice(), off: emptyPowerSlice() };
    let maxVmVcpu = 0;
    let maxVmRamGiB = 0;
    for (const { facts, poweredOn } of members) {
      addToSlice(slices.all, facts);
      addToSlice(poweredOn === false ? slices.off : slices.on, facts);
      if (facts.vcpu > maxVmVcpu) maxVmVcpu = facts.vcpu;
      if (facts.ramGiB > maxVmRamGiB) maxVmRamGiB = facts.ramGiB;
    }
    const all = roundSlice(slices.all);
    const totalCpuCores = hosts.reduce((s, h) => s + h.cores, 0);
    const totalMemoryGiB = hosts.reduce((s, h) => s + h.ramGiB, 0);
    const observed = observedFromHosts(hosts, utilBasis, utilSource);
    return {
      id: clusterIdByKey.get(clusterKey)!,
      name: displayNames[index],
      datacenter: clusterMeta.get(clusterKey)?.datacenter ?? null,
      moid: null,
      hosts: hosts.length,
      hostRecords: hosts,
      topVms: rankTopVms(members.map((m) => m.entry), TOP_VM_PER_CLUSTER),
      hostCpuUtilPct: averageOrNull(hosts.map((h) => h.cpuUtilPct)),
      hostMemoryUtilPct: averageOrNull(hosts.map((h) => h.memoryUtilPct)),
      totalVms: all.vms,
      avgVcpuPerVm: all.vms > 0 ? Number((all.vcpu / all.vms).toFixed(2)) : 0,
      vcpuPcoreRatio: totalCpuCores > 0 ? Number((all.vcpu / totalCpuCores).toFixed(2)) : 0,
      hardwareModels: buildHardwareGroups(hosts, all.partitionConfiguredTiB),
      aggVcpu: all.vcpu,
      aggRamGiB: all.ramGiB,
      aggStorageProvisionedTiB: all.partitionConfiguredTiB,
      aggStorageConsumedTiB: all.partitionConsumedTiB,
      maxVmVcpu,
      maxVmRamGiB,
      totalCpuCores,
      consumedCpuCores: observed?.cpuPCores ?? null,
      totalMemoryGiB,
      consumedMemoryGiB: observed?.ramGiB ?? null,
      totalStorageTiB: all.partitionConfiguredTiB,
      consumedStorageTiB: all.partitionConsumedTiB,
      observed,
      powerStateKnown,
      all,
      poweredOn: roundSlice(slices.on),
      poweredOff: roundSlice(slices.off),
    };
  });

  notes.unshift(`Parsed as ${source} from sheets: ${hostSheet.name}, ${vmSheet.name}.`);
  if (!powerStateKnown) notes.push("No VM power state column found, so every VM is treated as running.");

  return finalize({
    source,
    fileName,
    fileSizeBytes,
    datacenters:
      datacenterSheet.rows.length ||
      new Set(Array.from(clusterMeta.values()).map((m) => m.datacenter).filter(Boolean)).size ||
      null,
    snapshots: snapshotSheet.rows.length || null,
    guestOs: rankGuestOs(guestOsCounts),
    topVms: rankTopVms(topVmCandidates),
    vms: vmRecords,
    volumeGroups: [],
    hostCpuUtilPct: hostCpuUtil.average ?? perfCpuUtil.average,
    hostMemoryUtilPct: hostMemUtil.average ?? perfMemUtil.average,
    hostCount: hostSheet.rows.length,
    powerStateKnown,
    clusterDetails,
    sheetsFound: workbook.SheetNames.slice(),
    audit,
    notes,
  });
}

// ---------------------------------------------------------------------------
// Roll-up + sanity gate
// ---------------------------------------------------------------------------

// Estate-wide telemetry from the per-cluster figures. Each cluster has already
// been extrapolated across its own hosts, so the totals add; coverage is the
// weighted mean, and the basis degrades to the weakest one present so the
// headroom applied later matches the softest number in the mix.
const BASIS_STRENGTH: Record<UtilizationBasis, number> = { average: 0, peak: 1, p95: 2 };

function combineObserved(clusters: ParsedCluster[]): ObservedLoad | null {
  const present = clusters.filter((c) => c.observed);
  if (!present.length) return null;

  let weightTotal = 0;
  let weightedCoverage = 0;
  for (const cluster of clusters) {
    const weight = cluster.totalCpuCores > 0 ? cluster.totalCpuCores : cluster.totalVms;
    weightTotal += weight;
    weightedCoverage += weight * (cluster.observed?.coverage ?? 0);
  }

  const cpuClusters = present.filter((c) => c.observed?.cpuPCores != null);
  const ramClusters = present.filter((c) => c.observed?.ramGiB != null);
  const weakest = present.reduce<UtilizationBasis>(
    (acc, c) => (BASIS_STRENGTH[c.observed!.basis] < BASIS_STRENGTH[acc] ? c.observed!.basis : acc),
    "p95",
  );

  return {
    cpuPCores: cpuClusters.length
      ? Number(cpuClusters.reduce((s, c) => s + (c.observed!.cpuPCores ?? 0), 0).toFixed(2))
      : null,
    ramGiB: ramClusters.length ? Number(ramClusters.reduce((s, c) => s + (c.observed!.ramGiB ?? 0), 0).toFixed(2)) : null,
    basis: weakest,
    coverage: weightTotal > 0 ? Number((weightedCoverage / weightTotal).toFixed(3)) : 0,
    source: present[0].observed!.source,
  };
}

function finalize(input: {
  source: SizerSource;
  fileName: string;
  fileSizeBytes: number | null;
  datacenters: number | null;
  snapshots: number | null;
  guestOs: { name: string; count: number }[];
  topVms: TopVm[];
  vms: VmRecord[];
  volumeGroups: VolumeGroupRecord[];
  hostCpuUtilPct: number | null;
  hostMemoryUtilPct: number | null;
  hostCount: number;
  powerStateKnown: boolean;
  clusterDetails: ParsedCluster[];
  sheetsFound: string[];
  audit: ParseAudit[];
  notes: string[];
}): ParsedEnvironment {
  const { clusterDetails } = input;
  const all = roundSlice(sumSlices(clusterDetails.map((c) => c.all)));
  const poweredOn = roundSlice(sumSlices(clusterDetails.map((c) => c.poweredOn)));
  const poweredOff = roundSlice(sumSlices(clusterDetails.map((c) => c.poweredOff)));
  const totalCpuCores = clusterDetails.reduce((s, c) => s + c.totalCpuCores, 0);
  const totalMemoryGiB = clusterDetails.reduce((s, c) => s + c.totalMemoryGiB, 0);
  const observed = combineObserved(clusterDetails);

  const notes = [...input.notes];
  const unresolved = input.audit.filter((a) => a.confidence === "unresolved" && a.column !== null);
  if (unresolved.length) {
    notes.push(`${unresolved.length} column${unresolved.length === 1 ? "" : "s"} could not be read reliably. See the parsed inputs panel.`);
  }

  const unitIssues = input.audit
    .filter((a) => a.implausible)
    .map((a) => ({
      field: a.field,
      observed: `"${a.column}" read as ${a.unit}`,
      expected: "a physically possible value",
      detail: a.note,
    }));
  const plausibility = [...unitIssues, ...checkPlausibility({
    vms: all.vms,
    hosts: input.hostCount,
    vcpu: all.vcpu,
    vmRamGiB: all.ramGiB,
    vmStorageProvisionedTiB: all.partitionConfiguredTiB,
    vmStorageConsumedTiB: all.partitionConsumedTiB,
    hostCores: totalCpuCores,
    hostRamGiB: totalMemoryGiB,
  })];

  return {
    source: input.source,
    sourceDetection: "manual",
    fileName: input.fileName,
    fileSizeBytes: input.fileSizeBytes,
    analyzedAt: new Date().toISOString(),
    datacenters: input.datacenters,
    clusters: clusterDetails.length,
    hosts: input.hostCount,
    totalVms: all.vms,
    avgVcpuPerVm: all.vms > 0 ? Number((all.vcpu / all.vms).toFixed(2)) : 0,
    vcpuPcoreRatio: totalCpuCores > 0 ? Number((all.vcpu / totalCpuCores).toFixed(2)) : 0,
    totalCpuCores: Number(totalCpuCores.toFixed(2)),
    consumedCpuCores: observed?.cpuPCores ?? null,
    totalMemoryGiB: Number(totalMemoryGiB.toFixed(2)),
    consumedMemoryGiB: observed?.ramGiB ?? null,
    totalStorageTiB: all.partitionConfiguredTiB,
    consumedStorageTiB: all.partitionConsumedTiB,
    aggVcpu: all.vcpu,
    aggRamGiB: all.ramGiB,
    aggStorageProvisionedTiB: all.partitionConfiguredTiB,
    aggStorageConsumedTiB: all.partitionConsumedTiB,
    maxVmVcpu: clusterDetails.length ? Math.max(...clusterDetails.map((c) => c.maxVmVcpu ?? 0)) : null,
    maxVmRamGiB: clusterDetails.length ? Math.max(...clusterDetails.map((c) => c.maxVmRamGiB ?? 0)) : null,
    observed,
    powerStateKnown: input.powerStateKnown,
    all,
    poweredOn,
    poweredOff,
    guestOs: input.guestOs,
    topVms: input.topVms,
    vms: input.vms,
    volumeGroups: input.volumeGroups,
    snapshots: input.snapshots,
    hostCpuUtilPct: input.hostCpuUtilPct,
    hostMemoryUtilPct: input.hostMemoryUtilPct,
    sheetsFound: input.sheetsFound,
    audit: input.audit,
    plausibility,
    clusterDetails,
    notes,
  };
}

/**
 * Parse an export into an environment.
 *
 * Runs in the browser — the workbook bytes never leave the machine. Takes raw
 * bytes rather than a Node Buffer so the same code serves a File read via
 * `arrayBuffer()` on the client and a fixture in tests.
 */
export function parseSizerWorkbook(
  fileBytes: ArrayBuffer | Uint8Array,
  source: SizerSource,
  fileName: string,
  fileSizeBytes: number | null = null,
): ParsedEnvironment {
  const bytes = fileBytes instanceof Uint8Array ? fileBytes : new Uint8Array(fileBytes);
  const workbook = XLSX.read(bytes, { type: "array" });
  if (!workbook.SheetNames.length) {
    throw new ParseWorkbookError("Workbook has no sheets.");
  }

  if (source === "collector_excel") {
    const normalized = new Set(workbook.SheetNames.map(norm));
    const missing = ["vhosts", "vinfo"].filter((sheet) => !normalized.has(sheet));
    if (missing.length) {
      throw new ParseWorkbookError(
        `Collector Excel format expected (post-import export). Missing sheets: ${missing.join(", ")}. ` +
          "If you uploaded the raw collector ZIP, export to Excel from Collector first.",
      );
    }
    return parseCollector(workbook, fileName, fileSizeBytes);
  }

  return parseGeneric(workbook, source, fileName, fileSizeBytes);
}

export type { ParsedEnvironment, SizerSource } from "@/lib/simple-sizer-core";
