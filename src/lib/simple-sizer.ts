import * as XLSX from "xlsx";
import type { ParsedEnvironment, SizerSource } from "@/lib/simple-sizer-core";

class ParseWorkbookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseWorkbookError";
  }
}

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

function inferMemoryToGiBFactor(header: string, source: SizerSource): number {
  const h = norm(header);
  if (h.includes("gib") || h.includes("gb")) return 1;
  if (h.includes("mib") || h.includes("mb")) return 1 / 1024;
  if (h.includes("kib") || h.includes("kb")) return 1 / (1024 * 1024);
  if (h.includes("byte") || h === "b") return 1 / (1024 * 1024 * 1024);
  // RVTools "# Memory" is typically MiB.
  if (
    (source === "rvtools" || source === "liveoptics") &&
    (h === "memory" || h === "memorytotal" || h === "memorysize" || h === "memorymb")
  ) {
    return 1 / 1024;
  }
  return 1;
}

function inferStorageToTiBFactor(header: string): number {
  const h = norm(header);
  if (h.includes("tib") || h.includes("tb")) return 1;
  if (h.includes("gib") || h.includes("gb")) return 1 / 1024;
  if (h.includes("mib") || h.includes("mb")) return 1 / (1024 * 1024);
  if (h.includes("kib") || h.includes("kb")) return 1 / (1024 * 1024 * 1024);
  if (h.includes("byte") || h === "b") return 1 / (1024 * 1024 * 1024 * 1024);
  // Default unknown capacity units in exports are usually GiB.
  return 1 / 1024;
}

