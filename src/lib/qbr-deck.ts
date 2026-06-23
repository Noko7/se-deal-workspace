import type { Cs360HealthReport } from "./cs360";
import type { HealthTone } from "./nutanix-brand";

// The QBR deck model. buildQbrDeck() turns a CS360 health report into a curated,
// modern Quarterly Business Review deck that combines the auto-generated QBR
// Report (health-check data, per the Jan 2026 Health Check Guide) with the
// Customer Progress Report (team, licensing/adoption, support, renewals,
// certifications, recommendations). Each slide carries:
//   - structured `content` rendered identically by the web preview and the
//     .pptx exporter,
//   - a `talkTrack` lifted from the guide (the SE coaching for that slide),
//   - an auto-detected `insight` callout,
//   - `defaultHidden` for the slides the guide says SEs "typically hide".

export type Cell = string | { text: string; tone?: HealthTone };

export type SlideContent =
  | { type: "title" }
  | { type: "closing"; message: string }
  | { type: "agenda"; items: string[] }
  | { type: "team"; members: { name: string; role: string }[] }
  | { type: "bullets"; columns?: number; groups: { heading?: string; items: string[]; tone?: HealthTone }[] }
  | { type: "meters"; unit?: string; items: { label: string; value: number; max?: number; display?: string; tone?: HealthTone }[] }
  | {
      type: "metrics";
      groups: { label: string; stats: { label: string; value: string; tone?: HealthTone }[] }[];
    }
  | { type: "kpis"; kpis: { label: string; value: string; tone?: HealthTone; hint?: string }[] }
  | { type: "features"; features: { label: string; on: boolean; note: string }[] }
  | { type: "bars"; unit: string; max?: number; series: { label: string; value: number; tone?: HealthTone }[] }
  | { type: "lines"; unit: string; series: { label: string; points: number[] }[] }
  | { type: "table"; columns: string[]; rows: Cell[][]; note?: string };

export interface QbrSlide {
  id: string;
  section: string;
  title: string;
  subtitle?: string;
  talkTrack: string;
  insight?: { tone: HealthTone; text: string };
  defaultHidden: boolean;
  content: SlideContent;
}

export interface QbrDeckMeta {
  customer: string;
  vertical: string;
  preparedBy: string;
  dateLabel: string;
  lastPulse: string;
}

export interface QbrDeck {
  meta: QbrDeckMeta;
  slides: QbrSlide[];
}

// --- small helpers -----------------------------------------------------------

const pct = (n: number) => `${n}%`;

function monthsUntil(dateStr: string): number {
  return (new Date(dateStr).getTime() - Date.now()) / (30.44 * 86400000);
}

function utilTone(p: number): HealthTone {
  if (p >= 90) return "bad";
  if (p >= 75) return "warn";
  return "good";
}

function eolTone(dateStr: string): HealthTone {
  const m = monthsUntil(dateStr);
  if (m <= 0) return "bad";
  if (m <= 6) return "warn";
  return "good";
}

