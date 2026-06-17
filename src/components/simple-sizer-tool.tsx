"use client";

import { useMemo, useState } from "react";
import { Calculator, FileSpreadsheet, Upload } from "lucide-react";
import {
  computeClusterRecommendations,
  computeSizerRecommendation,
  type ClusterRecommendation,
  type ParsedCluster,
  type ParsedEnvironment,
  type SizerSettings,
  type SizerSource,
  type StorageEfficiency,
} from "@/lib/simple-sizer-core";
import { KEY_RESOURCES, SIZING_REFERENCE, storageEfficiencyLabel } from "@/lib/sizing-guidance";
import { Button, Card, StatusPill } from "@/components/ui";

const DEFAULT_SETTINGS: SizerSettings = {
  vcpuToPcoreRatio: 4,
  nodeCount: 3,
  rf: 2,
  storageBasis: "consumed",
  failoverHosts: 1,
  storageEfficiency: "none",
  peakIops: null,
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
  const [accounts, setAccounts] = useState<Array<{ dealId: string; accountName: string; dealName: string; owner: string }>>([]);
  const [selectedDealId, setSelectedDealId] = useState("");
  const [attachMessage, setAttachMessage] = useState<string | null>(null);
  const [attaching, setAttaching] = useState(false);

  const recommendation = useMemo(
    () => (parsed ? computeSizerRecommendation(parsed, settings) : null),
    [parsed, settings],
  );
  const clusterRecommendations: ClusterRecommendation[] = useMemo(
    () => (parsed ? computeClusterRecommendations(parsed, settings) : []),
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
      setAttachMessage(null);
      const accountsRes = await fetch("/api/simple-sizer/attach");
      if (accountsRes.ok) {
        const payload = (await accountsRes.json()) as { accounts?: Array<{ dealId: string; accountName: string; dealName: string; owner: string }> };
        const items = payload.accounts ?? [];
        setAccounts(items);
        if (!selectedDealId && items.length) {
          setSelectedDealId(items[0].dealId);
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setParsed(null);
    } finally {
      setUploading(false);
    }
  };

  const attachToAccount = async () => {
    if (!parsed || !recommendation || !selectedDealId) return;
    setAttaching(true);
    setAttachMessage(null);
    try {
      const body = buildSizingAttachmentText(parsed, recommendation, clusterRecommendations, settings);
      const response = await fetch("/api/simple-sizer/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId: selectedDealId, body }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to attach sizing.");
      }
      setAttachMessage("Sizing attached to account successfully.");
    } catch (error) {
      setAttachMessage((error as Error).message);
    } finally {
      setAttaching(false);
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
            {parsed ? (
              <div className="mt-3 rounded-lg border-2 border-charcoal-900 bg-charcoal-100 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-800">Attach Sizing to Account</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    value={selectedDealId}
                    onChange={(e) => setSelectedDealId(e.target.value)}
                    className="min-w-[320px] flex-1 border-2 border-charcoal-800 bg-white font-medium text-charcoal-900"
                  >
                    {accounts.map((account) => (
                      <option key={account.dealId} value={account.dealId}>
                        {account.accountName} - {account.dealName} ({account.owner})
                      </option>
                    ))}
                  </select>
                  <Button type="button" onClick={attachToAccount} disabled={!selectedDealId || attaching}>
                    {attaching ? "Attaching..." : "Attach Sizing"}
                  </Button>
                </div>
                {attachMessage ? <p className="mt-2 text-sm font-medium text-charcoal-900">{attachMessage}</p> : null}
              </div>
            ) : null}
            {error ? <p className="mt-2 text-sm text-[#9a3b27]">{error}</p> : null}
            <p className="mt-2 text-xs text-charcoal-500">
              Based on patterns from your formatter workflows (Collector-Formatter and RVTools-Formatter), this UI
              gives SE-ready sizing summaries for OEM handoff.
            </p>
          </div>

          <div className="rounded-lg border border-charcoal-200 bg-charcoal-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-charcoal-900">2) Sizing Settings</h3>
            <div className="space-y-2.5">
              <div>
                <label htmlFor="ratio">vCPU:pCore Ratio ({settings.vcpuToPcoreRatio.toFixed(1)}:1)</label>
                <input
                  id="ratio"
                  type="range"
                  min={1}
                  max={6}
                  step={0.5}
                  value={settings.vcpuToPcoreRatio}
                  onChange={(e) => setSettings((s) => ({ ...s, vcpuToPcoreRatio: Number(e.target.value) }))}
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="nodes">Target Node Count (N)</label>
                <input
                  id="nodes"
                  type="range"
                  min={3}
                  max={16}
                  step={1}
                  value={settings.nodeCount}
                  onChange={(e) => setSettings((s) => ({ ...s, nodeCount: Number(e.target.value) }))}
                  className="w-full"
                />
                <p className="text-xs text-charcoal-500">{settings.nodeCount} nodes</p>
              </div>

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
                <label htmlFor="storageBasis">Storage Basis</label>
                <select
                  id="storageBasis"
                  value={settings.storageBasis}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, storageBasis: e.target.value as "provisioned" | "consumed" }))
                  }
                  className="w-full"
                >
                  <option value="consumed">Consumed</option>
                  <option value="provisioned">Provisioned</option>
                </select>
              </div>

              <div>
                <label htmlFor="failover">HA Failover Reservation</label>
                <select
                  id="failover"
                  value={settings.failoverHosts ?? 1}
                  onChange={(e) => setSettings((s) => ({ ...s, failoverHosts: Number(e.target.value) }))}
                  className="w-full"
                >
                  <option value={1}>N+1 (reserve 1 host)</option>
                  <option value={2}>N+2 (HA-critical)</option>
                </select>
              </div>

              <div>
                <label htmlFor="efficiency">Storage Efficiency</label>
                <select
                  id="efficiency"
                  value={settings.storageEfficiency ?? "none"}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, storageEfficiency: e.target.value as StorageEfficiency }))
                  }
                  className="w-full"
                >
                  <option value="none">None (full RF copies)</option>
                  <option value="compression">Compression (~30%)</option>
                  <option value="ecx">Erasure Coding (EC-X, ≥4 nodes)</option>
                </select>
              </div>

              <div>
                <label htmlFor="peakIops">Observed Peak IOPS (cluster, 7-day)</label>
                <input
                  id="peakIops"
                  type="number"
                  min={0}
                  step={1000}
                  placeholder="optional — drives disk tier"
                  value={settings.peakIops ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      peakIops: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {parsed && recommendation ? (
        <Card
          title="Environment Summary"
          subtitle="As-Is telemetry and To-Be hardware sizing recommendations for the full environment."
          icon={<FileSpreadsheet className="h-5 w-5" />}
        >
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard title="Agg vCPU" raw={parsed.aggVcpu} consumed={null} recommended={recommendation.basePCores} unit="vCPU / pCores base" delta={null} />
            <MetricCard title="Agg RAM" raw={parsed.aggRamGiB} consumed={parsed.consumedMemoryGiB} recommended={recommendation.baseRamGiB} unit="GiB" delta={null} />
            <MetricCard
              title="Agg Storage"
              raw={settings.storageBasis === "consumed" ? parsed.aggStorageConsumedTiB : parsed.aggStorageProvisionedTiB}
              consumed={parsed.aggStorageConsumedTiB}
              recommended={recommendation.totalRawStorageTiB}
              unit="TiB"
              delta={null}
            />
          </div>
          <div className="mt-4 rounded-lg border border-iris-200 bg-iris-50 p-4">
            <h3 className="text-sm font-semibold text-iris-900">Recommended Environment Hardware Specs</h3>
            <div className="mt-2 grid gap-2 text-sm text-iris-900 md:grid-cols-3">
              <p>Per Node CPU: <span className="font-semibold">{format(recommendation.nodeTotalPCores, "pCores")}</span></p>
              <p>Per Node RAM: <span className="font-semibold">{format(recommendation.nodeTotalRamGiB, "GB")}</span></p>
              <p>Per Node Storage: <span className="font-semibold">{format(recommendation.nodeStorageTiB, "TB")}</span></p>
            </div>
            <div className="mt-2 grid gap-2 text-sm text-iris-900 md:grid-cols-3">
              <p>Cluster CPU: <span className="font-semibold">{format(recommendation.clusterTotalPCores, "pCores")}</span></p>
              <p>Cluster RAM: <span className="font-semibold">{format(recommendation.clusterTotalRamGiB, "GB")}</span></p>
              <p>Cluster Storage: <span className="font-semibold">{format(recommendation.clusterTotalStorageTiB, "TB raw")}</span></p>
            </div>
            {recommendation.monsterVmRisk ? (
              <p className="mt-2 text-sm font-semibold text-[#9a3b27]">NUMA/Monster VM Risk: {recommendation.monsterVmReason}</p>
            ) : null}
          </div>

          <div className="mt-4 rounded-lg border-2 border-charcoal-900 bg-white p-4">
            <h3 className="text-sm font-semibold text-charcoal-900">Nutanix Build Guidance</h3>
            <div className="mt-2 grid gap-2 text-sm text-charcoal-800 md:grid-cols-2">
              <p>
                Cluster topology:{" "}
                <span className="font-semibold">
                  {recommendation.effectiveNodeCount} nodes (RF{settings.rf}, N+{recommendation.failoverHosts})
                </span>
                {recommendation.clusterCount > 1 ? (
                  <span className="ml-1 text-[#9a3b27]">→ split into {recommendation.clusterCount} clusters</span>
                ) : null}
              </p>
              <p>
                Licensing: <span className="font-semibold">{recommendation.licenseTier.tier}</span>
                <span className="ml-1 text-xs text-charcoal-500">{recommendation.licenseTier.detail}</span>
              </p>
              <p>
                Storage efficiency:{" "}
                <span className="font-semibold">{storageEfficiencyLabel(settings.storageEfficiency ?? "none")}</span>
              </p>
              <p>
                Network: <span className="font-semibold">{recommendation.networkRecommendation}</span>
              </p>
              {recommendation.diskTier ? (
                <p className="md:col-span-2">
                  Disk tier (~{recommendation.perNodeIops?.toLocaleString()} IOPS/node):{" "}
                  <span className="font-semibold">{recommendation.diskTier.tier}</span>
                  <span className="ml-1 text-xs text-charcoal-500">
                    {recommendation.diskTier.latency} · {recommendation.diskTier.workloads}
                  </span>
                </p>
              ) : (
                <p className="md:col-span-2 text-xs text-charcoal-500">
                  Enter observed peak IOPS to get a disk-tier (Hybrid → NVMe/Optane) recommendation.
                </p>
              )}
            </div>
            {recommendation.warnings.length ? (
              <ul className="mt-3 space-y-1 rounded-md border border-[#e2b8ad] bg-[#fbeee9] p-3 text-xs text-[#7a2e1d]">
                {recommendation.warnings.map((w) => (
                  <li key={w}>• {w}</li>
                ))}
              </ul>
            ) : null}
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
                Total VMs: <span className="font-semibold">{parsed.totalVms}</span>
              </p>
              <p>
                Avg vCPU/VM: <span className="font-semibold">{parsed.avgVcpuPerVm}</span>
              </p>
              <p>N Target: <span className="font-semibold">{settings.nodeCount}</span></p>
              <p>vCPU:pCore Ratio: <span className="font-semibold">{settings.vcpuToPcoreRatio}:1</span></p>
              <p>RF: <span className="font-semibold">RF{settings.rf}</span></p>
              <p>Storage Basis: <span className="font-semibold">{settings.storageBasis}</span></p>
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

      {parsed && clusterRecommendations.length ? (
        <Card
          title="Per-Cluster Current vs Recommended"
          subtitle="Each cluster section includes current hardware models and recommended specs for OEM planning."
          icon={<FileSpreadsheet className="h-5 w-5" />}
        >
          <div className="space-y-4">
            {parsed.clusterDetails.map((cluster, index) => {
              const rec = clusterRecommendations.find((item) => item.clusterName === cluster.name) ?? null;
              const clusterKey = cluster.moid ? `${cluster.moid}-${cluster.name}` : `${cluster.name}-${index}`;
              return <ClusterSection key={clusterKey} cluster={cluster} recommendation={rec} index={index} />;
            })}
          </div>
        </Card>
      ) : null}

      <Card
        title="Sizing Reference & Sources"
        subtitle="Nutanix cluster build guidance the sizer applies — redundancy, ratios, storage, network, and HA."
        icon={<FileSpreadsheet className="h-5 w-5" />}
      >
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-iris-700">
            Show sizing principles & documentation links
          </summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {SIZING_REFERENCE.map((group) => (
              <div key={group.title} className="rounded-lg border border-charcoal-200 bg-white p-3">
                <h4 className="text-sm font-semibold text-charcoal-900">{group.title}</h4>
                <ul className="mt-2 space-y-2 text-xs text-charcoal-700">
                  {group.items.map((item) => (
                    <li key={item.rule}>
                      <span className="font-semibold text-charcoal-900">{item.rule}:</span> {item.detail}{" "}
                      <a
                        href={item.source.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-iris-700 underline"
                      >
                        {item.source.label} ↗
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-charcoal-200 bg-charcoal-50 p-3">
            <h4 className="text-sm font-semibold text-charcoal-900">Key Resources</h4>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {KEY_RESOURCES.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-iris-700 underline"
                >
                  {link.label} ↗
                </a>
              ))}
            </div>
          </div>
        </details>
      </Card>
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

function ClusterSection({
  cluster,
  recommendation,
  index,
}: {
  cluster: ParsedCluster;
  recommendation: ClusterRecommendation | null;
  index: number;
}) {
  const accents = [
    "border-l-8 border-l-iris-600",
    "border-l-8 border-l-[#0f766e]",
    "border-l-8 border-l-[#7c3aed]",
    "border-l-8 border-l-[#b45309]",
    "border-l-8 border-l-[#be123c]",
  ];
  const accentClass = accents[index % accents.length];

  return (
    <section className={`rounded-lg border-2 border-charcoal-700 bg-white p-4 shadow-sm ${accentClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-charcoal-900">{cluster.name}</h3>
        <StatusPill tone="info">{cluster.hosts} hosts</StatusPill>
      </div>
      <div className="mt-1 grid gap-2 text-xs text-charcoal-500 md:grid-cols-4">
        <p>Cluster ID: <span className="font-medium text-charcoal-700">{cluster.moid ?? "N/A"}</span></p>
        <p>Total VMs: <span className="font-medium text-charcoal-700">{cluster.totalVms}</span></p>
        <p>Avg vCPU/VM: <span className="font-medium text-charcoal-700">{cluster.avgVcpuPerVm}</span></p>
        <p>vCPU:pCore: <span className="font-medium text-charcoal-700">{cluster.vcpuPcoreRatio}</span></p>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <MetricCard
          title="Current CPU"
          raw={cluster.totalCpuCores}
          consumed={cluster.consumedCpuCores}
          recommended={recommendation?.recommendation.nodeTotalPCores ?? null}
          unit="cores / pCores"
          delta={null}
        />
        <MetricCard
          title="Current Memory"
          raw={cluster.totalMemoryGiB}
          consumed={cluster.consumedMemoryGiB}
          recommended={recommendation?.recommendation.nodeTotalRamGiB ?? null}
          unit="GiB"
          delta={null}
        />
        <MetricCard
          title="Current Storage"
          raw={cluster.totalStorageTiB}
          consumed={cluster.consumedStorageTiB}
          recommended={recommendation?.recommendation.nodeStorageTiB ?? null}
          unit="TiB"
          delta={null}
        />
      </div>

      <div className="mt-4 rounded-md border-2 border-charcoal-700 bg-charcoal-50 p-3">
        <h4 className="text-sm font-semibold text-charcoal-950">Current Hardware Models</h4>
        {cluster.hardwareModels.length ? (
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-left text-xs text-charcoal-900">
              <thead>
                <tr className="border-b-2 border-charcoal-700 text-charcoal-800">
                  <th className="py-1 pr-3 font-medium">Vendor</th>
                  <th className="py-1 pr-3 font-medium">Model</th>
                  <th className="py-1 pr-3 font-medium">Hosts</th>
                  <th className="py-1 pr-3 font-medium">CPU</th>
                  <th className="py-1 pr-3 font-medium">Memory</th>
                  <th className="py-1 font-medium">Storage</th>
                </tr>
              </thead>
              <tbody>
                {cluster.hardwareModels.map((model) => (
                  <tr key={`${model.vendor ?? "Unknown"}-${model.model}`} className="border-b border-charcoal-300">
                    <td className="py-1 pr-3">{model.vendor ?? "Unknown"}</td>
                    <td className="py-1 pr-3 font-medium">{model.model}</td>
                    <td className="py-1 pr-3">{model.hostCount}</td>
                    <td className="py-1 pr-3">{format(model.cpuCores, "cores")}</td>
                    <td className="py-1 pr-3">{format(model.memoryGiB, "GiB")}</td>
                    <td className="py-1">{format(model.storageTiB, "TiB")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-xs text-charcoal-500">No model details available in source export.</p>
        )}
      </div>

      <div className="mt-3 rounded-md border-2 border-iris-600 bg-iris-50 p-3 text-sm text-iris-950">
        <p className="font-semibold">Recommended Hardware Specs (Cluster)</p>
        <div className="mt-1 grid gap-2 md:grid-cols-3">
          <p>Per Node CPU: <span className="font-semibold">{formatMaybe(recommendation?.recommendation.nodeTotalPCores ?? null, "pCores")}</span></p>
          <p>Per Node Memory: <span className="font-semibold">{formatMaybe(recommendation?.recommendation.nodeTotalRamGiB ?? null, "GB")}</span></p>
          <p>Per Node Storage: <span className="font-semibold">{formatMaybe(recommendation?.recommendation.nodeStorageTiB ?? null, "TB")}</span></p>
        </div>
        {recommendation?.recommendation.monsterVmRisk ? (
          <p className="mt-2 text-xs font-semibold text-[#9a3b27]">NUMA/Monster VM Risk: {recommendation.recommendation.monsterVmReason}</p>
        ) : null}
        <div className="mt-1 grid gap-2 text-xs md:grid-cols-3">
          <p>Cluster CPU Total: <span className="font-semibold">{formatMaybe(recommendation?.recommendation.clusterTotalPCores ?? null, "pCores")}</span></p>
          <p>Cluster RAM Total: <span className="font-semibold">{formatMaybe(recommendation?.recommendation.clusterTotalRamGiB ?? null, "GB")}</span></p>
          <p>Cluster Storage Total: <span className="font-semibold">{formatMaybe(recommendation?.recommendation.clusterTotalStorageTiB ?? null, "TB raw")}</span></p>
        </div>
      </div>
    </section>
  );
}

function buildSizingAttachmentText(
  parsed: ParsedEnvironment,
  recommendation: ReturnType<typeof computeSizerRecommendation>,
  clusterRecommendations: ClusterRecommendation[],
  settings: SizerSettings,
): string {
  const lines: string[] = [];
  lines.push("Simple Sizer Snapshot");
  lines.push(`Source: ${parsed.source}`);
  lines.push(`File: ${parsed.fileName}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("Environment Summary");
  lines.push(`- Clusters: ${parsed.clusters}`);
  lines.push(`- Hosts: ${parsed.hosts}`);
  lines.push(`- VMs: ${parsed.totalVms}`);
  lines.push(`- Agg vCPU: ${parsed.aggVcpu}`);
  lines.push(`- Agg RAM (GiB): ${parsed.aggRamGiB}`);
  lines.push(
    `- Agg Storage (${settings.storageBasis === "consumed" ? "Consumed" : "Provisioned"} TiB): ${
      settings.storageBasis === "consumed" ? parsed.aggStorageConsumedTiB : parsed.aggStorageProvisionedTiB
    }`,
  );
  lines.push("");
  lines.push("Sizing Inputs");
  lines.push(`- vCPU:pCore Ratio: ${settings.vcpuToPcoreRatio}:1`);
  lines.push(`- Node Count: ${settings.nodeCount}`);
  lines.push(`- RF: RF${settings.rf}`);
  lines.push(`- HA Failover Reservation: N+${settings.failoverHosts ?? 1}`);
  lines.push(`- Storage Efficiency: ${storageEfficiencyLabel(settings.storageEfficiency ?? "none")}`);
  if (settings.peakIops) lines.push(`- Observed Peak IOPS (cluster): ${settings.peakIops.toLocaleString()}`);
  lines.push(`- Storage Basis: ${settings.storageBasis}`);
  lines.push("");
  lines.push("Nutanix Build Guidance");
  lines.push(`- Topology: ${recommendation.effectiveNodeCount} nodes, RF${settings.rf}, N+${recommendation.failoverHosts}`);
  if (recommendation.clusterCount > 1) {
    lines.push(`- Scale-out: exceeds 32-node max — split into ${recommendation.clusterCount} clusters under one Prism Central`);
  }
  lines.push(`- Licensing: ${recommendation.licenseTier.tier} (${recommendation.licenseTier.detail})`);
  lines.push(`- Network: ${recommendation.networkRecommendation}`);
  if (recommendation.diskTier) {
    lines.push(
      `- Disk tier (~${recommendation.perNodeIops?.toLocaleString()} IOPS/node): ${recommendation.diskTier.tier} (${recommendation.diskTier.latency})`,
    );
  }
  for (const warning of recommendation.warnings) {
    lines.push(`- Check: ${warning}`);
  }
  lines.push("");
  lines.push("Recommended Environment");
  lines.push(`- Per Node CPU (pCores): ${recommendation.nodeTotalPCores}`);
  lines.push(`- Per Node RAM (GB): ${recommendation.nodeTotalRamGiB}`);
  lines.push(`- Per Node Storage (TB): ${recommendation.nodeStorageTiB}`);
  lines.push(`- Cluster Total CPU (pCores): ${recommendation.clusterTotalPCores}`);
  lines.push(`- Cluster Total RAM (GB): ${recommendation.clusterTotalRamGiB}`);
  lines.push(`- Cluster Total Storage (TB raw): ${recommendation.clusterTotalStorageTiB}`);
  if (recommendation.monsterVmRisk) {
    lines.push(`- NUMA/Monster VM Risk: ${recommendation.monsterVmReason}`);
  }
  lines.push("");
  lines.push("Per-Cluster Recommendations");
  for (const cluster of clusterRecommendations) {
    lines.push(`* ${cluster.clusterName}`);
    lines.push(`  - Per Node CPU: ${cluster.recommendation.nodeTotalPCores} pCores`);
    lines.push(`  - Per Node RAM: ${cluster.recommendation.nodeTotalRamGiB} GB`);
    lines.push(`  - Per Node Storage: ${cluster.recommendation.nodeStorageTiB} TB`);
    lines.push(`  - Cluster CPU Total: ${cluster.recommendation.clusterTotalPCores} pCores`);
    lines.push(`  - Cluster RAM Total: ${cluster.recommendation.clusterTotalRamGiB} GB`);
    lines.push(`  - Cluster Storage Total: ${cluster.recommendation.clusterTotalStorageTiB} TB raw`);
    if (cluster.recommendation.monsterVmRisk) {
      lines.push(`  - Risk: ${cluster.recommendation.monsterVmReason}`);
    }
  }
  return lines.join("\n");
}

