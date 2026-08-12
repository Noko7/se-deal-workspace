"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Boxes,
  Camera,
  ChevronDown,
  Copy,
  Download,
  FileSpreadsheet,
  HardDrive,
  RotateCcw,
  SlidersHorizontal,
  TriangleAlert,
  Upload,
} from "lucide-react";
import {
  AUTO_PROFILE,
  CUSTOM_PROFILE,
  DEFAULT_SIZER_SETTINGS,
  buildSizingPlan,
  type ParsedCluster,
  type ParsedEnvironment,
  type PlanMode,
  type RfSetting,
  type SizerSettings,
  type SizerSource,
  type SizingPlan,
  type StorageEfficiency,
  type WorkloadBasis,
} from "@/lib/simple-sizer-core";
import { NODE_PROFILES } from "@/lib/node-profiles";
import { KEY_RESOURCES, SIZING_REFERENCE, SIZING_RULES } from "@/lib/sizing-guidance";
import { UNIT_FOOTNOTE, fmtInt, fmtNum, fmtRam, fmtStorage } from "@/lib/sizer-format";
import { buildSizerWorkbookBlob, sizerWorkbookFileName } from "@/lib/sizer-workbook";
import { HeroNumber, MicroMeters, Meter, RankedBars, SplitMeter, Stat, VizKey } from "@/components/sizer-viz";
import { StatusPill } from "@/components/ui";

// One stroke weight across every icon on the page.
const ICON = { strokeWidth: 1.5 } as const;

// Tactile press feedback, applied to everything clickable.
const PRESS = "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]";

// vCPU:pCore overcommit is a *status*, not a series — it ships with a word, never
// colour alone. <=4 suits latency-sensitive work, >6 risks CPU ready time.
function ratioStatus(ratio: number | null | undefined): { label: string; className: string } | null {
  if (ratio == null) return null;
  if (ratio > 6) return { label: "over guidance", className: "text-rose-600" };
  if (ratio > 4) return { label: "general-purpose", className: "text-charcoal-900" };
  return { label: "latency-safe", className: "text-charcoal-900" };
}

