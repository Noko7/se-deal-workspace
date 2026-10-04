// Derives the "current estate" figures a proposal deck shows, and the
// current-versus-proposed comparison, from a parsed customer export.
//
// Every number here is read straight from the Simple Sizer's `ParsedEnvironment`
// so the proposal can never disagree with the sizer about what a file says. When
// the export could not supply a value, the parser leaves it null; this module
// propagates that null rather than substituting a zero that would read as a real
// measurement on a customer-facing slide.
//
// Units follow the repo convention (see sizer-format.ts): memory is a binary GiB
// value displayed with a GB/TB label, and storage is binary TiB genuinely
// converted to decimal TB for display. Display formatting is delegated to the
// shared helpers in sizer-format.ts; this module never invents a conversion.

import type { CurrentEnvironment } from "@/lib/proposal-doc";
import type { ClusterHardwareModel } from "@/lib/simple-sizer-core";
import type { ProposalScenario } from "@/lib/sizer-import";
import { fmtInt, fmtRam, fmtStorage } from "@/lib/sizer-format";

/** Headline figures describing the estate as it runs today. */
export type EnvironmentRollup = {
  datacenters: number | null;
  clusters: number;
  hosts: number;
  vms: number;
  poweredOnVms: number;
  poweredOffVms: number;
  cpuCores: number;            // physical cores across all hosts
  memoryGiB: number;
  storageTiB: number;          // provisioned/allocated, state which in a comment
  vcpuAllocated: number;
  vcpuPerCoreRatio: number;
  cpuUtilPct: number | null;
  memoryUtilPct: number | null;
  snapshots: number | null;
};

export function environmentRollup(env: CurrentEnvironment): EnvironmentRollup {
  const p = env.parsed;
  return {
    datacenters: p.datacenters,
    clusters: p.clusters,
    hosts: p.hosts,
    vms: p.totalVms,
    // When the export carries no power state the parser sets poweredOn to the
    // whole estate and poweredOff to zero (see ParsedEnvironment.powerStateKnown).
    // Those pass through here as-is; callers that need to caveat it read
    // p.powerStateKnown directly rather than have this invent a split.
    poweredOnVms: p.poweredOn.vms,
    poweredOffVms: p.poweredOff.vms,
    cpuCores: p.totalCpuCores,
    memoryGiB: p.totalMemoryGiB,
    // Provisioned (allocated) VM storage: the parser fills both totalStorageTiB
    // and aggStorageProvisionedTiB from the export's configured partition size,
    // never from physical datastore capacity. Comparable to the proposal's
    // usable capacity, and stated as such on the slide.
    storageTiB: p.totalStorageTiB,
    vcpuAllocated: p.aggVcpu,
    vcpuPerCoreRatio: p.vcpuPcoreRatio,
    cpuUtilPct: p.hostCpuUtilPct,
    memoryUtilPct: p.hostMemoryUtilPct,
    snapshots: p.snapshots,
  };
}

/** Distinct host hardware in the estate, largest group first. */
export type HostGroupLine = {
  vendorModel: string;   // e.g. "Dell PowerEdge R740" — vendor + model, or model alone
  cpuModel: string;      // or "Unknown"
  hosts: number;
  socketsPerHost: number;
  coresPerHost: number;
  ramPerHostGiB: number;
  totalCores: number;
  totalMemoryGiB: number;
};

// A model reads as the same hardware group only when the vendor, model, CPU and
// the whole per-host spec match. Two clusters running identical R740s must merge;
// an R740 with a different DIMM ladder or socket count must not, because the
// group's per-host columns would then describe neither host honestly.
function hardwareKey(m: ClusterHardwareModel): string {
  return [
    m.vendor ?? "",
    m.model,
    m.cpuModel ?? "",
    m.socketsPerHost,
    m.coresPerSocket,
    m.coresPerHost,
    m.ramPerHostGiB,
  ].join("|");
}

// "Dell PowerEdge R740" when the vendor is known, "PowerEdge R740" when it is
// not. The parser already folds the vendor out of the model where it can, so
// this only prefixes and never duplicates it.
function vendorModel(vendor: string | null, model: string): string {
  return vendor ? `${vendor} ${model}` : model;
}