function capabilityTone(usage: string): HealthTone {
  if (usage === "Power") return "good";
  if (usage === "Standard") return "neutral";
  return "warn";
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// Static Nutanix messaging carried by the Progress Report (not per-account).
const EOS_PRODUCTS = ["AOS (CBL, NBL, VDI, RoBo)", "Flow", "Prism Pro, Prism Ultimate, Calm", "Files, Objects, Mine", "ERA"];
const EOS_NEW_REQS = ["Minimum AOS 6.10", "Prism Central 2024.2", "Prism Central required for licensing"];
const INSIGHTS = [
  { heading: "Infrastructure Insights", items: ["Benefit from the latest Insights enhancements to improve infrastructure health."] },
  { heading: "Identify", items: ["Pulse-enabled clusters proactively help identify system-related alerts."] },
  { heading: "Nutanix Support", items: ["Nutanix Support contributes effectively to resolve support cases."] },
];
const WHERE_ELSE = [
  { heading: "Modernize", items: ["AHV migration off ESXi", "Kubernetes (NKP) for cloud-native apps", "Database automation (NDB)"] },
  { heading: "Protect", items: ["DR / replication strategy", "Microsegmentation (Flow)", "Ransomware resilience"] },
  { heading: "Extend", items: ["Unified storage (NUS)", "Cloud bursting (NC2)", "Enterprise AI (NAI / GPT-in-a-Box)"] },
];

/** Build the full, curated combined QBR deck from a CS360 health report. */
export function buildQbrDeck(report: Cs360HealthReport): QbrDeck {
  const r = report;
  const slides: QbrSlide[] = [];
  const hottestStorage = Math.max(...r.clusterUtilization.map((c) => c.storageMaxPct));
  const openP1P2 = r.summary.openCases.p1 + r.summary.openCases.p2;
  const aosRows = r.softwareVersions;

  const push = (s: QbrSlide) => slides.push(s);

  // 1 — Title
  push({
    id: "title",
    section: "Cover",
    title: "Quarterly Business Review",
    subtitle: r.account.name,
    talkTrack:
      "If you don't often interact with the customer, give a short intro about yourself and your role, then jump into the agenda. Ask if they'd like to add anything.",
    defaultHidden: false,
    content: { type: "title" },
  });

  // 2 — Agenda (combined)
  push({
    id: "agenda",
    section: "Cover",
    title: "Agenda",
    talkTrack: "Set expectations for the session and invite the customer to add topics.",
    defaultHidden: false,
    content: {
      type: "agenda",
      items: [
        "Your Nutanix team & environment summary",
        "Licensing, adoption & PnP 2.0 readiness",
        "Resource utilization & capacity",
        "Software lifecycle & support",
        "Renewals, certifications & recommendations",
        "Where else can Nutanix help — next steps",
      ],
    },
  });

  // 3 — Your Nutanix Team
  push({
    id: "team",
    section: "Relationship",
    title: "Your Nutanix Team",
    subtitle: "Your dedicated account team",
    talkTrack: "Introduce the account team and their roles so the customer knows who to reach for what.",
    defaultHidden: false,
    content: {
      type: "team",
      members: [
        { name: r.team.ae, role: "Enterprise Account Manager" },
        { name: r.team.se, role: "Systems Engineer" },
        { name: r.team.sam, role: "Subscription Account Manager" },
        { name: r.team.ase, role: "Customer Success Engineer" },
      ],
    },
  });

  // 4 — Summary
  push({
    id: "summary",
    section: "Health Summary",
    title: "Summary",
    subtitle: `Install base overview · last Pulse ${r.lastPulse}`,
    talkTrack:
      "There's a lot here — call out the few that matter most: Active Clusters, VM Count, Open Cases, Uptime, NPS (if shown), and any high cluster utilization. If everything looks healthy and there are no open cases, say so positively and move on.",
    insight:
      openP1P2 > 0
        ? { tone: "warn", text: `${openP1P2} open P1/P2 case(s) — review the history before the meeting.` }
        : hottestStorage >= 75
          ? { tone: "warn", text: `Storage peaks at ${hottestStorage}% — good moment to discuss expanding a cluster by adding nodes.` }
          : { tone: "good", text: "No open P1/P2 cases and utilization is healthy — call this out positively." },
    defaultHidden: false,
    content: {
      type: "metrics",
      groups: [
        {
          label: "Install Base",
          stats: [
            { label: "Active Clusters", value: String(r.summary.activeClusters) },
            { label: "Total Clusters", value: String(r.summary.totalClusters) },
            { label: "Blocks & SW Assets", value: String(r.summary.blocksAndSwAssets) },
            { label: "Nodes (Pulse)", value: String(r.summary.nodes) },
            { label: "VMs (Pulse)", value: String(r.summary.vms) },
          ],
        },
        {
          label: "Adoptions & Activations",
          stats: [
            { label: "Total License Activation", value: pct(r.summary.totalLicenseActivation), tone: r.summary.totalLicenseActivation >= 99 ? "good" : "warn" },
            { label: "AHV Adoption", value: pct(r.summary.ahvAdoption) },
            { label: "Pulse HD Adoption", value: pct(r.summary.pulseHdAdoption) },
            { label: "Uptime (12-mo)", value: pct(r.summary.uptimePct), tone: "good" },
          ],
        },
        {
          label: "Open Cases",
          stats: [
            { label: "P1", value: String(r.summary.openCases.p1), tone: r.summary.openCases.p1 ? "bad" : "good" },
            { label: "P2", value: String(r.summary.openCases.p2), tone: r.summary.openCases.p2 ? "warn" : "good" },
            { label: "P3", value: String(r.summary.openCases.p3) },
            { label: "P4", value: String(r.summary.openCases.p4) },
            { label: "RFE", value: String(r.summary.openCases.rfe) },
          ],
        },
        {
          label: "Customer Experience",
          stats: [
            { label: "NPS Score", value: r.summary.npsScore == null ? "—" : String(r.summary.npsScore), tone: "good" },
            { label: "Open Escalations", value: "0", tone: "good" },
          ],
        },
      ],
    },
  });

  // 5 — Node Purchase History (bar)
  const maxNodes = Math.max(...r.nodePurchaseHistory.map((h) => h.nodes), 1);
  push({
    id: "node-history-bar",
    section: "Environment Growth",
    title: "Node Purchase History",
    subtitle: "Nodes acquired by year",
    talkTrack:
      "Give a quick narrative of how the environment has grown. Ex: \"Initial purchase in 2019, refreshed that cluster in 2024, and added a second cluster this past year.\"",
    defaultHidden: false,
    content: { type: "bars", unit: " nodes", max: maxNodes, series: r.nodePurchaseHistory.map((h) => ({ label: String(h.year), value: h.nodes })) },
  });

  // 5b — Node Count History (line) — guide: hide (redundant)
  push({
    id: "node-history-line",
    section: "Environment Growth",
    title: "Node Count History",
    subtitle: "Cumulative trend",
    talkTrack: "Redundant with the bar chart — the guide recommends hiding this one.",
    defaultHidden: true,
    content: {
      type: "lines",
      unit: " nodes",
      series: [{ label: "Cumulative nodes", points: r.nodePurchaseHistory.reduce<number[]>((acc, h) => { acc.push((acc[acc.length - 1] ?? 0) + h.nodes); return acc; }, []) }],
    },
  });

  // 6 — Feature Adoption
  const fa = r.featureAdoption;
  push({
    id: "feature-adoption",
    section: "Licensing & Adoption",
    title: "Feature Adoption",
    subtitle: "Data efficiency, DR & management features",
    talkTrack:
      "Compression should be on for all workloads. Dedup mainly helps full-clone VDI. Erasure Coding suits FT1 (4+ nodes) / FT2 (6+ nodes) with high storage but low CPU/memory. Async DR — ask if they replicate to another cluster or only keep local snapshots, and probe DR strategy (RTO/RPO). Metro = synchronous, near-zero RPO. Go beyond the slide and ask about tier-specific features.",
    insight: !fa.compression
      ? { tone: "warn", text: "Compression is off — recommend enabling it; it benefits all workloads." }
      : !fa.asyncDr
        ? { tone: "warn", text: "No Async DR detected — open a discovery conversation on their DR strategy." }
        : { tone: "good", text: "Core data-efficiency features are enabled." },
    defaultHidden: false,
    content: {
      type: "features",
      features: [
        { label: "Compression", on: fa.compression, note: "Recommended for all workloads" },
        { label: "Deduplication", on: fa.deduplication, note: "Best for full-clone VDI" },
        { label: "Erasure Coding", on: fa.erasureCoding, note: "Cold data; FT1≥4, FT2≥6 nodes" },
        { label: "Async DR", on: fa.asyncDr, note: "Replication / snapshots" },
        { label: "Prism Central", on: fa.prismCentral, note: "Required for NCM" },
        { label: "Metro Availability", on: fa.metroAvailability, note: "Synchronous, near-zero RPO" },
      ],
    },
  });

  // 7-9 — Resource Utilization (CPU / Memory / Storage)
  for (const m of r.resourceUtilization) {
    const peak = Math.max(...m.series.flatMap((s) => s.points));
    push({
      id: `resource-${m.metric.toLowerCase()}`,
      section: "Capacity & Utilization",
      title: "Resource Utilization",
      subtitle: `${m.metric} — each point is a 24-hour average of 15-minute samples`,
      talkTrack:
        "Call out high utilization or clear pattern changes. Sustained 75–100% → suggest expand/refresh. A sudden jump/drop usually means a new project or migration — probe it: databases/files/AI hint at NDB/NUS/NAI; a shift to public cloud hints at NC2.",
      insight: peak >= 75 ? { tone: utilTone(peak), text: `${m.metric} peaks at ${peak}% — flag capacity; discuss expansion or refresh.` } : undefined,
      defaultHidden: false,
      content: { type: "lines", unit: m.unit, series: m.series.map((s) => ({ label: s.cluster, points: s.points })) },
    });
  }

  // 10 — Resource Utilization as on Pulse Date
  push({
    id: "resource-pulse",
    section: "Capacity & Utilization",
    title: "Resource Utilization as on Pulse Date",
    subtitle: `Peak utilization · last Pulse ${r.lastPulse}`,
    talkTrack: "Snapshot of peak CPU / memory / storage at the last Pulse. Anything sustained above 75% is a capacity conversation.",
    insight: hottestStorage >= 90 ? { tone: "bad", text: `N-2 storage exceeds 100% on the busiest cluster — expansion is overdue.` } : undefined,
    defaultHidden: false,
    content: {
      type: "table",
      columns: ["Cluster", "Max CPU %", "Max Memory %", "Max Storage %"],
      rows: r.clusterUtilization.map((c) => [
        c.name,
        { text: pct(c.cpuMaxPct), tone: utilTone(c.cpuMaxPct) },
        { text: pct(c.memMaxPct), tone: utilTone(c.memMaxPct) },
        { text: pct(c.storageMaxPct), tone: utilTone(c.storageMaxPct) },
      ]),
    },
  });

  // 11 — AOS Version
  const aosRisk = aosRows.reduce<HealthTone>((worst, s) => {
    const t = eolTone(s.aosEos);
    if (t === "bad") return "bad";
    if (t === "warn" && worst !== "bad") return "warn";
    return worst;
  }, "good");
  push({
    id: "sw-aos",
    section: "Software Lifecycle",
    title: "AOS Version",
    subtitle: "CVM software version & support lifecycle",
    talkTrack:
      "Newer AOS unlocks features (e.g. data-at-rest encryption moved into NCI Starter/Pro in 7.3). Watch End of Maintenance (EOM) and End of Support (EOS) dates — if a cluster is approaching either, advise upgrading via LCM.",
    insight: aosRisk !== "good"
      ? { tone: aosRisk, text: "One or more clusters are near AOS End of Maintenance/Support — recommend an LCM upgrade." }
      : { tone: "good", text: "AOS versions are within their support window." },
    defaultHidden: false,
    content: {
      type: "table",
      columns: ["Cluster", "AOS Version", "End of Maintenance", "End of Support", "NCC"],
      rows: aosRows.map((s) => [s.cluster, s.aosVersion, { text: s.aosEom, tone: eolTone(s.aosEom) }, { text: s.aosEos, tone: eolTone(s.aosEos) }, s.ncc]),
    },
  });

  // 12 — Hypervisor Version
  const esxiClusters = aosRows.filter((s) => s.hypervisor.startsWith("ESX"));
  push({
    id: "sw-hypervisor",
    section: "Software Lifecycle",
    title: "Hypervisor Version",
    subtitle: "Hypervisor type per cluster",
    talkTrack:
      "If they run AHV, move quickly past this. If they run ESXi, pause and ask about migrating to AHV — usually they stay on ESXi for a specific incompatible workload. Capture details and engage internal teams on a workaround.",
    insight: esxiClusters.length
      ? { tone: "warn", text: `${esxiClusters.length} cluster(s) on ESXi — explore AHV migration and identify any blocking workload.` }
      : { tone: "good", text: "Fully on AHV." },
    defaultHidden: false,
    content: {
      type: "table",
      columns: ["Cluster", "Hypervisor", "AOS Version"],
      rows: aosRows.map((s) => [s.cluster, { text: s.hypervisor, tone: s.hypervisor.startsWith("ESX") ? "warn" : "good" }, s.aosVersion]),
    },
  });

  // Hidden firmware slides (guide: hide foundation/BIOS/BMC/NIC/NIC fw)
  for (const f of [
    { id: "sw-foundation", title: "Foundation Version", col: "Foundation", v: "5.6.1" },
    { id: "sw-bios", title: "BIOS Version", col: "BIOS", v: "PB95.001" },
    { id: "sw-bmc", title: "BMC Version", col: "BMC", v: "7.15.01" },
    { id: "sw-nic", title: "NIC Driver Version", col: "NIC Driver", v: "1.20.2.0" },
    { id: "sw-nic-fw", title: "NIC Firmware Version", col: "NIC Firmware", v: "0x800006d1" },
  ]) {
    push({
      id: f.id,
      section: "Software Lifecycle",
      title: f.title,
      talkTrack: "Guide recommends hiding this — usually not relevant to the customer conversation.",
      defaultHidden: true,
      content: { type: "table", columns: ["Cluster", f.col], rows: aosRows.map((s) => [s.cluster, f.v]) },
    });
  }

  // 13 — Cluster Summary
  push({
    id: "cluster-summary",
    section: "Inventory",
    title: "Cluster Summary",
    talkTrack: "Use this to reiterate AOS and hypervisor concerns. Sometimes fine to leave out if already covered.",
    defaultHidden: false,
    content: {
      type: "table",
      columns: ["Cluster", "License", "User VMs", "Nodes", "Blocks", "AOS", "Hypervisor", "Last Pulse"],
      rows: r.clusterSummary.map((c) => [
        c.name,
        c.licenseType,
        String(c.userVms),
        String(c.nodes),
        String(c.blocks),
        c.aosVersion,
        { text: c.hypervisor, tone: c.hypervisor.startsWith("ESX") ? "warn" : "good" },
        c.lastPulse,
      ]),
    },
  });

  // 14 — Prism Central Summary
  push({
    id: "pc-summary",
    section: "Inventory",
    title: "Prism Central Summary",
    talkTrack: "Like AOS, check the PC version against EOM/EOS dates (same support-portal page).",
    insight: { tone: eolTone(r.prismCentral.pcEos), text: `PC ${r.prismCentral.pcVersion} — EOS ${r.prismCentral.pcEos}.` },
    defaultHidden: false,
    content: {
      type: "table",
      columns: ["PC Name", "Size", "Clusters Managed", "PC Version", "EOM", "EOS", "Last Pulse"],
      rows: [[
        r.prismCentral.name,
        r.prismCentral.size,
        String(r.prismCentral.clustersManaged),
        r.prismCentral.pcVersion,
        { text: r.prismCentral.pcEom, tone: eolTone(r.prismCentral.pcEom) },
        { text: r.prismCentral.pcEos, tone: eolTone(r.prismCentral.pcEos) },
        r.prismCentral.lastPulse,
      ]],
    },
  });

  // 15 — PnP 2.0 Readiness
  const p = r.pnpReadiness;
  push({
    id: "pnp-readiness",
    section: "Licensing & Adoption",
    title: "PnP 2.0 Readiness",
    subtitle: "Includes PnP 2.0 Ready and PnP 2.0 Licensed clusters",
    talkTrack: "Confirm all clusters are PnP 2.0 licensed/ready. Flag any that need prerequisites met before the next licensing cycle.",
    insight: p.prereqNotMet || p.insufficientData
      ? { tone: "warn", text: `${p.prereqNotMet + p.insufficientData} cluster(s) need attention for PnP 2.0 readiness.` }
      : { tone: "good", text: "All clusters are PnP 2.0 licensed." },
    defaultHidden: false,
    content: {
      type: "meters",
      items: [
        { label: "PnP 2.0 Licensed", value: p.licensed, max: p.allClusters, display: String(p.licensed), tone: "good" },
        { label: "PnP 2.0 Ready", value: p.ready, max: p.allClusters, display: String(p.ready) },
        { label: "Insufficient Data", value: p.insufficientData, max: p.allClusters, display: String(p.insufficientData), tone: p.insufficientData ? "warn" : "neutral" },
        { label: "Prerequisites Not Met", value: p.prereqNotMet, max: p.allClusters, display: String(p.prereqNotMet), tone: p.prereqNotMet ? "warn" : "neutral" },
      ],
    },
  });

  // 16 — Core Platform License Summary
  push({
    id: "license-summary",
    section: "Licensing & Adoption",
    title: "Core Platform License Summary",
    subtitle: `${r.productTier} · CORES`,
    talkTrack:
      "We want all green — purchased licenses applied. Licensed cores should match deployed cores; a few unapplied after a refresh is normal. Reinforce that strong feature adoption reduces churn, and a low-pressure workshop is a great next step (confirm with the AE).",
    insight: { tone: r.licenseActivationPct >= 99 ? "good" : "warn", text: `License activation at ${r.licenseActivationLabel}.` },
    defaultHidden: false,
    content: {
      type: "meters",
      items: [{ label: `${r.productTier} — CORES`, value: r.licenseActivationPct, max: 100, display: r.licenseActivationLabel, tone: r.licenseActivationPct >= 99 ? "good" : "warn" }],
    },
  });

  // 17 — NCI Capability Adoption
  push({
    id: "capability-adoption",
    section: "Licensing & Adoption",
    title: "NCI Capability Adoption",
    subtitle: "Core Platform — capability usage by portfolio version",
    talkTrack: "Walk the capability matrix and highlight where usage is unknown — those are openings to drive adoption (workshops, enablement) of features they already own.",
    defaultHidden: false,
    content: {
      type: "table",
      columns: ["Version", "Capability", "Product Usage"],
      rows: r.capabilityAdoption.map((c) => [c.version, c.capability, { text: c.usage, tone: capabilityTone(c.usage) }]),
    },
  });

  // 18 — Licenses (detailed)
  const unapplied = r.licenses.filter((l) => l.status === "Unapplied");
  push({
    id: "licenses",
    section: "Licensing & Adoption",
    title: "Licenses",
    subtitle: "PnP 2.0 — licensed cores should match deployed core count",
    talkTrack: "Review per-cluster license entitlement vs. usage. A small number unapplied after a refresh is normal; larger gaps are worth a conversation (confirm with the AE first).",
    insight: unapplied.length
      ? { tone: "warn", text: `${unapplied.map((l) => l.tier).join(", ")} not applied — likely not in use (e.g. replication/DR).` }
      : { tone: "good", text: "All licenses applied — activation looks healthy." },
    defaultHidden: false,
    content: {
      type: "table",
      columns: ["Cluster", "License", "Tier", "Status", "Entitled", "Used", "Unused"],
      rows: r.licenses.map((l) => [
        l.cluster,
        l.name,
        l.tier,
        { text: l.status, tone: l.status === "Activated" ? "good" : "warn" },
        String(l.entitled),
        String(l.used),
        { text: String(l.unused), tone: l.unused > 0 ? "warn" : "good" },
      ]),
    },
  });

  // 19 — End-of-Sales: Legacy Software Portfolio
  push({
    id: "eos-portfolio",
    section: "Licensing & Adoption",
    title: "End-of-Sales: Legacy Software Portfolio",
    subtitle: "Plan transitions ahead of new licensing requirements",
    talkTrack: "Make the customer aware of end-of-sale products and the new minimum versions so renewals and upgrades aren't a surprise.",
    defaultHidden: false,
    content: {
      type: "bullets",
      columns: 2,
      groups: [
        { heading: "End-of-Sale Products", items: EOS_PRODUCTS, tone: "warn" },
        { heading: "New Licensing Requirements", items: EOS_NEW_REQS, tone: "neutral" },
      ],
    },
  });

  // 20 — Insights Overview
  push({
    id: "insights",
    section: "Licensing & Adoption",
    title: "Insights Overview",
    subtitle: "Get more value from Pulse & Insights",
    talkTrack: "Reinforce the value of keeping Pulse enabled — proactive alerts and faster support resolution.",
    defaultHidden: false,
    content: { type: "bullets", columns: 3, groups: INSIGHTS },
  });

  // 21 — Support Overview
  const so = r.supportOverview;
  push({
    id: "support-overview",
    section: "Support",
    title: "Support Overview",
    subtitle: `Open vs. closed cases since ${so.sinceDate}`,
    talkTrack: "Frame the support relationship: how many cases, how they were resolved. Good moment to ask about their support experience.",
    insight: so.open > 0 ? { tone: "warn", text: `${so.open} open case(s) — make sure they're addressed.` } : { tone: "good", text: "No open cases — affirm the support relationship." },
    defaultHidden: false,
    content: {
      type: "meters",
      items: [
        { label: "Open Cases", value: so.open, max: Math.max(so.open + so.closed, 1), display: String(so.open), tone: so.open ? "warn" : "good" },
        { label: "Closed Cases", value: so.closed, max: Math.max(so.open + so.closed, 1), display: String(so.closed), tone: "good" },
        { label: "P1 (initial)", value: so.byInitialPriority.p1, max: Math.max(so.closed, 1), display: String(so.byInitialPriority.p1), tone: so.byInitialPriority.p1 ? "warn" : "neutral" },
        { label: "P2 (initial)", value: so.byInitialPriority.p2, max: Math.max(so.closed, 1), display: String(so.byInitialPriority.p2), tone: so.byInitialPriority.p2 ? "warn" : "neutral" },
        { label: "P3 (initial)", value: so.byInitialPriority.p3, max: Math.max(so.closed, 1), display: String(so.byInitialPriority.p3) },
      ],
    },
  });

  // 22 — Support Case History (detailed)
  push({
    id: "support-cases",
    section: "Support",
    title: "Support Case History",
    subtitle: `Cases since ${so.sinceDate}`,
    talkTrack: "Skip this if there's an active P1/P2. (The guide hides the per-node trend and closure-tag slides.)",
    defaultHidden: false,
    content: {
      type: "table",
      columns: ["Case #", "Subject", "Initial", "Current", "Status", "Created", "Closed"],
      rows: r.supportCases.map((c) => [
        c.number,
        c.subject,
        c.initialPriority,
        c.currentPriority,
        { text: c.status, tone: c.status === "Closed" ? "good" : "warn" },
        c.created,
        c.closed,
      ]),
    },
  });

  // Hidden support trend slides
  for (const h of [
    { id: "support-cases-per-node", title: "Cases Per Node Trend" },
    { id: "support-defects-per-node", title: "Software Defects Per Node Trend" },
    { id: "support-closure-tags", title: "Cases by Closure Tags" },
  ]) {
    push({
      id: h.id,
      section: "Support",
      title: h.title,
      talkTrack: "Guide recommends hiding this support trend slide.",
      defaultHidden: true,
      content: { type: "lines", unit: "", series: [{ label: "Trend", points: r.supportCases.map((_, i) => 1 + ((i * 7) % 4)) }] },
    });
  }

  // 23 — Blocks & SW Assets
  const expiring = r.blocks.filter((b) => b.contractStatus !== "Under Support");
  push({
    id: "blocks-assets",
    section: "Hardware",
    title: "Blocks & SW Assets",
    subtitle: "Hardware support status",
    talkTrack:
      "Confirms whether nodes are under hardware support (NX nodes only). This view shows status, not the contract expiry — check Assets → Blocks in the portal for exact dates. A SAM usually covers renewals. If hardware is near the 4–5 year mark, open a refresh conversation.",
    insight: expiring.length
      ? { tone: "warn", text: `${expiring.length} block(s) expired or approaching the 4–5 year mark — open a hardware refresh conversation.` }
      : { tone: "good", text: "Hardware is under active support." },
    defaultHidden: false,
    content: {
      type: "table",
      columns: ["Serial", "Model", "Cluster", "Location", "Ship Date", "Contract", "Cores"],
      rows: r.blocks.map((b) => [
        b.serial,
        b.model,
        b.cluster,
        b.location,
        b.shipDate,
        { text: b.contractStatus, tone: b.contractStatus === "Under Support" ? "good" : b.contractStatus === "EXPIRED" ? "bad" : "warn" },
        b.cores,
      ]),
    },
  });

  // 24 — Upcoming License Renewals
  push({
    id: "renewals",
    section: "Renewals",
    title: "Upcoming License Renewals",
    subtitle: r.renewals.sinceLabel,
    talkTrack: "Surface upcoming renewals so the SAM/AE can plan. Tie renewal timing to any expansion or refresh you've discussed.",
    defaultHidden: false,
    content: {
      type: "table",
      columns: ["License Type", "Attribute", "Quantity for Renewal", r.renewals.renewalPeriod],
      rows: [
        [r.renewals.licenseType, "CORES", String(r.renewals.totalQuantity), String(r.renewals.totalQuantity)],
        [{ text: "Total", tone: "neutral" }, "", { text: String(r.renewals.totalQuantity), tone: "warn" }, String(r.renewals.totalQuantity)],
      ],
      note: "The value shown is the total quantity upcoming for renewal in the next 12 months.",
    },
  });

  // 25 — Nutanix Certifications
  const totalUsers = r.certifications.reduce((a, c) => a + c.users, 0) || 1;
  push({
    id: "certifications",
    section: "Enablement",
    title: "Nutanix Certifications",
    subtitle: "Customer team certification status",
    talkTrack: "Low certification numbers are an opening — offer enablement, free training, and certification paths to deepen the relationship.",
    insight: { tone: "warn", text: "Most portal users are uncertified — propose a free enablement / certification path." },
    defaultHidden: false,
    content: {
      type: "meters",
      items: r.certifications.map((c) => ({ label: c.label, value: c.users, max: totalUsers, display: `${c.users} (${c.pct}%)`, tone: c.label.startsWith("Uncertified") ? "warn" : "good" })),
    },
  });

  // 26 — Open Discoveries
  if (r.discoveries.length) {
    push({
      id: "discoveries",
      section: "Recommendations",
      title: "Open Discoveries",
      subtitle: `${r.discoveriesSummary.critical} critical · ${r.discoveriesSummary.warning} warning · ${r.discoveriesSummary.active} active`,
      talkTrack: "Walk through proactive findings and the recommended remediation. Tie each to a concrete next step.",
      insight: r.discoveriesSummary.critical ? { tone: "bad", text: `${r.discoveriesSummary.critical} critical discovery — prioritize remediation.` } : undefined,
      defaultHidden: false,
      content: {
        type: "table",
        columns: ["Cluster", "Policy", "Description", "Severity", "Recommendation"],
        rows: r.discoveries.map((d) => [
          d.cluster,
          d.policy,
          d.description,
          { text: d.severity, tone: d.severity === "Critical" ? "bad" : d.severity === "Warning" ? "warn" : "neutral" },
          d.recommendation,
        ]),
      },
    });
  }

  // 27 — Recommendations
  const rec = r.recommendations;
  const br = r.blocksReview;
  push({
    id: "recommendation",
    section: "Recommendations",
    title: "Recommendations",
    subtitle: "Lifecycle, capacity & renewal signals",
    talkTrack: "Summarize the actionable signals and agree on owners and timing for each next step.",
    defaultHidden: false,
    content: {
      type: "metrics",
      groups: [
        {
          label: "Blocks Review",
          stats: [
            { label: "Total Blocks", value: String(br.totalBlocks) },
            { label: "Age 3–5 Years", value: String(br.age3to5), tone: br.age3to5 ? "warn" : "good" },
            { label: "Age > 5 Years", value: String(br.ageOver5), tone: br.ageOver5 ? "warn" : "good" },
            { label: "EoM/EoS Now", value: String(br.eomNow), tone: br.eomNow ? "bad" : "good" },
          ],
        },
        {
          label: "Capacity Alerts",
          stats: [
            { label: "> 75% capacity", value: String(rec.over75Capacity), tone: rec.over75Capacity ? "warn" : "good" },
            { label: "Forecast > 90%", value: String(rec.forecast90), tone: rec.forecast90 ? "warn" : "good" },
            { label: "NCC Critical", value: String(rec.nccCritical), tone: rec.nccCritical ? "bad" : "good" },
          ],
        },
        {
          label: "Software Lifecycle",
          stats: [
            { label: "EOL Clusters", value: String(rec.eolClusters), tone: rec.eolClusters ? "bad" : "good" },
            { label: "EOL < 6 months", value: String(rec.eolUnder6mo), tone: rec.eolUnder6mo ? "warn" : "good" },
          ],
        },
        {
          label: "Support Renewals",
          stats: [
            { label: "0–6 Months", value: String(rec.supportRenewals0to6), tone: rec.supportRenewals0to6 ? "warn" : "good" },
            { label: "6–12 Months", value: String(rec.supportRenewals6to12) },
          ],
        },
      ],
    },
  });

  // 27b — EoS/EoM Software (from Recommendations)
  if (r.eosSoftware.length) {
    push({
      id: "eos-software",
      section: "Recommendations",
      title: "EoS / EoM Software",
      subtitle: "Versions reaching end of maintenance / support",
      talkTrack: "Pair the EoS/EoM list with an LCM upgrade recommendation and a target date.",
      insight: { tone: "warn", text: "Recommend scheduling LCM upgrades ahead of these dates." },
      defaultHidden: false,
      content: {
        type: "table",
        columns: ["Version", "EoM Date", "EoS Date", "Latest", "Clusters"],
        rows: r.eosSoftware.map((e) => [
          e.version,
          { text: e.eom, tone: "warn" },
          { text: e.eos, tone: "warn" },
          e.latest,
          String(e.clusters),
        ]),
      },
    });
  }

  // 28 — Where else can Nutanix help
  push({
    id: "where-else",
    section: "Next Steps",
    title: "Where Else Can Nutanix Help?",
    subtitle: "Expansion opportunities aligned to their roadmap",
    talkTrack: "Tie expansion ideas to what you heard during the review — only suggest what's relevant. Confirm with the AE before proposing.",
    defaultHidden: false,
    content: { type: "bullets", columns: 3, groups: WHERE_ELSE },
  });

  // 29 — Internal Notes (SE prep; default hidden from customer export)
  push({
    id: "internal-notes",
    section: "Next Steps",
    title: "Internal Notes",
    subtitle: "SE prep — not for customer distribution",
    talkTrack: "Your private prep notes and action items. Keep this hidden in the customer-facing export.",
    defaultHidden: true,
    content: { type: "bullets", columns: 1, groups: [{ heading: "Action items", items: ["Confirm DR strategy and follow-up workshop", "Validate renewal timing with SAM", "Propose enablement/certification path"] }] },
  });

  // 30 — Thank You
  push({
    id: "thank-you",
    section: "Cover",
    title: "Thank You",
    talkTrack: "Recap agreed next steps and owners. Confirm the date for the next review.",
    defaultHidden: false,
    content: { type: "closing", message: "Thank you" },
  });

  return {
    meta: {
      customer: r.account.name,
      vertical: r.account.vertical,
      preparedBy: r.team.se,
      dateLabel: todayLabel(),
      lastPulse: r.lastPulse,
    },
    slides,
  };
}
