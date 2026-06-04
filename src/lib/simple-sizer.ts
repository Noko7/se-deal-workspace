import * as XLSX from "xlsx";
import type { ParsedEnvironment, SizerSource } from "@/lib/simple-sizer-core";

function norm(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function toNum(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function headersFor(rows: Record<string, unknown>[]): string[] {
  return rows.length > 0 ? Object.keys(rows[0]) : [];
}

function firstHeader(headers: string[], candidates: string[]): string | null {
  const candidateSet = new Set(candidates.map(norm));
  for (const header of headers) {
    if (candidateSet.has(norm(header))) return header;
  }
  return null;
}

function sumColumn(rows: Record<string, unknown>[], header: string | null, factor = 1): number {
  if (!header) return 0;
  return rows.reduce((sum, row) => sum + toNum(row[header]) * factor, 0);
}

function sumFirstMatchingColumn(
  rows: Record<string, unknown>[],
  headers: string[],
  candidates: string[],
  factor = 1,
): number | null {
  const header = firstHeader(headers, candidates);
  if (!header) return null;
  return sumColumn(rows, header, factor);
}

function sheetByName(workbook: XLSX.WorkBook, names: string[]): XLSX.WorkSheet | null {
  const normalized = new Map(workbook.SheetNames.map((n) => [norm(n), n]));
  for (const name of names) {
    const found = normalized.get(norm(name));
    if (found) return workbook.Sheets[found];
  }
  return null;
}

function rowsFromSheet(sheet: XLSX.WorkSheet | null): Record<string, unknown>[] {
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

export function parseSizerWorkbook(fileBuffer: Buffer, source: SizerSource, fileName: string): ParsedEnvironment {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });

  const hostRows = rowsFromSheet(
    sheetByName(workbook, source === "collector" ? ["vHosts", "vHost", "Hosts"] : ["vHost", "vHosts", "Hosts"]),
  );
  const vmRows = rowsFromSheet(sheetByName(workbook, ["vInfo", "VMs", "VirtualMachines"]));
  const diskRows = rowsFromSheet(sheetByName(workbook, ["vDisk", "vPartition", "Datastore", "Storage"]));

  const hostHeaders = headersFor(hostRows);
  const vmHeaders = headersFor(vmRows);
  const diskHeaders = headersFor(diskRows);

  const hostNameCol = firstHeader(hostHeaders, ["Host", "Hostname", "ESX", "ESXi Host"]);
  const clusterCol = firstHeader(hostHeaders, ["Cluster", "Cluster Name"]);
  const cpuSocketsCol = firstHeader(hostHeaders, ["# CPU", "CPUs", "Sockets"]);
  const cpuCoresCol = firstHeader(hostHeaders, ["# Cores", "Cores", "Cpu Cores"]);
  const hostMemoryGiBCol = firstHeader(hostHeaders, ["Memory", "MemoryGB", "MemoryGiB"]);
  const hostMemoryMiBCol = firstHeader(hostHeaders, ["MemoryMB", "MemoryMiB"]);

  const hostCpuUsagePctCol = firstHeader(hostHeaders, ["CPU Usage %", "CpuUsagePct", "CpuUsagePercent", "% CPU"]);
  const hostMemoryUsagePctCol = firstHeader(hostHeaders, [
    "Memory Usage %",
    "MemUsagePct",
    "MemoryUsagePct",
    "% Memory",
  ]);
  const storageTotalTiBCol = firstHeader(diskHeaders, [
    "CapacityTiB",
    "TotalCapacityTiB",
    "CapacityTB",
    "Capacity",
    "SizeTiB",
    "vDiskCapacityTiB",
  ]);
  const storageUsedTiBCol = firstHeader(diskHeaders, [
    "ConsumedTiB",
    "UsedTiB",
    "InUseTiB",
    "UsedSpaceTiB",
    "ConsumedTB",
    "UsedTB",
    "Consumed",
    "Used",
  ]);

  const uniqueHosts = new Set(
    hostRows.map((row) => String(hostNameCol ? row[hostNameCol] : "").trim()).filter((v) => v.length > 0),
  );
  const uniqueClusters = new Set(
    hostRows.map((row) => String(clusterCol ? row[clusterCol] : "").trim()).filter((v) => v.length > 0),
  );

  const totalCpuCores = hostRows.reduce((sum, row) => {
    const sockets = cpuSocketsCol ? Math.max(1, toNum(row[cpuSocketsCol])) : 1;
    const cores = cpuCoresCol ? toNum(row[cpuCoresCol]) : 0;
    return sum + sockets * cores;
  }, 0);

  const totalMemoryGiB =
    sumColumn(hostRows, hostMemoryGiBCol) + sumColumn(hostRows, hostMemoryMiBCol, 1 / 1024);

  // Consumed should reflect observed usage when available, not allocated VM config.
  // If historical/utilization data is absent in exports, we intentionally return null (N/A in UI).
  const consumedCpuCores =
    hostCpuUsagePctCol && totalCpuCores > 0 && hostRows.length > 0
      ? (sumColumn(hostRows, hostCpuUsagePctCol) / hostRows.length / 100) * totalCpuCores
      : null;

  const consumedMemoryFromHostPct =
    hostMemoryUsagePctCol && totalMemoryGiB > 0 && hostRows.length > 0
      ? (sumColumn(hostRows, hostMemoryUsagePctCol) / hostRows.length / 100) * totalMemoryGiB
      : null;
  const consumedMemoryFromVmUsedGiB =
    sumFirstMatchingColumn(vmRows, vmHeaders, ["UsedMemoryGB", "Memory Used GB", "GuestMemUsedGB"], 1) ??
    sumFirstMatchingColumn(vmRows, vmHeaders, ["UsedMemoryMB", "Memory Used MB", "ConsumedMemoryMB"], 1 / 1024);
  const consumedMemoryGiB = consumedMemoryFromVmUsedGiB ?? consumedMemoryFromHostPct;

  // Storage columns vary heavily by export. If values look like GiB, convert.
  let totalStorageTiB = sumColumn(diskRows, storageTotalTiBCol);
  let consumedStorageTiB = storageUsedTiBCol ? sumColumn(diskRows, storageUsedTiBCol) : null;
  if (totalStorageTiB > 0 && totalStorageTiB > 10_000) totalStorageTiB /= 1024;
  if (consumedStorageTiB != null && consumedStorageTiB > 0 && consumedStorageTiB > 10_000) consumedStorageTiB /= 1024;

  const notes: string[] = [];
  if (!hostRows.length) notes.push("Host sheet not found or empty; CPU/Memory totals may be zero.");
  if (!vmRows.length) notes.push("VM sheet not found or empty; consumed CPU/Memory may be N/A.");
  if (!diskRows.length) notes.push("Disk/storage sheet not found or empty; storage totals may be zero/N/A.");
  if (consumedCpuCores == null) {
    notes.push("CPU consumption not present in export (no usage columns); showing N/A.");
  }
  if (consumedMemoryGiB == null) {
    notes.push("Memory consumption not present in export (no usage columns); showing N/A.");
  }
  if (consumedStorageTiB == null) {
    notes.push("Storage consumption not present in export (no used/consumed columns); showing N/A.");
  }

  return {
    source,
    fileName,
    clusters: uniqueClusters.size || 1,
    hosts: uniqueHosts.size || hostRows.length || 0,
    totalCpuCores: Number(totalCpuCores.toFixed(2)),
    consumedCpuCores: consumedCpuCores == null ? null : Number(consumedCpuCores.toFixed(2)),
    totalMemoryGiB: Number(totalMemoryGiB.toFixed(2)),
    consumedMemoryGiB: consumedMemoryGiB == null ? null : Number(consumedMemoryGiB.toFixed(2)),
    totalStorageTiB: Number(totalStorageTiB.toFixed(2)),
    consumedStorageTiB: consumedStorageTiB == null ? null : Number(consumedStorageTiB.toFixed(2)),
    notes,
  };
}

export type { ParsedEnvironment, SizerSource } from "@/lib/simple-sizer-core";

