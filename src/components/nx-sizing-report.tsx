"use client";

// Printable sizing report. Rendered off-screen and sent to the browser's
// print-to-PDF, the same pattern as the Proposal and QBR builders. Every figure
// comes from the recommendation object; nothing is recomputed here.
//
// Kept deliberately short for partners and customers: the build, the hardware,
// one capacity table and the assumptions in plain language. The itemised math
// stays on screen. Page-break rules for each <section>, table and heading live
// with the print CSS in globals.css (.sizer-report).

import type { ReactNode } from "react";
import type { ParsedEnvironment } from "@/lib/simple-sizer-core";
import type { NxRecommendation } from "@/lib/nx-sizer";
import { UNIT_FOOTNOTE, fmtInt, fmtNum, fmtRam, fmtStorage } from "@/lib/sizer-format";
import { driveLabel, type ReportMeta } from "@/lib/nx-report";

const SOURCE_LABEL = { collector_excel: "Nutanix Collector", rvtools: "RVTools", liveoptics: "LiveOptics" } as const;
const DRIVER_LABEL = { cpu: "CPU workload", ram: "Memory workload", storage: "Storage workload" } as const;

export function SizingReport({ parsed, rec, meta }: { parsed: ParsedEnvironment; rec: NxRecommendation; meta: ReportMeta }) {
  const fit = rec.fit!;
  const c = fit.config;
  const cap = fit.capacity;
  const s = rec.settings;
  const u = rec.utilization!;
  const d = rec.demand;
  const w = rec.workload;
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const working = fit.clusters.reduce((t, k) => t + k.workingNodes, 0);
  const multi = fit.clusters.length > 1;
  const target = Math.round(s.targetUtilization * 100);
  const pct = (v: number) => `${fmtNum(v, 0)}%`;
  const notes = [...rec.warnings, ...parsed.notes];

  const layout = multi ? `${fit.clusters.length} clusters of ${fit.clusters.map((k) => k.nodes).join(" + ")} nodes` : `1 cluster of ${fit.totalNodes} nodes`;
  const failover =
    s.failoverNodes === 0 ? "N+0 (no spare node)" : `N+${s.failoverNodes}${multi ? " per cluster" : ""}`;
  const lostLabel = `${s.failoverNodes} node${s.failoverNodes === 1 ? "" : "s"} down${multi ? " per cluster" : ""}`;

  const cpuBasis =
    s.cpuBasis === "utilization"
      ? `CPU from measured 95th-percentile use (vCPU / ${s.vcpuPerPcore} where not measured)`
      : `CPU at configured vCPU / ${s.vcpuPerPcore}`;
  const ramBasis = s.memoryBasis === "consumed" ? "memory from measured 95th-percentile use (provisioned where not measured)" : "memory as provisioned";
  const storageBasis = `storage as ${s.storageBasis}${s.includePoweredOffStorage ? ", including powered-off VMs" : ", powered-on VMs only"}`;
  const reduction = s.compressionSavings ? `${Math.round(s.compressionSavings * 100)}% compression savings assumed.` : "No data reduction assumed.";

  return (
    <article className="sizer-report bg-white text-[12px] leading-relaxed text-charcoal-900">
      <header className="border-b-2 border-iris-500 pb-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-iris-600">Nutanix NX hardware sizing</p>
        <h1 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-tight">{meta.customer || "Customer environment"}</h1>
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-[10.5px] text-charcoal-600">
          <span>Prepared by: {meta.preparedBy || "-"}</span>
          <span>Date: {date}</span>
          <span>Source: {SOURCE_LABEL[parsed.source]} export</span>
          <span className="truncate">File: {parsed.fileName}</span>
        </div>
      </header>

      <Section title="Recommendation">
        <div className="rounded-lg border border-iris-200 bg-iris-50 px-6 py-5">
          <p className="text-[22px] font-semibold leading-tight tracking-tight">
            {fit.totalNodes} x {c.model.sku}
          </p>
          <p className="mt-1 text-charcoal-700">
            {c.model.formFactor}, {c.model.socketsPerNode}-socket {c.model.vendor} {c.model.cpuFamily}
          </p>
          <dl className="mt-5 grid grid-cols-3 gap-x-6 gap-y-4">
            <Fact label="Cluster layout">{layout}</Fact>
            <Fact label="Data protection">RF{s.rf}</Fact>
            <Fact label="Failover">{failover}</Fact>
            <Fact label="Target utilization">{s.targetUtilization >= 1 ? "None (failover limit only)" : `${target}% with all nodes up`}</Fact>
            <Fact label="Total physical cores">{fmtInt(fit.totalCores)}</Fact>
            <Fact label="Node count set by">{fit.driver === "minimum" ? `RF${s.rf} minimum cluster size` : DRIVER_LABEL[fit.driver]}</Fact>
          </dl>
        </div>
      </Section>

      <Section title="Hardware per node">
        <Table
          textValues
          head={["Component", "Specification"]}
          rows={[
            ["CPU", `${c.model.socketsPerNode} x ${c.cpu.model} (${c.cpu.coresPerCpu} cores, ${c.cpu.baseGHz} GHz)`],
            ["Physical cores", fmtInt(c.cores)],
            ["Memory", fmtRam(c.ramGiB)],
            ["Data drives", driveLabel(c.drives)],
            ["Raw storage", `${fmtNum(c.rawTB, 1)} TB`],
          ]}
        />
      </Section>

      <Section title="Cluster capacity and utilization">
        <Table
          head={[
            "Resource",
            "Usable capacity",
            "Workload",
            "Utilization, all nodes up",
            ...(s.failoverNodes > 0 ? [`Utilization, ${lostLabel}`] : []),
          ]}
          rows={[
            [
              "CPU (physical cores)",
              fmtInt(fit.totalNodes * cap.cpu.usable),
              fmtNum(d.cpu.total, 1),
              pct(u.cpu.allUp),
              ...(s.failoverNodes > 0 ? [pct(u.cpu.failover)] : []),
            ],
            ["Memory", fmtRam(fit.totalNodes * cap.ram.usable), fmtRam(d.ram.total), pct(u.ram.allUp), ...(s.failoverNodes > 0 ? [pct(u.ram.failover)] : [])],
            [
              `Storage (raw, RF${s.rf})`,
              fmtStorage(fit.totalNodes * cap.storage.usable, 1),
              fmtStorage(d.storage.rawTiB, 1),
              pct(u.storage.allUp),
              ...(s.failoverNodes > 0 ? [pct(u.storage.failover)] : []),
            ],
          ]}
        />
        <p className="mt-3 text-[10.5px] text-charcoal-600">
          Usable capacity is what remains on all {fit.totalNodes} nodes after the Nutanix platform overhead. Utilization is the workload as a share of usable capacity.
        </p>
      </Section>

      <Section title="How this was sized">
        <ul className="list-disc space-y-2.5 pl-5 marker:text-iris-500">
          <li>
            <strong>Workload:</strong> {fmtInt(w.runningVms)} {s.workloadBasis === "poweredOn" ? "powered-on " : ""}VMs from the {SOURCE_LABEL[parsed.source]} export
            {w.prismCentral ? `, plus Prism Central (${w.prismCentral.label})` : ""}. The existing hosts do not shape the build.
          </li>
          <li>
            <strong>Workload basis:</strong> {cpuBasis}; {ramBasis}; {storageBasis}. {reduction}
          </li>
          <li>
            <strong>Target utilization:</strong>{" "}
            {s.targetUtilization >= 1
              ? "none. Nodes are added only until the workload fits with the failover nodes down."
              : `nodes are added until CPU, memory and storage each sit at or under ${target}% of usable capacity with every node up, leaving room for growth.`}
          </li>
          <li>
            <strong>Failover:</strong>{" "}
            {s.failoverNodes === 0
              ? "N+0. There is no spare node; losing a node leaves the cluster short."
              : `N+${s.failoverNodes}. The workload still fits with ${lostLabel} (${working} of ${fit.totalNodes} nodes carrying it).`}
          </li>
          <li>
            <strong>Data protection:</strong> RF{s.rf}. Every write is kept {s.rf === 3 ? "three times" : "twice"}, so the storage workload is counted at {s.rf}x its size.
          </li>
          <li>
            <strong>Platform overhead:</strong> each node first reserves {fmtInt(cap.cpu.cvmCores)} cores and {fmtRam(cap.ram.cvmGiB)} of memory for the Nutanix CVM,{" "}
            {fmtRam(cap.ram.ahvHostGiB)} of memory for AHV, CVM metadata storage, and a 5% safety buffer on memory and storage.
          </li>
          <li>
            <strong>Model choice:</strong>{" "}
            {s.modelSku === "auto"
              ? `${c.model.sku}, chosen automatically as the smallest NX model in the sizing order that fits the largest VM on one node.`
              : `${c.model.sku} was selected by the SE.`}{" "}
            Within it, the configuration with the fewest total cores is used, since NCI is licensed per core.
          </li>
        </ul>
      </Section>

      {notes.length ? (
        <Section title="Warnings and notes">
          <ul className="list-disc space-y-2 pl-5 marker:text-peach">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      <footer className="mt-10 border-t border-charcoal-200 pt-3 text-[9.5px] leading-normal text-charcoal-500">
        {UNIT_FOOTNOTE} Hardware options from Nutanix NX G10 System Specifications. Final part numbers and DIMM layouts are confirmed with the build partner.
      </footer>
    </article>
  );
}

/** One report section. Print CSS keeps each section whole on a page. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="mb-3 border-b border-charcoal-200 pb-1 text-[14px] font-semibold text-charcoal-900">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[9.5px] font-medium uppercase tracking-[0.12em] text-charcoal-600">{label}</dt>
      <dd className="mt-0.5 font-semibold">{children}</dd>
    </div>
  );
}

/** Numeric columns right-align; `textValues` left-aligns them for specifications. */
function Table({ head, rows, textValues = false }: { head: string[]; rows: string[][]; textValues?: boolean }) {
  const valueAlign = textValues ? "text-left" : "text-right tabular-nums";
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="bg-charcoal-50">
          {head.map((h, i) => (
            <th key={h} className={`border-b border-charcoal-300 px-3 py-2 font-semibold ${i > 0 ? valueAlign : "text-left"} ${textValues && i === 0 ? "w-40" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} className="border-b border-charcoal-100">
            {r.map((cell, i) => (
              <td key={i} className={`px-3 py-2 align-top ${i > 0 ? valueAlign : "text-charcoal-700"}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
