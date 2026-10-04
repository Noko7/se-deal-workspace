"use client";

// "What was imported": everything the parser read from the export, laid out per
// cluster. Each cluster opens to its totals, hardware configurations, every host
// and every VM. Read-only; the editable VM list stays in the sizing flow.

import { useMemo, useState, type ReactNode } from "react";
import { Boxes, Camera, ChevronDown, HardDrive } from "lucide-react";
import type { HostRecord, ParsedCluster, ParsedEnvironment, VmRecord, VolumeGroupRecord } from "@/lib/simple-sizer-core";
import { UNIT_FOOTNOTE, fmtInt, fmtNum, fmtRam, fmtStorage } from "@/lib/sizer-format";
import { Meter, RankedBars, SplitMeter, Stat, VizKey } from "@/components/sizer-viz";
import { StatusPill } from "@/components/ui";

const ICON = { strokeWidth: 1.5 } as const;
const PRESS = "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]";
const VM_PAGE = 100;

const SOURCE_LABEL = { collector_excel: "Nutanix Collector", rvtools: "RVTools", liveoptics: "LiveOptics" } as const;

function basisLabel(basis: string): string {
  return basis === "peak" ? "observed peak" : basis === "p95" ? "95th percentile" : "observed average";
}

// vCPU:pCore overcommit is a status, so it ships with a word, never colour alone.
function ratioLabel(ratio: number | null | undefined): string | undefined {
  if (ratio == null) return undefined;
  return ratio > 6 ? "over guidance" : ratio > 4 ? "general-purpose" : "latency-safe";
}

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronDown
      {...ICON}
      className={`h-4 w-4 shrink-0 text-charcoal-500 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${open ? "rotate-180" : ""}`}
    />
  );
}

/** A nested dropdown. Children mount only while open, so big lists cost nothing closed. */
function Drop({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-charcoal-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 bg-transparent px-4 py-3 text-left transition-colors duration-200 hover:bg-charcoal-50"
      >
        <span className="min-w-0 flex-1 text-sm font-medium text-charcoal-900">{title}</span>
        {hint ? <span className="shrink-0 text-[11px] tabular-nums text-charcoal-500">{hint}</span> : null}
        <Chevron open={open} />
      </button>
      {open ? <div className="border-t border-charcoal-200 px-4 py-4">{children}</div> : null}
    </div>
  );
}

function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return <th className={`px-3 pb-2 font-medium first:pl-0 last:pr-0 ${right ? "text-right" : ""}`}>{children}</th>;
}

