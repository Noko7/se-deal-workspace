import * as XLSX from "xlsx";
import type { ParsedCluster, ParsedEnvironment, SizerSource } from "@/lib/simple-sizer-core";

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

function clampRound(value: number | null): number | null {
  if (value == null) return null;
  return Number(value.toFixed(2));
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

function parseCollectorUsingMoid(workbook: XLSX.WorkBook, fileName: string): ParsedEnvironment {
  const vhosts = rowsFromSheet(sheetByName(workbook, ["vHosts"]));
  const vcluster = rowsFromSheet(sheetByName(workbook, ["vCluster"]));
  const vinfo = rowsFromSheet(sheetByName(workbook, ["vInfo"]));
  const vcpu = rowsFromSheet(sheetByName(workbook, ["vCPU"]));
  const vmemory = rowsFromSheet(sheetByName(workbook, ["vMemory"]));
  const vpartition = rowsFromSheet(sheetByName(workbook, ["vPartition"]));
  const vdisk = rowsFromSheet(sheetByName(workbook, ["vDisk"]));

  if (!vhosts.length || !vinfo.length) {
    throw new ParseWorkbookError("Collector Excel requires vHosts and vInfo sheets with data.");
  }

  const hostByMoid = new Map<string, Record<string, unknown>>();
  const hostToCluster = new Map<string, string>();
  for (const row of vhosts) {
    const hostMoid = String(row["MOID"] ?? "").trim();
    const clusterMoid = String(row["Cluster"] ?? "").trim();
    if (!hostMoid) continue;
    hostByMoid.set(hostMoid, row);
    if (clusterMoid) hostToCluster.set(hostMoid, clusterMoid);
  }

  const clusterNameByMoid = new Map<string, string>();
  for (const row of vcluster) {
    const moid = String(row["MOID"] ?? "").trim();
    const name = String(row["Cluster Name"] ?? row["Cluster"] ?? moid).trim();
    if (moid) clusterNameByMoid.set(moid, name || moid);
  }

  const vmToCluster = new Map<string, string>();
  for (const row of vinfo) {
    const uuid = String(row["UUID"] ?? "").trim();
    const hostMoid = String(row["Host MOID"] ?? "").trim();
    const clusterMoid = hostToCluster.get(hostMoid);
    if (uuid && clusterMoid) vmToCluster.set(uuid, clusterMoid);
  }

  const clusterAgg = new Map<string, {
    clusterMoid: string;
    totalVms: number;
    aggVcpu: number;
    aggRamGiB: number;
    aggStorageProvisionedTiB: number;
    aggStorageConsumedTiB: number;
    maxVmVcpu: number;
    maxVmRamGiB: number;
  }>();
  const ensure = (moid: string) => {
    if (!clusterAgg.has(moid)) {
      clusterAgg.set(moid, {
        clusterMoid: moid,
        totalVms: 0,
        aggVcpu: 0,
        aggRamGiB: 0,
        aggStorageProvisionedTiB: 0,
        aggStorageConsumedTiB: 0,
        maxVmVcpu: 0,
        maxVmRamGiB: 0,
      });
    }
    return clusterAgg.get(moid)!;
  };

  // VM counts per cluster
  const vmSetByCluster = new Map<string, Set<string>>();
  for (const [uuid, clusterMoid] of vmToCluster) {
    if (!vmSetByCluster.has(clusterMoid)) vmSetByCluster.set(clusterMoid, new Set());
    vmSetByCluster.get(clusterMoid)!.add(uuid);
  }
  for (const [clusterMoid, set] of vmSetByCluster) {
    ensure(clusterMoid).totalVms = set.size;
  }

  for (const row of vcpu) {
    const uuid = String(row["UUID"] ?? "").trim();
    const clusterMoid = vmToCluster.get(uuid);
    if (!clusterMoid) continue;
    const val = toNum(row["vCPUs"]);
    const agg = ensure(clusterMoid);
    agg.aggVcpu += val;
    if (val > agg.maxVmVcpu) agg.maxVmVcpu = val;
  }
  for (const row of vmemory) {
    const uuid = String(row["UUID"] ?? "").trim();
    const clusterMoid = vmToCluster.get(uuid);
    if (!clusterMoid) continue;
    const mib = toNum(row["Size (MiB)"]);
    const gib = mib / 1024;
    const agg = ensure(clusterMoid);
    agg.aggRamGiB += gib;
    if (gib > agg.maxVmRamGiB) agg.maxVmRamGiB = gib;
  }
  for (const row of vpartition) {
    const uuid = String(row["UUID"] ?? "").trim();
    const clusterMoid = vmToCluster.get(uuid);
    if (!clusterMoid) continue;
    const provisionedTib = toNum(row["Capacity (MiB)"]) / (1024 * 1024);
    const consumedTib = toNum(row["Consumed (MiB)"]) / (1024 * 1024);
    const agg = ensure(clusterMoid);
    agg.aggStorageProvisionedTiB += provisionedTib;
    agg.aggStorageConsumedTiB += consumedTib;
  }
  // fallback storage from vDisk if vPartition absent
  if (!vpartition.length) {
    for (const row of vdisk) {
      const uuid = String(row["UUID"] ?? "").trim();
      const clusterMoid = vmToCluster.get(uuid);
      if (!clusterMoid) continue;
      const provisionedTib = toNum(row["Capacity (MiB)"]) / (1024 * 1024);
      ensure(clusterMoid).aggStorageProvisionedTiB += provisionedTib;
    }
  }

  const clusterDetails = Array.from(clusterAgg.values()).map((agg) => {
    const hosts = vhosts.filter((h) => String(h["Cluster"] ?? "").trim() === agg.clusterMoid);
    const hardwareModelMap = new Map<string, { model: string; vendor: string | null; hostCount: number; cpuCores: number; memoryGiB: number }>();
    let totalCpuCores = 0;
    let totalMemoryGiB = 0;
    for (const host of hosts) {
      const sockets = Math.max(1, toNum(host["CPUs"]));
      const coresPerCpu = toNum(host["Cores per CPU"]);
      const cpuCores = toNum(host["CPU Cores"]);
      const hostCores = coresPerCpu > 0 ? sockets * coresPerCpu : cpuCores;
      const hostMemory = toNum(host["Memory Size"]) * (1000 ** 3) / (1024 ** 3);
      totalCpuCores += hostCores;
      totalMemoryGiB += hostMemory;
      const model = String(host["Model"] ?? "Unknown").trim() || "Unknown";
      const vendor = String(host["Vendor"] ?? "").trim() || null;
      const key = `${vendor ?? "Unknown"}|${model}`;
      const existing = hardwareModelMap.get(key) ?? { model, vendor, hostCount: 0, cpuCores: 0, memoryGiB: 0 };
      existing.hostCount += 1;
      existing.cpuCores += hostCores;
      existing.memoryGiB += hostMemory;
      hardwareModelMap.set(key, existing);
    }
    return {
      name: clusterNameByMoid.get(agg.clusterMoid) ?? agg.clusterMoid,
      moid: agg.clusterMoid,
      hosts: hosts.length,
      totalVms: agg.totalVms,
      avgVcpuPerVm: agg.totalVms > 0 ? Number((agg.aggVcpu / agg.totalVms).toFixed(2)) : 0,
      vcpuPcoreRatio: totalCpuCores > 0 ? Number((agg.aggVcpu / totalCpuCores).toFixed(2)) : 0,
      hardwareModels: Array.from(hardwareModelMap.values()).map((m) => ({
        model: m.model,
        vendor: m.vendor,
        hostCount: m.hostCount,
        cpuCores: Number(m.cpuCores.toFixed(2)),
        memoryGiB: Number(m.memoryGiB.toFixed(2)),
        storageTiB: hosts.length > 0 ? Number(((agg.aggStorageProvisionedTiB * m.hostCount) / hosts.length).toFixed(2)) : 0,
      })),
      aggVcpu: Number(agg.aggVcpu.toFixed(2)),
      aggRamGiB: Number(agg.aggRamGiB.toFixed(2)),
      aggStorageProvisionedTiB: Number(agg.aggStorageProvisionedTiB.toFixed(2)),
      aggStorageConsumedTiB: Number(agg.aggStorageConsumedTiB.toFixed(2)),
      maxVmVcpu: Number(agg.maxVmVcpu.toFixed(2)),
      maxVmRamGiB: Number(agg.maxVmRamGiB.toFixed(2)),
      totalCpuCores: Number(totalCpuCores.toFixed(2)),
      consumedCpuCores: null,
      totalMemoryGiB: Number(totalMemoryGiB.toFixed(2)),
      consumedMemoryGiB: null,
      totalStorageTiB: Number(agg.aggStorageProvisionedTiB.toFixed(2)),
      consumedStorageTiB: Number(agg.aggStorageConsumedTiB.toFixed(2)),
    };
  });

  const totalVms = clusterDetails.reduce((s, c) => s + c.totalVms, 0);
  const aggVcpu = clusterDetails.reduce((s, c) => s + c.aggVcpu, 0);
  const aggRamGiB = clusterDetails.reduce((s, c) => s + c.aggRamGiB, 0);
  const aggStorageProvisionedTiB = clusterDetails.reduce((s, c) => s + c.aggStorageProvisionedTiB, 0);
  const aggStorageConsumedTiB = clusterDetails.reduce((s, c) => s + c.aggStorageConsumedTiB, 0);
  const totalCpuCores = clusterDetails.reduce((s, c) => s + c.totalCpuCores, 0);
  const totalMemoryGiB = clusterDetails.reduce((s, c) => s + c.totalMemoryGiB, 0);
  const totalStorageTiB = clusterDetails.reduce((s, c) => s + c.totalStorageTiB, 0);
  const maxVmVcpu = clusterDetails.length ? Math.max(...clusterDetails.map((c) => c.maxVmVcpu ?? 0)) : null;
  const maxVmRamGiB = clusterDetails.length ? Math.max(...clusterDetails.map((c) => c.maxVmRamGiB ?? 0)) : null;

  return {
    source: "collector_excel",
    sourceDetection: "manual",
    fileName,
    clusters: clusterDetails.length,
    hosts: vhosts.length,
    totalVms,
    avgVcpuPerVm: totalVms > 0 ? Number((aggVcpu / totalVms).toFixed(2)) : 0,
    vcpuPcoreRatio: totalCpuCores > 0 ? Number((aggVcpu / totalCpuCores).toFixed(2)) : 0,
    totalCpuCores: Number(totalCpuCores.toFixed(2)),
    consumedCpuCores: null,
    totalMemoryGiB: Number(totalMemoryGiB.toFixed(2)),
    consumedMemoryGiB: null,
    totalStorageTiB: Number(totalStorageTiB.toFixed(2)),
    consumedStorageTiB: Number(aggStorageConsumedTiB.toFixed(2)),
    aggVcpu: Number(aggVcpu.toFixed(2)),
    aggRamGiB: Number(aggRamGiB.toFixed(2)),
    aggStorageProvisionedTiB: Number(aggStorageProvisionedTiB.toFixed(2)),
    aggStorageConsumedTiB: Number(aggStorageConsumedTiB.toFixed(2)),
    maxVmVcpu,
    maxVmRamGiB,
    clusterDetails,
    notes: ["Collector parsed with MOID/UUID cluster joins (Collector-Formatter style)."],
  };
}

export function parseSizerWorkbook(fileBuffer: Buffer, source: SizerSource, fileName: string): ParsedEnvironment {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  if (!workbook.SheetNames.length) {
    throw new ParseWorkbookError("Workbook has no sheets.");
  }
  collectorWorkbookGuard(source, workbook);
  if (source === "collector_excel") {
    return parseCollectorUsingMoid(workbook, fileName);
  }

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
  const clusterCol = firstHeader(hostHeaders, ["Cluster Name", "Cluster"]);
  const hostModelCol = firstHeader(hostHeaders, ["Model", "Host Model", "Server Model"]);
  const hostVendorCol = firstHeader(hostHeaders, ["Vendor", "Manufacturer"]);
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
  const perfClusterCol = firstHeader(perfHeaders, ["Cluster", "Cluster Name"]);
  const perfCpuPctCol = firstHeader(perfHeaders, ["Average CPU %", "Avg CPU %", "CPU Usage %"]);
  const perfMemoryPctCol = firstHeader(perfHeaders, ["Average Memory %", "Avg Memory %", "Memory Usage %"]);
  const vmClusterCol = firstHeader(vmHeaders, ["Cluster Name", "Cluster", "Target Cluster"]);
  const vmVcpuCol = firstHeader(vmHeaders, ["vCPUs", "CPUs", "Virtual CPU", "NumCPU", "# vCPU"]);
  const vmRamCol = firstHeader(vmHeaders, [
    "Memory (MiB)",
    "Provisioned Memory (MiB)",
    "Size (MiB)",
    "Memory",
    "Size MiB",
  ]);
  const vmMemoryUsedGiBCol = firstHeader(vmHeaders, ["UsedMemoryGB", "Memory Used GB", "GuestMemUsedGB"]);
  const vmMemoryUsedMiBCol = firstHeader(vmHeaders, ["UsedMemoryMB", "Memory Used MB", "ConsumedMemoryMB"]);
  const vmMemoryUsedKiBCol = firstHeader(vmHeaders, ["UsedMemoryKB", "Memory Used KB"]);
  const vmMemoryUsedBytesCol = firstHeader(vmHeaders, ["UsedMemoryBytes", "Memory Used Bytes"]);
  const diskClusterCol = firstHeader(diskHeaders, ["Cluster", "Cluster Name", "Cluster name"]);
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

  const aggVcpu = vmVcpuCol ? sumColumn(vmRows, vmVcpuCol, 1) : 0;
  const aggRamGiB = vmRamCol
    ? sumColumn(vmRows, vmRamCol, norm(vmRamCol).includes("gib") || norm(vmRamCol).includes("gb") ? 1 : 1 / 1024)
    : totalMemoryGiB;
  const aggStorageProvisionedTiB = totalStorageTiB;
  const aggStorageConsumedTiB = consumedStorageTiB ?? 0;
  const maxVmVcpu = vmVcpuCol ? Math.max(...vmRows.map((row) => toNum(row[vmVcpuCol])), 0) : null;
  const maxVmRamGiB =
    vmRamCol
      ? Math.max(
          ...vmRows.map((row) =>
            toNum(row[vmRamCol]) * (norm(vmRamCol).includes("gib") || norm(vmRamCol).includes("gb") ? 1 : 1 / 1024),
          ),
          0,
        )
      : null;

  const namedClusters = Array.from(uniqueClusters).filter(Boolean);
  const clusterNames = namedClusters.length
    ? namedClusters
    : Array.from(
        new Set(
          hostRows.map((row) => String(clusterCol ? row[clusterCol] : "").trim()).filter((name) => Boolean(name)),
        ),
      );
  const resolvedClusterNames = clusterNames.length ? clusterNames : ["Environment"];

  const clusterDetails: ParsedCluster[] = resolvedClusterNames.map((clusterName) => {
    const hostSubset = clusterName === "Environment"
      ? hostRows
      : hostRows.filter((row) => String(clusterCol ? row[clusterCol] : "").trim() === clusterName);
    const perfSubset = clusterName === "Environment"
      ? perfRows
      : perfRows.filter((row) => String(perfClusterCol ? row[perfClusterCol] : "").trim() === clusterName);
    const vmSubset = clusterName === "Environment"
      ? vmRows
      : vmRows.filter((row) => String(vmClusterCol ? row[vmClusterCol] : "").trim() === clusterName);
    const diskSubset = clusterName === "Environment"
      ? diskRows
      : diskRows.filter((row) => String(diskClusterCol ? row[diskClusterCol] : "").trim() === clusterName);

    const modelMap = new Map<string, { model: string; vendor: string | null; hostCount: number; cpuCores: number; memoryGiB: number }>();
    for (const row of hostSubset) {
      const model = String(hostModelCol ? row[hostModelCol] : "Unknown").trim() || "Unknown";
      const vendor = hostVendorCol ? String(row[hostVendorCol]).trim() || null : null;
      const key = `${vendor ?? "Unknown"}|${model}`;
      const sockets = cpuSocketsCol ? Math.max(1, toNum(row[cpuSocketsCol])) : 1;
      const coresPerCpu = coresPerCpuCol ? toNum(row[coresPerCpuCol]) : 0;
      const cores = coresPerCpu > 0 ? coresPerCpu : cpuCoresCol ? toNum(row[cpuCoresCol]) : 0;
      const memoryGiB = toNum(row[hostMemoryCol]) * inferMemoryToGiBFactor(hostMemoryCol, source);
      const existing = modelMap.get(key) ?? { model, vendor, hostCount: 0, cpuCores: 0, memoryGiB: 0 };
      existing.hostCount += 1;
      existing.cpuCores += sockets * cores;
      existing.memoryGiB += memoryGiB;
      modelMap.set(key, existing);
    }

    const clusterCpu = hostSubset.reduce((sum, row) => {
      const sockets = cpuSocketsCol ? Math.max(1, toNum(row[cpuSocketsCol])) : 1;
      const coresPerCpu = coresPerCpuCol ? toNum(row[coresPerCpuCol]) : 0;
      const cores = coresPerCpu > 0 ? coresPerCpu : cpuCoresCol ? toNum(row[cpuCoresCol]) : 0;
      return sum + sockets * cores;
    }, 0);
    const clusterMemory = sumColumnAutoUnit(hostSubset, hostMemoryCol, (header) => inferMemoryToGiBFactor(header, source));

    const clusterCpuConsumed =
      (hostCpuUsagePctCol && hostSubset.length > 0 && clusterCpu > 0
        ? (sumColumn(hostSubset, hostCpuUsagePctCol) / hostSubset.length / 100) * clusterCpu
        : null) ??
      (perfCpuPctCol && perfSubset.length > 0 && clusterCpu > 0
        ? (sumColumn(perfSubset, perfCpuPctCol) / perfSubset.length / 100) * clusterCpu
        : null);
    const clusterMemConsumed =
      (hostMemoryUsagePctCol && hostSubset.length > 0 && clusterMemory > 0
        ? (sumColumn(hostSubset, hostMemoryUsagePctCol) / hostSubset.length / 100) * clusterMemory
        : null) ??
      (perfMemoryPctCol && perfSubset.length > 0 && clusterMemory > 0
        ? (sumColumn(perfSubset, perfMemoryPctCol) / perfSubset.length / 100) * clusterMemory
        : null) ??
      (vmMemoryUsedGiBCol
        ? sumColumn(vmSubset, vmMemoryUsedGiBCol, 1)
        : vmMemoryUsedMiBCol
          ? sumColumn(vmSubset, vmMemoryUsedMiBCol, 1 / 1024)
          : vmMemoryUsedKiBCol
            ? sumColumn(vmSubset, vmMemoryUsedKiBCol, 1 / (1024 * 1024))
            : vmMemoryUsedBytesCol
              ? sumColumn(vmSubset, vmMemoryUsedBytesCol, 1 / (1024 * 1024 * 1024))
              : null);
    const clusterStorage = sumColumnAutoUnit(diskSubset, storageTotalTiBCol, inferStorageToTiBFactor);
    const clusterStorageConsumed = storageUsedTiBCol
      ? sumColumnAutoUnit(diskSubset, storageUsedTiBCol, inferStorageToTiBFactor)
      : null;
    const clusterAggVcpu = vmVcpuCol ? sumColumn(vmSubset, vmVcpuCol, 1) : 0;
    const clusterAggRamGiB = vmRamCol
      ? sumColumn(
          vmSubset,
          vmRamCol,
          norm(vmRamCol).includes("gib") || norm(vmRamCol).includes("gb") ? 1 : 1 / 1024,
        )
      : clusterMemory;
    const clusterMaxVmVcpu = vmVcpuCol ? Math.max(...vmSubset.map((row) => toNum(row[vmVcpuCol])), 0) : null;
    const clusterMaxVmRamGiB =
      vmRamCol
        ? Math.max(
            ...vmSubset.map((row) =>
              toNum(row[vmRamCol]) * (norm(vmRamCol).includes("gib") || norm(vmRamCol).includes("gb") ? 1 : 1 / 1024),
            ),
            0,
          )
        : null;

    const hardwareModels = Array.from(modelMap.values()).map((m) => ({
      model: m.model,
      vendor: m.vendor,
      hostCount: m.hostCount,
      cpuCores: Number(m.cpuCores.toFixed(2)),
      memoryGiB: Number(m.memoryGiB.toFixed(2)),
      storageTiB: Number(
        (m.hostCount > 0 && clusterStorage > 0 ? (clusterStorage * m.hostCount) / hostSubset.length : 0).toFixed(2),
      ),
    }));

    return {
      name: clusterName,
      moid: null,
      hosts: hostSubset.length,
      totalVms: vmSubset.length,
      avgVcpuPerVm: vmSubset.length > 0 ? Number((clusterAggVcpu / vmSubset.length).toFixed(2)) : 0,
      vcpuPcoreRatio: clusterCpu > 0 ? Number((clusterAggVcpu / clusterCpu).toFixed(2)) : 0,
      hardwareModels,
      aggVcpu: Number(clusterAggVcpu.toFixed(2)),
      aggRamGiB: Number(clusterAggRamGiB.toFixed(2)),
      aggStorageProvisionedTiB: Number(clusterStorage.toFixed(2)),
      aggStorageConsumedTiB: Number((clusterStorageConsumed ?? 0).toFixed(2)),
      maxVmVcpu: clusterMaxVmVcpu == null ? null : Number(clusterMaxVmVcpu.toFixed(2)),
      maxVmRamGiB: clusterMaxVmRamGiB == null ? null : Number(clusterMaxVmRamGiB.toFixed(2)),
      totalCpuCores: Number(clusterCpu.toFixed(2)),
      consumedCpuCores: clampRound(clusterCpuConsumed),
      totalMemoryGiB: Number(clusterMemory.toFixed(2)),
      consumedMemoryGiB: clampRound(clusterMemConsumed),
      totalStorageTiB: Number(clusterStorage.toFixed(2)),
      consumedStorageTiB: clampRound(clusterStorageConsumed),
    };
  });

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
    totalVms: vmRows.length,
    avgVcpuPerVm: vmRows.length > 0 ? Number((aggVcpu / vmRows.length).toFixed(2)) : 0,
    vcpuPcoreRatio: totalCpuCores > 0 ? Number((aggVcpu / totalCpuCores).toFixed(2)) : 0,
    totalCpuCores: Number(totalCpuCores.toFixed(2)),
    consumedCpuCores: consumedCpuCores == null ? null : Number(consumedCpuCores.toFixed(2)),
    totalMemoryGiB: Number(totalMemoryGiB.toFixed(2)),
    consumedMemoryGiB: consumedMemoryGiB == null ? null : Number(consumedMemoryGiB.toFixed(2)),
    totalStorageTiB: Number(totalStorageTiB.toFixed(2)),
    consumedStorageTiB: consumedStorageTiB == null ? null : Number(consumedStorageTiB.toFixed(2)),
    aggVcpu: Number(aggVcpu.toFixed(2)),
    aggRamGiB: Number(aggRamGiB.toFixed(2)),
    aggStorageProvisionedTiB: Number(aggStorageProvisionedTiB.toFixed(2)),
    aggStorageConsumedTiB: Number(aggStorageConsumedTiB.toFixed(2)),
    maxVmVcpu: maxVmVcpu == null ? null : Number(maxVmVcpu.toFixed(2)),
    maxVmRamGiB: maxVmRamGiB == null ? null : Number(maxVmRamGiB.toFixed(2)),
    clusterDetails,
    notes,
  };
}

export type { ParsedEnvironment, SizerSource } from "@/lib/simple-sizer-core";

