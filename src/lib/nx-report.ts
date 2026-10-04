// Shared presentation helpers for the NX sizer page and its PDF report.

import { findNxModel } from "@/lib/nx-catalog";
import { AHV_PRESETS, CVM_PCORES_PER_NODE, SIZING_CONSTANTS, cvmRamGiBFor, type NxRecommendation } from "@/lib/nx-sizer";
import { fmtInt, fmtNum, fmtRam, tibToTB } from "@/lib/sizer-format";

export type ReportMeta = { customer: string; preparedBy: string };

export function driveLabel(drives: { media: string; count: number; sizeTB: number }[]): string {
  return drives.map((d) => `${d.count} x ${d.sizeTB} TB ${d.media}`).join(" + ");
}

/** The itemised CPU / memory / storage math, shared by the page and the PDF. */
export function capacityLines(rec: NxRecommendation): { title: string; rows: [string, string, boolean?][] }[] {
  const fit = rec.fit!;
  const cap = fit.capacity;
  const d = rec.demand;
  const s = rec.settings;
  const working = fit.clusters.reduce((t, c) => t + c.workingNodes, 0);
  const ahv = AHV_PRESETS[s.ahvPreset];
  const tb = (tib: number) => `${fmtNum(tibToTB(tib), 2)} TB`;
  return [
    {
      title: "CPU (physical cores)",
      rows: [
        ["Cores per node", fmtInt(cap.cpu.cores)],
        [`CVM (${SIZING_CONSTANTS.cvmVcpu} vCPU at 2:1)`, `-${CVM_PCORES_PER_NODE}`],
        ["Usable per node", fmtInt(cap.cpu.usable), true],
        [`Usable on ${working} working nodes`, fmtInt(cap.cpu.usable * working)],
        [s.cpuBasis === "utilization" ? `VMs (${rec.workload.cpuMeasuredVms} at p95, ${rec.workload.cpuFallbackVms} at vCPU/${s.vcpuPerPcore})` : `VMs (vCPU / ${s.vcpuPerPcore})`, fmtNum(d.cpu.vmCores, 2)],
        ...(d.cpu.pcCores ? ([[`Prism Central`, fmtNum(d.cpu.pcCores, 2)]] as [string, string][]) : []),
        ["Workload", fmtNum(d.cpu.total, 2), true],
      ],
    },
    {
      title: "Memory",
      rows: [
        ["RAM per node", fmtRam(cap.ram.rawGiB)],
        ["Safety buffer (5%)", `-${fmtRam(cap.ram.bufferGiB)}`],
        [`CVM (${cvmRamGiBFor(s.rf)} GiB)`, `-${fmtRam(cap.ram.cvmGiB)}`],
        [`AHV host (${ahv.label})`, `-${fmtRam(cap.ram.ahvHostGiB)}`],
        ["Usable per node", fmtRam(cap.ram.usable), true],
        [`Usable on ${working} working nodes`, fmtRam(cap.ram.usable * working)],
        [s.memoryBasis === "consumed" ? `VMs, consumed (${rec.workload.ramMeasuredVms} measured)` : "VMs, provisioned", fmtRam(d.ram.vmGiB)],
        ["AHV per-VM overhead", fmtRam(d.ram.vmOverheadGiB)],
        ...(d.ram.pcGiB ? ([["Prism Central (+ overhead)", fmtRam(d.ram.pcGiB + d.ram.pcOverheadGiB)]] as [string, string][]) : []),
        ["Workload", fmtRam(d.ram.total), true],
      ],
    },
    {
      title: "Storage",
      rows: [
        ["Raw per node", tb(cap.storage.rawTiB)],
        ["Safety buffer (5%)", `-${tb(cap.storage.bufferTiB)}`],
        ["CVM: boot + home", `-${tb(cap.storage.cvm.bootHomeTiB)}`],
        [`CVM: oplog (RF${s.rf})`, `-${tb(cap.storage.cvm.oplogTiB)}`],
        ["CVM: Hades", `-${tb(cap.storage.cvm.hadesTiB)}`],
        ["CVM: Cassandra (3%)", `-${tb(cap.storage.cvm.cassandraTiB)}`],
        ["CVM: Curator (2%)", `-${tb(cap.storage.cvm.curatorTiB)}`],
        ["CVM: ext4", `-${tb(cap.storage.cvm.ext4TiB)}`],
        ["Usable raw per node", tb(cap.storage.usable), true],
        [`Usable raw on ${working} working nodes`, tb(cap.storage.usable * working)],
        [`VMs, ${s.storageBasis}${s.includePoweredOffStorage ? "" : " (powered on)"}`, tb(d.storage.vmsTiB)],
        ...(d.storage.volumeGroupsTiB ? ([["Volume groups with no VM", tb(d.storage.volumeGroupsTiB)]] as [string, string][]) : []),
        ...(d.storage.pcTiB ? ([["Prism Central", tb(d.storage.pcTiB)]] as [string, string][]) : []),
        ...(d.storage.compressionSavings
          ? ([[`Compression (-${Math.round(d.storage.compressionSavings * 100)}%)`, `-${tb(d.storage.logicalTiB - d.storage.afterCompressionTiB)}`]] as [string, string][])
          : []),
        [`x RF${s.rf}`, tb(d.storage.rawTiB - d.storage.afterCompressionTiB)],
        ["Workload (raw)", tb(d.storage.rawTiB), true],
      ],
    },
  ];
}

export function modelLabel(sku: string): string {
  const m = findNxModel(sku);
  return m ? `${m.sku} (${m.formFactor}, ${m.socketsPerNode}-socket ${m.vendor} ${m.cpuFamily})` : sku;
}