function PowerDot({ on }: { on: boolean | null }) {
  return (
    <>
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${on === false ? "bg-viz-muted" : "bg-viz-storage"}`} />
      <span className="sr-only">{on === false ? "powered off" : on ? "powered on" : "power state unknown"}</span>
    </>
  );
}

export function ImportedPanel({ parsed }: { parsed: ParsedEnvironment }) {
  const [open, setOpen] = useState(true);
  const on = parsed.poweredOn;
  const off = parsed.poweredOff;

  const vmsByCluster = useMemo(() => {
    const map = new Map<string, VmRecord[]>();
    for (const vm of parsed.vms) {
      const key = vm.clusterId ?? "";
      const list = map.get(key);
      if (list) list.push(vm);
      else map.set(key, [vm]);
    }
    return map;
  }, [parsed.vms]);
  const vgsByCluster = useMemo(() => {
    const map = new Map<string, VolumeGroupRecord[]>();
    for (const vg of parsed.volumeGroups ?? []) {
      const key = vg.clusterId ?? "";
      const list = map.get(key);
      if (list) list.push(vg);
      else map.set(key, [vg]);
    }
    return map;
  }, [parsed.volumeGroups]);
  const unassigned = vmsByCluster.get("") ?? [];

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-charcoal-200 bg-white shadow-[0_18px_40px_-24px_rgba(49,49,49,0.18)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 bg-transparent px-6 py-5 text-left transition-colors duration-200 hover:bg-charcoal-50 md:px-8"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold tracking-tight text-charcoal-900">What was imported</span>
          <span className="mt-0.5 block max-w-[80ch] text-sm text-charcoal-600">
            {SOURCE_LABEL[parsed.source]}
            {parsed.fileSizeBytes ? ` · ${(parsed.fileSizeBytes / 1024 / 1024).toFixed(1)} MB` : ""} · {parsed.fileName}. Everything the
            parser read, per cluster, with hosts and VMs underneath.
          </span>
        </span>
        {parsed.powerStateKnown ? <StatusPill tone="good">Power state read</StatusPill> : <StatusPill tone="warning">No power state</StatusPill>}
        <Chevron open={open} />
      </button>

      {open ? (
        <div className="border-t border-charcoal-200 px-6 py-6 md:px-8">
          {/* Whole-file totals */}
          <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div className="sizer-rise" style={{ ["--index" as string]: 0 }}>
              <div className="flex items-center gap-1.5">
                <Boxes {...ICON} className="h-3.5 w-3.5 text-charcoal-400" />
                <p className="text-[11px] font-medium text-charcoal-500">Virtual machines</p>
              </div>
              <p className="mt-1 text-4xl font-semibold tracking-tighter tabular-nums text-charcoal-900">{fmtInt(parsed.vms.length)}</p>
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
                  <p className="text-[11px] text-charcoal-500">Power state absent, so all are treated as running.</p>
                )}
              </div>
            </div>
            <Stat label="Datacenters" value={parsed.datacenters == null ? "-" : fmtInt(parsed.datacenters)} index={1} />
            <Stat label="Clusters" value={fmtInt(parsed.clusters)} index={2} />
            <Stat label="Hosts" value={fmtInt(parsed.hosts)} index={3} />
          </div>

          <div className="mt-8 grid gap-x-6 gap-y-6 border-t border-charcoal-200 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="vCPU running" value={fmtInt(on.vcpu)} sub={`${fmtInt(parsed.all.vcpu)} allocated in total`} series="compute" index={0} />
            <Stat label="Host physical cores" value={fmtInt(parsed.totalCpuCores)} sub={`${fmtNum(parsed.avgVcpuPerVm)} vCPU per VM`} series="compute" index={1} />
            <Stat label="vCPU : pCore" value={`${fmtNum(parsed.vcpuPcoreRatio, 2)}:1`} sub={ratioLabel(parsed.vcpuPcoreRatio)} series="compute" index={2} />
            <Stat label="VM memory running" value={fmtRam(on.ramGiB)} sub={`${fmtRam(parsed.totalMemoryGiB)} installed in hosts`} series="memory" index={3} />
          </div>

          <div className="mt-8 grid gap-8 border-t border-charcoal-200 pt-6 lg:grid-cols-[1fr_1.15fr]">
            <div>
              <div className="flex items-center gap-1.5">
                <HardDrive {...ICON} className="h-3.5 w-3.5 text-charcoal-400" />
                <p className="text-[11px] font-medium text-charcoal-500">Storage</p>
              </div>
              <p className="mt-1 text-3xl font-semibold tracking-tighter tabular-nums text-charcoal-900">{fmtStorage(parsed.aggStorageConsumedTiB)}</p>
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
                {parsed.observed?.cpuPCores != null && parsed.totalCpuCores > 0 ? (
                  <StatusPill tone="neutral">
                    CPU used {fmtNum((parsed.observed.cpuPCores / parsed.totalCpuCores) * 100)}% · {fmtInt(parsed.observed.cpuPCores)} of{" "}
                    {fmtInt(parsed.totalCpuCores)} cores
                  </StatusPill>
                ) : parsed.hostCpuUtilPct != null ? (
                  <StatusPill tone="neutral">Host CPU {fmtNum(parsed.hostCpuUtilPct)}%</StatusPill>
                ) : null}
                {parsed.hostMemoryUtilPct != null ? <StatusPill tone="neutral">Host RAM {fmtNum(parsed.hostMemoryUtilPct)}%</StatusPill> : null}
              </div>
              {parsed.observed ? (
                <p className="mt-3 max-w-[70ch] text-[11px] leading-relaxed text-charcoal-500">
                  Host telemetry read as {basisLabel(parsed.observed.basis)} from {parsed.observed.source}, covering{" "}
                  {Math.round(parsed.observed.coverage * 100)}% of the estate. Context only; the build is sized from the VMs.
                </p>
              ) : null}
            </div>
            {parsed.guestOs.length ? (
              <div>
                <p className="mb-3 text-[11px] font-medium text-charcoal-500">Guest OS mix</p>
                <RankedBars rows={parsed.guestOs} total={parsed.all.vms} />
              </div>
            ) : null}
          </div>

          {parsed.notes.length ? (
            <ul className="mt-6 space-y-1 border-t border-charcoal-200 pt-4 text-[11px] leading-relaxed text-charcoal-500">
              {parsed.notes.map((n, i) => (
                <li key={`${i}-${n.slice(0, 24)}`}>{n}</li>
              ))}
            </ul>
          ) : null}

          {/* Per cluster */}
          <div className="mt-8 border-t border-charcoal-200 pt-6">
            <p className="text-sm font-semibold text-charcoal-900">
              Clusters <span className="font-normal text-charcoal-500">({fmtInt(parsed.clusterDetails.length)})</span>
            </p>
            <div className="mt-3 divide-y divide-charcoal-200 border-t border-charcoal-200">
              {parsed.clusterDetails.map((cluster, i) => (
                <ClusterRow
                  key={cluster.id}
                  cluster={cluster}
                  vms={vmsByCluster.get(cluster.id) ?? []}
                  volumeGroups={vgsByCluster.get(cluster.id) ?? []}
                  index={i}
                />
              ))}
            </div>
            {unassigned.length ? (
              <div className="mt-4">
                <Drop title="VMs not tied to a cluster" hint={`${fmtInt(unassigned.length)} VMs`}>
                  <VmList vms={unassigned} showCluster={false} />
                </Drop>
              </div>
            ) : null}
          </div>

          <p className="mt-6 max-w-[80ch] text-[11px] leading-relaxed text-charcoal-500">{UNIT_FOOTNOTE}</p>
        </div>
      ) : null}
    </section>
  );
}

function ClusterRow({
  cluster,
  vms,
  volumeGroups,
  index,
}: {
  cluster: ParsedCluster;
  vms: VmRecord[];
  volumeGroups: VolumeGroupRecord[];
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const hosts = cluster.hosts;
  const perNode = (v: number) => (hosts > 0 ? v / hosts : 0);
  // Host rows carry utilization on some exports and not others; the same figure
  // is recoverable from guest telemetry, so the meter shows a number either way.
  const cpuUsedPct =
    cluster.hostCpuUtilPct ??
    (cluster.consumedCpuCores != null && cluster.totalCpuCores > 0
      ? Number(((cluster.consumedCpuCores / cluster.totalCpuCores) * 100).toFixed(1))
      : null);

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
            {fmtInt(hosts)} hosts · {fmtInt(cluster.all.vms)} VMs · {fmtInt(cluster.totalCpuCores)} cores · {fmtRam(cluster.totalMemoryGiB)} ·{" "}
            {fmtStorage(cluster.aggStorageProvisionedTiB)}
          </span>
        </span>
        <Chevron open={open} />
      </button>

      {open ? (
        <div className="space-y-6 pb-6">
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="vCPU allocated" value={fmtInt(cluster.all.vcpu)} sub={`${fmtNum(cluster.avgVcpuPerVm)} per VM`} series="compute" index={0} />
            <Stat label="vCPU : pCore" value={`${fmtNum(cluster.vcpuPcoreRatio, 2)}:1`} sub={ratioLabel(cluster.vcpuPcoreRatio)} series="compute" index={1} />
            <Stat label="VM memory" value={fmtRam(cluster.all.ramGiB)} sub={`${fmtRam(cluster.totalMemoryGiB)} installed`} series="memory" index={2} />
            <Stat
              label="Storage consumed"
              value={fmtStorage(cluster.aggStorageConsumedTiB)}
              sub={`of ${fmtStorage(cluster.aggStorageProvisionedTiB)}`}
              series="storage"
              index={3}
            />
          </div>

          <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <p className="text-[11px] font-medium text-charcoal-500">Cluster detail</p>
              <dl className="mt-2 divide-y divide-charcoal-100 border-t border-charcoal-200 text-sm">
                {(
                  [
                    ["Datacenter", cluster.datacenter ?? "-"],
                    ["Cluster ID", cluster.moid ?? "-"],
                    ["VMs", `${fmtInt(cluster.all.vms)} (${cluster.powerStateKnown ? `${fmtInt(cluster.poweredOn.vms)} on, ${fmtInt(cluster.poweredOff.vms)} off` : "power state not in export"})`],
                    ["vCPU running / allocated", `${fmtInt(cluster.poweredOn.vcpu)} / ${fmtInt(cluster.all.vcpu)}`],
                    ["VM memory running / allocated", `${fmtRam(cluster.poweredOn.ramGiB)} / ${fmtRam(cluster.all.ramGiB)}`],
                    ["Disk provisioned", fmtStorage(cluster.all.diskProvisionedTiB, 2)],
                    ["Guest partitions configured", fmtStorage(cluster.all.partitionConfiguredTiB, 2)],
                    ["Guest partitions consumed", fmtStorage(cluster.all.partitionConsumedTiB, 2)],
                    ["Largest VM", `${cluster.maxVmVcpu != null ? `${fmtInt(cluster.maxVmVcpu)} vCPU` : "-"} · ${cluster.maxVmRamGiB != null ? fmtRam(cluster.maxVmRamGiB) : "-"}`],
                    ["Host cores (total)", fmtInt(cluster.totalCpuCores)],
                    ["Host memory (total)", fmtRam(cluster.totalMemoryGiB)],
                    ["Host storage (total)", fmtStorage(cluster.totalStorageTiB)],
                    ["Average cores per host", fmtNum(perNode(cluster.totalCpuCores))],
                    ["Average memory per host", fmtRam(perNode(cluster.totalMemoryGiB))],
                    ["Average storage per host", fmtStorage(perNode(cluster.aggStorageProvisionedTiB))],
                  ] as [string, string][]
                ).map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3 py-2">
                    <dt className="shrink-0 text-charcoal-600">{k}</dt>
                    <dd className="truncate text-right font-medium tabular-nums text-charcoal-900" title={v}>
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 grid gap-3">
                {cpuUsedPct != null ? <Meter label="CPU used" series="compute" value={cpuUsedPct} max={100} caption={`${fmtNum(cpuUsedPct)}%`} /> : null}
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
                Hardware: {cluster.hardwareModels.length} distinct {cluster.hardwareModels.length === 1 ? "configuration" : "configurations"}
              </p>
              {cluster.hardwareModels.length ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[38rem] text-xs">
                    <thead>
                      <tr className="border-b border-charcoal-200 text-left text-[11px] font-medium text-charcoal-500">
                        <Th>Model</Th>
                        <Th>CPU</Th>
                        <Th right>Hosts</Th>
                        <Th right>Sockets</Th>
                        <Th right>Cores/host</Th>
                        <Th right>Memory/host</Th>
                        <Th right>Storage/host</Th>
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
                            {m.cpuModel ?? "-"}
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
                        <td className="px-3 text-right tabular-nums font-medium">{fmtInt(hosts)}</td>
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
            </div>
          </div>

          <div className="space-y-3">
            <Drop title="Hosts" hint={`${fmtInt(cluster.hostRecords.length)} in this cluster`}>
              {cluster.hostRecords.length ? <HostList cluster={cluster} /> : <p className="text-xs text-charcoal-500">No host rows in this export.</p>}
            </Drop>
            <Drop title="Virtual machines" hint={`${fmtInt(vms.length)} in this cluster`}>
              {vms.length ? <VmList vms={vms} showCluster={false} /> : <p className="text-xs text-charcoal-500">No VMs in this cluster.</p>}
            </Drop>
            {volumeGroups.length ? (
              <Drop title="Volume groups with no owning VM" hint={`${fmtInt(volumeGroups.length)}`}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[30rem] text-xs">
                    <thead>
                      <tr className="border-b border-charcoal-200 text-left text-[11px] font-medium text-charcoal-500">
                        <Th>Name</Th>
                        <Th>Owner</Th>
                        <Th right>Provisioned</Th>
                        <Th right>Consumed</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-charcoal-100">
                      {volumeGroups.map((vg, i) => (
                        <tr key={`${i}-${vg.name}`}>
                          <td className="max-w-[16rem] truncate py-1.5 pr-3 font-medium text-charcoal-900" title={vg.name}>
                            {vg.name}
                          </td>
                          <td className="max-w-[14rem] truncate px-3 text-charcoal-600">{vg.owner || "-"}</td>
                          <td className="px-3 text-right tabular-nums text-charcoal-700">{fmtStorage(vg.provisionedTiB, 2)}</td>
                          <td className="pl-3 text-right tabular-nums text-charcoal-700">{fmtStorage(vg.consumedTiB, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Drop>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function speedLabel(mbps: number | null): string {
  if (mbps == null) return "";
  return mbps >= 1000 ? `${fmtNum(mbps / 1000, mbps % 1000 === 0 ? 0 : 1)} GbE` : `${fmtInt(mbps)} Mb`;
}

/** NIC count with each adapter's speed and driver on hover; "-" when the export has none. */
function NicCell({ nics }: { nics: HostRecord["nics"] | null }) {
  if (!nics) return <span className="text-charcoal-400">-</span>;
  const detail = nics.adapters.map((a) => [a.name, speedLabel(a.speedMbps), a.driver].filter(Boolean).join(" · ")).join("\n");
  const speeds = Array.from(new Set(nics.adapters.map((a) => speedLabel(a.speedMbps)).filter(Boolean)));
  return (
    <span title={detail || undefined} className="whitespace-nowrap">
      <span className="font-medium text-charcoal-900">{fmtInt(nics.count)}</span>
      {speeds.length ? <span className="text-charcoal-500"> × {speeds.join(", ")}</span> : null}
    </span>
  );
}

function HostList({ cluster }: { cluster: ParsedCluster }) {
  const anyNics = cluster.hostRecords.some((h) => h.nics);
  const pct = (v: number | null) => (v == null ? "-" : `${fmtNum(v)}%`);
  return (
    <div className="overflow-x-auto">
      {anyNics ? null : (
        <p className="mb-2 text-[11px] text-charcoal-500">This export has no NIC columns or NIC sheet, so NICs show a dash.</p>
      )}
      <table className="w-full min-w-[60rem] text-xs">
        <thead>
          <tr className="border-b border-charcoal-200 text-left text-[11px] font-medium text-charcoal-500">
            <Th>Host</Th>
            <Th>Vendor / model</Th>
            <Th>CPU</Th>
            <Th right>Sockets × cores</Th>
            <Th right>Cores</Th>
            <Th right>Memory</Th>
            <Th>NICs</Th>
            <Th right>CPU used</Th>
            <Th right>Memory used</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-charcoal-100">
          {cluster.hostRecords.map((h, i) => (
            <tr key={`${i}-${h.name}`}>
              <td className="max-w-[16rem] truncate py-1.5 pr-3 font-medium text-charcoal-900" title={h.name}>
                {h.name}
              </td>
              <td className="max-w-[14rem] truncate px-3 text-charcoal-600" title={`${h.vendor ?? ""} ${h.model}`}>
                {h.vendor ? `${h.vendor} ` : ""}
                {h.model}
              </td>
              <td className="max-w-[14rem] truncate px-3 text-charcoal-600" title={h.cpuModel ?? ""}>
                {h.cpuModel ?? "-"}
              </td>
              <td className="px-3 text-right tabular-nums text-charcoal-700">
                {fmtInt(h.sockets)} × {fmtInt(h.coresPerSocket)}
              </td>
              <td className="px-3 text-right tabular-nums text-charcoal-700">{fmtInt(h.cores)}</td>
              <td className="px-3 text-right tabular-nums text-charcoal-700">{fmtRam(h.ramGiB)}</td>
              <td className="px-3 text-charcoal-700">
                <NicCell nics={h.nics ?? null} />
              </td>
              <td className="px-3 text-right tabular-nums text-charcoal-700">{pct(h.cpuUtilPct)}</td>
              <td className="pl-3 text-right tabular-nums text-charcoal-700">{pct(h.memoryUtilPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VmList({ vms, showCluster }: { vms: VmRecord[]; showCluster: boolean }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(VM_PAGE);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? vms.filter((vm) => vm.name.toLowerCase().includes(q) || vm.os.toLowerCase().includes(q)) : vms;
  }, [vms, query]);
  const visible = filtered.slice(0, shown);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(VM_PAGE);
          }}
          placeholder="Search VM or guest OS"
          aria-label="Search VMs"
          className="w-56"
        />
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <VizKey series="storage" label="Powered on" />
          <VizKey series="muted" label="Powered off" />
        </span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[52rem] text-xs">
          <thead>
            <tr className="border-b border-charcoal-200 text-left text-[11px] font-medium text-charcoal-500">
              <Th>VM</Th>
              {showCluster ? <Th>Cluster</Th> : null}
              <Th>Guest OS</Th>
              <Th right>vCPU</Th>
              <Th right>CPU p95 (cores)</Th>
              <Th right>Memory</Th>
              <Th right>Memory used</Th>
              <Th right>Storage provisioned</Th>
              <Th right>Storage consumed</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-100">
            {visible.map((vm) => (
              <tr key={vm.id}>
                <td className="max-w-[18rem] py-1.5 pr-3">
                  <span className="flex items-center gap-2">
                    <PowerDot on={vm.poweredOn} />
                    <span className="truncate font-medium text-charcoal-900" title={vm.name}>
                      {vm.name}
                    </span>
                  </span>
                </td>
                {showCluster ? <td className="max-w-[12rem] truncate px-3 text-charcoal-600">{vm.clusterName ?? "-"}</td> : null}
                <td className="max-w-[14rem] truncate px-3 text-charcoal-600" title={vm.os}>
                  {vm.os || "-"}
                </td>
                <td className="px-3 text-right tabular-nums font-medium text-charcoal-900">{fmtInt(vm.vcpu)}</td>
                <td className="px-3 text-right tabular-nums text-charcoal-700">{vm.cpuUsed.p95 == null ? "-" : fmtNum(vm.cpuUsed.p95, 2)}</td>
                <td className="px-3 text-right tabular-nums text-charcoal-700">{fmtRam(vm.ramGiB)}</td>
                <td className="px-3 text-right tabular-nums text-charcoal-700">{vm.ramUsedGiB == null ? "-" : fmtRam(vm.ramUsedGiB)}</td>
                <td className="px-3 text-right tabular-nums text-charcoal-700">{fmtStorage(vm.storageProvisionedTiB, 2)}</td>
                <td
                  className="pl-3 text-right tabular-nums text-charcoal-700"
                  title={vm.consumedSource === "none" ? "No consumed figure in the export" : vm.consumedSource === "vm-level" ? "From the VM-level used column" : undefined}
                >
                  {vm.consumedSource === "none" ? "-" : fmtStorage(vm.storageConsumedTiB, 2)}
                  {vm.consumedSource === "vm-level" ? <span className="ml-1 text-charcoal-400">vm</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-charcoal-500">
        <span>
          Showing {fmtInt(visible.length)} of {fmtInt(filtered.length)}
          {query ? ` matching "${query}"` : ""}.
        </span>
        {shown < filtered.length ? (
          <button
            type="button"
            onClick={() => setShown((n) => n + VM_PAGE)}
            className={`${PRESS} rounded-full border border-charcoal-300 px-3 py-1 font-medium text-charcoal-700 hover:bg-charcoal-50`}
          >
            Show {fmtInt(Math.min(VM_PAGE, filtered.length - shown))} more
          </button>
        ) : null}
      </div>
    </div>
  );
}