export function SimpleSizerTool() {
  const [source, setSource] = useState<SizerSource>("collector_excel");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedEnvironment | null>(null);
  const [settings, setSettings] = useState<SizerSettings>(DEFAULT_SIZER_SETTINGS);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const plan = useMemo(() => (parsed ? buildSizingPlan(parsed, settings) : null), [parsed, settings]);

  const uploadAndAnalyze = async () => {
    if (!file || uploading) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setError("That needs to be an .xlsx or .xls export. ZIPs and CSVs aren't supported here.");
      return;
    }
    if (file.size === 0) {
      setError("That file is empty. Re-export from the source tool and try again.");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setError("That file is over 30 MB. Trim the export or split it before uploading.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("source", source);
      form.set("file", file);

      let response: Response;
      try {
        response = await fetch("/api/simple-sizer/analyze", { method: "POST", body: form });
      } catch {
        throw new Error("Couldn't reach the analyzer. Check your connection and try again.");
      }

      let data: { ok?: boolean; parsed?: ParsedEnvironment; error?: string };
      try {
        data = await response.json();
      } catch {
        throw new Error(`The analyzer returned an unreadable response (HTTP ${response.status}). Confirm the file is a valid Excel export.`);
      }

      if (!response.ok || !data.ok || !data.parsed) {
        throw new Error(data.error ?? `Unable to analyze the file (HTTP ${response.status}).`);
      }
      if (!Array.isArray(data.parsed.clusterDetails) || data.parsed.clusterDetails.length === 0) {
        throw new Error("No clusters were found in that file. Check that it's the full export and matches the selected source type.");
      }

      setParsed(data.parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong analyzing the file.");
      setParsed(null);
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setParsed(null);
    setFile(null);
    setError(null);
    setCopied(false);
    setSettings(DEFAULT_SIZER_SETTINGS);
  };

  const copySummary = async () => {
    if (!parsed || !plan) return;
    try {
      await navigator.clipboard.writeText(summaryText(parsed, plan, settings));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy to the clipboard — your browser blocked it.");
    }
  };

  const downloadWorkbook = async () => {
    if (!parsed || !plan || downloading) return;
    setDownloading(true);
    try {
      const blob = await buildSizerWorkbookBlob(parsed, plan, settings);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = sizerWorkbookFileName(parsed);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? `Couldn't build the workbook: ${e.message}` : "Couldn't build the workbook.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <ImportPanel
        source={source}
        setSource={setSource}
        file={file}
        // Choosing a new file clears the previous failure — the message described
        // the old file and would otherwise stick around as a false alarm.
        setFile={(f) => {
          setFile(f);
          setError(null);
        }}
        uploading={uploading}
        onAnalyze={uploadAndAnalyze}
        onReset={reset}
        error={error}
        parsed={parsed}
        onCopy={copySummary}
        copied={copied}
        onDownload={downloadWorkbook}
        downloading={downloading}
      />

      {uploading ? <ResultSkeleton /> : null}

      {!uploading && parsed && plan ? (
        <>
          {/* Reads as a narrative: what's in the file, what exists today, what we
              propose, and finally how every number was read. */}
          <EnvironmentSummary parsed={parsed} />
          <ExistingClusters parsed={parsed} plan={plan} />
          <BuildPlan plan={plan} settings={settings} onSettings={setSettings} />
          <ParsedInputs parsed={parsed} />
        </>
      ) : null}

      <ReferencePanel />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import — asymmetric split, with the empty state living in the right rail
// ---------------------------------------------------------------------------

function ImportPanel({
  source,
  setSource,
  file,
  setFile,
  uploading,
  onAnalyze,
  onReset,
  error,
  parsed,
  onCopy,
  copied,
  onDownload,
  downloading,
}: {
  source: SizerSource;
  setSource: (s: SizerSource) => void;
  file: File | null;
  setFile: (f: File | null) => void;
  uploading: boolean;
  onAnalyze: () => void;
  onReset: () => void;
  error: string | null;
  parsed: ParsedEnvironment | null;
  onCopy: () => void;
  copied: boolean;
  onDownload: () => void;
  downloading: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-charcoal-200 bg-white shadow-[0_18px_40px_-24px_rgba(49,49,49,0.22)]">
      <div className="grid gap-px bg-charcoal-200 lg:grid-cols-[1.35fr_0.9fr]">
        {/* Controls */}
        <div className="bg-white p-6 md:p-8">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-viz-compute">Simple Sizer</p>
          <h1 className="mt-2 max-w-[22ch] text-2xl font-semibold tracking-tighter text-charcoal-900 md:text-3xl">
            Read the estate, then size the cluster.
          </h1>
          <p className="mt-2 max-w-[58ch] text-sm leading-relaxed text-charcoal-600">
            Drop in a Collector, RVTools or LiveOptics export. Node class and node count are chosen from the workload —
            you only override what you disagree with.
          </p>

          {/* Both controls share one row and one baseline: the label row, the
              control row, and the helper row line up across both columns. */}
          <div className="mt-6 grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:grid-rows-[auto_auto_auto]">
            <label htmlFor="sourceType" className="sm:row-start-1">
              Source
            </label>
            <select
              id="sourceType"
              value={source}
              onChange={(e) => setSource(e.target.value as SizerSource)}
              className="h-11 w-full sm:col-start-1 sm:row-start-2"
            >
              <option value="collector_excel">Nutanix Collector</option>
              <option value="rvtools">RVTools</option>
              <option value="liveoptics">LiveOptics</option>
            </select>
            <p className="text-[11px] text-charcoal-500 sm:col-start-1 sm:row-start-3">Match this to the export.</p>

            <label htmlFor="fileUpload" className="sm:col-start-2 sm:row-start-1">
              Export file
            </label>
            <FileDrop
              file={file}
              onFile={setFile}
              invalid={Boolean(error)}
              className="sm:col-start-2 sm:row-start-2"
            />
            <p id="upload-help" className="text-[11px] text-charcoal-500 sm:col-start-2 sm:row-start-3">
              Drop a file here or browse — .xlsx or .xls, up to 30 MB.
            </p>
          </div>

          {error ? (
            <p
              id="upload-error"
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300"
            >
              <TriangleAlert {...ICON} className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onAnalyze}
              disabled={uploading || !file}
              className={`${PRESS} inline-flex items-center gap-2 rounded-full bg-iris-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-iris-600 disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Upload {...ICON} className="h-4 w-4" />
              {uploading ? "Analyzing" : "Analyze export"}
            </button>
            {parsed ? (
              <>
                <button
                  type="button"
                  onClick={onCopy}
                  className={`${PRESS} inline-flex items-center gap-2 rounded-full border border-charcoal-300 bg-white px-4 py-2.5 text-sm font-medium text-charcoal-800 hover:border-iris-400 hover:bg-iris-50`}
                >
                  <Copy {...ICON} className="h-4 w-4" />
                  {copied ? "Copied" : "Copy summary"}
                </button>
                <button
                  type="button"
                  onClick={onDownload}
                  disabled={downloading}
                  className={`${PRESS} inline-flex items-center gap-2 rounded-full border border-charcoal-300 bg-white px-4 py-2.5 text-sm font-medium text-charcoal-800 hover:border-iris-400 hover:bg-iris-50 disabled:opacity-60`}
                >
                  <Download {...ICON} className="h-4 w-4" />
                  {downloading ? "Building workbook" : "Download Excel"}
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  title="Clear this analysis"
                  className={`${PRESS} inline-flex items-center gap-2 rounded-full border border-charcoal-300 bg-white px-3 py-2.5 text-sm text-charcoal-600 hover:border-iris-400 hover:bg-iris-50`}
                >
                  <RotateCcw {...ICON} className="h-4 w-4" />
                  <span className="sr-only">Clear</span>
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* Right rail: empty state before a file, live status after */}
        <div className="bg-charcoal-50 p-6 md:p-8">
          {parsed ? (
            <div className="sizer-rise">
              <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-charcoal-500">
                <span aria-hidden className="sizer-breathe h-1.5 w-1.5 rounded-full bg-viz-storage" />
                Parsed
              </span>
              <p className="mt-3 truncate text-sm font-medium text-charcoal-900" title={parsed.fileName}>
                {parsed.fileName}
              </p>
              <dl className="mt-4 divide-y divide-charcoal-200 border-t border-charcoal-200 text-sm">
                <RailRow k="Clusters" v={fmtInt(parsed.clusters)} />
                <RailRow k="Hosts" v={fmtInt(parsed.hosts)} />
                <RailRow k="VMs" v={fmtInt(parsed.all.vms)} />
                <RailRow k="Sheets read" v={fmtInt(parsed.sheetsFound.length)} />
              </dl>
              <p className="mt-4 text-[11px] leading-relaxed text-charcoal-500">
                Held in this browser tab only — no session storage, no server-side copy. Closing the tab discards it.
              </p>
            </div>
          ) : (
            <EmptyState hasFile={Boolean(file)} fileName={file?.name} />
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * File field that accepts a drop as well as a click. Height-matched to the
 * adjacent select so the two controls share a baseline. The native input stays
 * in the DOM (visually hidden, not `display:none`) so the label, keyboard focus
 * and form semantics all keep working.
 */
function FileDrop({
  file,
  onFile,
  invalid,
  className = "",
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  invalid: boolean;
  className?: string;
}) {
  // dragenter/dragleave fire for every descendant, so count depth and derive the
  // highlight from it — toggling a boolean per event flickers as the pointer
  // crosses child elements.
  const [depth, setDepth] = useState(0);
  const dragging = depth > 0;

  const accept = (list: FileList | null) => {
    const dropped = list?.[0];
    if (dropped) onFile(dropped);
  };

  return (
    <div
      className={`relative ${className}`}
      onDragEnter={(e) => {
        e.preventDefault();
        setDepth((d) => d + 1);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
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
        id="fileUpload"
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => accept(e.target.files)}
        aria-describedby="upload-help"
        aria-invalid={invalid || undefined}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <div
        aria-hidden
        className={`pointer-events-none flex h-11 items-center gap-2.5 rounded-md border border-dashed px-3 text-sm transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-iris-300 peer-focus-visible:ring-offset-1 ${
          dragging
            ? "border-viz-compute bg-iris-50"
            : invalid
              ? "border-rose-300 bg-white"
              : "border-charcoal-300 bg-white peer-hover:border-iris-400 peer-hover:bg-iris-50"
        }`}
      >
        <Upload
          {...ICON}
          className={`h-4 w-4 shrink-0 ${dragging ? "text-viz-compute" : "text-charcoal-400"}`}
        />
        {file ? (
          <span className="min-w-0 flex-1 truncate font-medium text-charcoal-900" title={file.name}>
            {file.name}
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-charcoal-500">
            {dragging ? "Release to load" : "Drop export or click to browse"}
          </span>
        )}
        {file ? (
          <span className="shrink-0 tabular-nums text-[11px] text-charcoal-500">
            {(file.size / 1024 / 1024).toFixed(1)} MB
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-charcoal-600">{k}</dt>
      <dd className="tabular-nums font-medium text-charcoal-900">{v}</dd>
    </div>
  );
}

function EmptyState({ hasFile, fileName }: { hasFile: boolean; fileName?: string }) {
  return (
    <div>
      <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-charcoal-500">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${hasFile ? "bg-viz-compute" : "bg-charcoal-300"}`} />
        {hasFile ? "Ready" : "No file yet"}
      </span>
      {hasFile ? (
        <p className="mt-3 break-all text-sm font-medium text-charcoal-900">{fileName}</p>
      ) : (
        <p className="mt-3 max-w-[34ch] text-sm leading-relaxed text-charcoal-600">
          Pick a source and an export to get an as-is read of the environment plus a Nutanix build.
        </p>
      )}

      <ul className="mt-5 space-y-3 border-t border-charcoal-200 pt-4">
        <SourceHint title="Nutanix Collector" detail="The Excel export, not the raw ZIP. Needs vHosts and vInfo." />
        <SourceHint title="RVTools" detail="Standard export with vHost and vInfo; vPartition improves capacity accuracy." />
        <SourceHint title="LiveOptics" detail="The workbook containing ESX Hosts and VMs." />
      </ul>
    </div>
  );
}

function SourceHint({ title, detail }: { title: string; detail: string }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5">
      <FileSpreadsheet {...ICON} className="mt-0.5 h-4 w-4 text-charcoal-400" />
      <div>
        <p className="text-xs font-medium text-charcoal-900">{title}</p>
        <p className="text-[11px] leading-relaxed text-charcoal-500">{detail}</p>
      </div>
    </li>
  );
}

// Skeletal loader matching the real result layout — not a spinner.
function ResultSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Analyzing the export</span>
      <section className="rounded-[1.75rem] border border-charcoal-200 bg-white p-6 md:p-8">
        <div className="sizer-shimmer h-3 w-40 rounded-full bg-charcoal-100" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="sizer-shimmer h-2.5 w-20 rounded-full bg-charcoal-100" />
              <div className="sizer-shimmer h-7 w-28 rounded-lg bg-charcoal-100" />
              <div className="sizer-shimmer h-1.5 w-full rounded-full bg-charcoal-100" />
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-[1.75rem] border border-charcoal-200 bg-white p-6 md:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.7fr_1fr]">
          <div className="space-y-3">
            <div className="sizer-shimmer h-14 w-52 rounded-xl bg-charcoal-100" />
            <div className="sizer-shimmer h-3 w-full max-w-md rounded-full bg-charcoal-100" />
            <div className="sizer-shimmer h-3 w-2/3 max-w-sm rounded-full bg-charcoal-100" />
          </div>
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="sizer-shimmer h-3 w-full rounded-full bg-charcoal-100" />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section shell
// ---------------------------------------------------------------------------

function Section({
  title,
  subtitle,
  defaultOpen = false,
  badge,
  tone = "default",
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  tone?: "default" | "alert";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      className={`overflow-hidden rounded-[1.75rem] border bg-white shadow-[0_18px_40px_-24px_rgba(49,49,49,0.18)] ${
        tone === "alert" ? "border-rose-300" : "border-charcoal-200"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 bg-transparent px-6 py-5 text-left transition-colors duration-200 hover:bg-charcoal-50 md:px-8"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {tone === "alert" ? <TriangleAlert {...ICON} className="h-4 w-4 shrink-0 text-rose-600" /> : null}
            <span className="text-base font-semibold tracking-tight text-charcoal-900">{title}</span>
          </span>
          {subtitle ? <span className="mt-0.5 block max-w-[80ch] text-sm text-charcoal-600">{subtitle}</span> : null}
        </span>
        {badge}
        <ChevronDown
          {...ICON}
          className={`h-4 w-4 shrink-0 text-charcoal-500 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <div className="border-t border-charcoal-200 px-6 py-6 md:px-8">{children}</div> : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// What's in this file
// ---------------------------------------------------------------------------

function EnvironmentSummary({ parsed }: { parsed: ParsedEnvironment }) {
  const on = parsed.poweredOn;
  const off = parsed.poweredOff;
  const ratio = ratioStatus(parsed.vcpuPcoreRatio);
  const sourceLabel =
    parsed.source === "collector_excel" ? "Nutanix Collector" : parsed.source === "rvtools" ? "RVTools" : "LiveOptics";

  return (
    <Section
      title="What's in this file"
      subtitle={`${sourceLabel}${parsed.fileSizeBytes ? ` · ${(parsed.fileSizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}`}
      defaultOpen
      badge={
        parsed.powerStateKnown ? (
          <StatusPill tone="good">Power state read</StatusPill>
        ) : (
          <StatusPill tone="warning">No power state</StatusPill>
        )
      }
    >
      {/* Inventory — asymmetric, VMs given the weight it deserves */}
      <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="sizer-rise" style={{ ["--index" as string]: 0 }}>
          <div className="flex items-center gap-1.5">
            <Boxes {...ICON} className="h-3.5 w-3.5 text-charcoal-400" />
            <p className="text-[11px] font-medium text-charcoal-500">Virtual machines</p>
          </div>
          <p className="mt-1 text-4xl font-semibold tracking-tighter tabular-nums text-charcoal-900">{fmtInt(parsed.all.vms)}</p>
          <div className="mt-3 max-w-xs">
            {parsed.powerStateKnown ? (
              <SplitMeter
                label=""
                segments={[
                  { key: "on", label: `${fmtInt(on.vms)} on`, value: on.vms, series: "storage" },
                  { key: "off", label: `${fmtInt(off.vms)} off`, value: off.vms, series: "muted" },
                ]}
              />
            ) : (
              <p className="text-[11px] text-charcoal-500">Power state absent — all treated as running.</p>
            )}
          </div>
        </div>
        <Stat label="Datacenters" value={fmtInt(parsed.datacenters)} index={1} />
        <Stat label="Clusters" value={fmtInt(parsed.clusters)} index={2} />
        <Stat label="Hosts" value={fmtInt(parsed.hosts)} index={3} />
      </div>

      <div className="mt-8 grid gap-x-6 gap-y-6 border-t border-charcoal-200 pt-6 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="vCPU running" value={fmtInt(on.vcpu)} sub={`${fmtInt(parsed.all.vcpu)} allocated in total`} series="compute" index={0} />
        <Stat label="Host physical cores" value={fmtInt(parsed.totalCpuCores)} sub={`${fmtNum(parsed.avgVcpuPerVm)} vCPU per VM`} series="compute" index={1} />
        <Stat
          label="vCPU : pCore"
          value={`${fmtNum(parsed.vcpuPcoreRatio, 2)}:1`}
          sub={ratio?.label}
          series="compute"
          index={2}
        />
        <Stat label="VM memory running" value={fmtRam(on.ramGiB)} sub={`${fmtRam(parsed.totalMemoryGiB)} installed in hosts`} series="memory" index={3} />
      </div>

      {/* Storage + OS mix, asymmetric */}
      <div className="mt-8 grid gap-8 border-t border-charcoal-200 pt-6 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <div className="flex items-center gap-1.5">
            <HardDrive {...ICON} className="h-3.5 w-3.5 text-charcoal-400" />
            <p className="text-[11px] font-medium text-charcoal-500">Storage</p>
          </div>
          <p className="mt-1 text-3xl font-semibold tracking-tighter tabular-nums text-charcoal-900">
            {fmtStorage(parsed.aggStorageConsumedTiB)}
          </p>
          <p className="text-[11px] text-charcoal-500">consumed of {fmtStorage(parsed.aggStorageProvisionedTiB)} provisioned</p>
          <div className="mt-4 max-w-md">
            <Meter
              label="Utilization"
              series="storage"
              value={parsed.aggStorageConsumedTiB}
              max={parsed.aggStorageProvisionedTiB}
              caption={
                parsed.aggStorageProvisionedTiB > 0
                  ? `${Math.round((parsed.aggStorageConsumedTiB / parsed.aggStorageProvisionedTiB) * 100)}%`
                  : undefined
              }
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {parsed.snapshots ? (
              <StatusPill tone={parsed.snapshots > 50 ? "warning" : "neutral"}>
                <Camera {...ICON} className="mr-1 inline h-3 w-3" />
                {fmtInt(parsed.snapshots)} snapshots
              </StatusPill>
            ) : null}
            {parsed.hostCpuUtilPct != null ? <StatusPill tone="neutral">Host CPU {fmtNum(parsed.hostCpuUtilPct)}%</StatusPill> : null}
            {parsed.hostMemoryUtilPct != null ? <StatusPill tone="neutral">Host RAM {fmtNum(parsed.hostMemoryUtilPct)}%</StatusPill> : null}
          </div>
        </div>

        {parsed.guestOs.length ? (
          <div>
            <p className="mb-3 text-[11px] font-medium text-charcoal-500">Guest OS mix</p>
            <RankedBars rows={parsed.guestOs} total={parsed.all.vms} />
          </div>
        ) : null}
      </div>

      {parsed.topVms.length ? (
        <div className="mt-8 border-t border-charcoal-200 pt-6">
          <TopVmTable vms={parsed.topVms} caption="Largest VMs — each must fit inside one node" />
        </div>
      ) : null}

      {parsed.notes.length ? (
        <ul className="mt-6 space-y-1 border-t border-charcoal-200 pt-4 text-[11px] leading-relaxed text-charcoal-500">
          {parsed.notes.map((n, i) => (
            <li key={`${i}-${n.slice(0, 24)}`}>{n}</li>
          ))}
        </ul>
      ) : null}

      <p className="mt-4 max-w-[80ch] text-[11px] leading-relaxed text-charcoal-500">{UNIT_FOOTNOTE}</p>
    </Section>
  );
}

function TopVmTable({
  vms,
  caption,
  showCluster = true,
}: {
  vms: { name: string; cluster: string | null; vcpu: number; ramGiB: number; storageTiB: number; poweredOn: boolean }[];
  caption: string;
  showCluster?: boolean;
}) {
  return (
    <div>
      <p className="mb-3 text-[11px] font-medium text-charcoal-500">{caption}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-charcoal-200 text-left text-[11px] font-medium text-charcoal-500">
              <th className="pb-2 pr-3 font-medium">VM</th>
              {showCluster ? <th className="px-3 pb-2 font-medium">Cluster</th> : null}
              <th className="px-3 pb-2 text-right font-medium">vCPU</th>
              <th className="px-3 pb-2 text-right font-medium">Memory</th>
              <th className="pb-2 pl-3 text-right font-medium">Storage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-100">
            {vms.map((vm, i) => (
              <tr key={`${i}-${vm.name}`}>
                <td className="max-w-[18rem] py-2 pr-3">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${vm.poweredOn ? "bg-viz-storage" : "bg-viz-muted"}`}
                    />
                    <span className="truncate font-medium text-charcoal-900" title={vm.name}>
                      {vm.name}
                    </span>
                    <span className="sr-only">{vm.poweredOn ? "powered on" : "powered off"}</span>
                  </span>
                </td>
                {showCluster ? (
                  <td className="max-w-[14rem] truncate px-3 text-charcoal-600" title={vm.cluster ?? ""}>
                    {vm.cluster ?? "—"}
                  </td>
                ) : null}
                <td className="px-3 text-right tabular-nums font-medium text-charcoal-900">{fmtInt(vm.vcpu)}</td>
                <td className="px-3 text-right tabular-nums text-charcoal-700">{fmtRam(vm.ramGiB)}</td>
                <td className="pl-3 text-right tabular-nums text-charcoal-700">{fmtStorage(vm.storageTiB, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <VizKey series="storage" label="Powered on" />
        <VizKey series="muted" label="Powered off" />
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recommended build
// ---------------------------------------------------------------------------

function BuildPlan({
  plan,
  settings,
  onSettings,
}: {
  plan: SizingPlan;
  settings: SizerSettings;
  onSettings: (update: (s: SizerSettings) => SizerSettings) => void;
}) {
  const build = plan.consolidated;
  const blocked = plan.blockers.length > 0;
  const set = <K extends keyof SizerSettings>(key: K, value: SizerSettings[K]) => onSettings((s) => ({ ...s, [key]: value }));

  const driverText =
    build.fit.driver === "storage"
      ? "capacity"
      : build.fit.driver === "ram"
        ? "memory"
        : build.fit.driver === "resiliency"
          ? "the RF node minimum"
          : "CPU";

  return (
    <Section
      title={blocked ? "Recommendation withheld" : "Recommended Nutanix build"}
      subtitle={
        blocked
          ? "The figures read from this file are not physically possible, so no build is shown."
          : `Node class and count derived from the workload, then split to respect the ${SIZING_RULES.maxNodesPerCluster}-node planning maximum.`
      }
      tone={blocked ? "alert" : "default"}
      defaultOpen
      badge={
        blocked ? (
          <StatusPill tone="bad">
            {plan.blockers.length} {plan.blockers.length === 1 ? "check failed" : "checks failed"}
          </StatusPill>
        ) : (
          <StatusPill tone="info">
            {fmtInt(plan.totalNodes)} nodes · {fmtInt(plan.totalClusters)} {plan.totalClusters === 1 ? "cluster" : "clusters"}
          </StatusPill>
        )
      }
    >
      {blocked ? (
        <div className="mb-8">
          <p className="max-w-[70ch] text-sm leading-relaxed text-charcoal-700">
            A recommendation would be wrong, so it has been suppressed. Each check compares what was parsed against what is
            physically possible. Open <span className="font-medium text-charcoal-900">Parsed inputs</span> to see which sheet
            and column produced the bad figure, then re-export or correct the source type.
          </p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="border-b border-charcoal-200 text-left text-[11px] font-medium text-charcoal-500">
                  <th className="pb-2 pr-3 font-medium">Check</th>
                  <th className="px-3 pb-2 font-medium">Parsed</th>
                  <th className="px-3 pb-2 font-medium">Expected</th>
                  <th className="pb-2 pl-3 font-medium">Likely cause</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal-100">
                {plan.blockers.map((issue, i) => (
                  <tr key={`${i}-${issue.field}`}>
                    <td className="py-2.5 pr-3 font-medium text-charcoal-900">{issue.field}</td>
                    <td className="px-3 py-2.5 font-medium tabular-nums text-rose-600">{issue.observed}</td>
                    <td className="px-3 py-2.5 tabular-nums text-charcoal-700">{issue.expected}</td>
                    <td className="py-2.5 pl-3 text-charcoal-600">{issue.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          {/* Headline — left-aligned, asymmetric, no centred hero */}
          <div className="grid gap-8 lg:grid-cols-[1.7fr_1fr]">
            <div>
              <HeroNumber
                value={fmtInt(plan.totalNodes)}
                unit={`${plan.profile.label} ${plan.totalNodes === 1 ? "node" : "nodes"}`}
                hint={
                  <>
                    across {fmtInt(plan.totalClusters)} {plan.totalClusters === 1 ? "cluster" : "clusters"} · RF
                    {build.effectiveRf} · N+{build.failoverHosts} · {build.licenseTier.tier}
                  </>
                }
              />
              <p className="mt-5 max-w-[62ch] text-sm leading-relaxed text-charcoal-600">
                {plan.profile.family} — {plan.profile.blurb} Sized on {driverText}: {build.fit.nodesForCpu} node
                {build.fit.nodesForCpu === 1 ? "" : "s"} for CPU, {build.fit.nodesForRam} for memory, {build.fit.nodesForStorage} for
                capacity, plus {build.failoverHosts} HA spare{build.failoverHosts === 1 ? "" : "s"}.
                {build.rfUpgraded ? " Stepped up to RF3 at 5+ nodes." : ""}
              </p>
              {plan.autoSelected ? (
                <p className="mt-3 text-[11px] text-charcoal-500">Node class chosen automatically. Override it below.</p>
              ) : null}
            </div>

            <div className="grid content-start gap-4 lg:border-l lg:border-charcoal-200 lg:pl-8">
              <p className="text-[11px] font-medium text-charcoal-500">Headroom on the proposed build</p>
              <Meter label="CPU" series="compute" value={build.headroom.cpuPct} max={100} caption={`${fmtNum(100 - build.headroom.cpuPct)}% free`} index={0} />
              <Meter label="Memory" series="memory" value={build.headroom.ramPct} max={100} caption={`${fmtNum(100 - build.headroom.ramPct)}% free`} index={1} />
              <Meter label="Capacity" series="storage" value={build.headroom.storagePct} max={100} caption={`${fmtNum(100 - build.headroom.storagePct)}% free`} index={2} />
            </div>
          </div>

          {/* Specs — asymmetric, never three equal cards */}
          <div className="mt-8 grid gap-8 border-t border-charcoal-200 pt-6 lg:grid-cols-[1.4fr_1fr_1fr]">
            <SpecGroup
              title="Each node"
              rows={[
                ["Physical cores", fmtInt(plan.profile.cores)],
                ["Memory", `${fmtRam(build.perNode.ramGiB)} of ${fmtRam(plan.profile.maxRamGiB)} max`],
                ["Raw storage", `${fmtStorage(build.perNode.storageTiB)} of ${fmtStorage(plan.profile.maxStorageTiB)} max`],
              ]}
            />
            <SpecGroup
              title="Solution total"
              rows={[
                ["Nodes", fmtInt(plan.totalNodes)],
                ["Physical cores", fmtInt(plan.totals.cores)],
                ["Memory", fmtRam(plan.totals.ramGiB)],
                ["Raw storage", fmtStorage(plan.totals.rawStorageTiB)],
              ]}
            />
            <SpecGroup
              title="Workload placed"
              rows={[
                ["VMs", fmtInt(build.workload.vmCount)],
                ["vCPU", fmtInt(build.workload.vcpu)],
                ["Memory", fmtRam(build.workload.ramGiB)],
                ["Data", fmtStorage(build.workload.storageTiB)],
              ]}
            />
          </div>
        </>
      )}

      {/* Assumptions */}
      <details className="mt-8 border-t border-charcoal-200 pt-6">
        <summary className={`${PRESS} inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-charcoal-900`}>
          <SlidersHorizontal {...ICON} className="h-4 w-4 text-charcoal-500" />
          Assumptions &amp; overrides
        </summary>
        <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Size against" htmlFor="basis">
            <select id="basis" value={settings.workloadBasis} onChange={(e) => set("workloadBasis", e.target.value as WorkloadBasis)} className="w-full">
              <option value="poweredOn">Powered-on VMs</option>
              <option value="all">All VMs</option>
            </select>
          </Field>
          <Field label="vCPU : pCore" htmlFor="ratio">
            <select id="ratio" value={settings.vcpuToPcoreRatio} onChange={(e) => set("vcpuToPcoreRatio", Number(e.target.value))} className="w-full">
              {[2, 3, 4, 5, 6].map((r) => (
                <option key={r} value={r}>
                  {r}:1{r <= 4 ? " (latency-sensitive)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Replication" htmlFor="rf">
            <select
              id="rf"
              value={String(settings.rf)}
              onChange={(e) => set("rf", (e.target.value === "auto" ? "auto" : Number(e.target.value)) as RfSetting)}
              className="w-full"
            >
              <option value="auto">Auto (RF3 at 5+ nodes)</option>
              <option value="2">RF2</option>
              <option value="3">RF3</option>
            </select>
          </Field>
          <Field label="HA failover" htmlFor="failover">
            <select id="failover" value={settings.failoverHosts} onChange={(e) => set("failoverHosts", Number(e.target.value))} className="w-full">
              <option value={1}>N+1</option>
              <option value={2}>N+2</option>
            </select>
          </Field>
          <Field label="Node class" htmlFor="nodeProfile">
            <select id="nodeProfile" value={settings.nodeProfileId} onChange={(e) => set("nodeProfileId", e.target.value)} className="w-full">
              <option value={AUTO_PROFILE}>Auto — pick for me</option>
              {NODE_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} — {p.cores}c / up to {fmtRam(p.maxRamGiB)}
                </option>
              ))}
              <option value={CUSTOM_PROFILE}>Custom</option>
            </select>
          </Field>
          <Field label="Cluster plan" htmlFor="planMode">
            <select id="planMode" value={settings.planMode} onChange={(e) => set("planMode", e.target.value as PlanMode)} className="w-full">
              <option value="consolidated">Consolidate everything</option>
              <option value="per-cluster">One cluster per source cluster</option>
            </select>
          </Field>
          <Field label="Storage basis" htmlFor="storageBasis">
            <select id="storageBasis" value={settings.storageBasis} onChange={(e) => set("storageBasis", e.target.value as "provisioned" | "consumed")} className="w-full">
              <option value="consumed">Consumed</option>
              <option value="provisioned">Provisioned</option>
            </select>
          </Field>
          <Field label="Data reduction" htmlFor="efficiency">
            <select id="efficiency" value={settings.storageEfficiency} onChange={(e) => set("storageEfficiency", e.target.value as StorageEfficiency)} className="w-full">
              <option value="none">None (full RF)</option>
              <option value="compression">Compression (~30%)</option>
              <option value="ecx">EC-X (4+ nodes)</option>
            </select>
          </Field>
          {settings.nodeProfileId === CUSTOM_PROFILE ? (
            <>
              <Field label="Cores per node" htmlFor="customCores">
                <input id="customCores" type="number" min={8} step={2} value={settings.customCores} onChange={(e) => set("customCores", Number(e.target.value) || 0)} className="w-full" />
              </Field>
              <Field label="Memory GB per node" htmlFor="customRam">
                <input id="customRam" type="number" min={64} step={64} value={settings.customRamGiB} onChange={(e) => set("customRamGiB", Number(e.target.value) || 0)} className="w-full" />
              </Field>
              <Field label="Storage TB per node" htmlFor="customStorage">
                <input id="customStorage" type="number" min={1} step={1} value={settings.customStorageTiB} onChange={(e) => set("customStorageTiB", Number(e.target.value) || 0)} className="w-full" />
              </Field>
            </>
          ) : null}
          <Field label="Peak IOPS" htmlFor="peakIops" helper="Optional — sets the disk tier.">
            <input
              id="peakIops"
              type="number"
              min={0}
              step={1000}
              placeholder="e.g. 84,000"
              value={settings.peakIops ?? ""}
              onChange={(e) => set("peakIops", e.target.value === "" ? null : Number(e.target.value))}
              className="w-full"
            />
          </Field>
        </div>
      </details>

      {blocked ? null : (
        <>
          {/* Cluster plan */}
          <div className="mt-8 border-t border-charcoal-200 pt-6">
            <p className="mb-4 text-[11px] font-medium text-charcoal-500">
              Cluster plan — {plan.mode === "consolidated" ? "workloads pooled" : "one target per source cluster"}
            </p>
            <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
              {plan.targets.map((target, i) => (
                <div key={`${i}-${target.name}`} className="sizer-rise min-w-0 border-t-2 border-viz-compute pt-3" style={{ ["--index" as string]: i }}>
                  <p className="truncate text-xs font-medium text-charcoal-600" title={target.name}>
                    {target.name}
                  </p>
                  <p className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-2xl font-semibold tabular-nums tracking-tight text-charcoal-900">{target.nodes}</span>
                    <span className="text-[11px] text-charcoal-500">nodes · RF{target.rf}</span>
                  </p>
                  <dl className="mt-2 space-y-0.5 text-[11px]">
                    <SpecRow k="Cores" v={fmtInt(target.totals.cores)} />
                    <SpecRow k="Memory" v={fmtRam(target.totals.ramGiB)} />
                    <SpecRow k="Raw" v={fmtStorage(target.totals.rawStorageTiB)} />
                  </dl>
                  <div className="mt-3">
                    <MicroMeters
                      items={[
                        { key: "cpu", series: "compute", pct: target.util.cpuPct, label: `CPU ${fmtNum(target.util.cpuPct)}%` },
                        { key: "ram", series: "memory", pct: target.util.ramPct, label: `Memory ${fmtNum(target.util.ramPct)}%` },
                        { key: "sto", series: "storage", pct: target.util.storagePct, label: `Capacity ${fmtNum(target.util.storagePct)}%` },
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
              <VizKey series="compute" label="CPU" />
              <VizKey series="memory" label="Memory" />
              <VizKey series="storage" label="Capacity" />
            </p>
          </div>

          {build.diskTier ? (
            <div className="mt-8 grid gap-2 border-t border-charcoal-200 pt-6 text-sm">
              <p className="font-medium text-charcoal-900">
                {build.diskTier.tier}
                <span className="ml-2 text-[11px] font-normal tabular-nums text-charcoal-500">
                  {fmtInt(build.perNodeIops)} IOPS per node · {build.diskTier.latency}
                </span>
              </p>
              <p className="max-w-[76ch] text-xs leading-relaxed text-charcoal-600">{build.diskTier.workloads}</p>
              <p className="max-w-[76ch] text-xs leading-relaxed text-charcoal-600">{build.networkRecommendation}</p>
            </div>
          ) : null}

          {build.monsterVmRisk ? (
            <p className="mt-6 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-300">
              <TriangleAlert {...ICON} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{build.monsterVmReason}</span>
            </p>
          ) : null}

          {plan.warnings.length ? (
            <ul className="mt-6 space-y-1.5 border-t border-charcoal-200 pt-4 text-xs leading-relaxed text-charcoal-600">
              {plan.warnings.map((w, i) => (
                <li key={`${i}-${w.slice(0, 24)}`} className="max-w-[86ch]">
                  {w}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-4 max-w-[86ch] text-[11px] leading-relaxed text-charcoal-500">
            Node classes are indicative platform targets — confirm models and drive configs in Nutanix Sizer and the HCL
            before quoting. CPU and memory are sized on {settings.workloadBasis === "poweredOn" ? "powered-on VMs" : "all VMs"};
            storage always counts every VM, because powered-off VMs still occupy capacity. Raw capacity includes RF copies
            plus 20% reserved for rebuild.
          </p>
        </>
      )}
    </Section>
  );
}

function SpecGroup({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-charcoal-500">{title}</p>
      <dl className="mt-2 divide-y divide-charcoal-100 border-t border-charcoal-200 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="shrink-0 text-charcoal-600">{k}</dt>
            <dd className="truncate text-right font-medium tabular-nums text-charcoal-900">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SpecRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-charcoal-500">{k}</dt>
      <dd className="truncate text-right tabular-nums font-medium text-charcoal-800">{v}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Existing clusters
// ---------------------------------------------------------------------------

function ExistingClusters({ parsed, plan }: { parsed: ParsedEnvironment; plan: SizingPlan }) {
  const nodesByCluster = useMemo(() => {
    const map = new Map<string, number>();
    plan.perCluster.forEach(({ source, build }) => map.set(source.id, build.nodes));
    return map;
  }, [plan]);

  return (
    <Section
      title="Existing clusters"
      subtitle="Every cluster in the export with its hardware, utilization, and the Nutanix nodes it would take on its own."
      badge={
        <StatusPill tone="neutral">
          {fmtInt(parsed.clusters)} {parsed.clusters === 1 ? "cluster" : "clusters"}
        </StatusPill>
      }
    >
      <div className="divide-y divide-charcoal-200 border-t border-charcoal-200">
        {parsed.clusterDetails.map((cluster, i) => (
          <ClusterRow key={cluster.id} cluster={cluster} recommendedNodes={nodesByCluster.get(cluster.id) ?? null} index={i} />
        ))}
      </div>
    </Section>
  );
}

function ClusterRow({
  cluster,
  recommendedNodes,
  index,
}: {
  cluster: ParsedCluster;
  recommendedNodes: number | null;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const coresPerNode = cluster.hosts > 0 ? cluster.totalCpuCores / cluster.hosts : 0;
  const ramPerNode = cluster.hosts > 0 ? cluster.totalMemoryGiB / cluster.hosts : 0;
  const storagePerNode = cluster.hosts > 0 ? cluster.aggStorageProvisionedTiB / cluster.hosts : 0;

  return (
    <div className="sizer-rise" style={{ ["--index" as string]: index }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 bg-transparent py-4 text-left transition-colors duration-200 hover:bg-charcoal-50"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-charcoal-900" title={cluster.name}>
            {cluster.name}
          </span>
          <span className="mt-0.5 block truncate text-[11px] tabular-nums text-charcoal-500">
            {cluster.datacenter ? `${cluster.datacenter} · ` : ""}
            {fmtInt(cluster.hosts)} hosts · {fmtInt(cluster.all.vms)} VMs · {fmtInt(cluster.totalCpuCores)} cores ·{" "}
            {fmtRam(cluster.totalMemoryGiB)} · {fmtStorage(cluster.aggStorageProvisionedTiB)}
          </span>
        </span>
        <span className="flex items-center gap-3">
          {recommendedNodes != null ? (
            <span className="whitespace-nowrap text-[11px] tabular-nums text-charcoal-600">
              <span className="text-base font-semibold text-charcoal-900">{recommendedNodes}</span> nodes
            </span>
          ) : null}
          <ChevronDown
            {...ICON}
            className={`h-4 w-4 shrink-0 text-charcoal-500 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open ? (
        <div className="pb-6">
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="vCPU allocated" value={fmtInt(cluster.all.vcpu)} sub={`${fmtNum(cluster.avgVcpuPerVm)} per VM`} series="compute" index={0} />
            <Stat label="vCPU : pCore" value={`${fmtNum(cluster.vcpuPcoreRatio, 2)}:1`} sub={ratioStatus(cluster.vcpuPcoreRatio)?.label} series="compute" index={1} />
            <Stat label="VM memory" value={fmtRam(cluster.all.ramGiB)} sub={`${fmtRam(cluster.totalMemoryGiB)} installed`} series="memory" index={2} />
            <Stat label="Storage consumed" value={fmtStorage(cluster.aggStorageConsumedTiB)} sub={`of ${fmtStorage(cluster.aggStorageProvisionedTiB)}`} series="storage" index={3} />
          </div>

          <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <p className="text-[11px] font-medium text-charcoal-500">Average per node</p>
              <dl className="mt-2 divide-y divide-charcoal-100 border-t border-charcoal-200 text-sm">
                <div className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-charcoal-600">Cores</dt>
                  <dd className="tabular-nums font-medium text-charcoal-900">{fmtNum(coresPerNode)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-charcoal-600">Memory</dt>
                  <dd className="tabular-nums font-medium text-charcoal-900">{fmtRam(ramPerNode)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-2">
                  <dt className="text-charcoal-600">Storage</dt>
                  <dd className="tabular-nums font-medium text-charcoal-900">{fmtStorage(storagePerNode)}</dd>
                </div>
              </dl>
              <div className="mt-4 grid gap-3">
                {cluster.hostCpuUtilPct != null ? (
                  <Meter label="Host CPU used" series="compute" value={cluster.hostCpuUtilPct} max={100} caption={`${fmtNum(cluster.hostCpuUtilPct)}%`} />
                ) : null}
                {cluster.hostMemoryUtilPct != null ? (
                  <Meter label="Host memory used" series="memory" value={cluster.hostMemoryUtilPct} max={100} caption={`${fmtNum(cluster.hostMemoryUtilPct)}%`} />
                ) : null}
                <Meter
                  label="Storage used"
                  series="storage"
                  value={cluster.aggStorageConsumedTiB}
                  max={cluster.aggStorageProvisionedTiB}
                  caption={
                    cluster.aggStorageProvisionedTiB > 0
                      ? `${Math.round((cluster.aggStorageConsumedTiB / cluster.aggStorageProvisionedTiB) * 100)}%`
                      : undefined
                  }
                />
              </div>
            </div>

            <div>
              <p className="text-[11px] font-medium text-charcoal-500">
                Hardware — {cluster.hardwareModels.length} distinct{" "}
                {cluster.hardwareModels.length === 1 ? "configuration" : "configurations"}
              </p>
              {cluster.hardwareModels.length ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[38rem] text-xs">
                    <thead>
                      <tr className="border-b border-charcoal-200 text-left text-[11px] font-medium text-charcoal-500">
                        <th className="pb-2 pr-3 font-medium">Model</th>
                        <th className="px-3 pb-2 font-medium">CPU</th>
                        <th className="px-3 pb-2 text-right font-medium">Hosts</th>
                        <th className="px-3 pb-2 text-right font-medium">Sockets</th>
                        <th className="px-3 pb-2 text-right font-medium">Cores/host</th>
                        <th className="px-3 pb-2 text-right font-medium">Memory/host</th>
                        <th className="pb-2 pl-3 text-right font-medium">Storage/host</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-charcoal-100">
                      {cluster.hardwareModels.map((m, i) => (
                        <tr key={`${i}-${m.vendor ?? ""}-${m.model}`}>
                          <td className="max-w-[14rem] py-2 pr-3">
                            <span className="block truncate font-medium text-charcoal-900" title={m.model}>
                              {m.model}
                            </span>
                            <span className="block truncate text-[11px] text-charcoal-500">{m.vendor ?? "Unknown vendor"}</span>
                          </td>
                          <td className="max-w-[13rem] truncate px-3 text-charcoal-600" title={m.cpuModel ?? ""}>
                            {m.cpuModel ?? "—"}
                          </td>
                          <td className="px-3 text-right tabular-nums font-medium text-charcoal-900">{fmtInt(m.hostCount)}</td>
                          <td className="px-3 text-right tabular-nums text-charcoal-700">
                            {fmtInt(m.socketsPerHost)}
                            <span className="text-charcoal-400"> × {fmtInt(m.coresPerSocket)}</span>
                          </td>
                          <td className="px-3 text-right tabular-nums text-charcoal-700">{fmtNum(m.coresPerHost)}</td>
                          <td className="px-3 text-right tabular-nums text-charcoal-700">{fmtRam(m.ramPerHostGiB)}</td>
                          <td className="pl-3 text-right tabular-nums text-charcoal-700">{fmtStorage(m.storagePerHostTiB)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-charcoal-200 text-charcoal-900">
                        <td className="py-2 pr-3 font-medium" colSpan={2}>
                          Cluster total
                        </td>
                        <td className="px-3 text-right tabular-nums font-medium">{fmtInt(cluster.hosts)}</td>
                        <td className="px-3" />
                        <td className="px-3 text-right tabular-nums font-medium">{fmtInt(cluster.totalCpuCores)}</td>
                        <td className="px-3 text-right tabular-nums font-medium">{fmtRam(cluster.totalMemoryGiB)}</td>
                        <td className="pl-3 text-right tabular-nums font-medium">{fmtStorage(cluster.aggStorageProvisionedTiB)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <p className="mt-2 text-xs text-charcoal-500">No hardware detail in this export.</p>
              )}

              {cluster.hostRecords.length ? (
                <details className="mt-4">
                  <summary className={`${PRESS} cursor-pointer text-[11px] font-medium text-viz-compute`}>
                    All {fmtInt(cluster.hostRecords.length)} hosts
                  </summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[32rem] text-xs">
                      <thead>
                        <tr className="border-b border-charcoal-200 text-left text-[11px] font-medium text-charcoal-500">
                          <th className="pb-2 pr-3 font-medium">Host</th>
                          <th className="px-3 pb-2 font-medium">Model</th>
                          <th className="px-3 pb-2 text-right font-medium">Sockets</th>
                          <th className="px-3 pb-2 text-right font-medium">Cores</th>
                          <th className="pb-2 pl-3 text-right font-medium">Memory</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-charcoal-100">
                        {cluster.hostRecords.map((h, i) => (
                          <tr key={`${i}-${h.name}`}>
                            <td className="max-w-[16rem] truncate py-1.5 pr-3 font-medium text-charcoal-900" title={h.name}>
                              {h.name}
                            </td>
                            <td className="max-w-[14rem] truncate px-3 text-charcoal-600">
                              {h.vendor ? `${h.vendor} ` : ""}
                              {h.model}
                            </td>
                            <td className="px-3 text-right tabular-nums text-charcoal-700">{fmtInt(h.sockets)}</td>
                            <td className="px-3 text-right tabular-nums text-charcoal-700">{fmtInt(h.cores)}</td>
                            <td className="pl-3 text-right tabular-nums text-charcoal-700">{fmtRam(h.ramGiB)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : null}
            </div>
          </div>

          {cluster.topVms.length ? (
            <div className="mt-6">
              <TopVmTable vms={cluster.topVms} caption="Largest VMs in this cluster" showCluster={false} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Parsed inputs — the audit trail
// ---------------------------------------------------------------------------

function ParsedInputs({ parsed }: { parsed: ParsedEnvironment }) {
  const inferred = parsed.audit.filter((a) => a.confidence !== "header").length;
  return (
    <Section
      title="Parsed inputs"
      subtitle="Which sheet and column each number came from, and how its unit was decided."
      badge={inferred > 0 ? <StatusPill tone="warning">{inferred} inferred</StatusPill> : <StatusPill tone="good">All from headers</StatusPill>}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-xs">
          <thead>
            <tr className="border-b border-charcoal-200 text-left text-[11px] font-medium text-charcoal-500">
              <th className="pb-2 pr-3 font-medium">Field</th>
              <th className="px-3 pb-2 font-medium">Sheet</th>
              <th className="px-3 pb-2 font-medium">Column</th>
              <th className="px-3 pb-2 font-medium">Unit</th>
              <th className="pb-2 pl-3 font-medium">How it was decided</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-100">
            {parsed.audit.map((a, i) => (
              <tr key={`${i}-${a.field}`}>
                <td className="py-2 pr-3 font-medium text-charcoal-900">{a.field}</td>
                <td className="px-3 text-charcoal-600">{a.sheet}</td>
                <td className="px-3 text-charcoal-600">{a.column ?? <span className="text-rose-600">not found</span>}</td>
                <td className="px-3">
                  <ConfidencePill confidence={a.confidence} unit={a.unit} />
                </td>
                <td className="max-w-[28rem] py-2 pl-3 leading-relaxed text-charcoal-600">{a.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[11px] text-charcoal-500">Sheets in this file: {parsed.sheetsFound.join(", ")}</p>
    </Section>
  );
}

function ConfidencePill({ confidence, unit }: { confidence: string; unit: string | null }) {
  const tone =
    confidence === "header" ? "good" : confidence === "unresolved" ? "bad" : confidence === "header-overridden" ? "warning" : "info";
  const label =
    confidence === "header"
      ? unit ?? "—"
      : confidence === "unresolved"
        ? "unresolved"
        : confidence === "header-overridden"
          ? `${unit} corrected`
          : `${unit} inferred`;
  return <StatusPill tone={tone as "good" | "bad" | "warning" | "info"}>{label}</StatusPill>;
}

// ---------------------------------------------------------------------------
// Reference
// ---------------------------------------------------------------------------

function ReferencePanel() {
  return (
    <Section title="Sizing reference" subtitle="The Nutanix guidance this tool applies — redundancy, ratios, storage, network, HA.">
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        {SIZING_REFERENCE.map((group) => (
          <div key={group.title}>
            <h3 className="text-sm font-semibold tracking-tight text-charcoal-900">{group.title}</h3>
            <ul className="mt-3 divide-y divide-charcoal-100 border-t border-charcoal-200">
              {group.items.map((item) => (
                <li key={item.rule} className="py-2.5">
                  <p className="text-xs font-medium text-charcoal-900">{item.rule}</p>
                  <p className="mt-0.5 max-w-[70ch] text-xs leading-relaxed text-charcoal-600">
                    {item.detail}{" "}
                    <a href={item.source.href} target="_blank" rel="noopener noreferrer" className="text-viz-compute underline underline-offset-2">
                      {item.source.label}
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-8 border-t border-charcoal-200 pt-6">
        <h3 className="text-sm font-semibold tracking-tight text-charcoal-900">Node classes the sizer picks from</h3>
        <div className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {NODE_PROFILES.map((p) => (
            <div key={p.id} className="flex items-baseline justify-between gap-3 border-b border-charcoal-100 py-2 text-xs">
              <span className="font-medium text-charcoal-900">{p.label}</span>
              <span className="tabular-nums text-charcoal-500">
                {p.cores}c · {fmtRam(p.maxRamGiB)} · {fmtStorage(p.maxStorageTiB)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-charcoal-200 pt-4 text-xs">
        {KEY_RESOURCES.map((link) => (
          <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="text-viz-compute underline underline-offset-2">
            {link.label}
          </a>
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Form primitives
// ---------------------------------------------------------------------------

function Field({ label, htmlFor, helper, children }: { label: string; htmlFor: string; helper?: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-2">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {helper ? <p className="text-[11px] text-charcoal-500">{helper}</p> : null}
    </div>
  );
}

// Plain-text roll-up for pasting into notes, an email, or an opportunity record.
function summaryText(parsed: ParsedEnvironment, plan: SizingPlan, settings: SizerSettings): string {
  const build = plan.consolidated;
  const lines = [
    `Simple Sizer — ${parsed.fileName}`,
    "",
    "CURRENT ENVIRONMENT",
    `  Clusters: ${fmtInt(parsed.clusters)}   Hosts: ${fmtInt(parsed.hosts)}   VMs: ${fmtInt(parsed.all.vms)} (${fmtInt(parsed.poweredOn.vms)} on / ${fmtInt(parsed.poweredOff.vms)} off)`,
    `  vCPU: ${fmtInt(parsed.all.vcpu)} on ${fmtInt(parsed.totalCpuCores)} physical cores (${fmtNum(parsed.vcpuPcoreRatio, 2)}:1)`,
    `  VM memory: ${fmtRam(parsed.all.ramGiB)}   Host memory: ${fmtRam(parsed.totalMemoryGiB)}`,
    `  Storage: ${fmtStorage(parsed.aggStorageConsumedTiB)} used of ${fmtStorage(parsed.aggStorageProvisionedTiB)} provisioned`,
    "",
  ];

  if (plan.blockers.length) {
    lines.push(
      "RECOMMENDATION WITHHELD — the parsed inputs failed validation:",
      ...plan.blockers.map((b) => `  - ${b.field}: read ${b.observed}, expected ${b.expected}. ${b.detail}`),
      "",
    );
  } else {
    lines.push(
      "RECOMMENDED NUTANIX BUILD",
      `  ${fmtInt(plan.totalNodes)} x ${plan.profile.label} — ${plan.profile.cores} cores / ${fmtRam(build.perNode.ramGiB)} / ${fmtStorage(build.perNode.storageTiB)} raw per node (${plan.profile.family})`,
      `  ${fmtInt(plan.totalClusters)} cluster(s), RF${build.effectiveRf}, N+${build.failoverHosts}, ${build.licenseTier.tier}`,
      `  Totals: ${fmtInt(plan.totals.cores)} cores, ${fmtRam(plan.totals.ramGiB)}, ${fmtStorage(plan.totals.rawStorageTiB)} raw`,
      `  Headroom: CPU ${fmtNum(100 - build.headroom.cpuPct)}%, memory ${fmtNum(100 - build.headroom.ramPct)}%, capacity ${fmtNum(100 - build.headroom.storagePct)}%`,
      "",
      "CLUSTER PLAN",
      ...plan.targets.map(
        (t) => `  ${t.name}: ${t.nodes} nodes, RF${t.rf}, ${fmtInt(t.totals.cores)} cores, ${fmtRam(t.totals.ramGiB)}, ${fmtStorage(t.totals.rawStorageTiB)} raw`,
      ),
      "",
    );
  }

  lines.push(
    "EXISTING CLUSTERS",
    ...parsed.clusterDetails.map(
      (c) =>
        `  ${c.name}: ${fmtInt(c.hosts)} hosts, ${fmtInt(c.all.vms)} VMs, ${fmtInt(c.totalCpuCores)} cores, ${fmtRam(c.totalMemoryGiB)}, ${fmtStorage(c.aggStorageProvisionedTiB)} provisioned`,
    ),
    "",
    "ASSUMPTIONS",
    `  Sized on ${settings.workloadBasis === "poweredOn" ? "powered-on VMs" : "all VMs"} at ${settings.vcpuToPcoreRatio}:1 vCPU:pCore; storage on ${settings.storageBasis} capacity for all VMs`,
    `  Data reduction: ${settings.storageEfficiency === "ecx" ? "EC-X" : settings.storageEfficiency === "compression" ? "compression (~30%)" : "none"}; 20% capacity reserved for rebuild`,
    `  ${UNIT_FOOTNOTE}`,
  );

  if (plan.warnings.length) {
    lines.push("", "FLAGS", ...plan.warnings.map((w) => `  - ${w}`));
  }
  return lines.join("\n");
}
