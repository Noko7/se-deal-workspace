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
// Unit-resolved column reader
// ---------------------------------------------------------------------------

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
 * Find a capacity column and settle its unit once for the whole sheet, using the
 * column's total spread over `entities` to sanity-check what the header claims.
 */
function readCapacity(
  rows: Record<string, unknown>[],
  candidates: string[],
  band: Plausibility,
  entities: number,
  audit: ParseAudit[],
  field: string,
  sheet: string,
  // The unit this tool conventionally uses, when known. Only breaks ties between
  // interpretations that are already plausible (MiB vs MB differ by 2.4%).
  prefer?: Unit,
): Capacity {
  const header = firstHeader(headersFor(rows), candidates);
  if (!header) {
    audit.push({ field, sheet, column: null, unit: null, confidence: "unresolved", note: `No column matched for ${field}.` });
    return NO_CAPACITY;
  }
  const values = rows.map((row) => toNum(row[header]));
  const resolution = resolveCapacity(header, values, entities, band, prefer);
  const unit: Unit | null = resolution.unit;

  // Real exports carry corrupt rows. Once the unit is settled, any single row
  // beyond what one entity could physically hold is discarded rather than
  // allowed to dominate the total — and the drop is reported, never silent.
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
    note:
      dropped > 0
        ? `${resolution.note} Discarded ${dropped} corrupt row${dropped === 1 ? "" : "s"} above ${Math.round(ceilingGiB / 1024).toLocaleString()} TiB (${Math.round(droppedGiB / 1024).toLocaleString()} TiB of impossible values).`
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
 * Classify a "usage" column once for the whole sheet, from its magnitude.
 *
 * Exports disagree about what "CPU Usage" / "Memory Usage" means: RVTools writes
 * a percentage, some tools write a 0–1 fraction, and Nutanix Collector writes an
 * absolute amount. Reading an absolute as a percentage is how 511 GiB of memory
 * became "536,576,864%", so the scale is derived rather than assumed — and when
 * it can't be established, the figure is dropped instead of displayed.
 */
type UsageScale = "percent" | "fraction" | "absolute" | "empty";

function classifyUsage(rows: Record<string, unknown>[], header: string | null): UsageScale {
  if (!header || rows.length === 0) return "empty";
  const values = rows.map((row) => toNum(row[header])).filter((v) => v > 0);
  if (!values.length) return "empty";
  const max = Math.max(...values);
  if (max <= 1.5) return "fraction";
  if (max <= 100) return "percent";
  return "absolute";
}

/**
 * Utilization reader for a whole sheet. The scale is settled once across every
 * row — deciding it per row would let a single large value read as a percentage.
 */
function makeUtilization(
  rows: Record<string, unknown>[],
  header: string | null,
  absoluteRatio?: (row: Record<string, unknown>) => number | null,
): { perRow: (row: Record<string, unknown>) => number | null; average: number | null; scale: UsageScale } {
  const scale = classifyUsage(rows, header);
  const perRow = (row: Record<string, unknown>): number | null => {
    if (!header || scale === "empty") return null;
    const raw = toNum(row[header]);
    if (!(raw > 0)) return null;
    const pct =
      scale === "fraction" ? raw * 100 : scale === "percent" ? raw : (absoluteRatio?.(row) ?? null);
    if (pct == null || !Number.isFinite(pct) || pct <= 0 || pct > 100) return null;
    return Number(pct.toFixed(1));
  };
  const values = rows.map(perRow).filter((v): v is number => v != null);
  const average = values.length ? Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(1)) : null;
  return { perRow, average, scale };
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

/**
 * Same idea from the guest side, for exports whose host rows carry no telemetry
 * but whose per-VM sheets do. A fully busy vCPU occupies about one physical
 * core, so busy vCPUs convert straight across.
 */
function observedFromVms(
  vms: { cpuUsed: VmCpuUsage; observedRamGiB: number | null }[],
  basis: UtilizationBasis,
  source: string,
): ObservedLoad | null {
  const pick = (vm: { cpuUsed: VmCpuUsage }) => vm.cpuUsed.p95 ?? vm.cpuUsed.peak ?? vm.cpuUsed.average;
  const withCpu = vms.filter((v) => pick(v) != null);
  const withRam = vms.filter((v) => v.observedRamGiB != null);
  if (!withCpu.length && !withRam.length) return null;
  const coverage = vms.length > 0 ? withCpu.length / vms.length : 0;
  return {
    cpuPCores: withCpu.length ? Number(withCpu.reduce((s, v) => s + (pick(v) ?? 0), 0).toFixed(2)) : null,
    ramGiB: withRam.length ? Number(withRam.reduce((s, v) => s + (v.observedRamGiB ?? 0), 0).toFixed(2)) : null,
    basis,
    coverage: Number(coverage.toFixed(3)),
    source,
  };
}

/**
 * Pick the best utilization column a sheet offers, in the order a sizer wants
 * them: a 95th percentile trims one-off spikes, a peak is the honest worst case,
 * and an average is the last resort because it hides the busy hour entirely.
 */
function pickUtilizationColumn(
  rows: Record<string, unknown>[],
  candidates: { column: string | null; basis: UtilizationBasis }[],
): { column: string; basis: UtilizationBasis } | null {
  for (const { column, basis } of candidates) {
    if (column && classifyUsage(rows, column) !== "empty") return { column, basis };
  }
  return null;
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
  provisionedTiB: number;
  consumedTiB: number;
  // Telemetry, when the collection carried any. null means "not measured",
  // which is not the same as zero.
  cpuUsed: VmCpuUsage;
  observedRamGiB: number | null;
};

function emptyCpuUsage(): VmCpuUsage {
  return { average: null, p95: null, peak: null };
}

function addUsage(current: number | null, value: number | null): number | null {
  if (value == null) return current;
  return (current ?? 0) + value;
}

function parseCollector(workbook: XLSX.WorkBook, fileName: string, fileSizeBytes: number | null): ParsedEnvironment {
  const audit: ParseAudit[] = [];
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
  const hostMoidCol = firstHeader(hostHeaders, ["MOID", "Host MOID", "Host Moid"]);
  const hostClusterCol = firstHeader(hostHeaders, ["Cluster", "Cluster MOID", "Cluster Name"]);
  const hostNameCol = firstHeader(hostHeaders, ["Name", "Host", "Host Name", "Hostname"]);
  const hostModelCol = firstHeader(hostHeaders, ["Model", "Host Model", "Server Model"]);
  const hostVendorCol = firstHeader(hostHeaders, ["Vendor", "Manufacturer"]);
  const hostCpuModelCol = firstHeader(hostHeaders, ["CPU Model", "Processor", "CPU Type", "CPU"]);
  const hostSocketsCol = firstHeader(hostHeaders, ["CPUs", "# CPU", "Sockets", "CPU Sockets"]);
  const hostCoresPerCpuCol = firstHeader(hostHeaders, ["Cores per CPU", "Cores/CPU", "Cores per Socket"]);
  const hostTotalCoresCol = firstHeader(hostHeaders, ["CPU Cores", "# Cores", "Cores", "Total Cores"]);
  const hostCpuPctCol = firstHeader(hostHeaders, ["CPU Usage %", "CPU Utilization %", "CPU Util %", "% CPU", "CPU Usage"]);
  const hostMemPctCol = firstHeader(hostHeaders, ["Memory Usage %", "Memory Utilization %", "Mem Util %", "% Memory", "Memory Usage"]);

  // Collector reports host "Memory Size" in decimal GB — the Collector-Formatter
  // converts it with 1e9/2^30, so decimal is the right default when the header
  // itself is silent.
  const hostMemory = readCapacity(
    vhosts.rows,
    ["Memory Size", "Memory (GiB)", "Memory (MiB)", "Memory", "RAM", "# Memory", "Physical Memory"],
    PLAUSIBLE.hostMemory,
    vhosts.rows.length,
    audit,
    "Host memory",
    vhosts.name,
    "GB",
  );

  // Collector writes host "Memory Usage" as an absolute amount, not a percentage.
  // Resolve it as a capacity so it can be divided by the host's own memory; if it
  // turns out to already be a percentage, this stays unused.
  const hostMemUsage =
    hostMemPctCol && classifyUsage(vhosts.rows, hostMemPctCol) === "absolute"
      ? readCapacity(vhosts.rows, [hostMemPctCol], PLAUSIBLE.hostMemory, vhosts.rows.length, audit, "Host memory used", vhosts.name, "GB")
      : null;
  const hostMemUtil = makeUtilization(vhosts.rows, hostMemPctCol, (row) => {
    if (!hostMemUsage) return null;
    const capacityGiB = hostMemory.valueGiB(row);
    const usedGiB = hostMemUsage.valueGiB(row);
    return capacityGiB > 0 ? (usedGiB / capacityGiB) * 100 : null;
  });
  const hostCpuUtil = makeUtilization(vhosts.rows, hostCpuPctCol);

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
      ramGiB: Number(hostMemory.valueGiB(row).toFixed(2)),
      cpuUtilPct: hostCpuUtil.perRow(row),
      memoryUtilPct: hostMemUtil.perRow(row),
    };
    hostsByCluster.set(clusterMoid, [...(hostsByCluster.get(clusterMoid) ?? []), record]);
  }

  // --- VM facts -------------------------------------------------------------
  const infoHeaders = headersFor(vinfo.rows);
  const infoUuidCol = firstHeader(infoHeaders, ["UUID", "VM UUID", "Instance UUID"]);
  const infoNameCol = firstHeader(infoHeaders, ["VM Name", "Name", "VM"]);
  const infoHostCol = firstHeader(infoHeaders, ["Host MOID", "Host", "Host Moid"]);
  const infoPowerCol = firstHeader(infoHeaders, ["Power State", "Powerstate", "State", "Power"]);
  const infoOsCol = firstHeader(infoHeaders, ["Guest OS", "Guest Operating System", "Operating System", "OS"]);
  if (!infoUuidCol) throw new ParseWorkbookError("vInfo has no UUID column, so VMs cannot be joined to hosts.");

  const vms = new Map<string, CollectorVm>();
  const uuidByName = new Map<string, string>();
  for (const row of vinfo.rows) {
    const uuid = str(row[infoUuidCol]);
    if (!uuid) continue;
    const name = str(infoNameCol ? row[infoNameCol] : "") || uuid;
    const hostMoid = str(infoHostCol ? row[infoHostCol] : "");
    vms.set(uuid, {
      uuid,
      name,
      clusterMoid: hostToCluster.get(hostMoid) ?? null,
      poweredOn: infoPowerCol ? parsePowerState(row[infoPowerCol]) : null,
      os: osFamily(infoOsCol ? row[infoOsCol] : ""),
      vcpu: 0,
      ramGiB: 0,
      provisionedTiB: 0,
      consumedTiB: 0,
      cpuUsed: emptyCpuUsage(),
      observedRamGiB: null,
    });
    // Names repeat in obfuscated exports — first UUID wins for name lookups.
    if (name && !uuidByName.has(name.toLowerCase())) uuidByName.set(name.toLowerCase(), uuid);
  }

  // Power state sometimes lives in vmList instead of vInfo.
  if (!infoPowerCol && vmlist.rows.length) {
    const listHeaders = headersFor(vmlist.rows);
    const listNameCol = firstHeader(listHeaders, ["VM Name", "Name", "VM"]);
    const listPowerCol = firstHeader(listHeaders, ["Power State", "Powerstate", "State", "Power"]);
    if (listNameCol && listPowerCol) {
      for (const row of vmlist.rows) {
        const uuid = uuidByName.get(str(row[listNameCol]).toLowerCase());
        const vm = uuid ? vms.get(uuid) : undefined;
        if (vm) vm.poweredOn = parsePowerState(row[listPowerCol]);
      }
    }
  }

  // Resource sheets key on UUID, falling back to VM name on older exports.
  const linker = (rows: Record<string, unknown>[]) => {
    const headers = headersFor(rows);
    const uuidCol = firstHeader(headers, ["UUID", "VM UUID"]);
    const nameCol = firstHeader(headers, ["VM Name", "Name", "VM"]);
    return {
      uuidCol,
      nameCol,
      resolve: (row: Record<string, unknown>): CollectorVm | undefined => {
        const uuid = uuidCol ? str(row[uuidCol]) : "";
        if (uuid && vms.has(uuid)) return vms.get(uuid);
        if (!nameCol) return undefined;
        const byName = uuidByName.get(str(row[nameCol]).toLowerCase());
        return byName ? vms.get(byName) : undefined;
      },
      vmCount: (): number => {
        if (uuidCol) return distinctCount(rows, (r) => str(r[uuidCol]));
        if (nameCol) return distinctCount(rows, (r) => str(r[nameCol]));
        return rows.length;
      },
    };
  };

  const cpuLink = linker(vcpu.rows);
  const cpuHeaders = headersFor(vcpu.rows);
  const cpuCol = firstHeader(cpuHeaders, ["vCPUs", "vCPU", "CPUs", "Num vCPU", "# vCPU"]);

  // Every per-VM CPU statistic the export offers, kept separately rather than
  // collapsed to one: an SE choosing between them needs to see the spread.
  // "CPU Readiness 95th Percentile %" is a contention metric, not a usage one,
  // and would otherwise be caught by a loose search for a percentile column.
  const notReadiness = (col: string | null) => (col && !norm(col).includes("readiness") ? col : null);
  const cpuStatColumns = {
    p95: notReadiness(firstHeader(cpuHeaders, ["95th Percentile % (recommended)", "95th Percentile %"])),
    peak: notReadiness(firstHeader(cpuHeaders, ["Peak %"])),
    average: notReadiness(firstHeader(cpuHeaders, ["Average %"])),
  } as const;
  const cpuStatUtil = {
    p95: makeUtilization(vcpu.rows, cpuStatColumns.p95),
    peak: makeUtilization(vcpu.rows, cpuStatColumns.peak),
    average: makeUtilization(vcpu.rows, cpuStatColumns.average),
  };
  // With no percentile columns, Collector still records the VM's current draw
  // against its ceiling, which is a usable if coarse average.
  const overallMhzCol = firstHeader(cpuHeaders, ["Overall CPU (MHz)", "Overall CPU MHz"]);
  const maxMhzCol = firstHeader(cpuHeaders, ["Max CPU (MHz)", "Max CPU MHz"]);

  if (cpuCol) {
    for (const row of vcpu.rows) {
      const vm = cpuLink.resolve(row);
      if (!vm) continue;
      const rowVcpu = toNum(row[cpuCol]);
      vm.vcpu += rowVcpu;

      const fromPct = (util: { perRow: (r: Record<string, unknown>) => number | null }) => {
        const pct = util.perRow(row);
        return pct == null ? null : (rowVcpu * pct) / 100;
      };
      let average = fromPct(cpuStatUtil.average);
      if (average == null && overallMhzCol && maxMhzCol) {
        const max = toNum(row[maxMhzCol]);
        const overall = toNum(row[overallMhzCol]);
        if (max > 0 && overall >= 0) average = rowVcpu * Math.min(1, overall / max);
      }
      vm.cpuUsed = {
        p95: addUsage(vm.cpuUsed.p95, fromPct(cpuStatUtil.p95)),
        peak: addUsage(vm.cpuUsed.peak, fromPct(cpuStatUtil.peak)),
        average: addUsage(vm.cpuUsed.average, average),
      };
    }
    audit.push({ field: "VM vCPU", sheet: vcpu.name, column: cpuCol, unit: "count", confidence: "header", note: `"${cpuCol}" read as a vCPU count.` });
  } else {
    audit.push({ field: "VM vCPU", sheet: vcpu.name, column: null, unit: null, confidence: "unresolved", note: "No vCPU column found, so CPU sizing will be wrong." });
  }

  const allVmList = Array.from(vms.values());
  const measured = {
    p95: allVmList.filter((vm) => vm.cpuUsed.p95 != null).length,
    peak: allVmList.filter((vm) => vm.cpuUsed.peak != null).length,
    average: allVmList.filter((vm) => vm.cpuUsed.average != null).length,
  };
  const mhzFallback = !cpuStatColumns.average && measured.average > 0;
  const cpuTelemetrySource = measured.p95
    ? `${vcpu.name} · ${cpuStatColumns.p95}`
    : measured.peak
      ? `${vcpu.name} · ${cpuStatColumns.peak}`
      : mhzFallback
        ? `${vcpu.name} · ${overallMhzCol} / ${maxMhzCol}`
        : measured.average
          ? `${vcpu.name} · ${cpuStatColumns.average}`
          : null;
  const cpuBasis: UtilizationBasis = measured.p95 ? "p95" : measured.peak ? "peak" : "average";
  audit.push({
    field: "VM CPU usage",
    sheet: vcpu.name,
    column: cpuStatColumns.p95 ?? cpuStatColumns.peak ?? cpuStatColumns.average ?? (mhzFallback ? overallMhzCol : null),
    unit: mhzFallback && !measured.p95 && !measured.peak ? "MHz" : "%",
    confidence: cpuTelemetrySource ? "header" : "unresolved",
    note: cpuTelemetrySource
      ? `Per-VM CPU usage from ${cpuTelemetrySource}. Measured for ${measured.p95 || measured.peak || measured.average} of ${allVmList.length} VMs (95th percentile ${measured.p95}, peak ${measured.peak}, average ${measured.average}).`
      : "No per-VM CPU telemetry in this export, so CPU falls back to allocated vCPU over the overcommit ratio.",
  });

  const memLink = linker(vmemory.rows);
  const vmMemory = readCapacity(
    vmemory.rows,
    ["Size (MiB)", "Size (GiB)", "Memory (MiB)", "Memory (GiB)", "Size", "Memory", "RAM"],
    PLAUSIBLE.vmMemory,
    memLink.vmCount(),
    audit,
    "VM memory",
    vmemory.name,
    "MiB",
  );
  // Observed memory is recorded for the SE to look at and never sized on: a
  // guest's configured memory is a promise the hypervisor has to keep the moment
  // the guest asks, so what it happens to be touching today is not a budget.
  const memHeaders = headersFor(vmemory.rows);
  const vmMemUsage = pickUtilizationColumn(vmemory.rows, [
    { column: firstHeader(memHeaders, ["95th Percentile % (recommended)", "95th Percentile %"]), basis: "p95" },
    { column: firstHeader(memHeaders, ["Peak %"]), basis: "peak" },
    { column: firstHeader(memHeaders, ["Average %"]), basis: "average" },
  ]);
  const vmMemUtil = vmMemUsage ? makeUtilization(vmemory.rows, vmMemUsage.column) : null;
  for (const row of vmemory.rows) {
    const vm = memLink.resolve(row);
    if (!vm) continue;
    const sizeGiB = vmMemory.valueGiB(row);
    vm.ramGiB += sizeGiB;
    const pct = vmMemUtil?.perRow(row) ?? null;
    if (pct != null) vm.observedRamGiB = (vm.observedRamGiB ?? 0) + (sizeGiB * pct) / 100;
  }

  // Guest partitions are the better capacity signal; vDisk is the fallback.
  const partLink = linker(vpartition.rows);
  const partVmCount = partLink.vmCount();
  const partCapacity = readCapacity(
    vpartition.rows,
    ["Capacity (MiB)", "Capacity MiB", "Capacity (GiB)", "Capacity", "Size (MiB)", "Size"],
    PLAUSIBLE.vmStorage,
    partVmCount,
    audit,
    "VM storage (provisioned)",
    vpartition.name,
    "MiB",
  );
  const partConsumed = readCapacity(
    vpartition.rows,
    ["Consumed (MiB)", "Consumed MiB", "Consumed (GiB)", "Consumed", "Used (MiB)", "In Use MiB", "Used"],
    PLAUSIBLE.vmStorage,
    partVmCount,
    audit,
    "VM storage (consumed)",
    vpartition.name,
    "MiB",
  );
  for (const row of vpartition.rows) {
    const vm = partLink.resolve(row);
    if (!vm) continue;
    vm.provisionedTiB += partCapacity.valueGiB(row) / GIB_PER_TIB;
    vm.consumedTiB += partConsumed.valueGiB(row) / GIB_PER_TIB;
  }

  if (!vpartition.rows.length || partCapacity.resolution.unit == null) {
    const diskLink = linker(vdisk.rows);
    const diskCapacity = readCapacity(
      vdisk.rows,
      ["Capacity (MiB)", "Capacity MiB", "Capacity (GiB)", "Capacity", "Size (MiB)", "Size"],
      PLAUSIBLE.vmStorage,
      diskLink.vmCount(),
      audit,
      "VM storage (virtual disks)",
      vdisk.name,
    );
    for (const row of vdisk.rows) {
      const vm = diskLink.resolve(row);
      if (vm) vm.provisionedTiB += diskCapacity.valueGiB(row) / GIB_PER_TIB;
    }
  }

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
  const displayNames = labelCollisions(orderedMoids.map((moid) => clusterNameByMoid.get(moid) ?? (moid === "__unassigned__" ? "Unassigned hosts" : moid)));
  const vmRecords: VmRecord[] = [];

  const clusterDetails: ParsedCluster[] = orderedMoids.map((moid, index) => {
    const hosts = hostsByCluster.get(moid) ?? [];
    const clusterVms = vmsByCluster.get(moid) ?? [];
    const clusterId = `cluster-${index}-${moid}`;
    const slices = { all: emptyPowerSlice(), on: emptyPowerSlice(), off: emptyPowerSlice() };
    let maxVmVcpu = 0;
    let maxVmRamGiB = 0;
    const clusterTopVms: TopVm[] = [];

    for (const vm of clusterVms) {
      vmRecords.push({
        id: vm.uuid,
        name: vm.name,
        clusterId,
        clusterName: displayNames[index],
        poweredOn: vm.poweredOn,
        os: vm.os,
        vcpu: Number(vm.vcpu.toFixed(2)),
        ramGiB: Number(vm.ramGiB.toFixed(3)),
        storageProvisionedTiB: Number(vm.provisionedTiB.toFixed(4)),
        storageConsumedTiB: Number(vm.consumedTiB.toFixed(4)),
        cpuUsed: vm.cpuUsed,
        ramUsedGiB: vm.observedRamGiB,
      });
    }

    for (const vm of clusterVms) {
      const facts: VmFacts = { vcpu: vm.vcpu, ramGiB: vm.ramGiB, provisionedTiB: vm.provisionedTiB, consumedTiB: vm.consumedTiB };
      addToSlice(slices.all, facts);
      // Unknown power state counts as running so nothing silently drops out.
      addToSlice(vm.poweredOn === false ? slices.off : slices.on, facts);
      if (vm.vcpu > maxVmVcpu) maxVmVcpu = vm.vcpu;
      if (vm.ramGiB > maxVmRamGiB) maxVmRamGiB = vm.ramGiB;
      const entry: TopVm = {
        name: vm.name,
        cluster: displayNames[index],
        vcpu: Math.round(vm.vcpu),
        ramGiB: Number(vm.ramGiB.toFixed(1)),
        storageTiB: Number(vm.provisionedTiB.toFixed(2)),
        poweredOn: vm.poweredOn !== false,
      };
      clusterTopVms.push(entry);
      topVmCandidates.push(entry);
    }

    const all = roundSlice(slices.all);
    const totalCpuCores = hosts.reduce((s, h) => s + h.cores, 0);
    const totalMemoryGiB = hosts.reduce((s, h) => s + h.ramGiB, 0);

    // Context for the inventory view only. The build is sized from the VM
    // records above; this is what the hosts happen to be doing today.
    const observed =
      observedFromHosts(hosts, "average", `${vhosts.name} · host usage columns`) ??
      observedFromVms(clusterVms, cpuBasis, cpuTelemetrySource ?? `${vcpu.name} · per-VM usage`);

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
      maxVmVcpu: Number(maxVmVcpu.toFixed(2)),
      maxVmRamGiB: Number(maxVmRamGiB.toFixed(2)),
      totalCpuCores: Number(totalCpuCores.toFixed(2)),
      consumedCpuCores: observed?.cpuPCores ?? null,
      totalMemoryGiB: Number(totalMemoryGiB.toFixed(2)),
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

  const notes = ["Collector parsed with MOID/UUID joins, matching the Collector Cluster Summary tab."];
  if (!powerStateKnown) notes.push("No VM power state column found, so every VM is treated as running.");
  const orphans = allVms.filter((vm) => !vm.clusterMoid).length;
  if (orphans > 0) notes.push(`${orphans} VM${orphans === 1 ? "" : "s"} had no resolvable host and are grouped under "Unassigned hosts".`);

  return finalize({
    source: "collector_excel",
    fileName,
    fileSizeBytes,
    datacenters: vdatacenter.rows.length || clusterDcByMoid.size || null,
    snapshots: vsnapshot.rows.length || null,
    guestOs: rankGuestOs(guestOsCounts),
    topVms: rankTopVms(topVmCandidates),
    vms: vmRecords,
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
// RVTools / LiveOptics (header-driven, per-VM where possible)
// ---------------------------------------------------------------------------

function hostSheetNamesFor(source: SizerSource): string[] {
  if (source === "liveoptics") return ["ESX Hosts", "Hosts", "Host", "vHost", "vHosts", "ESXi Hosts"];
  return ["vHost", "vHosts", "Hosts", "Host"];
}

function vmSheetNamesFor(source: SizerSource): string[] {
  if (source === "liveoptics") return ["VMs", "VM Performance", "VirtualMachines", "vInfo", "Guest VMs"];
  return ["vInfo", "VMs", "VirtualMachines"];
}

function parseGeneric(
  workbook: XLSX.WorkBook,
  source: SizerSource,
  fileName: string,
  fileSizeBytes: number | null,
): ParsedEnvironment {
  const audit: ParseAudit[] = [];
  const hostSheet = rowsFromSheet(workbook, hostSheetNamesFor(source));
  const vmSheet = rowsFromSheet(workbook, vmSheetNamesFor(source));
  const partitionSheet = rowsFromSheet(workbook, ["vPartition", "Partitions", "Guest Disks"]);
  const datastoreSheet = rowsFromSheet(workbook, ["vDatastore", "Datastore", "Datastores", "Storage"]);
  const snapshotSheet = rowsFromSheet(workbook, ["vSnapshot", "Snapshots", "VM Snapshots"]);
  const datacenterSheet = rowsFromSheet(workbook, ["vDatacenter", "vDataCenter", "Datacenters"]);

  if (!hostSheet.rows.length) {
    throw new ParseWorkbookError(
      `Could not find host inventory data for ${source}. Available sheets: ${workbook.SheetNames.join(", ")}`,
    );
  }
  if (!vmSheet.rows.length) {
    throw new ParseWorkbookError(
      `Could not find VM inventory data for ${source}. Available sheets: ${workbook.SheetNames.join(", ")}`,
    );
  }

  // --- hosts ---------------------------------------------------------------
  const hostHeaders = headersFor(hostSheet.rows);
  const hostNameCol = firstHeader(hostHeaders, ["Host", "Hostname", "Host Name", "Name", "ESX", "ESXi Host"]);
  const hostClusterCol = firstHeader(hostHeaders, ["Cluster Name", "Cluster"]);
  const hostDcCol = firstHeader(hostHeaders, ["Datacenter", "DataCenter"]);
  const hostVcenterCol = firstHeader(hostHeaders, ["vCenter", "VI SDK Server", "vCenter Server"]);
  const hostModelCol = firstHeader(hostHeaders, ["Model", "Host Model", "Server Model"]);
  const hostVendorCol = firstHeader(hostHeaders, ["Vendor", "Manufacturer"]);
  const hostCpuModelCol = firstHeader(hostHeaders, ["CPU Model", "Processor", "CPU Type"]);
  const hostSocketsCol = firstHeader(hostHeaders, ["# CPU", "CPUs", "Sockets", "CPU Sockets"]);
  const hostCoresPerCpuCol = firstHeader(hostHeaders, ["Cores per CPU", "Cores/CPU", "Cores per Socket"]);
  const hostTotalCoresCol = firstHeader(hostHeaders, ["# Cores", "CPU Cores", "Cores", "Total Cores"]);
  const hostCpuPctCol = firstHeader(hostHeaders, ["CPU Usage %", "CpuUsagePct", "CPU Utilization %", "% CPU"]);
  const hostMemPctCol = firstHeader(hostHeaders, ["Memory Usage %", "MemUsagePct", "Memory Utilization %", "% Memory"]);
  // RVTools reports host "# Memory" in MiB.
  const hostMemory = readCapacity(
    hostSheet.rows,
    ["# Memory", "Memory Size", "Memory (GiB)", "Memory (MiB)", "Physical Memory", "RAM", "Memory"],
    PLAUSIBLE.hostMemory,
    hostSheet.rows.length,
    audit,
    "Host memory",
    hostSheet.name,
    "MiB",
  );

  // LiveOptics keeps host utilization on a separate performance sheet rather
  // than on the inventory rows. Join it back per host, so a cluster's own
  // utilization is real instead of blank, and take the peak column when there is
  // one: a cluster sized on an average is a cluster that is short at the busy
  // hour.
  const perfSheet = source === "liveoptics" ? rowsFromSheet(workbook, ["ESX Performance", "Host Performance"]) : { rows: [], name: "" };
  const perfHeaders = headersFor(perfSheet.rows);
  const perfHostCol = firstHeader(perfHeaders, ["Host", "Host Name", "Server Name"]);
  const perfCpu = pickUtilizationColumn(perfSheet.rows, [
    { column: firstHeader(perfHeaders, ["Peak CPU %"]), basis: "peak" },
    { column: firstHeader(perfHeaders, ["Average CPU %", "Avg CPU %", "CPU Usage %", "% CPU"]), basis: "average" },
  ]);
  const perfMem = pickUtilizationColumn(perfSheet.rows, [
    { column: firstHeader(perfHeaders, ["Peak Memory %"]), basis: "peak" },
    { column: firstHeader(perfHeaders, ["Average Memory %", "Avg Memory %", "Memory Usage %", "% Memory"]), basis: "average" },
  ]);

  const hostCpuUtil = makeUtilization(hostSheet.rows, hostCpuPctCol);
  const hostMemUtil = makeUtilization(hostSheet.rows, hostMemPctCol);
  const perfCpuUtil = makeUtilization(perfSheet.rows, perfCpu?.column ?? null);
  const perfMemUtil = makeUtilization(perfSheet.rows, perfMem?.column ?? null);

  const perfByHost = new Map<string, { cpu: number | null; mem: number | null }>();
  if (perfHostCol) {
    for (const row of perfSheet.rows) {
      const key = str(row[perfHostCol]).toLowerCase();
      if (key) perfByHost.set(key, { cpu: perfCpuUtil.perRow(row), mem: perfMemUtil.perRow(row) });
    }
  }

  // The inventory sheet's own column, when it has values, is a point-in-time
  // sample. Only the performance sheet offers a peak.
  const utilBasis: UtilizationBasis = hostCpuUtil.average != null ? "average" : (perfCpu?.basis ?? "average");
  const utilSource =
    hostCpuUtil.average != null
      ? `${hostSheet.name} · ${hostCpuPctCol}`
      : perfCpu
        ? `${perfSheet.name} · ${perfCpu.column}`
        : `${hostSheet.name} · host usage columns`;
  audit.push({
    field: "Host CPU usage",
    sheet: hostCpuUtil.average != null ? hostSheet.name : perfSheet.name || hostSheet.name,
    column: hostCpuUtil.average != null ? hostCpuPctCol : (perfCpu?.column ?? null),
    unit: "%",
    confidence: hostCpuUtil.average != null || perfCpu ? "header" : "unresolved",
    note:
      hostCpuUtil.average != null || perfCpu
        ? `Observed CPU read as ${utilBasis === "peak" ? "a peak" : "an average"} from ${utilSource}.`
        : "No host CPU telemetry in this export. CPU will be sized from allocated vCPU.",
  });

  // A cluster's identity is the vCenter/datacenter/name triple, not the name.
  // Estates reuse names freely, and two four-host "Production" clusters keyed on
  // the name alone merge into one eight-host cluster that never existed, with
  // every figure below it doubled.
  const clusterKeyOf = (vcenter: string, datacenter: string, name: string) =>
    [vcenter, datacenter, name].map((part) => part.trim().toLowerCase()).join(" ");

  const hostsByCluster = new Map<string, HostRecord[]>();
  const clusterMeta = new Map<string, { name: string; datacenter: string | null }>();
  // Host name -> cluster key. Joining a VM through its host is the surest route,
  // because the host row is where cluster membership is authoritative.
  const clusterKeyByHostName = new Map<string, string>();
  // Cluster name -> the keys that use it, for VM sheets with no datacenter column.
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
      ramGiB: Number(hostMemory.valueGiB(row).toFixed(2)),
      cpuUtilPct: hostCpuUtil.perRow(row) ?? perf?.cpu ?? null,
      memoryUtilPct: hostMemUtil.perRow(row) ?? perf?.mem ?? null,
    };
    hostsByCluster.set(clusterKey, [...(hostsByCluster.get(clusterKey) ?? []), record]);
    if (!clusterMeta.has(clusterKey)) clusterMeta.set(clusterKey, { name: clusterName, datacenter: datacenter || null });
    if (hostName) clusterKeyByHostName.set(hostName.toLowerCase(), clusterKey);
    const nameKey = clusterName.toLowerCase();
    keysByClusterName.set(nameKey, (keysByClusterName.get(nameKey) ?? new Set()).add(clusterKey));
  }

  // --- VMs ------------------------------------------------------------------
  const vmHeaders = headersFor(vmSheet.rows);
  const vmNameCol = firstHeader(vmHeaders, ["VM", "VM Name", "Name"]);
  const vmClusterCol = firstHeader(vmHeaders, ["Cluster Name", "Cluster", "Target Cluster"]);
  const vmDcCol = firstHeader(vmHeaders, ["Datacenter", "DataCenter"]);
  const vmVcenterCol = firstHeader(vmHeaders, ["vCenter", "VI SDK Server", "vCenter Server"]);
  const vmHostCol = firstHeader(vmHeaders, ["Host", "Host Name", "ESX Host"]);
  const vmPowerCol = firstHeader(vmHeaders, ["Powerstate", "Power State", "State", "Power Status"]);
  const vmOsCol = firstHeader(vmHeaders, [
    "OS according to the configuration file",
    "OS according to the VMware Tools",
    "Guest OS",
    "Guest Operating System",
    "Operating System",
    "OS",
  ]);
  const vmVcpuCol = firstHeader(vmHeaders, ["vCPUs", "CPUs", "NumCPU", "# vCPU", "Virtual CPU", "vCPU"]);
  if (vmVcpuCol) {
    audit.push({ field: "VM vCPU", sheet: vmSheet.name, column: vmVcpuCol, unit: "count", confidence: "header", note: `"${vmVcpuCol}" read as a vCPU count.` });
  } else {
    audit.push({ field: "VM vCPU", sheet: vmSheet.name, column: null, unit: null, confidence: "unresolved", note: "No vCPU column found, so CPU sizing will be wrong." });
  }
  const vmMemory = readCapacity(
    vmSheet.rows,
    ["Memory (MiB)", "Provisioned Memory (MiB)", "Memory (GiB)", "Memory MiB", "Size (MiB)", "Memory", "RAM"],
    PLAUSIBLE.vmMemory,
    vmSheet.rows.length,
    audit,
    "VM memory",
    vmSheet.name,
    "MiB",
  );
  const vmProvisioned = readCapacity(
    vmSheet.rows,
    ["Provisioned MiB", "Provisioned MB", "Provisioned (MiB)", "Total disk capacity MiB", "Provisioned Storage (MiB)", "Capacity (MiB)", "Provisioned", "Capacity"],
    PLAUSIBLE.vmStorage,
    vmSheet.rows.length,
    audit,
    "VM storage (provisioned)",
    vmSheet.name,
    "MiB",
  );
  const vmConsumed = readCapacity(
    vmSheet.rows,
    ["In Use MiB", "In Use MB", "In Use (MiB)", "Consumed (MiB)", "Used (MiB)", "Used Storage (MiB)", "In Use", "Consumed", "Used"],
    PLAUSIBLE.vmStorage,
    vmSheet.rows.length,
    audit,
    "VM storage (consumed)",
    vmSheet.name,
    "MiB",
  );

  // Guest partitions win over the VM sheet's own capacity columns when present.
  const partitionByVm = new Map<string, { provisionedTiB: number; consumedTiB: number }>();
  if (partitionSheet.rows.length) {
    const partHeaders = headersFor(partitionSheet.rows);
    const partVmCol = firstHeader(partHeaders, ["VM", "VM Name", "Name"]);
    if (partVmCol) {
      const partVms = distinctCount(partitionSheet.rows, (r) => str(r[partVmCol]));
      const cap = readCapacity(
        partitionSheet.rows,
        ["Capacity MiB", "Capacity (MiB)", "Capacity (GiB)", "Capacity"],
        PLAUSIBLE.vmStorage,
        partVms,
        audit,
        "Guest partitions (provisioned)",
        partitionSheet.name,
        "MiB",
      );
      const used = readCapacity(
        partitionSheet.rows,
        ["Consumed MiB", "Consumed (MiB)", "Consumed (GiB)", "Consumed", "Used MiB", "In Use MiB"],
        PLAUSIBLE.vmStorage,
        partVms,
        audit,
        "Guest partitions (consumed)",
        partitionSheet.name,
        "MiB",
      );
      if (cap.resolution.unit) {
        for (const row of partitionSheet.rows) {
          const key = str(row[partVmCol]).toLowerCase();
          if (!key) continue;
          const prev = partitionByVm.get(key) ?? { provisionedTiB: 0, consumedTiB: 0 };
          prev.provisionedTiB += cap.valueGiB(row) / GIB_PER_TIB;
          prev.consumedTiB += used.valueGiB(row) / GIB_PER_TIB;
          partitionByVm.set(key, prev);
        }
      }
    }
  }

  // LiveOptics keeps per-VM telemetry on its own sheet. The GHz columns are the
  // ones to use: the percentage columns are relative to a nominal clock and read
  // above 100% when a guest turbos, while GHz over the host clock is physical
  // cores directly.
  const vmPerfSheet =
    source === "liveoptics" ? rowsFromSheet(workbook, ["VM Performance", "Virtual Machine Performance"]) : { rows: [], name: "" };
  const vmPerfHeaders = headersFor(vmPerfSheet.rows);
  const vmPerfNameCol = firstHeader(vmPerfHeaders, ["VM Name", "VM", "Name"]);
  const vmPerfPeakGhzCol = firstHeader(vmPerfHeaders, ["Peak vCPU (GHz)"]);
  const vmPerfAvgGhzCol = firstHeader(vmPerfHeaders, ["Average vCPU (GHz)", "Avg vCPU (GHz)"]);
  const vmPerfPeakMemCol = firstHeader(vmPerfHeaders, ["Peak Memory (MiB)"]);
  // Every host in these exports runs the same clock in practice; the median
  // keeps one odd row from skewing the conversion.
  const hostClockGhz = (() => {
    const clockCol = firstHeader(hostHeaders, ["CPU Clock Speed (GHz)", "CPU Speed (GHz)"]);
    if (!clockCol) return 0;
    const values = hostSheet.rows.map((row) => toNum(row[clockCol])).filter((v) => v > 0.5 && v < 10);
    if (!values.length) return 0;
    return values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  })();

  const vmPerfByName = new Map<string, { cpuUsed: VmCpuUsage; ramUsedGiB: number | null }>();
  if (vmPerfNameCol && hostClockGhz > 0) {
    for (const row of vmPerfSheet.rows) {
      const key = str(row[vmPerfNameCol]).toLowerCase();
      if (!key) continue;
      const peakGhz = vmPerfPeakGhzCol ? toNum(row[vmPerfPeakGhzCol]) : 0;
      const avgGhz = vmPerfAvgGhzCol ? toNum(row[vmPerfAvgGhzCol]) : 0;
      const peakMem = vmPerfPeakMemCol ? toNum(row[vmPerfPeakMemCol]) : 0;
      vmPerfByName.set(key, {
        cpuUsed: {
          p95: null,
          peak: peakGhz > 0 ? peakGhz / hostClockGhz : null,
          average: avgGhz > 0 ? avgGhz / hostClockGhz : null,
        },
        ramUsedGiB: peakMem > 0 ? peakMem / 1024 : null,
      });
    }
    audit.push({
      field: "VM CPU usage",
      sheet: vmPerfSheet.name,
      column: vmPerfPeakGhzCol ?? vmPerfAvgGhzCol,
      unit: "GHz",
      confidence: "header",
      note: `Per-VM CPU usage converted to physical cores at the host clock of ${hostClockGhz} GHz, for ${vmPerfByName.size} of ${vmSheet.rows.length} VMs.`,
    });
  } else if (source === "liveoptics" && vmPerfSheet.rows.length) {
    audit.push({
      field: "VM CPU usage",
      sheet: vmPerfSheet.name,
      column: null,
      unit: null,
      confidence: "unresolved",
      note: "Found a VM performance sheet but no host clock speed to convert GHz into cores, so CPU falls back to allocated vCPU.",
    });
  }

  const guestOsCounts = new Map<string, number>();
  const topVmCandidates: TopVm[] = [];
  const vmRecords: VmRecord[] = [];
  const vmsByCluster = new Map<string, { facts: VmFacts; entry: TopVm; poweredOn: boolean | null }[]>();
  const soleCluster = hostsByCluster.size === 1 ? Array.from(hostsByCluster.keys())[0] : null;
  let powerStateKnown = false;
  let ambiguousClusterVms = 0;

  /**
   * Place a VM on a cluster, most reliable route first.
   *
   * The host row is where cluster membership is authoritative, so a VM's host
   * name settles it outright. Failing that, the VM sheet's own triple has to
   * match a cluster the host sheet produced. A bare cluster name is only trusted
   * when exactly one cluster answers to it.
   */
  function resolveVmClusterKey(row: Record<string, unknown>, clusterName: string): string {
    const hostName = str(vmHostCol ? row[vmHostCol] : "").toLowerCase();
    const viaHost = hostName ? clusterKeyByHostName.get(hostName) : undefined;
    if (viaHost) return viaHost;

    if (clusterName) {
      const triple = clusterKeyOf(
        str(vmVcenterCol ? row[vmVcenterCol] : ""),
        str(vmDcCol ? row[vmDcCol] : ""),
        clusterName,
      );
      if (hostsByCluster.has(triple)) return triple;

      const candidates = keysByClusterName.get(clusterName.toLowerCase());
      if (candidates?.size === 1) return Array.from(candidates)[0];
      if (candidates && candidates.size > 1) ambiguousClusterVms += 1;
      // A cluster the host sheet never mentioned still deserves to exist.
      return triple;
    }

    // With one cluster in the file, unlabelled VMs belong to it.
    return soleCluster ?? clusterKeyOf("", "", "Environment");
  }

  const vmIdCol = firstHeader(vmHeaders, ["UUID", "InstanceUUID", "MOB ID", "VM UUID"]);
  vmSheet.rows.forEach((row, rowIndex) => {
    const name = str(vmNameCol ? row[vmNameCol] : "") || "Unnamed VM";
    const vmClusterName = str(vmClusterCol ? row[vmClusterCol] : "");
    const clusterKey = resolveVmClusterKey(row, vmClusterName);
    const clusterName = clusterMeta.get(clusterKey)?.name ?? (vmClusterName || "Environment");
    const poweredOn = vmPowerCol ? parsePowerState(row[vmPowerCol]) : null;
    if (poweredOn != null) powerStateKnown = true;
    const partition = partitionByVm.get(name.toLowerCase());
    const facts: VmFacts = {
      vcpu: vmVcpuCol ? toNum(row[vmVcpuCol]) : 0,
      ramGiB: vmMemory.valueGiB(row),
      provisionedTiB: partition ? partition.provisionedTiB : vmProvisioned.valueGiB(row) / GIB_PER_TIB,
      consumedTiB: partition ? partition.consumedTiB : vmConsumed.valueGiB(row) / GIB_PER_TIB,
    };
    const os = osFamily(vmOsCol ? row[vmOsCol] : "");
    guestOsCounts.set(os, (guestOsCounts.get(os) ?? 0) + 1);
    const entry: TopVm = {
      name,
      cluster: clusterName,
      vcpu: Math.round(facts.vcpu),
      ramGiB: Number(facts.ramGiB.toFixed(1)),
      storageTiB: Number(facts.provisionedTiB.toFixed(2)),
      poweredOn: poweredOn !== false,
    };
    topVmCandidates.push(entry);
    vmsByCluster.set(clusterKey, [...(vmsByCluster.get(clusterKey) ?? []), { facts, entry, poweredOn }]);

    // The row index guarantees uniqueness where an export gives no id and
    // repeats VM names, which obfuscated files routinely do.
    const perf = vmPerfByName.get(name.toLowerCase());
    vmRecords.push({
      id: `${str(vmIdCol ? row[vmIdCol] : "") || name}#${rowIndex}`,
      name,
      clusterId: clusterKey,
      clusterName,
      poweredOn,
      os,
      vcpu: Number(facts.vcpu.toFixed(2)),
      ramGiB: Number(facts.ramGiB.toFixed(3)),
      storageProvisionedTiB: Number(facts.provisionedTiB.toFixed(4)),
      storageConsumedTiB: Number(facts.consumedTiB.toFixed(4)),
      cpuUsed: perf?.cpuUsed ?? emptyCpuUsage(),
      ramUsedGiB: perf?.ramUsedGiB ?? null,
    });
  });

  // Datastore capacity is only used when nothing per-VM was resolvable — it
  // describes the array, not the guests, and double-counts shared LUNs.
  const anyVmStorage = Array.from(vmsByCluster.values()).some((list) => list.some((v) => v.facts.provisionedTiB > 0));
  let datastoreTiB = 0;
  if (!anyVmStorage && datastoreSheet.rows.length) {
    const dsCap = readCapacity(
      datastoreSheet.rows,
      ["Capacity MiB", "Capacity (MiB)", "Capacity GiB", "Capacity (GiB)", "Capacity"],
      PLAUSIBLE.datastore,
      datastoreSheet.rows.length,
      audit,
      "Datastore capacity (fallback)",
      datastoreSheet.name,
    );
    datastoreTiB = (dsCap.resolution.totalGiB ?? 0) / GIB_PER_TIB;
  }

  const clusterKeys = Array.from(new Set([...hostsByCluster.keys(), ...vmsByCluster.keys()]));
  // Two clusters can legitimately share a name across datacenters. They stay
  // separate entities; only their labels get a suffix so the UI can tell them
  // apart.
  const displayNames = labelCollisions(
    clusterKeys.map((key) => clusterMeta.get(key)?.name ?? vmsByCluster.get(key)?.[0]?.entry.cluster ?? "Environment"),
  );
  // VM records were built against the raw cluster key; restate them against the
  // cluster ids the rest of the tool uses.
  const clusterIdByKey = new Map(clusterKeys.map((key, index) => [key, `cluster-${index}-${key}`]));
  for (const vm of vmRecords) {
    const id = vm.clusterId ? clusterIdByKey.get(vm.clusterId) : undefined;
    vm.clusterId = id ?? null;
    const index = clusterKeys.indexOf(vm.clusterId?.replace(/^cluster-\d+-/, "") ?? "");
    if (index >= 0) vm.clusterName = displayNames[index];
  }

  // With only datastore capacity to go on, every VM gets an equal share of it so
  // the per-VM table and the totals tell the same story.
  if (datastoreTiB > 0 && vmRecords.length > 0) {
    const perVm = datastoreTiB / vmRecords.length;
    for (const vm of vmRecords) {
      vm.storageProvisionedTiB = Number(perVm.toFixed(4));
      vm.storageConsumedTiB = 0;
    }
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

    // Spread the datastore fallback across clusters by VM share.
    if (datastoreTiB > 0 && vmSheet.rows.length > 0) {
      const share = members.length / vmSheet.rows.length;
      slices.all.partitionConfiguredTiB = datastoreTiB * share;
      slices.all.diskProvisionedTiB = datastoreTiB * share;
      const onShare = slices.all.vms > 0 ? slices.on.vms / slices.all.vms : 0;
      slices.on.partitionConfiguredTiB = datastoreTiB * share * onShare;
      slices.off.partitionConfiguredTiB = datastoreTiB * share * (1 - onShare);
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
      maxVmVcpu: Number(maxVmVcpu.toFixed(2)),
      maxVmRamGiB: Number(maxVmRamGiB.toFixed(2)),
      totalCpuCores: Number(totalCpuCores.toFixed(2)),
      consumedCpuCores: observed?.cpuPCores ?? null,
      totalMemoryGiB: Number(totalMemoryGiB.toFixed(2)),
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

  const notes = [`Parsed as ${source} from sheets: ${hostSheet.name}, ${vmSheet.name}.`];
  if (ambiguousClusterVms > 0) {
    notes.push(
      `${ambiguousClusterVms} VM${ambiguousClusterVms === 1 ? "" : "s"} named a cluster that exists in more than one datacenter and gave no host to join through, so their placement is a best guess.`,
    );
  }
  if (!powerStateKnown) notes.push("No VM power state column found, so every VM is treated as running.");
  if (!anyVmStorage && datastoreTiB > 0) {
    notes.push("No per-VM storage columns found, so capacity was taken from the datastore sheet and split by VM count.");
  }

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

  const plausibility = checkPlausibility({
    vms: all.vms,
    hosts: input.hostCount,
    vcpu: all.vcpu,
    vmRamGiB: all.ramGiB,
    vmStorageProvisionedTiB: all.partitionConfiguredTiB,
    vmStorageConsumedTiB: all.partitionConsumedTiB,
    hostCores: totalCpuCores,
    hostRamGiB: totalMemoryGiB,
  });

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