function sumColumnAutoUnit(
  rows: Record<string, unknown>[],
  header: string | null,
  factorForHeader: (header: string) => number,
): number {
  if (!header) return 0;
  const factor = factorForHeader(header);
  return sumColumn(rows, header, factor);
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

function requiredHeader(headers: string[], candidates: string[], label: string): string {
  const header = firstHeader(headers, candidates);
  if (!header) {
    throw new ParseWorkbookError(`Missing required ${label} column. Checked: ${candidates.join(", ")}`);
  }
  return header;
}

function hostSheetNamesFor(source: SizerSource): string[] {
  if (source === "collector_excel") return ["vHosts", "vHost", "Hosts"];
  if (source === "liveoptics") return ["ESX Hosts", "Hosts", "Host", "vHost", "ESXi Hosts"];
  return ["vHost", "vHosts", "Hosts"];
}

function vmSheetNamesFor(source: SizerSource): string[] {
  if (source === "liveoptics") return ["VMs", "VM Performance", "VirtualMachines", "vInfo", "Guest VMs"];
  return ["vInfo", "VMs", "VirtualMachines"];
}

function storageSheetNamesFor(source: SizerSource): string[] {
  if (source === "collector_excel") return ["Storage Containers", "vmList", "vDisk", "vPartition", "Storage"];
  if (source === "liveoptics") return ["Host Devices", "VM Disks", "ESX Hosts", "Datastore", "Storage", "vDatastore", "Disks"];
  return ["vDatastore", "Datastore", "vDisk", "vPartition", "Storage"];
}

function collectorWorkbookGuard(source: SizerSource, workbook: XLSX.WorkBook): void {
  if (source !== "collector_excel") return;
  const normalized = new Set(workbook.SheetNames.map(norm));
  const mustHave = ["vhosts", "vinfo"];
  const missing = mustHave.filter((sheet) => !normalized.has(sheet));
  if (missing.length) {
    throw new ParseWorkbookError(
      "Collector Excel format expected (post-import export). Missing sheets: " +
        missing.join(", ") +
        ". If you uploaded the raw collector ZIP, export to Excel from Collector first.",
    );
  }
}

function performanceRowsFor(source: SizerSource, workbook: XLSX.WorkBook): Record<string, unknown>[] {
  if (source === "liveoptics") {
    return rowsFromSheet(sheetByName(workbook, ["ESX Performance", "Host Performance"]));
  }
  return [];
}

export function parseSizerWorkbook(fileBuffer: Buffer, source: SizerSource, fileName: string): ParsedEnvironment {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  if (!workbook.SheetNames.length) {
    throw new ParseWorkbookError("Workbook has no sheets.");
  }
  collectorWorkbookGuard(source, workbook);

  const hostRows = rowsFromSheet(sheetByName(workbook, hostSheetNamesFor(source)));
  const vmRows = rowsFromSheet(sheetByName(workbook, vmSheetNamesFor(source)));
  const diskRows = rowsFromSheet(sheetByName(workbook, storageSheetNamesFor(source)));
  const perfRows = performanceRowsFor(source, workbook);
  if (!hostRows.length) {
    throw new ParseWorkbookError(
      `Could not find host inventory data for ${source}. Available sheets: ${workbook.SheetNames.join(", ")}`,
    );
  }

  const hostHeaders = headersFor(hostRows);
  const vmHeaders = headersFor(vmRows);
  const diskHeaders = headersFor(diskRows);

  const hostNameCol = firstHeader(hostHeaders, ["Host", "Hostname", "ESX", "ESXi Host"]);
  const clusterCol = firstHeader(hostHeaders, ["Cluster", "Cluster Name"]);
  const cpuSocketsCol = firstHeader(hostHeaders, ["# CPU", "CPUs", "Sockets"]);
  const cpuCoresCol = requiredHeader(hostHeaders, ["# Cores", "Cores", "Cpu Cores"], "host CPU cores");
  const coresPerCpuCol = firstHeader(hostHeaders, ["Cores per CPU", "Cores/CPU"]);
  const hostMemoryCol = firstHeader(hostHeaders, [
    "# Memory",
    "Memory Size",
    "Memory (KiB)",
    "Memory (MiB)",
    "Memory (GiB)",
    "MemoryGB",
    "MemoryGiB",
    "MemoryMB",
    "MemoryMiB",
    "Memory",
  ]);
  if (!hostMemoryCol) {
    throw new ParseWorkbookError("Missing required host memory column (GiB or MiB).");
  }

  const hostCpuUsagePctCol = firstHeader(hostHeaders, ["CPU Usage %", "CpuUsagePct", "CpuUsagePercent", "% CPU"]);
  const hostMemoryUsagePctCol = firstHeader(hostHeaders, [
    "Memory Usage %",
    "MemUsagePct",
    "MemoryUsagePct",
    "% Memory",
  ]);
  const perfHeaders = headersFor(perfRows);
  const perfCpuPctCol = firstHeader(perfHeaders, ["Average CPU %", "Avg CPU %", "CPU Usage %"]);
  const perfMemoryPctCol = firstHeader(perfHeaders, ["Average Memory %", "Avg Memory %", "Memory Usage %"]);
  const storageTotalTiBCol = firstHeader(diskHeaders, [
    "CapacityTiB",
    "TotalCapacityTiB",
    "CapacityTB",
    "CapacityGB",
    "CapacityMB",
    "Capacity MiB",
    "Capacity GiB",
    "Capacity",
    "Capacity (MiB)",
    "Capacity (GiB)",
    "Local Capacity (GiB)",
    "Guest VM Disk Capacity (MiB)",
    "Virtual Disk Size (MiB)",
    "SizeTiB",
    "Total",
    "vDiskCapacityTiB",
  ]);
  const storageUsedTiBCol = firstHeader(diskHeaders, [
    "ConsumedTiB",
    "UsedTiB",
    "In Use",
    "InUse",
    "In Use MiB",
    "In Use GiB",
    "ProvisionedGB",
    "ProvisionedMB",
    "Consumed (MiB)",
    "In Use MiB",
    "Used (MiB)",
    "Used Capacity (GiB)",
    "Guest VM Disk Used (MiB)",
    "Virtual Disk Used (MiB)",
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
    const coresPerCpu = coresPerCpuCol ? toNum(row[coresPerCpuCol]) : 0;
    const cores = coresPerCpu > 0 ? coresPerCpu : cpuCoresCol ? toNum(row[cpuCoresCol]) : 0;
    return sum + sockets * cores;
  }, 0);

  let totalMemoryGiB = sumColumnAutoUnit(hostRows, hostMemoryCol, (header) => inferMemoryToGiBFactor(header, source));
  if (totalMemoryGiB > 0 && hostRows.length > 0) {
    // Guardrail: if per-host memory is absurdly high, likely still in MiB/KiB.
    let perHost = totalMemoryGiB / Math.max(1, hostRows.length);
    let fixes = 0;
    while (perHost > 8192 && fixes < 3) {
      totalMemoryGiB /= 1024;
      perHost = totalMemoryGiB / Math.max(1, hostRows.length);
      fixes += 1;
    }
  }

  // Consumed should reflect observed usage when available, not allocated VM config.
  // If historical/utilization data is absent in exports, we intentionally return null (N/A in UI).
  const consumedCpuCores =
    (hostCpuUsagePctCol && totalCpuCores > 0 && hostRows.length > 0
      ? (sumColumn(hostRows, hostCpuUsagePctCol) / hostRows.length / 100) * totalCpuCores
      : null) ??
    (perfCpuPctCol && perfRows.length > 0 && totalCpuCores > 0
      ? (sumColumn(perfRows, perfCpuPctCol) / perfRows.length / 100) * totalCpuCores
      : null);

  const consumedMemoryFromHostPct =
    (hostMemoryUsagePctCol && totalMemoryGiB > 0 && hostRows.length > 0
      ? (sumColumn(hostRows, hostMemoryUsagePctCol) / hostRows.length / 100) * totalMemoryGiB
      : null) ??
    (perfMemoryPctCol && perfRows.length > 0 && totalMemoryGiB > 0
      ? (sumColumn(perfRows, perfMemoryPctCol) / perfRows.length / 100) * totalMemoryGiB
      : null);
  const consumedMemoryFromVmUsedGiB =
    sumFirstMatchingColumn(vmRows, vmHeaders, ["UsedMemoryGB", "Memory Used GB", "GuestMemUsedGB"], 1) ??
    sumFirstMatchingColumn(vmRows, vmHeaders, ["UsedMemoryMB", "Memory Used MB", "ConsumedMemoryMB"], 1 / 1024) ??
    sumFirstMatchingColumn(vmRows, vmHeaders, ["UsedMemoryKB", "Memory Used KB"], 1 / (1024 * 1024)) ??
    sumFirstMatchingColumn(vmRows, vmHeaders, ["UsedMemoryBytes", "Memory Used Bytes"], 1 / (1024 * 1024 * 1024));
  let consumedMemoryGiB = consumedMemoryFromVmUsedGiB ?? consumedMemoryFromHostPct;
  if (consumedMemoryGiB != null && totalMemoryGiB > 0) {
    let fixes = 0;
    while (consumedMemoryGiB > totalMemoryGiB * 4 && fixes < 3) {
      consumedMemoryGiB /= 1024;
      fixes += 1;
    }
  }

  // Storage columns vary heavily by export. If values look like GiB, convert.
  let totalStorageTiB = sumColumnAutoUnit(diskRows, storageTotalTiBCol, inferStorageToTiBFactor);
  let consumedStorageTiB = storageUsedTiBCol
    ? sumColumnAutoUnit(diskRows, storageUsedTiBCol, inferStorageToTiBFactor)
    : null;
  if (totalStorageTiB > 0 && totalStorageTiB > 100_000) totalStorageTiB /= 1024;
  if (consumedStorageTiB != null && consumedStorageTiB > 0 && consumedStorageTiB > 100_000) consumedStorageTiB /= 1024;

  const notes: string[] = [];
  notes.push(`Using manually selected source: ${source}.`);
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
    sourceDetection: "manual",
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

