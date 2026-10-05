"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, FileDown, FileSpreadsheet, RotateCcw, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { parseSizerWorkbook } from "@/lib/simple-sizer";
import type { ParsedEnvironment, SizerSource, VmAdjustment, VmRecord } from "@/lib/simple-sizer-core";
import {
  AHV_PRESETS,
  DEFAULT_NX_SETTINGS,
  PC_PROFILES,
  approvedModels,
  recommendNx,
  vmCpuCores,
  isExcluded,
  vmStorageTiB,
  type NxRecommendation,
  type NxSizerSettings,
  type PcProfileId,
} from "@/lib/nx-sizer";
import { UNIT_FOOTNOTE, fmtInt, fmtNum, fmtRam, fmtStorage, gibToGB, tibToTB } from "@/lib/sizer-format";
import { SizingReport } from "@/components/nx-sizing-report";
import { ImportedPanel } from "@/components/sizer-imported";
import { buildHeadline, buildSubtitle, capacityLines, cpuSpec, driveLabel, ramSpec, type ReportMeta } from "@/lib/nx-report";
import { GENERIC_SKU, NX_USE_CASES, type NxUseCase } from "@/lib/nx-catalog";

const ICON = { strokeWidth: 1.5 } as const;
const PRESS = "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]";
const SOURCE_LABEL: Record<SizerSource, string> = {
  collector_excel: "Nutanix Collector",
  rvtools: "RVTools",
  liveoptics: "LiveOptics",
};

