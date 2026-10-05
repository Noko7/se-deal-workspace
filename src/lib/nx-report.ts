// Shared presentation helpers for the NX sizer page and its PDF report.
// capacityLines feeds the on-screen "Capacity math" section only; the PDF
// leaves the itemised math out.

import { genericCpuClass, isGenericModel } from "@/lib/nx-catalog";
import type { NodeConfig } from "@/lib/nx-sizer";
import { AHV_PRESETS, CVM_PCORES_PER_NODE, SIZING_CONSTANTS, type NxRecommendation } from "@/lib/nx-sizer";
import { fmtInt, fmtNum, fmtRam, tibToTB } from "@/lib/sizer-format";

export type ReportMeta = {
  customer: string;
  preparedBy: string;
  // Adds an appendix with the per-node platform overhead and capacity math.
  includeDetail: boolean;
};

export function driveLabel(drives: { media: string; count: number; sizeTB: number }[]): string {
  return drives.map((d) => `${d.count} x ${d.sizeTB} TB ${d.media}`).join(" + ");
}

/** The itemised CPU / memory / storage math shown on the sizer page. */
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
        [`Nutanix CVM (${SIZING_CONSTANTS.cvmVcpu} vCPU)`, `-${CVM_PCORES_PER_NODE}`],
        ["Usable per node", fmtInt(cap.cpu.usable), true],
        [`Usable on ${working} working nodes`, fmtInt(cap.cpu.usable * working)],
        [
          (s.cpuBasis === "utilization"
            ? `VMs (${rec.workload.cpuMeasuredVms} at p95, ${rec.workload.cpuFallbackVms} at vCPU/${s.vcpuPerPcore}`
            : `VMs (vCPU / ${s.vcpuPerPcore}`) + (rec.workload.cpuSqlVms ? `, ${rec.workload.cpuSqlVms} SQL at vCPU/${s.sqlVcpuPerPcore})` : ")"),
          fmtNum(d.cpu.vmCores, 2),
        ],
        ...(d.cpu.pcCores ? ([[`Prism Central`, fmtNum(d.cpu.pcCores, 2)]] as [string, string][]) : []),
        ["Workload", fmtNum(d.cpu.total, 2), true],
      ],
    },
    {
      title: "Memory",
      rows: [
        ["RAM per node", fmtRam(cap.ram.rawGiB)],
        ["Safety buffer (5%)", `-${fmtRam(cap.ram.bufferGiB)}`],
        ["Nutanix CVM", `-${fmtRam(cap.ram.cvmGiB)}`],
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
        ["Raw drive capacity per node", tb(cap.storage.rawTiB)],
        ["Nutanix CVM reserve", `-${tb(cap.storage.cvm.totalTiB)}`],
        ["Safety buffer (5%)", `-${tb(cap.storage.bufferTiB)}`],
        ["Usable raw per node", tb(cap.storage.usable), true],
        [`Usable raw on ${working} working nodes`, tb(cap.storage.usable * working)],
        [`VM data, ${s.storageBasis}${s.includePoweredOffStorage ? "" : " (powered on)"}`, tb(d.storage.vmsTiB)],
        ...(d.storage.volumeGroupsTiB ? ([["Volume groups with no VM", tb(d.storage.volumeGroupsTiB)]] as [string, string][]) : []),
        ...(d.storage.pcTiB ? ([["Prism Central", tb(d.storage.pcTiB)]] as [string, string][]) : []),
        ...(d.storage.compressionSavings
          ? ([[`Compression (-${Math.round(d.storage.compressionSavings * 100)}%)`, `-${tb(d.storage.logicalTiB - d.storage.afterCompressionTiB)}`]] as [string, string][])
          : []),
        [`RF${s.rf} copies (+${s.rf - 1} of the data)`, `+${tb(d.storage.rawTiB - d.storage.afterCompressionTiB)}`],
        [`Raw space the workload uses (data x ${s.rf})`, tb(d.storage.rawTiB), true],
      ],
    },
  ];
}

export type StorageRequirement = {
  nodes: number;
  rf: number;
  target: number;
  // Per node, binary TiB.
  node: { rawTiB: number; cvmTiB: number; bufferTiB: number; usableTiB: number; minRawTiB: number };
  // Data the VMs store (after any compression) and the raw space RF needs for it.
  dataTiB: number;
  workloadRawTiB: number;
};

/**
 * Raw drive capacity, per node and per cluster, in the terms a customer and a
 * build partner use. `minRawTiB` is the least raw flash per node that still
 * carries the workload at the target utilization (and with the failover nodes
 * down) for this node count, with the same CVM reserve and 5% buffer applied.
 */
export function storageRequirement(rec: NxRecommendation): StorageRequirement {
  const fit = rec.fit!;
  const st = fit.capacity.storage;
  const s = rec.settings;
  const d = rec.demand.storage;
  const working = fit.clusters.reduce((t, c) => t + c.workingNodes, 0);
  const target = Math.min(1, Math.max(0.1, s.targetUtilization));
  const usableNeed = Math.max(d.rawTiB / (fit.totalNodes * target), working > 0 ? d.rawTiB / working : 0);
  // Reserves that scale with raw capacity versus fixed ones, from this node's drive layout.
  const proportional = st.rawTiB > 0 ? (st.bufferTiB + st.cvm.cassandraTiB + st.cvm.curatorTiB + st.cvm.ext4TiB) / st.rawTiB : 0;
  const fixed = st.cvm.bootHomeTiB + st.cvm.oplogTiB + st.cvm.hadesTiB;
  const minRawTiB = d.rawTiB > 0 ? (usableNeed + fixed) / (1 - proportional) : 0;
  return {
    nodes: fit.totalNodes,
    rf: s.rf,
    target,
    node: { rawTiB: st.rawTiB, cvmTiB: st.cvm.totalTiB, bufferTiB: st.bufferTiB, usableTiB: st.usable, minRawTiB },
    dataTiB: d.afterCompressionTiB,
    workloadRawTiB: d.rawTiB,
  };
}

/** Memory as a partner orders it: DIMM capacity, which vendors label in binary GB. */
export function ramSpec(gib: number): string {
  return `${fmtInt(gib)} GB`;
}

/** Headline for the build: "4 x NX-1175S-G10" or "3 nodes" for generic hardware. */
export function buildHeadline(nodes: number, c: NodeConfig): string {
  return isGenericModel(c.model) ? `${nodes} nodes` : `${nodes} x ${c.model.sku}`;
}

/** One-line node summary under the headline. */
export function buildSubtitle(c: NodeConfig): string {
  if (isGenericModel(c.model)) {
    return `Dual-socket, ${c.cpu.coresPerCpu} cores per CPU · ${ramSpec(c.ramGiB)} RAM · ${driveLabel(c.drives)} all-flash`;
  }
  return `${c.model.formFactor}, ${c.model.socketsPerNode}-socket ${c.model.vendor} ${c.model.cpuFamily}`;
}

/** The CPU line a partner quotes from. */
export function cpuSpec(c: NodeConfig): string {
  if (isGenericModel(c.model)) {
    return `${c.model.socketsPerNode} x ${c.cpu.coresPerCpu}-core CPUs (${c.cores} cores per node), ${genericCpuClass(c.cpu.coresPerCpu)}, current generation`;
  }
  return `${c.model.socketsPerNode} x ${c.cpu.model} (${c.cpu.coresPerCpu} cores, ${c.cpu.baseGHz} GHz)`;
}
