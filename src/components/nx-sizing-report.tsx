"use client";

// Printable sizing report. Rendered off-screen and sent to the browser's
// print-to-PDF, the same pattern as the Proposal and QBR builders. Every figure
// comes from the recommendation object; nothing is recomputed here.

import type { ReactNode } from "react";
import type { ParsedEnvironment } from "@/lib/simple-sizer-core";
import {
  AHV_PRESETS,
  CVM_PCORES_PER_NODE,
  SIZING_CONSTANTS,
  cvmRamGiBFor,
  type NxRecommendation,
} from "@/lib/nx-sizer";
import { UNIT_FOOTNOTE, fmtInt, fmtNum, fmtRam, fmtStorage } from "@/lib/sizer-format";
import { capacityLines, driveLabel, modelLabel, type ReportMeta } from "@/lib/nx-report";

const SOURCE_LABEL = { collector_excel: "Nutanix Collector", rvtools: "RVTools", liveoptics: "LiveOptics" } as const;

export function SizingReport({ parsed, rec, meta }: { parsed: ParsedEnvironment; rec: NxRecommendation; meta: ReportMeta }) {
  const fit = rec.fit!;
  const c = fit.config;
  const s = rec.settings;
  const u = rec.utilization!;
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const working = fit.clusters.reduce((t, k) => t + k.workingNodes, 0);
  const pc = rec.workload.prismCentral;
  const ahv = AHV_PRESETS[s.ahvPreset];

  return (
    <article className="sizer-report bg-white text-[11px] leading-relaxed text-charcoal-900">
      <header className="border-b-2 border-iris-500 pb-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-iris-600">Nutanix NX hardware sizing</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{meta.customer || "Customer environment"}</h1>
        <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-0.5 text-[10px] text-charcoal-600">
          <span>Prepared by: {meta.preparedBy || "-"}</span>
          <span>Date: {date}</span>
          <span>Source: {SOURCE_LABEL[parsed.source]} export</span>
          <span className="truncate">File: {parsed.fileName}</span>
        </div>
      </header>

      <H2 n={1}>Recommendation</H2>
      <p>
        <strong>
          {fit.totalNodes} x {modelLabel(c.model.sku)}
        </strong>
        {fit.clusters.length === 1
          ? ` in one cluster, RF${s.rf}, N+${s.failoverNodes}.`
          : ` in ${fit.clusters.length} clusters of ${fit.clusters.map((k) => k.nodes).join(", ")} nodes, RF${s.rf}, each N+${s.failoverNodes}.`}{" "}
        The node count is set by {fit.driver === "minimum" ? `the RF${s.rf} minimum node count` : `${fit.driver.toUpperCase()} demand`}.
      </p>
      <Table
        head={["Per-node hardware requirement", "Value"]}
        rows={[
          ["CPU", `${c.model.socketsPerNode} x ${c.cpu.model} (${c.cpu.coresPerCpu} cores, ${c.cpu.baseGHz} GHz base)`],
          ["Physical cores", fmtInt(c.cores)],
          ["Memory", fmtRam(c.ramGiB)],
          ["Data drives", driveLabel(c.drives)],
          ["Raw storage", `${fmtNum(c.rawTB, 2)} TB`],
          ["Boot device", c.model.bootDevice ?? "Not stated on the spec sheet"],
        ]}
      />
      <Table
        head={["Cluster totals", "Installed", "Usable after overhead", "Demand"]}
        rows={[
          ["Physical cores", fmtInt(fit.totalNodes * c.cores), fmtInt(fit.totalNodes * fit.capacity.cpu.usable), fmtNum(rec.demand.cpu.total, 2)],
          ["Memory", fmtRam(fit.totalNodes * c.ramGiB), fmtRam(fit.totalNodes * fit.capacity.ram.usable), fmtRam(rec.demand.ram.total)],
          [
            "Storage (raw)",
            fmtStorage(fit.totalNodes * fit.capacity.storage.rawTiB, 2),
            fmtStorage(fit.totalNodes * fit.capacity.storage.usable, 2),
            fmtStorage(rec.demand.storage.rawTiB, 2),
          ],
        ]}
      />
      <Table
        head={["Utilization of usable capacity", "All nodes up", `${s.failoverNodes} node(s) lost per cluster`]}
        rows={[
          ["CPU", `${fmtNum(u.cpu.allUp, 1)}%`, `${fmtNum(u.cpu.failover, 1)}%`],
          ["Memory", `${fmtNum(u.ram.allUp, 1)}%`, `${fmtNum(u.ram.failover, 1)}%`],
          ["Storage", `${fmtNum(u.storage.allUp, 1)}%`, `${fmtNum(u.storage.failover, 1)}%`],
        ]}
      />

      <H2 n={2}>Sizing method</H2>
      <ul className="list-disc space-y-0.5 pl-4">
        <li>Sized from the VMs in the export only. Existing host hardware is shown for context and does not drive the build.</li>
        <li>
          CPU:{" "}
          {s.cpuBasis === "utilization"
            ? `utilization. Each VM's 95th-percentile CPU (vCPU x 95th-percentile %) where the export has it, otherwise vCPU / ${s.vcpuPerPcore}. ${rec.workload.cpuMeasuredVms} VMs measured, ${rec.workload.cpuFallbackVms} at vCPU / ${s.vcpuPerPcore}.`
            : `configuration. Configured vCPU / ${s.vcpuPerPcore} for every VM.`}{" "}
          Source vCPU:pCore ratio {fmtNum(parsed.vcpuPcoreRatio, 2)}. CPU is not normalised between source and NX processor generations.
        </li>
        <li>
          Memory:{" "}
          {s.memoryBasis === "consumed"
            ? `consumed. 95th-percentile memory where measured (${rec.workload.ramMeasuredVms} VMs), configured memory for the rest.`
            : "provisioned. Configured VM memory."}
        </li>
        <li>
          Storage: {s.storageBasis === "consumed" ? "consumed (guest partition used space; VMs with no consumed figure at provisioned)" : "provisioned (virtual disk capacity)"} for{" "}
          {s.includePoweredOffStorage ? "every VM, powered on or off" : "powered-on VMs only"}, plus volume groups with no owning VM.
          {s.compressionSavings ? ` Compression savings of ${Math.round(s.compressionSavings * 100)}% applied before RF.` : " No data reduction assumed."}
        </li>
        <li>Compute sized on {s.workloadBasis === "poweredOn" ? "powered-on VMs" : "all VMs"}.</li>
        <li>
          Model: {s.modelSku === "auto" ? "automatic, NX-1175S-G10 first, stepping up only when the largest VM cannot fit on one node" : `fixed to ${s.modelSku}`}. Within a
          model, the configuration with the fewest total cores is chosen (NCI is licensed per core), then fewest nodes, least RAM, least raw storage.
        </li>
        <li>Minimum {SIZING_CONSTANTS.minCoresPerNode} physical cores per node. Up to {SIZING_CONSTANTS.maxNodesPerCluster} nodes per cluster.</li>
      </ul>

      <H2 n={3}>Nutanix platform overhead, per node</H2>
      <Table
        head={["Item", "Value", "Basis"]}
        rows={[
          ["CVM vCPU", `${SIZING_CONSTANTS.cvmVcpu} vCPU = ${CVM_PCORES_PER_NODE} physical cores`, "Hyperthreading enabled, 2 vCPU per core (Sizer Regular mode)"],
          ["CVM memory", `${cvmRamGiBFor(s.rf)} GiB (${fmtRam(cvmRamGiBFor(s.rf))})`, s.rf === 3 ? "AOS 7.6 Table 17: RF3 adds 8 GiB, max 40 GiB" : "AOS 7.6 Table 16 default"],
          [
            "AHV host memory",
            `${fmtNum(ahv.hostBaseGiB, 2)} GiB + ${fmtNum(ahv.hostFractionOfRam * 100, 1)}% of RAM${s.flowVirtualNetworking ? " + 2 GiB Flow VN" : ""}${s.flowMicrosegmentation ? " + 4 GiB Flow microsegmentation" : ""}`,
            ahv.label,
          ],
          ["AHV per-VM memory", `${fmtNum(ahv.perVmBaseMiB, 1)} MiB + ${ahv.perVmPerVcpuMiB} MiB/vCPU + ${ahv.perVmPerRamGiBMiB} MiB/GiB RAM`, ahv.label],
          ["Safety buffer", "5% of raw RAM and 5% of raw storage", "Applied to every node"],
          [
            "CVM storage",
            `280 GB + ${SIZING_CONSTANTS.cvmStorage.oplogGB[s.rf]} GB oplog + 100 GB per data drive + 3% + 2% of raw + ext4`,
            "ext4: 1.8% HDD, 2.6% flash under 4 TB, 1.8% flash 4 TB and over",
          ],
          ["AHV CPU", "None charged", "No fixed AHV CPU percentage is applied"],
          ["Failover", `N+${s.failoverNodes}: demand must fit on ${working} of ${fit.totalNodes} nodes`, "CPU, memory and storage"],
        ]}
      />

      <H2 n={4}>Capacity calculation</H2>
      <div className="grid grid-cols-3 gap-4">
        {capacityLines(rec).map((block) => (
          <div key={block.title} className="break-inside-avoid">
            <p className="font-semibold">{block.title}</p>
            <table className="mt-1 w-full">
              <tbody>
                {block.rows.map(([k, v, strong]) => (
                  <tr key={k} className="border-b border-charcoal-100">
                    <td className={`py-0.5 pr-2 ${strong ? "font-semibold" : "text-charcoal-700"}`}>{k}</td>
                    <td className={`py-0.5 text-right font-mono ${strong ? "font-semibold" : ""}`}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <H2 n={5}>Workload</H2>
      <Table
        head={["Measure", "Value"]}
        rows={[
          ["VMs in export", fmtInt(parsed.vms.length)],
          ["VMs excluded by the SE", fmtInt(rec.workload.excludedVms - rec.workload.sourceCvmsExcluded.length)],
          ["Source-cluster CVM rows excluded", fmtInt(rec.workload.sourceCvmsExcluded.length)],
          ["VMs sized for CPU and memory", fmtInt(rec.workload.runningVms)],
          ["vCPU", fmtInt(rec.workload.vcpu)],
          ["CPU cores used", fmtNum(rec.workload.cpuCores, 2)],
          [`Memory, ${s.memoryBasis}`, fmtRam(rec.workload.ramGiB)],
          [`Storage, ${s.storageBasis}`, fmtStorage(rec.demand.storage.vmsTiB, 2)],
          ["Volume groups with no VM", fmtStorage(rec.demand.storage.volumeGroupsTiB, 3)],
          ["Prism Central", pc ? `${pc.label}: ${pc.vcpu} vCPU, ${pc.ramGiB} GiB, ${s.storageBasis === "consumed" ? pc.storageGiB : pc.vdiskGiB} GiB` : "Not included"],
          [
            "Largest VM by vCPU",
            rec.workload.largestVm.byVcpu ? `${rec.workload.largestVm.byVcpu.name}: ${rec.workload.largestVm.byVcpu.vcpu} vCPU, ${fmtRam(rec.workload.largestVm.byVcpu.ramGiB)}` : "-",
          ],
          [
            "Largest VM by memory",
            rec.workload.largestVm.byRam ? `${rec.workload.largestVm.byRam.name}: ${rec.workload.largestVm.byRam.vcpu} vCPU, ${fmtRam(rec.workload.largestVm.byRam.ramGiB)}` : "-",
          ],
        ]}
      />

      <H2 n={6}>Existing environment (context)</H2>
      <p>
        {fmtInt(parsed.clusters)} cluster(s), {fmtInt(parsed.hosts)} host(s), {fmtInt(parsed.totalCpuCores)} physical cores,{" "}
        {fmtRam(parsed.totalMemoryGiB)} of host memory.
      </p>

      <H2 n={7}>Model selection</H2>
      <ul className="list-disc pl-4">
        {rec.attempts.map((a) => (
          <li key={a.sku}>
            {a.sku}: {a.fits ? "fits; selected" : `not used (${a.reason})`}
          </li>
        ))}
      </ul>

      {rec.warnings.length || parsed.notes.length ? (
        <>
          <H2 n={8}>Notes and exceptions</H2>
          <ul className="list-disc space-y-0.5 pl-4">
            {[...rec.warnings, ...parsed.notes].map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </>
      ) : null}

      <H2 n={9}>Data sources</H2>
      <Table
        head={["Field", "Sheet and column", "Unit"]}
        rows={parsed.audit.map((a) => [a.field, `${a.sheet} · ${a.column ?? "none"}`, a.unit ? `${a.unit} (${a.confidence})` : a.confidence])}
      />

      <footer className="mt-6 border-t border-charcoal-200 pt-2 text-[9px] text-charcoal-500">
        {UNIT_FOOTNOTE} Hardware options from Nutanix NX G10 System Specifications. Final part numbers and DIMM layouts are confirmed with the build partner.
      </footer>
    </article>
  );
}

function H2({ n, children }: { n: number; children: ReactNode }) {
  return (
    <h2 className="mt-5 mb-1.5 break-after-avoid border-b border-charcoal-200 pb-0.5 text-[13px] font-semibold text-charcoal-900">
      <span className="mr-1.5 text-iris-600">{n}.</span>
      {children}
    </h2>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <table className="mt-2 w-full break-inside-avoid border-collapse">
      <thead>
        <tr className="bg-charcoal-50">
          {head.map((h, i) => (
            <th key={h} className={`border-b border-charcoal-300 px-1.5 py-1 text-left font-semibold ${i > 0 ? "text-right" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="border-b border-charcoal-100">
            {r.map((cell, i) => (
              <td key={i} className={`px-1.5 py-0.5 align-top ${i > 0 ? "text-right font-mono" : ""}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
