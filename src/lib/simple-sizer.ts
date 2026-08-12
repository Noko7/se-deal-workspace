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
  type ParseAudit,
  type ParsedCluster,
  type ParsedEnvironment,
  type PowerSlice,
  type SizerSource,
  type TopVm,
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
};

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
  if (!infoUuidCol) throw new ParseWorkbookError("vInfo has no UUID column — cannot join VMs to hosts.");

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
  const cpuCol = firstHeader(headersFor(vcpu.rows), ["vCPUs", "vCPU", "CPUs", "Num vCPU", "# vCPU"]);
  if (cpuCol) {
    for (const row of vcpu.rows) {
      const vm = cpuLink.resolve(row);
      if (vm) vm.vcpu += toNum(row[cpuCol]);
    }
    audit.push({ field: "VM vCPU", sheet: vcpu.name, column: cpuCol, unit: "count", confidence: "header", note: `"${cpuCol}" read as a vCPU count.` });
  } else {
    audit.push({ field: "VM vCPU", sheet: vcpu.name, column: null, unit: null, confidence: "unresolved", note: "No vCPU column found — CPU sizing will be wrong." });
  }

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
  for (const row of vmemory.rows) {
    const vm = memLink.resolve(row);
    if (vm) vm.ramGiB += vmMemory.valueGiB(row);
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
    "VM storage — provisioned",
    vpartition.name,
    "MiB",
  );
  const partConsumed = readCapacity(
    vpartition.rows,
    ["Consumed (MiB)", "Consumed MiB", "Consumed (GiB)", "Consumed", "Used (MiB)", "In Use MiB", "Used"],
    PLAUSIBLE.vmStorage,
    partVmCount,
    audit,
    "VM storage — consumed",
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
      "VM storage — virtual disks",
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

  const clusterDetails: ParsedCluster[] = orderedMoids.map((moid, index) => {
    const hosts = hostsByCluster.get(moid) ?? [];
    const clusterVms = vmsByCluster.get(moid) ?? [];
    const slices = { all: emptyPowerSlice(), on: emptyPowerSlice(), off: emptyPowerSlice() };
    let maxVmVcpu = 0;
    let maxVmRamGiB = 0;
    const clusterTopVms: TopVm[] = [];

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

    return {
      id: `cluster-${index}-${moid}`,
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
      consumedCpuCores: null,
      totalMemoryGiB: Number(totalMemoryGiB.toFixed(2)),
      consumedMemoryGiB: null,
      totalStorageTiB: all.partitionConfiguredTiB,
      consumedStorageTiB: all.partitionConsumedTiB,
      powerStateKnown,
      all,
      poweredOn: roundSlice(slices.on),
      poweredOff: roundSlice(slices.off),
    };
  });

  const notes = ["Collector parsed with MOID/UUID joins, matching the Collector Cluster Summary tab."];
  if (!powerStateKnown) notes.push("No VM power state column found — every VM is treated as running.");
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

  // LiveOptics carries no host utilization on the inventory sheet — it lives in
  // ESX Performance. Take it from there when present rather than inventing it.
  const perfSheet = source === "liveoptics" ? rowsFromSheet(workbook, ["ESX Performance", "Host Performance"]) : { rows: [], name: "" };
  const perfHeaders = headersFor(perfSheet.rows);
  const perfCpuCol = firstHeader(perfHeaders, ["Average CPU %", "Avg CPU %", "CPU Usage %", "% CPU"]);
  const perfMemCol = firstHeader(perfHeaders, ["Average Memory %", "Avg Memory %", "Memory Usage %", "% Memory"]);

  const hostCpuUtil = makeUtilization(hostSheet.rows, hostCpuPctCol);
  const hostMemUtil = makeUtilization(hostSheet.rows, hostMemPctCol);
  const perfCpuUtil = makeUtilization(perfSheet.rows, perfCpuCol);
  const perfMemUtil = makeUtilization(perfSheet.rows, perfMemCol);

  const hostsByCluster = new Map<string, HostRecord[]>();
  const dcByCluster = new Map<string, string>();
  for (const row of hostSheet.rows) {
    const clusterName = str(hostClusterCol ? row[hostClusterCol] : "") || "Environment";
    const { cores, sockets, coresPerSocket } = resolveHostCores(
      hostSocketsCol ? toNum(row[hostSocketsCol]) : 0,
      hostCoresPerCpuCol ? toNum(row[hostCoresPerCpuCol]) : 0,
      hostTotalCoresCol ? toNum(row[hostTotalCoresCol]) : 0,
    );
    const record: HostRecord = {
      name: str(hostNameCol ? row[hostNameCol] : "") || `host-${hostsByCluster.size}`,
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
    hostsByCluster.set(clusterName, [...(hostsByCluster.get(clusterName) ?? []), record]);
    const dc = str(hostDcCol ? row[hostDcCol] : "");
    if (dc && !dcByCluster.has(clusterName)) dcByCluster.set(clusterName, dc);
  }

  // --- VMs ------------------------------------------------------------------
  const vmHeaders = headersFor(vmSheet.rows);
  const vmNameCol = firstHeader(vmHeaders, ["VM", "VM Name", "Name"]);
  const vmClusterCol = firstHeader(vmHeaders, ["Cluster Name", "Cluster", "Target Cluster"]);
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
    audit.push({ field: "VM vCPU", sheet: vmSheet.name, column: null, unit: null, confidence: "unresolved", note: "No vCPU column found — CPU sizing will be wrong." });
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
    "VM storage — provisioned",
    vmSheet.name,
    "MiB",
  );
  const vmConsumed = readCapacity(
    vmSheet.rows,
    ["In Use MiB", "In Use MB", "In Use (MiB)", "Consumed (MiB)", "Used (MiB)", "Used Storage (MiB)", "In Use", "Consumed", "Used"],
    PLAUSIBLE.vmStorage,
    vmSheet.rows.length,
    audit,
    "VM storage — consumed",
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
        "Guest partitions — provisioned",
        partitionSheet.name,
        "MiB",
      );
      const used = readCapacity(
        partitionSheet.rows,
        ["Consumed MiB", "Consumed (MiB)", "Consumed (GiB)", "Consumed", "Used MiB", "In Use MiB"],
        PLAUSIBLE.vmStorage,
        partVms,
        audit,
        "Guest partitions — consumed",
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

  const guestOsCounts = new Map<string, number>();
  const topVmCandidates: TopVm[] = [];
  const vmsByCluster = new Map<string, { facts: VmFacts; entry: TopVm; poweredOn: boolean | null }[]>();
  const soleCluster = hostsByCluster.size === 1 ? Array.from(hostsByCluster.keys())[0] : null;
  let powerStateKnown = false;

  for (const row of vmSheet.rows) {
    const name = str(vmNameCol ? row[vmNameCol] : "") || "Unnamed VM";
    // With only one cluster in the file, unlabelled VMs belong to it.
    const clusterName = str(vmClusterCol ? row[vmClusterCol] : "") || soleCluster || "Environment";
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
    vmsByCluster.set(clusterName, [...(vmsByCluster.get(clusterName) ?? []), { facts, entry, poweredOn }]);
  }

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

  const clusterNames = Array.from(new Set([...hostsByCluster.keys(), ...vmsByCluster.keys()]));
  const displayNames = labelCollisions(clusterNames);

  const clusterDetails: ParsedCluster[] = clusterNames.map((clusterName, index) => {
    const hosts = hostsByCluster.get(clusterName) ?? [];
    const members = vmsByCluster.get(clusterName) ?? [];
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

    return {
      id: `cluster-${index}-${clusterName}`,
      name: displayNames[index],
      datacenter: dcByCluster.get(clusterName) ?? null,
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
      consumedCpuCores: null,
      totalMemoryGiB: Number(totalMemoryGiB.toFixed(2)),
      consumedMemoryGiB: null,
      totalStorageTiB: all.partitionConfiguredTiB,
      consumedStorageTiB: all.partitionConsumedTiB,
      powerStateKnown,
      all,
      poweredOn: roundSlice(slices.on),
      poweredOff: roundSlice(slices.off),
    };
  });

  const notes = [`Parsed as ${source} from sheets: ${hostSheet.name}, ${vmSheet.name}.`];
  if (!powerStateKnown) notes.push("No VM power state column found — every VM is treated as running.");
  if (!anyVmStorage && datastoreTiB > 0) {
    notes.push("No per-VM storage columns found — capacity taken from the datastore sheet and split by VM count.");
  }

  return finalize({
    source,
    fileName,
    fileSizeBytes,
    datacenters: datacenterSheet.rows.length || dcByCluster.size || null,
    snapshots: snapshotSheet.rows.length || null,
    guestOs: rankGuestOs(guestOsCounts),
    topVms: rankTopVms(topVmCandidates),
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

function finalize(input: {
  source: SizerSource;
  fileName: string;
  fileSizeBytes: number | null;
  datacenters: number | null;
  snapshots: number | null;
  guestOs: { name: string; count: number }[];
  topVms: TopVm[];
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

  const notes = [...input.notes];
  const unresolved = input.audit.filter((a) => a.confidence === "unresolved" && a.column !== null);
  if (unresolved.length) {
    notes.push(`${unresolved.length} column${unresolved.length === 1 ? "" : "s"} could not be read reliably — see the parsed inputs panel.`);
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
    consumedCpuCores: null,
    totalMemoryGiB: Number(totalMemoryGiB.toFixed(2)),
    consumedMemoryGiB: null,
    totalStorageTiB: all.partitionConfiguredTiB,
    consumedStorageTiB: all.partitionConsumedTiB,
    aggVcpu: all.vcpu,
    aggRamGiB: all.ramGiB,
    aggStorageProvisionedTiB: all.partitionConfiguredTiB,
    aggStorageConsumedTiB: all.partitionConsumedTiB,
    maxVmVcpu: clusterDetails.length ? Math.max(...clusterDetails.map((c) => c.maxVmVcpu ?? 0)) : null,
    maxVmRamGiB: clusterDetails.length ? Math.max(...clusterDetails.map((c) => c.maxVmRamGiB ?? 0)) : null,
    powerStateKnown: input.powerStateKnown,
    all,
    poweredOn,
    poweredOff,
    guestOs: input.guestOs,
    topVms: input.topVms,
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

export function parseSizerWorkbook(
  fileBuffer: Buffer,
  source: SizerSource,
  fileName: string,
  fileSizeBytes: number | null = null,
): ParsedEnvironment {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
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