export function SimpleSizerTool() {
  const [source, setSource] = useState<SizerSource>("collector_excel");
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedEnvironment | null>(null);
  const [settings, setSettings] = useState<NxSizerSettings>(DEFAULT_NX_SETTINGS);
  const [meta, setMeta] = useState<ReportMeta>({ customer: "", preparedBy: "", includeDetail: false });
  const [printing, setPrinting] = useState(false);

  const rec = useMemo(() => (parsed ? recommendNx(parsed, settings) : null), [parsed, settings]);
  // Include or leave out VMs from the imported view; shares state with the VM table.
  const excludeVms = useCallback((ids: string[], excluded: boolean) => {
    setSettings((prev) => {
      const next = { ...prev.vmAdjustments };
      for (const id of ids) next[id] = { ...next[id], excluded };
      return { ...prev, vmAdjustments: next };
    });
  }, []);

  // The file is read as soon as it is chosen, like Sizer's import: the options
  // then apply live to the workloads it found.
  const load = async (next: File | null, nextSource: SizerSource = source) => {
    setFile(next);
    setParsed(null);
    setError(null);
    if (!next) return;
    if (!/\.(xlsx|xls)$/i.test(next.name)) return setError("Select the .xlsx export. ZIP bundles and CSVs are not supported.");
    if (next.size === 0) return setError("That file is empty. Re-export it from the source tool.");
    if (next.size > 30 * 1024 * 1024) return setError("That file is over 30 MB. Split the export first.");
    setParsing(true);
    try {
      // Parsed in the browser: the workbook never leaves this machine.
      const bytes = await next.arrayBuffer();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      const result = parseSizerWorkbook(bytes, nextSource, next.name, next.size);
      if (!result.vms.length) throw new Error("No VMs were found. Check the file matches the selected source.");
      setParsed(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The file could not be read.");
    } finally {
      setParsing(false);
    }
  };

  const reset = () => {
    setFile(null);
    setParsed(null);
    setError(null);
    setSettings(DEFAULT_NX_SETTINGS);
  };

  const exportPdf = () => {
    if (!rec?.fit || !parsed) return;
    setPrinting(true);
    // Let the print surface mount before the dialog opens.
    window.setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 60);
  };

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[1.75rem] border border-charcoal-200 bg-white shadow-[0_18px_40px_-24px_rgba(49,49,49,0.22)]">
        <div className="grid gap-px bg-charcoal-200 lg:grid-cols-[0.95fr_1.25fr]">
          <div className="bg-white p-6 md:p-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-viz-compute">Simple Sizer</p>
            <h1 className="mt-2 max-w-[22ch] text-2xl font-semibold tracking-tighter text-charcoal-900 md:text-3xl">
              Size Anything. Fast.
            </h1>
            <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-charcoal-600">
              Import a Collector, RVTools or LiveOptics export. CPU, memory and storage per node come back with the
              Nutanix overhead charged and itemised, ready to hand to a build partner.
            </p>

            <div className="mt-6 grid gap-4">
              <Field label="Source" htmlFor="nx-source">
                <select
                  id="nx-source"
                  value={source}
                  onChange={(e) => {
                    const next = e.target.value as SizerSource;
                    setSource(next);
                    if (file) void load(file, next);
                  }}
                  className="h-11 w-full"
                >
                  {(Object.keys(SOURCE_LABEL) as SizerSource[]).map((s) => (
                    <option key={s} value={s}>
                      {SOURCE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Select collection file" htmlFor="nx-file" helper="The .xlsx export. Collector: the Excel file from Collector Portal, not the ZIP bundle.">
                <FileDrop file={file} invalid={Boolean(error)} onFile={(f) => void load(f)} />
              </Field>
            </div>

            {error ? (
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                <TriangleAlert {...ICON} className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </p>
            ) : null}

            {parsing ? (
              <div aria-busy="true" className="mt-4 space-y-2">
                <span className="sr-only">Reading the export</span>
                <div className="sizer-shimmer h-3 w-48 rounded-full bg-charcoal-100" />
                <div className="sizer-shimmer h-3 w-64 rounded-full bg-charcoal-100" />
              </div>
            ) : null}

            {parsed ? (
              <div className="mt-4 rounded-xl border border-charcoal-200 bg-charcoal-50 px-4 py-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-charcoal-900">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-viz-storage" />
                  Workloads ready to import
                </p>
                <p className="mt-1 font-mono text-xs tabular-nums text-charcoal-600">
                  {fmtInt(parsed.vms.length)} VMs ({fmtInt(parsed.poweredOn.vms)} on, {fmtInt(parsed.poweredOff.vms)} off) ·{" "}
                  {fmtInt(parsed.clusters)} clusters · {fmtInt(parsed.hosts)} hosts
                </p>
              </div>
            ) : null}

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="Customer" htmlFor="nx-customer" helper="Printed on the report.">
                <input id="nx-customer" value={meta.customer} onChange={(e) => setMeta({ ...meta, customer: e.target.value })} className="h-10 w-full" />
              </Field>
              <Field label="Prepared by" htmlFor="nx-se" helper="Printed on the report.">
                <input id="nx-se" value={meta.preparedBy} onChange={(e) => setMeta({ ...meta, preparedBy: e.target.value })} className="h-10 w-full" />
              </Field>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={exportPdf}
                disabled={!rec?.fit || printing}
                className={`${PRESS} inline-flex items-center gap-2 rounded-full bg-iris-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-iris-600 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <FileDown {...ICON} className="h-4 w-4" />
                {printing ? "Preparing PDF" : "Sizing report (PDF)"}
              </button>
              <label className="inline-flex items-center gap-2 px-2 text-sm text-charcoal-700">
                <input
                  type="checkbox"
                  checked={meta.includeDetail}
                  onChange={(e) => setMeta({ ...meta, includeDetail: e.target.checked })}
                  className="h-4 w-4 accent-iris-500"
                />
                Include overhead appendix
              </label>
              {file ? (
                <button
                  type="button"
                  onClick={reset}
                  className={`${PRESS} inline-flex items-center gap-2 rounded-full border border-charcoal-300 bg-white px-4 py-2.5 text-sm text-charcoal-700 hover:border-iris-400 hover:bg-iris-50`}
                >
                  <RotateCcw {...ICON} className="h-4 w-4" /> Start over
                </button>
              ) : null}
            </div>

            <p className="mt-5 flex max-w-[56ch] items-start gap-2 text-[11px] leading-relaxed text-charcoal-500">
              <ShieldCheck {...ICON} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-viz-storage" />
              The file is read in this browser, never uploaded, and discarded when the tab closes.
            </p>
          </div>

          <SizeFor settings={settings} onChange={setSettings} parsed={parsed} />
        </div>
      </section>

      {!parsing && !parsed && !error ? <EmptyState /> : null}

      {!parsing && parsed && rec ? (
        <>
          <ImportedPanel parsed={parsed} adjustments={settings.vmAdjustments} onExclude={excludeVms} />
          <Issues rec={rec} />
          {rec.fit ? <Recommendation rec={rec} /> : null}
          {rec.fit ? <CapacityMath rec={rec} /> : null}
          <WorkloadPanel parsed={parsed} rec={rec} />
          <VmTable parsed={parsed} settings={settings} onSettings={setSettings} />
          <AuditPanel parsed={parsed} />
        </>
      ) : null}

      {/* Mounted directly under <body> so print CSS can drop the page around it. */}
      {printing && parsed && rec?.fit
        ? createPortal(
            <div className="sizer-print-root" aria-hidden>
              <SizingReport parsed={parsed} rec={rec} meta={meta} />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Size For: the import options, in Sizer's order, then the cluster options
// ---------------------------------------------------------------------------

function Choice<T extends string | number>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: { value: T; label: string; helper?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`${PRESS} rounded-xl border px-3 py-2 text-left transition-colors ${
              on ? "border-iris-400 bg-iris-50" : "border-charcoal-200 bg-white hover:border-iris-300"
            }`}
          >
            <span className={`block text-sm font-medium ${on ? "text-iris-700" : "text-charcoal-800"}`}>{o.label}</span>
            {o.helper ? <span className="mt-0.5 block text-[11px] leading-snug text-charcoal-500">{o.helper}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-600">{title}</p>
      {children}
    </div>
  );
}

function SizeFor({
  settings,
  onChange,
  parsed,
}: {
  settings: NxSizerSettings;
  onChange: (s: NxSizerSettings) => void;
  parsed: ParsedEnvironment | null;
}) {
  const set = <K extends keyof NxSizerSettings>(key: K, value: NxSizerSettings[K]) => onChange({ ...settings, [key]: value });
  return (
    <div className="grid content-start gap-5 bg-charcoal-50 p-6 md:p-8">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-charcoal-500">Size for</p>

      <Group title="VMs">
        <Choice
          name="VMs"
          value={settings.workloadBasis}
          onChange={(v) => set("workloadBasis", v)}
          options={[
            { value: "poweredOn", label: "Powered ON only" },
            { value: "all", label: "Both powered ON and OFF", helper: "Review powered-off VMs with the customer before sizing them." },
          ]}
        />
      </Group>

      <Group title="CPU">
        <Choice
          name="CPU"
          value={settings.cpuBasis}
          onChange={(v) => set("cpuBasis", v)}
          options={[
            { value: "configuration", label: "Configuration", helper: "Configured vCPUs / vCPU:pCore ratio." },
            { value: "utilization", label: "Utilization", helper: "95th-percentile vCPU use; ratio where not measured." },
          ]}
        />
      </Group>

      <Field
        label="vCPU:pCore ratio"
        htmlFor="opt-ratio"
        helper={`Min 1, max 15.${parsed ? ` Average source ratio ${fmtNum(parsed.vcpuPcoreRatio, 2)}.` : ""}`}
      >
        <input
          id="opt-ratio"
          type="number"
          min={1}
          max={15}
          step={0.01}
          value={settings.vcpuPerPcore}
          onChange={(e) => set("vcpuPerPcore", Math.min(15, Math.max(1, Number(e.target.value) || 1)))}
          className="h-10 w-40 font-mono"
        />
      </Field>

      <Field label="SQL VMs vCPU:pCore ratio" htmlFor="opt-sql-ratio" helper='VMs with "SQL" in the name are sized at vCPU / this ratio, ignoring measured use. 0 turns it off.'>
        <input
          id="opt-sql-ratio"
          type="number"
          min={0}
          max={15}
          step={0.1}
          value={settings.sqlVcpuPerPcore}
          onChange={(e) => set("sqlVcpuPerPcore", Math.min(15, Math.max(0, Number(e.target.value) || 0)))}
          className="h-10 w-40 font-mono"
        />
      </Field>

      <Group title="Memory">
        <Choice
          name="Memory"
          value={settings.memoryBasis}
          onChange={(v) => set("memoryBasis", v)}
          options={[
            { value: "provisioned", label: "Provisioned", helper: "Configured VM memory." },
            { value: "consumed", label: "Consumed", helper: "95th-percentile use where measured, else configured." },
          ]}
        />
      </Group>

      <Group title="Capacity">
        <Choice
          name="Capacity"
          value={settings.storageBasis}
          onChange={(v) => set("storageBasis", v)}
          options={[
            { value: "provisioned", label: "Provisioned", helper: "Virtual disk size." },
            { value: "consumed", label: "Consumed", helper: "Guest used space." },
          ]}
        />
        <label className="flex items-center gap-2 text-sm font-normal normal-case tracking-normal text-charcoal-700">
          <input
            type="checkbox"
            checked={settings.includePoweredOffStorage}
            onChange={(e) => set("includePoweredOffStorage", e.target.checked)}
          />
          Consider storage of powered-off VMs
        </label>
      </Group>

      <div className="grid gap-4 border-t border-charcoal-200 pt-5 sm:grid-cols-2">
        <Field
          label="Hardware"
          htmlFor="opt-model"
          helper="Generic sizes the fewest, densest dual-socket nodes (up to 256 cores, 2 TB RAM, 184 TB raw) as a requirement any partner can build. NX Auto picks from the models for the use case."
        >
          <select id="opt-model" value={settings.modelSku} onChange={(e) => set("modelSku", e.target.value)} className="h-10 w-full">
            <option value={GENERIC_SKU}>Generic (fewest nodes)</option>
            <option value="auto">NX Auto (by use case)</option>
            {approvedModels().map((m) => (
              <option key={m.sku} value={m.sku}>
                {m.sku}
              </option>
            ))}
          </select>
        </Field>
        {settings.modelSku === "auto" ? (
          <Field label="Use case" htmlFor="opt-usecase" helper={NX_USE_CASES[settings.useCase].helper}>
            <select id="opt-usecase" value={settings.useCase} onChange={(e) => set("useCase", e.target.value as NxUseCase)} className="h-10 w-full">
              {(Object.keys(NX_USE_CASES) as NxUseCase[]).map((k) => (
                <option key={k} value={k}>
                  {NX_USE_CASES[k].label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Target utilization" htmlFor="opt-tu" helper="Share of usable CPU, memory and storage consumed with every node up.">
          <select id="opt-tu" value={settings.targetUtilization} onChange={(e) => set("targetUtilization", Number(e.target.value))} className="h-10 w-full">
            <option value={0.5}>50%</option>
            <option value={0.6}>60%</option>
            <option value={0.7}>70%</option>
            <option value={0.8}>80%</option>
            <option value={1}>No target (failover limit only)</option>
          </select>
        </Field>
        <Field label="Failover" htmlFor="opt-fo" helper="Nodes the cluster must survive losing.">
          <select id="opt-fo" value={settings.failoverNodes} onChange={(e) => set("failoverNodes", Number(e.target.value) as 0 | 1 | 2)} className="h-10 w-full">
            <option value={0}>N+0</option>
            <option value={1}>N+1</option>
            <option value={2}>N+2</option>
          </select>
        </Field>
        <Field label="Replication factor" htmlFor="opt-rf" helper="RF3 needs 5 nodes and a 40 GiB CVM.">
          <select id="opt-rf" value={settings.rf} onChange={(e) => set("rf", Number(e.target.value) as 2 | 3)} className="h-10 w-full">
            <option value={2}>RF2</option>
            <option value={3}>RF3</option>
          </select>
        </Field>
        <Field label="Compression savings %" htmlFor="opt-comp" helper="0 unless the customer data supports it.">
          <input
            id="opt-comp"
            type="number"
            min={0}
            max={90}
            value={Math.round(settings.compressionSavings * 100)}
            onChange={(e) => set("compressionSavings", Math.min(90, Math.max(0, Number(e.target.value) || 0)) / 100)}
            className="h-10 w-full font-mono"
          />
        </Field>
        <Field label="Prism Central" htmlFor="opt-pc" helper="None if an existing Prism Central is reused.">
          <select id="opt-pc" value={settings.prismCentral} onChange={(e) => set("prismCentral", e.target.value as PcProfileId)} className="h-10 w-full">
            <option value="none">None</option>
            {PC_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="AHV memory overhead" htmlFor="opt-ahv">
          <select
            id="opt-ahv"
            value={settings.ahvPreset}
            onChange={(e) => set("ahvPreset", e.target.value as NxSizerSettings["ahvPreset"])}
            className="h-10 w-full"
          >
            {(Object.keys(AHV_PRESETS) as (keyof typeof AHV_PRESETS)[]).map((k) => (
              <option key={k} value={k}>
                {AHV_PRESETS[k].label}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="grid gap-1.5 sm:col-span-2">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-charcoal-600">Flow</legend>
          <label className="flex items-center gap-2 text-sm font-normal normal-case tracking-normal text-charcoal-700">
            <input type="checkbox" checked={settings.flowVirtualNetworking} onChange={(e) => set("flowVirtualNetworking", e.target.checked)} />
            Virtual Networking (+2 GiB per host)
          </label>
          <label className="flex items-center gap-2 text-sm font-normal normal-case tracking-normal text-charcoal-700">
            <input type="checkbox" checked={settings.flowMicrosegmentation} onChange={(e) => set("flowMicrosegmentation", e.target.checked)} />
            Microsegmentation (+4 GiB per host)
          </label>
        </fieldset>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function Issues({ rec }: { rec: NxRecommendation }) {
  if (!rec.blockers.length && !rec.warnings.length) return null;
  return (
    <section
      className={`rounded-[1.75rem] border bg-white px-6 py-5 md:px-8 ${rec.blockers.length ? "border-rose-300" : "border-amber-200"}`}
    >
      {rec.blockers.length ? (
        <>
          <p className="flex items-center gap-2 text-sm font-semibold text-rose-700">
            <TriangleAlert {...ICON} className="h-4 w-4" /> No recommendation until these are resolved
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-700">
            {rec.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </>
      ) : null}
      {rec.warnings.length ? (
        <ul className={`${rec.blockers.length ? "mt-4" : ""} list-disc space-y-1 pl-5 text-sm text-charcoal-700`}>
          {rec.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Recommendation({ rec }: { rec: NxRecommendation }) {
  const fit = rec.fit!;
  const c = fit.config;
  return (
    <section className="rounded-[1.75rem] border border-charcoal-200 bg-white p-6 shadow-[0_18px_40px_-24px_rgba(49,49,49,0.18)] md:p-8">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-viz-compute">Recommended build</p>
          <p className="mt-2 text-3xl font-semibold tracking-tighter text-charcoal-900">
            {buildHeadline(fit.totalNodes, c)}
          </p>
          <p className="mt-1 text-sm font-medium text-charcoal-800">{buildSubtitle(c)}</p>
          <p className="mt-1 text-sm text-charcoal-600">
            {fit.clusters.length === 1
              ? `One cluster, RF${rec.settings.rf}, N+${rec.settings.failoverNodes}.`
              : `${fit.clusters.length} clusters (${fit.clusters.map((k) => k.nodes).join(" + ")} nodes), RF${rec.settings.rf}, N+${rec.settings.failoverNodes} each.`}{" "}
            Node count set by {fit.driver === "minimum" ? `the RF${rec.settings.rf} minimum` : fit.driver.toUpperCase()}.
          </p>
          <dl className="mt-6 divide-y divide-charcoal-200 border-y border-charcoal-200 text-sm">
            <Row k="CPU per node" v={cpuSpec(c)} />
            <Row k="Cores per node" v={fmtInt(c.cores)} />
            <Row k="RAM per node" v={`${ramSpec(c.ramGiB)} (DIMM capacity)`} />
            <Row k="Drives per node" v={driveLabel(c.drives)} />
            <Row k="Raw storage per node" v={`${fmtNum(c.rawTB, 2)} TB`} />
          </dl>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-charcoal-500">
            With every node up / with {rec.settings.failoverNodes} node{rec.settings.failoverNodes === 1 ? "" : "s"} lost
          </p>
          <div className="mt-4 grid gap-4">
            <UtilBar label="CPU" util={rec.utilization!.cpu} />
            <UtilBar label="Memory" util={rec.utilization!.ram} />
            <UtilBar label="Storage" util={rec.utilization!.storage} />
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-charcoal-500">
            Percent of usable capacity, after CVM, AHV and the 5% safety buffer are removed from every node.
          </p>
          <div className="mt-5 border-t border-charcoal-200 pt-4">
            <p className="text-xs font-medium text-charcoal-800">Model selection</p>
            <ul className="mt-2 space-y-1 text-xs text-charcoal-600">
              {rec.attempts.map((a) => (
                <li key={a.sku}>
                  <span className="font-mono">{a.sku}</span>: {a.fits ? "fits" : `skipped (${a.reason})`}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function UtilBar({ label, util }: { label: string; util: { allUp: number; failover: number } }) {
  const tone = util.failover > 100 ? "bg-rose-500" : "bg-viz-compute";
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-charcoal-700">{label}</span>
        <span className="font-mono tabular-nums text-charcoal-900">
          {fmtNum(util.allUp, 1)}% / {fmtNum(util.failover, 1)}%
        </span>
      </div>
      <div className="relative mt-1.5 h-1.5 rounded-full bg-charcoal-100">
        <div className="absolute inset-y-0 left-0 rounded-full bg-iris-200" style={{ width: `${Math.min(100, util.failover)}%` }} />
        <div className={`absolute inset-y-0 left-0 rounded-full ${tone}`} style={{ width: `${Math.min(100, util.allUp)}%` }} />
      </div>
    </div>
  );
}

function CapacityMath({ rec }: { rec: NxRecommendation }) {
  const lines = capacityLines(rec);
  return (
    <Section title="Capacity math" subtitle="Every overhead charged per node, and the demand it has to carry." defaultOpen>
      <div className="grid gap-8 xl:grid-cols-3">
        {lines.map((block) => (
          <div key={block.title}>
            <p className="text-sm font-semibold text-charcoal-900">{block.title}</p>
            <table className="mt-2 w-full text-sm">
              <tbody className="divide-y divide-charcoal-100">
                {block.rows.map(([k, v, strong]) => (
                  <tr key={k}>
                    <td className={`py-1.5 pr-3 ${strong ? "font-medium text-charcoal-900" : "text-charcoal-600"}`}>{k}</td>
                    <td className={`py-1.5 text-right font-mono tabular-nums ${strong ? "font-medium text-charcoal-900" : "text-charcoal-800"}`}>
                      {v}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <p className="mt-6 text-[11px] text-charcoal-500">{UNIT_FOOTNOTE}</p>
    </Section>
  );
}

function WorkloadPanel({ parsed, rec }: { parsed: ParsedEnvironment; rec: NxRecommendation }) {
  const w = rec.workload;
  const vgs = parsed.volumeGroups ?? [];
  return (
    <Section
      title="Workload from the export"
      subtitle={`${fmtInt(parsed.vms.length)} VMs in ${parsed.fileName}. ${fmtInt(w.runningVms)} sized for CPU and memory, ${fmtInt(w.storedVms)} for storage.`}
    >
      <dl className="grid gap-x-10 divide-y divide-charcoal-100 text-sm md:grid-cols-2 md:divide-y-0">
        <Row k="VMs in export" v={fmtInt(parsed.vms.length)} />
        <Row k="Excluded by hand" v={fmtInt(w.excludedVms - w.sourceCvmsExcluded.length)} />
        <Row k="Source-cluster CVM rows excluded" v={fmtInt(w.sourceCvmsExcluded.length)} />
        <Row k={`Running (${parsed.powerStateKnown ? "power state read" : "no power state; all counted"})`} v={fmtInt(w.runningVms)} />
        <Row k="vCPU (running)" v={fmtInt(w.vcpu)} />
        <Row k="CPU cores used (p95 / fallback)" v={fmtNum(w.cpuCores, 2)} />
        <Row k="RAM configured (running)" v={fmtRam(w.ramGiB)} />
        <Row k="Storage consumed (all VMs)" v={fmtStorage(parsed.vms.reduce((t, vm) => t + vmStorageTiB(vm, "consumed"), 0), 2)} />
        <Row k="Storage provisioned (all VMs)" v={fmtStorage(parsed.vms.reduce((t, vm) => t + vmStorageTiB(vm, "provisioned"), 0), 2)} />
        <Row k="Largest VM by vCPU" v={w.largestVm.byVcpu ? `${w.largestVm.byVcpu.name}: ${w.largestVm.byVcpu.vcpu} vCPU` : "-"} />
        <Row k="Largest VM by RAM" v={w.largestVm.byRam ? `${w.largestVm.byRam.name}: ${fmtRam(w.largestVm.byRam.ramGiB)}` : "-"} />
        <Row k="Volume groups with no VM" v={vgs.length ? `${vgs.length} (${fmtStorage(vgs.reduce((t, v) => t + v.provisionedTiB, 0), 2)} provisioned)` : "None"} />
        <Row k="Hosts in export (context only)" v={`${fmtInt(parsed.hosts)} hosts, ${fmtInt(parsed.totalCpuCores)} cores, ${fmtRam(parsed.totalMemoryGiB)}`} />
      </dl>
      {parsed.notes.length ? (
        <ul className="mt-5 list-disc space-y-1 pl-5 text-xs text-charcoal-600">
          {parsed.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

const PAGE = 40;

type VmSortKey = "name" | "vcpu" | "cores" | "ram" | "consumed" | "provisioned";

function VmTable({
  parsed,
  settings,
  onSettings,
}: {
  parsed: ParsedEnvironment;
  settings: NxSizerSettings;
  onSettings: (s: NxSizerSettings) => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<VmSortKey>("name");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("asc");
  const [power, setPower] = useState<"all" | "on" | "off">("all");
  const [inclusion, setInclusion] = useState<"all" | "included" | "excluded">("all");
  const [cluster, setCluster] = useState("all");
  const clusters = useMemo(
    () => Array.from(new Set(parsed.vms.map((vm) => vm.clusterName).filter((c): c is string => !!c))).sort(),
    [parsed.vms],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const value = (vm: VmRecord): number => {
      const a = settings.vmAdjustments[vm.id] ?? {};
      switch (sortKey) {
        case "vcpu":
          return a.vcpu ?? vm.vcpu;
        case "cores":
          return vmCpuCores(vm, settings.vcpuPerPcore, settings.cpuBasis, settings.sqlVcpuPerPcore).cores;
        case "ram":
          return a.ramGiB ?? vm.ramGiB;
        case "consumed":
          return a.storageTiB ?? vm.storageConsumedTiB;
        case "provisioned":
          return a.storageTiB ?? vm.storageProvisionedTiB;
        default:
          return 0;
      }
    };
    const rows = parsed.vms.filter((vm) => {
      if (q && !vm.name.toLowerCase().includes(q) && !(vm.clusterName ?? "").toLowerCase().includes(q)) return false;
      if (power === "on" && vm.poweredOn !== true) return false;
      if (power === "off" && vm.poweredOn !== false) return false;
      if (cluster !== "all" && vm.clusterName !== cluster) return false;
      const off = isExcluded(vm, settings.vmAdjustments);
      if (inclusion === "included" && off) return false;
      if (inclusion === "excluded" && !off) return false;
      return true;
    });
    const dir = sortDir === "desc" ? -1 : 1;
    return [...rows].sort((a, b) =>
      sortKey === "name" ? dir * a.name.localeCompare(b.name) : dir * (value(a) - value(b)) || a.name.localeCompare(b.name),
    );
  }, [parsed.vms, query, power, cluster, inclusion, sortKey, sortDir, settings]);
  const headerSort = (key: VmSortKey) => {
    if (key === sortKey) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
    setPage(0);
  };
  const sortMark = (key: VmSortKey) => (key === sortKey ? (sortDir === "desc" ? " ↓" : " ↑") : "");
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const safePage = Math.min(page, pages - 1);
  const rows = filtered.slice(safePage * PAGE, safePage * PAGE + PAGE);
  const adjust = (vm: VmRecord, patch: VmAdjustment) => {
    const next = { ...settings.vmAdjustments, [vm.id]: { ...settings.vmAdjustments[vm.id], ...patch } };
    onSettings({ ...settings, vmAdjustments: next });
  };
  const excluded = parsed.vms.filter((vm) => isExcluded(vm, settings.vmAdjustments)).length;

  return (
    <Section title="Virtual machines" subtitle={`Exclude a VM or correct its figures. ${excluded} excluded.`}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Search" htmlFor="vm-search">
          <input
            id="vm-search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="VM or cluster name"
            className="h-10 w-64"
          />
        </Field>
        <Field label="Sort by" htmlFor="vm-sort">
          <select
            id="vm-sort"
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value as VmSortKey);
              setPage(0);
            }}
            className="h-10 w-40"
          >
            <option value="name">Name</option>
            <option value="vcpu">vCPU</option>
            <option value="cores">CPU cores</option>
            <option value="ram">RAM</option>
            <option value="consumed">Consumed storage</option>
            <option value="provisioned">Provisioned storage</option>
          </select>
        </Field>
        <Field label="Order" htmlFor="vm-order">
          <select
            id="vm-order"
            value={sortDir}
            onChange={(e) => {
              setSortDir(e.target.value as "desc" | "asc");
              setPage(0);
            }}
            className="h-10 w-40"
          >
            <option value="desc">{sortKey === "name" ? "Z to A" : "Highest first"}</option>
            <option value="asc">{sortKey === "name" ? "A to Z" : "Lowest first"}</option>
          </select>
        </Field>
        <Field label="Power" htmlFor="vm-power">
          <select id="vm-power" value={power} onChange={(e) => { setPower(e.target.value as "all" | "on" | "off"); setPage(0); }} className="h-10 w-32">
            <option value="all">All</option>
            <option value="on">Powered on</option>
            <option value="off">Powered off</option>
          </select>
        </Field>
        <Field label="Included" htmlFor="vm-incl">
          <select id="vm-incl" value={inclusion} onChange={(e) => { setInclusion(e.target.value as "all" | "included" | "excluded"); setPage(0); }} className="h-10 w-32">
            <option value="all">All</option>
            <option value="included">Included</option>
            <option value="excluded">Excluded</option>
          </select>
        </Field>
        {clusters.length > 1 ? (
          <Field label="Cluster" htmlFor="vm-cluster">
            <select id="vm-cluster" value={cluster} onChange={(e) => { setCluster(e.target.value); setPage(0); }} className="h-10 w-48">
              <option value="all">All clusters</option>
              {clusters.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {Object.keys(settings.vmAdjustments).length ? (
          <button
            type="button"
            onClick={() => onSettings({ ...settings, vmAdjustments: {} })}
            className={`${PRESS} h-10 rounded-full border border-charcoal-300 bg-white px-4 text-sm text-charcoal-700 hover:border-iris-400`}
          >
            Clear all edits
          </button>
        ) : null}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-charcoal-200 text-left text-xs text-charcoal-500">
              <th className="py-2 pr-3 font-medium">Include</th>
              <th className="py-2 pr-3 font-medium"><button type="button" onClick={() => headerSort("name")} className="font-medium hover:text-charcoal-900">VM{sortMark("name")}</button></th>
              <th className="py-2 pr-3 font-medium">Power</th>
              <th className="py-2 pr-3 text-right font-medium"><button type="button" onClick={() => headerSort("vcpu")} className="font-medium hover:text-charcoal-900">vCPU{sortMark("vcpu")}</button></th>
              <th className="py-2 pr-3 text-right font-medium"><button type="button" onClick={() => headerSort("cores")} className="font-medium hover:text-charcoal-900">CPU cores{sortMark("cores")}</button></th>
              <th className="py-2 pr-3 text-right font-medium"><button type="button" onClick={() => headerSort("ram")} className="font-medium hover:text-charcoal-900">RAM (GB){sortMark("ram")}</button></th>
              <th className="py-2 pr-3 text-right font-medium"><button type="button" onClick={() => headerSort("consumed")} className="font-medium hover:text-charcoal-900">Consumed (TB){sortMark("consumed")}</button></th>
              <th className="py-2 text-right font-medium"><button type="button" onClick={() => headerSort("provisioned")} className="font-medium hover:text-charcoal-900">Provisioned (TB){sortMark("provisioned")}</button></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-100">
            {rows.map((vm) => {
              const a = settings.vmAdjustments[vm.id] ?? {};
              const off = isExcluded(vm, settings.vmAdjustments);
              const cpu = vmCpuCores(vm, settings.vcpuPerPcore, settings.cpuBasis, settings.sqlVcpuPerPcore);
              return (
                <tr key={vm.id} className={off ? "opacity-50" : ""}>
                  <td className="py-1.5 pr-3">
                    <input
                      type="checkbox"
                      aria-label={`Include ${vm.name}`}
                      checked={!off}
                      onChange={(e) => adjust(vm, { excluded: !e.target.checked })}
                    />
                  </td>
                  <td className="max-w-[16rem] truncate py-1.5 pr-3 text-charcoal-900" title={vm.name}>
                    {vm.name}
                  </td>
                  <td className="py-1.5 pr-3 text-charcoal-600">{vm.poweredOn == null ? "unknown" : vm.poweredOn ? "on" : "off"}</td>
                  <td className="py-1.5 pr-3 text-right">
                    <NumberCell value={a.vcpu ?? vm.vcpu} onCommit={(v) => adjust(vm, { vcpu: v })} />
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-charcoal-700" title={cpu.sql ? `SQL VM: vCPU / ${settings.sqlVcpuPerPcore}` : cpu.measured ? "95th percentile" : `vCPU / ${settings.vcpuPerPcore}`}>
                    {fmtNum(cpu.cores, 2)}
                    {cpu.sql ? <span className="ml-1 text-[10px] font-sans font-medium text-viz-compute">SQL</span> : cpu.measured ? "" : "*"}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <NumberCell
                      value={Number(gibToGB(a.ramGiB ?? vm.ramGiB).toFixed(2))}
                      onCommit={(gb) => adjust(vm, { ramGiB: (gb * 1e9) / 1024 ** 3 })}
                    />
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-charcoal-700">
                    {fmtNum(tibToTB(a.storageTiB ?? vm.storageConsumedTiB), 3)}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-charcoal-700">
                    {fmtNum(tibToTB(a.storageTiB ?? vm.storageProvisionedTiB), 3)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-charcoal-500">
        <span>
          * Sized at vCPU / {settings.vcpuPerPcore}.{settings.sqlVcpuPerPcore > 0 ? ` SQL: name contains "SQL", sized at vCPU / ${settings.sqlVcpuPerPcore}.` : ""}
        </span>
        <span className="flex items-center gap-2">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-full border border-charcoal-300 bg-white px-3 py-1 text-xs font-medium text-charcoal-700 hover:bg-charcoal-50 disabled:opacity-40">
            Previous
          </button>
          {page + 1} / {pages}
          <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} className="rounded-full border border-charcoal-300 bg-white px-3 py-1 text-xs font-medium text-charcoal-700 hover:bg-charcoal-50 disabled:opacity-40">
            Next
          </button>
        </span>
      </div>
    </Section>
  );
}

function NumberCell({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      min={0}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft != null) {
          const n = Number(draft);
          if (Number.isFinite(n) && n >= 0 && n !== value) onCommit(n);
          setDraft(null);
        }
      }}
      className="h-8 w-24 text-right font-mono tabular-nums"
    />
  );
}

function AuditPanel({ parsed }: { parsed: ParsedEnvironment }) {
  return (
    <Section title="How each column was read" subtitle="The sheet, column and unit behind every number. Units come from the header or the tool's documented unit, never from guessing.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-charcoal-200 text-left text-xs text-charcoal-500">
              <th className="py-2 pr-3 font-medium">Field</th>
              <th className="py-2 pr-3 font-medium">Sheet · column</th>
              <th className="py-2 pr-3 font-medium">Unit</th>
              <th className="py-2 font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-100">
            {parsed.audit.map((a, i) => (
              <tr key={`${a.field}-${i}`} className={a.implausible || a.confidence === "unresolved" ? "text-rose-700" : "text-charcoal-800"}>
                <td className="py-1.5 pr-3 align-top">{a.field}</td>
                <td className="py-1.5 pr-3 align-top font-mono text-xs">
                  {a.sheet} · {a.column ?? "none"}
                </td>
                <td className="py-1.5 pr-3 align-top">
                  {a.unit ?? "-"} <span className="text-xs text-charcoal-500">({a.confidence})</span>
                </td>
                <td className="py-1.5 align-top text-xs text-charcoal-600">{a.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function Field({ label, htmlFor, helper, children }: { label: string; htmlFor: string; helper?: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-2">
      <label htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {helper ? <p className="text-[11px] leading-snug text-charcoal-500">{helper}</p> : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-charcoal-600">{k}</dt>
      <dd className="text-right font-mono tabular-nums text-charcoal-900">{v}</dd>
    </div>
  );
}

function Section({ title, subtitle, defaultOpen = false, children }: { title: string; subtitle?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-charcoal-200 bg-white shadow-[0_18px_40px_-24px_rgba(49,49,49,0.18)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 bg-transparent px-6 py-5 text-left transition-colors duration-200 hover:bg-charcoal-50 md:px-8"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold tracking-tight text-charcoal-900">{title}</span>
          {subtitle ? <span className="mt-0.5 block max-w-[80ch] text-sm text-charcoal-600">{subtitle}</span> : null}
        </span>
        <ChevronDown {...ICON} className={`h-4 w-4 shrink-0 text-charcoal-500 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="border-t border-charcoal-200 px-6 py-6 md:px-8">{children}</div> : null}
    </section>
  );
}

function FileDrop({ file, onFile, invalid }: { file: File | null; onFile: (f: File | null) => void; invalid: boolean }) {
  const [depth, setDepth] = useState(0);
  const dragging = depth > 0;
  const accept = (list: FileList | null) => {
    const f = list?.[0];
    if (f) onFile(f);
  };
  return (
    <div
      className="relative"
      onDragEnter={(e) => {
        e.preventDefault();
        setDepth((d) => d + 1);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        setDepth((d) => Math.max(0, d - 1));
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDepth(0);
        accept(e.dataTransfer.files);
      }}
    >
      <input
        id="nx-file"
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => accept(e.target.files)}
        aria-invalid={invalid || undefined}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <div
        aria-hidden
        className={`pointer-events-none flex h-11 items-center gap-2.5 rounded-md border border-dashed px-3 text-sm transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-iris-300 ${
          dragging ? "border-viz-compute bg-iris-50" : invalid ? "border-rose-300 bg-white" : "border-charcoal-300 bg-white peer-hover:border-iris-400"
        }`}
      >
        <FileSpreadsheet {...ICON} className="h-4 w-4 shrink-0 text-charcoal-400" />
        <span className={`min-w-0 flex-1 truncate ${file ? "font-medium text-charcoal-900" : "text-charcoal-500"}`}>
          {file ? file.name : dragging ? "Release to load" : "Drop export or click to browse"}
        </span>
      </div>
      {file ? (
        <button
          type="button"
          onClick={() => onFile(null)}
          className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full border border-charcoal-200 bg-white px-2.5 py-1 text-xs font-medium text-charcoal-700 hover:bg-charcoal-50"
        >
          <X {...ICON} className="h-3.5 w-3.5" /> Remove
        </button>
      ) : null}
    </div>
  );
}

function EmptyState() {
  return (
    <section className="grid gap-6 rounded-[1.75rem] border border-dashed border-charcoal-300 bg-white px-6 py-8 md:grid-cols-[1fr_1.4fr] md:px-8">
      <div>
        <p className="text-sm font-semibold text-charcoal-900">No export loaded</p>
        <p className="mt-1 max-w-[40ch] text-sm text-charcoal-600">
          Choose the source and the export file. The build appears below and updates as you change the options.
        </p>
      </div>
      <ul className="grid gap-3 text-sm sm:grid-cols-2">
        <li>
          <p className="font-medium text-charcoal-900">Nutanix Collector</p>
          <p className="text-xs text-charcoal-600">The Excel export from Collector Portal, not the encrypted ZIP bundle.</p>
        </li>
        <li>
          <p className="font-medium text-charcoal-900">RVTools</p>
          <p className="text-xs text-charcoal-600">Full export with vHost, vInfo, vDisk and vPartition.</p>
        </li>
        <li>
          <p className="font-medium text-charcoal-900">LiveOptics</p>
          <p className="text-xs text-charcoal-600">VMware workbook with ESX Hosts, VMs and VM Disks.</p>
        </li>
      </ul>
    </section>
  );
}


