"use client";

import { useMemo, useState } from "react";
import { Calculator, FileSpreadsheet, Upload } from "lucide-react";
import {
  computeSizerRecommendation,
  type ParsedEnvironment,
  type SizerRecommendation,
  type SizerSettings,
  type SizerSource,
} from "@/lib/simple-sizer-core";
import {
  Button,
  Card,
  StatusPill,
} from "@/components/ui";

const DEFAULT_SETTINGS: SizerSettings = {
  nMinusOne: true,
  rf: 2,
  cvmOverheadPct: 12,
  pcOverheadPct: 3,
  growthPct: 20,
};

function format(value: number, unit: string): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`;
}

function formatMaybe(value: number | null, unit: string): string {
  if (value == null) return "N/A";
  return format(value, unit);
}

function Delta({ value, unit }: { value: number | null; unit: string }) {
  if (value == null) return <StatusPill tone="neutral">N/A</StatusPill>;
  const tone = value > 0 ? "warning" : "good";
  return <StatusPill tone={tone}>{value > 0 ? `+${format(value, unit)} needed` : "Capacity sufficient"}</StatusPill>;
}

export function SimpleSizerTool() {
  const [source, setSource] = useState<SizerSource>("collector_excel");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedEnvironment | null>(null);
  const [settings, setSettings] = useState<SizerSettings>(DEFAULT_SETTINGS);

  const recommendation: SizerRecommendation | null = useMemo(
    () => (parsed ? computeSizerRecommendation(parsed, settings) : null),
    [parsed, settings],
  );

  const uploadAndAnalyze = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("source", source);
      form.set("file", file);
      const response = await fetch("/api/simple-sizer/analyze", { method: "POST", body: form });
      const data = (await response.json()) as {
        ok: boolean;
        parsed?: ParsedEnvironment;
        error?: string;
      };
      if (!response.ok || !data.ok || !data.parsed) {
        throw new Error(data.error ?? "Unable to analyze file.");
      }
      setParsed(data.parsed);
    } catch (e) {
      setError((e as Error).message);
      setParsed(null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card
        title="Simple Sizer"
        subtitle="Import Collector Excel exports, RVTools, or LiveOptics files for SE-ready CPU, memory, and storage sizing guidance."
        icon={<Calculator className="h-5 w-5" />}
      >
        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-lg border border-charcoal-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-charcoal-900">1) Import Data</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="sourceType">Source Type</label>
                <select
                  id="sourceType"
                  value={source}
                  onChange={(e) => setSource(e.target.value as SizerSource)}
                  className="w-full"
                >
                  <option value="collector_excel">Nutanix Collector (Excel Export)</option>
                  <option value="rvtools">RVTools Export</option>
                  <option value="liveoptics">LiveOptics Export</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="fileUpload">Upload File (.xlsx/.xls)</label>
                <input
                  id="fileUpload"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button type="button" onClick={uploadAndAnalyze} disabled={uploading || !file}>
                <Upload className="mr-1 inline h-4 w-4" />
                {uploading ? "Analyzing..." : "Analyze Environment"}
              </Button>
              {parsed ? <StatusPill tone="good">Parsed {parsed.fileName}</StatusPill> : null}
            </div>
            {error ? <p className="mt-2 text-sm text-[#9a3b27]">{error}</p> : null}
            <p className="mt-2 text-xs text-charcoal-500">
              Based on patterns from your formatter workflows (Collector-Formatter and RVTools-Formatter), this UI
              gives SE-ready sizing summaries for OEM handoff.
            </p>
          </div>

          <div className="rounded-lg border border-charcoal-200 bg-charcoal-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-charcoal-900">2) Sizing Settings</h3>
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-sm font-medium normal-case tracking-normal text-charcoal-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-iris-600"
                  checked={settings.nMinusOne}
                  onChange={(e) => setSettings((s) => ({ ...s, nMinusOne: e.target.checked }))}
                />
                N-1 Availability
              </label>

              <div>
                <label htmlFor="rf">Replication Factor</label>
                <select
                  id="rf"
                  value={settings.rf}
                  onChange={(e) => setSettings((s) => ({ ...s, rf: Number(e.target.value) as 2 | 3 }))}
                  className="w-full"
                >
                  <option value={2}>RF2</option>
                  <option value={3}>RF3</option>
                </select>
              </div>

              <div>
                <label htmlFor="cvm">CVM Overhead (%)</label>
                <input
                  id="cvm"
                  type="number"
                  min={0}
                  max={40}
                  value={settings.cvmOverheadPct}
                  onChange={(e) => setSettings((s) => ({ ...s, cvmOverheadPct: Number(e.target.value) || 0 }))}
                  className="w-full"
                />
              </div>

              <div>
                <label htmlFor="pc">Prism Central Overhead (%)</label>
                <input
                  id="pc"
                  type="number"
                  min={0}
                  max={20}
                  value={settings.pcOverheadPct}
                  onChange={(e) => setSettings((s) => ({ ...s, pcOverheadPct: Number(e.target.value) || 0 }))}
                  className="w-full"
                />
              </div>

              <div>
                <label htmlFor="growth">Growth Buffer (%)</label>
                <input
                  id="growth"
                  type="number"
                  min={0}
                  max={100}
                  value={settings.growthPct}
                  onChange={(e) => setSettings((s) => ({ ...s, growthPct: Number(e.target.value) || 0 }))}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {parsed && recommendation ? (
        <Card
          title="Environment Summary & Recommendation"
          subtitle="Current capacity vs consumed load, then adjusted sizing recommendation for N-1/RF/CVM/PC policy."
          icon={<FileSpreadsheet className="h-5 w-5" />}
        >
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard title="CPU Cores" raw={parsed.totalCpuCores} consumed={parsed.consumedCpuCores} recommended={recommendation.recommendedCpuCores} unit="cores" delta={recommendation.cpuDelta} />
            <MetricCard title="Memory" raw={parsed.totalMemoryGiB} consumed={parsed.consumedMemoryGiB} recommended={recommendation.recommendedMemoryGiB} unit="GiB" delta={recommendation.memoryDeltaGiB} />
            <MetricCard title="Storage" raw={parsed.totalStorageTiB} consumed={parsed.consumedStorageTiB} recommended={recommendation.recommendedStorageTiB} unit="TiB" delta={recommendation.storageDeltaTiB} />
          </div>

          <div className="mt-4 rounded-lg border border-charcoal-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-charcoal-900">Rollup</h3>
            <div className="mt-2 grid gap-2 text-sm text-charcoal-700 md:grid-cols-2">
              <p>
                Source:{" "}
                <span className="font-semibold">
                  {parsed.source === "collector_excel"
                    ? "Nutanix Collector (Excel)"
                    : parsed.source === "rvtools"
                      ? "RVTools"
                      : "LiveOptics"}
                </span>
                <span className="ml-2 text-xs text-charcoal-500">(manual)</span>
              </p>
              <p>
                File: <span className="font-semibold">{parsed.fileName}</span>
              </p>
              <p>
                Clusters: <span className="font-semibold">{parsed.clusters}</span>
              </p>
              <p>
                Hosts: <span className="font-semibold">{parsed.hosts}</span>
              </p>
              <p>
                Effective CPU after policy: <span className="font-semibold">{format(recommendation.availableCpuCores, "cores")}</span>
              </p>
              <p>
                Effective Memory after policy: <span className="font-semibold">{format(recommendation.availableMemoryGiB, "GiB")}</span>
              </p>
              <p>
                Effective Storage after policy: <span className="font-semibold">{format(recommendation.availableStorageTiB, "TiB")}</span>
              </p>
            </div>
            {parsed.notes.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-charcoal-500">
                {parsed.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function MetricCard({
  title,
  raw,
  consumed,
  recommended,
  unit,
  delta,
}: {
  title: string;
  raw: number;
  consumed: number | null;
  recommended: number | null;
  unit: string;
  delta: number | null;
}) {
  return (
    <div className="rounded-lg border border-charcoal-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-charcoal-900">{title}</h3>
      <div className="mt-2 space-y-1 text-sm text-charcoal-700">
        <p>
          Raw: <span className="font-semibold">{format(raw, unit)}</span>
        </p>
        <p>
          Consumed: <span className="font-semibold">{formatMaybe(consumed, unit)}</span>
        </p>
        <p>
          Recommended: <span className="font-semibold text-iris-700">{formatMaybe(recommended, unit)}</span>
        </p>
      </div>
      <div className="mt-3">
        <Delta value={delta} unit={unit} />
      </div>
    </div>
  );
}