export function hostGroups(env: CurrentEnvironment): HostGroupLine[] {
  const groups = new Map<string, HostGroupLine>();
  for (const cluster of env.parsed.clusterDetails) {
    for (const m of cluster.hardwareModels) {
      const key = hardwareKey(m);
      const existing = groups.get(key);
      if (existing) {
        existing.hosts += m.hostCount;
        existing.totalCores += m.cpuCores;
        existing.totalMemoryGiB += m.memoryGiB;
      } else {
        groups.set(key, {
          vendorModel: vendorModel(m.vendor, m.model),
          cpuModel: m.cpuModel ?? "Unknown",
          hosts: m.hostCount,
          socketsPerHost: m.socketsPerHost,
          coresPerHost: m.coresPerHost,
          ramPerHostGiB: m.ramPerHostGiB,
          totalCores: m.cpuCores,
          totalMemoryGiB: m.memoryGiB,
        });
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.hosts - a.hosts);
}

/** Guest OS mix, largest first, with a rolled-up "Other" tail. */
export type OsShare = { name: string; count: number; pct: number };

export function osDistribution(env: CurrentEnvironment, topN = 6): OsShare[] {
  const os = env.parsed.guestOs;
  const total = os.reduce((sum, o) => sum + o.count, 0);
  if (total <= 0) return [];

  // Percentages are computed against the true total before any rollup, so the
  // "Other" tail carries the exact remainder and the shares still sum to 100.
  const pct = (count: number): number => Number(((count / total) * 100).toFixed(1));
  const sorted = [...os].sort((a, b) => b.count - a.count);

  // A non-positive topN would drop every named row into "Other", which is never
  // what a caller means; clamp to at least one named line.
  const head = sorted.slice(0, Math.max(1, topN));
  const tail = sorted.slice(Math.max(1, topN));
  const lines: OsShare[] = head.map((o) => ({ name: o.name, count: o.count, pct: pct(o.count) }));

  const tailCount = tail.reduce((sum, o) => sum + o.count, 0);
  if (tailCount > 0) lines.push({ name: "Other", count: tailCount, pct: pct(tailCount) });
  return lines;
}

/** One row of the current-versus-proposed comparison. */
export type MigrationRow = {
  metric: string;
  current: string;    // formatted for display
  proposed: string;   // formatted for display
  /** Short human delta, e.g. "12 fewer hosts" or "2.4x consolidation". null when not meaningful. */
  delta: string | null;
  /**
   * Basis caveat, printed as a slide footnote. Set only where the two sides are
   * not like-for-like, so a reader is never left to assume they are.
   */
  note?: string;
};

// A signed count difference phrased honestly: the proposal is not spun, so a
// build with more of something says "more", never dressed up as headroom.
function countDelta(current: number, proposed: number, singular: string, plural = `${singular}s`): string {
  const diff = proposed - current;
  if (diff === 0) return "no change";
  const n = Math.abs(diff);
  const noun = n === 1 ? singular : plural;
  return diff < 0 ? `${fmtInt(n)} fewer ${noun}` : `${fmtInt(n)} more ${noun}`;
}

export function migrationComparison(env: CurrentEnvironment, scenario: ProposalScenario): MigrationRow[] {
  const p = env.parsed;
  const t = scenario.totals;
  const rows: MigrationRow[] = [];

  // Sum of both storage tiers as the Sizer export reports them. Deliberately NOT
  // called usable: whether that export field is raw drive capacity or a
  // post-replication figure is unverified, so this module states where the
  // number came from instead of asserting what it means.
  const proposedStorageTiB = t.ssdTiB + t.hddTiB;

  // Servers: physical hosts today against proposed Nutanix nodes.
  rows.push({
    metric: "Servers",
    current: `${fmtInt(p.hosts)} hosts`,
    proposed: `${fmtInt(t.nodes)} nodes`,
    delta: countDelta(p.hosts, t.nodes, "server"),
  });

  rows.push({
    metric: "CPU cores",
    current: fmtInt(p.totalCpuCores),
    proposed: fmtInt(t.cores),
    delta: countDelta(Math.round(p.totalCpuCores), Math.round(t.cores), "core"),
  });

  // Memory delta is stated in the same GB/TB units the row shows, and only when
  // one side actually exceeds the other.
  const memDiff = t.ramGiB - p.totalMemoryGiB;
  rows.push({
    metric: "Memory",
    current: fmtRam(p.totalMemoryGiB),
    proposed: fmtRam(t.ramGiB),
    delta: memDiff === 0 ? "no change" : `${fmtRam(Math.abs(memDiff))} ${memDiff < 0 ? "less" : "more"}`,
  });

  // The two storage figures are not like-for-like: today's is what the guests
  // have allocated, the proposal's is what the Sizer export reports for the
  // build. The comparison still answers the question an SE is asked (does
  // today's data fit?), so it stays, but the basis is spelled out rather than
  // implied by putting two numbers side by side.
  const storageDiffTiB = proposedStorageTiB - p.totalStorageTiB;
  rows.push({
    metric: "Storage",
    current: fmtStorage(p.totalStorageTiB),
    proposed: fmtStorage(proposedStorageTiB),
    // No delta. Subtracting a figure of one basis from a figure of another
    // produces a number that looks authoritative and means nothing, which is
    // the worst outcome on a slide a customer will read closely.
    delta: null,
    note: "Storage today is capacity allocated to VMs in the export. The proposed figure is the capacity reported by the Sizer scenario, on a different basis, so the two are shown side by side rather than differenced.",
  });

  rows.push({
    metric: "Clusters",
    current: fmtInt(p.clusters),
    proposed: fmtInt(t.clusters),
    delta: countDelta(p.clusters, t.clusters, "cluster"),
  });

  // VM count only appears when the Sizer export carried one; otherwise both
  // sides are not comparable and the row is dropped.
  if (t.vmCount != null) {
    rows.push({
      metric: "Virtual machines",
      current: fmtInt(p.totalVms),
      proposed: fmtInt(t.vmCount),
      // Deliberately no delta: the Sizer figure is the workload the scenario
      // was sized for, not a proposal to run fewer machines. Differencing them
      // would read as "we are removing VMs", which is not what is on offer.
      delta: null,
      note: "The proposed VM count is the workload the Sizer scenario was sized for, which may cover part of the estate.",
    });
  }

  // Consolidation is only meaningful with real hosts and real nodes on both
  // sides; a ratio over a zero denominator is not a fact about the design.
  // A consolidation row only when the footprint actually shrinks. Printing
  // "1.2x more servers" under a heading that says "Consolidation" contradicts
  // itself, and the Servers row above already states the change either way.
  if (p.hosts > 0 && t.nodes > 0 && p.hosts > t.nodes) {
    rows.push({
      metric: "Consolidation",
      current: `${fmtInt(p.hosts)} hosts`,
      proposed: `${fmtInt(t.nodes)} nodes`,
      delta: `${(p.hosts / t.nodes).toFixed(1)}x fewer servers to run`,
    });
  }

  return rows;
}

/** Per-cluster current-state detail for the environment slides. */
export type EnvironmentClusterLine = {
  name: string;
  datacenter: string | null;
  hosts: number;
  vms: number;
  cores: number;
  memoryGiB: number;
  cpuUtilPct: number | null;
  memoryUtilPct: number | null;
  hardware: string;  // short summary, e.g. "8x Dell R740" or "4x R740 + 2x R750"
};

// A one-line hardware summary. A single model carries its vendor for context
// ("8x Dell R740"); a mixed cluster drops the vendor to stay short and reads as
// "4x R740 + 2x R750". Unknown when the export listed no per-model hardware.
function hardwareSummary(models: ClusterHardwareModel[]): string {
  if (!models.length) return "Unknown";
  const ordered = [...models].sort((a, b) => b.hostCount - a.hostCount);
  if (ordered.length === 1) {
    const m = ordered[0];
    return `${m.hostCount}x ${vendorModel(m.vendor, m.model)}`;
  }
  return ordered.map((m) => `${m.hostCount}x ${m.model}`).join(" + ");
}

export function environmentClusters(env: CurrentEnvironment): EnvironmentClusterLine[] {
  return env.parsed.clusterDetails.map((c) => ({
    name: c.name,
    datacenter: c.datacenter,
    hosts: c.hosts,
    vms: c.totalVms,
    cores: c.totalCpuCores,
    memoryGiB: c.totalMemoryGiB,
    cpuUtilPct: c.hostCpuUtilPct,
    memoryUtilPct: c.hostMemoryUtilPct,
    hardware: hardwareSummary(c.hardwareModels),
  }));
}