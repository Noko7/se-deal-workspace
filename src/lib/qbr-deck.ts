import type { Cs360HealthReport } from "./cs360";
import type { HealthTone } from "./nutanix-brand";

// The QBR deck model. buildQbrDeck() turns a CS360 health report into the exact
// slide sequence described in the Jan 2026 Health Check Guide (and confirmed by
// the UCLA Anderson reference deck). Each slide carries:
//   - structured `content` rendered identically by the web preview and the
//     .pptx exporter,
//   - a `talkTrack` lifted from the guide (the SE coaching for that slide),
//   - an auto-detected `insight` callout (e.g. "storage at 95% — discuss
//     expansion"),
//   - `defaultHidden` for the slides the guide says SEs "typically hide".

export type Cell = string | { text: string; tone?: HealthTone };

export type SlideContent =
  | { type: "title" }
  | { type: "closing"; message: string }
  | { type: "agenda"; items: string[] }
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
  const target = new Date(dateStr).getTime();
  const now = Date.now();
  return (target - now) / (30.44 * 86400000);
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

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Build the full, curated QBR deck from a CS360 health report. */
export function buildQbrDeck(report: Cs360HealthReport): QbrDeck {
  const r = report;
  const slides: QbrSlide[] = [];
  const hottestStorage = Math.max(...r.clusterUtilization.map((c) => c.storageMaxPct));
  const openP1P2 = r.summary.openCases.p1 + r.summary.openCases.p2;

  // 1 — Title
  slides.push({
    id: "title",
    section: "Cover",
    title: "Quarterly Business Review",
    subtitle: r.account.name,
    talkTrack:
      "If you don't often interact with the customer, give a short intro about yourself and your role, then jump into the agenda. Ask if they'd like to add anything.",
    defaultHidden: false,
    content: { type: "title" },
  });

  // 2 — Agenda
  slides.push({
    id: "agenda",
    section: "Cover",
    title: "Agenda",
    talkTrack: "Set expectations for the session and invite the customer to add topics.",
    defaultHidden: false,
    content: {
      type: "agenda",
      items: [
        "Environment summary & health",
        "Licensing & feature adoption",
        "Resource utilization & capacity",
        "Software versions & support lifecycle",
        "Support case review",
        "Recommendations & next steps",
      ],
    },
  });

  // 3 — Summary
  slides.push({
    id: "summary",
    section: "Health Summary",
    title: "Summary",
    subtitle: `Environment overview · last Pulse ${r.lastPulse}`,
    talkTrack:
      "There's a lot here — call out the few that matter most: Active Clusters, VM Count, Open Cases, Uptime, NPS (if shown), and any high cluster utilization. If everything looks healthy and there are no open cases, say so positively and move on.",
    insight:
      openP1P2 > 0
        ? { tone: "warn", text: `${openP1P2} open P1/P2 case(s) — review the history before the meeting; the customer will likely want to discuss.` }
        : hottestStorage >= 75
          ? { tone: "warn", text: `Storage peaks at ${hottestStorage}% — good moment to discuss expanding a cluster by adding nodes.` }
          : { tone: "good", text: "No open P1/P2 cases and utilization is healthy — call this out positively." },
    defaultHidden: false,
    content: {
      type: "metrics",
      groups: [
        {
          label: "Assets",
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
            {
              label: "Total License Activation",
              value: pct(r.summary.totalLicenseActivation),
              tone: r.summary.totalLicenseActivation >= 99 ? "good" : "warn",
            },
            { label: "AHV Adoption", value: pct(r.summary.ahvAdoption) },
            { label: "Pulse HD Adoption", value: pct(r.summary.pulseHdAdoption) },
            { label: "Uptime", value: pct(r.summary.uptimePct), tone: "good" },
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
          ],
        },
      ],
    },
  });

  // 4 — Node Purchase History (bar)
  const maxNodes = Math.max(...r.nodePurchaseHistory.map((h) => h.nodes), 1);
  slides.push({
    id: "node-history-bar",
    section: "Environment Growth",
    title: "Node Purchase History",
    subtitle: "Nodes acquired by year",
    talkTrack:
      "Give a quick narrative of how the environment has grown. Ex: \"Initial purchase in 2019, refreshed that cluster in 2024, and added a second cluster this past year.\"",
    defaultHidden: false,
    content: {
      type: "bars",
      unit: " nodes",
      max: maxNodes,
      series: r.nodePurchaseHistory.map((h) => ({ label: String(h.year), value: h.nodes })),
    },
  });

  // 5 — Node Purchase History (line) — guide: typically hidden (redundant)
  slides.push({
    id: "node-history-line",
    section: "Environment Growth",
    title: "Node Purchase History (Trend)",
    subtitle: "Line view",
    talkTrack: "Redundant with the bar chart — the guide recommends hiding this one.",
    defaultHidden: true,
    content: {
      type: "lines",
      unit: " nodes",
      series: [{ label: "Cumulative nodes", points: r.nodePurchaseHistory.reduce<number[]>((acc, h) => {
        acc.push((acc[acc.length - 1] ?? 0) + h.nodes);
        return acc;
      }, []) }],
    },
  });

  // 6 — Licenses
  const unapplied = r.licenses.filter((l) => l.status === "Unapplied");
  slides.push({
    id: "licenses",
    section: "Licensing",
    title: "Licenses",
    subtitle: "PnP 2.0 — licensed cores should match deployed core count",
    talkTrack:
      "We want to see all green (purchased licenses applied). Licensed cores should match the deployed core count; a few unapplied after a refresh is normal. Review tiers to confirm the customer is using what they own — weak feature adoption raises churn risk. A low-pressure workshop is a great next step (confirm with the AE first).",
    insight: unapplied.length
      ? {
          tone: "warn",
          text: `${unapplied.map((l) => l.tier).join(", ")} not applied — likely not using it (e.g. replication/DR). Worth raising, but confirm with the AE first.`,
        }
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

  // 7 — Feature Adoption
  const fa = r.featureAdoption;
  slides.push({
    id: "feature-adoption",
    section: "Licensing",
    title: "Feature Adoption",
    subtitle: "Data efficiency, DR & management features",
    talkTrack:
      "Compression should be on for all workloads. Dedup mainly helps full-clone VDI. Erasure Coding suits FT1 (4+ nodes) / FT2 (6+ nodes) with high storage but low CPU/memory. Async DR — ask if they replicate to another cluster or only keep local snapshots, and probe DR strategy (RTO/RPO, target site). Metro = synchronous, near-zero RPO. Go beyond the slide and ask about tier-specific features (e.g. microsegmentation on Ultimate).",
    insight:
      !fa.compression
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

  // 8-10 — Resource Utilization (CPU / Memory / Storage)
  for (const m of r.resourceUtilization) {
    const peak = Math.max(...m.series.flatMap((s) => s.points));
    slides.push({
      id: `resource-${m.metric.toLowerCase()}`,
      section: "Capacity & Utilization",
      title: "Resource Utilization",
      subtitle: `${m.metric} — each point is a 24-hour average of 15-minute samples`,
      talkTrack:
        "Call out high utilization or clear pattern changes. Sustained 75–100% → suggest expand/refresh. A sudden jump/drop usually means a new project or migration — probe it: databases/files/AI hint at NDB/NUS/NAI; a shift to public cloud hints at NC2.",
      insight:
        peak >= 75
          ? { tone: utilTone(peak), text: `${m.metric} peaks at ${peak}% — flag capacity; discuss expansion or refresh.` }
          : undefined,
      defaultHidden: false,
      content: { type: "lines", unit: m.unit, series: m.series.map((s) => ({ label: s.cluster, points: s.points })) },
    });
  }

  // 11 — AOS Version
  const aosRows = r.softwareVersions;
  const aosRisk = aosRows.reduce<HealthTone>((worst, s) => {
    const t = eolTone(s.aosEos);
    if (t === "bad") return "bad";
    if (t === "warn" && worst !== "bad") return "warn";
    return worst;
  }, "good");
  slides.push({
    id: "sw-aos",
    section: "Software Versions",
    title: "AOS Version",
    subtitle: "CVM software version & support lifecycle",
    talkTrack:
      "Newer AOS unlocks features (e.g. data-at-rest encryption moved into NCI Starter/Pro in 7.3). Watch End of Maintenance (EOM) and End of Support (EOS) dates — if a cluster is approaching either, advise upgrading via LCM. Check EOL/EOSL dates on the support portal.",
    insight:
      aosRisk !== "good"
        ? { tone: aosRisk, text: "One or more clusters are near AOS End of Maintenance/Support — recommend an LCM upgrade." }
        : { tone: "good", text: "AOS versions are within their support window." },
    defaultHidden: false,
    content: {
      type: "table",
      columns: ["Cluster", "AOS Version", "End of Maintenance", "End of Support", "NCC"],
      rows: aosRows.map((s) => [
        s.cluster,
        s.aosVersion,
        { text: s.aosEom, tone: eolTone(s.aosEom) },
        { text: s.aosEos, tone: eolTone(s.aosEos) },
        s.ncc,
      ]),
    },
  });

  // 12 — Hypervisor Version
  const esxiClusters = aosRows.filter((s) => s.hypervisor.startsWith("ESX"));
  slides.push({
    id: "sw-hypervisor",
    section: "Software Versions",
    title: "Hypervisor Version",
    subtitle: "Hypervisor type per cluster",
    talkTrack:
      "If they run AHV, you can move quickly past this. If they run ESXi, pause and ask about migrating to AHV — usually they stay on ESXi for a specific incompatible workload. Capture details on that workload and engage internal teams on a workaround.",
    insight: esxiClusters.length
      ? { tone: "warn", text: `${esxiClusters.length} cluster(s) on ESXi — explore AHV migration and identify any blocking workload.` }
      : { tone: "good", text: "Fully on AHV." },
    defaultHidden: false,
    content: {
      type: "table",
      columns: ["Cluster", "Hypervisor", "AOS Version"],
      rows: aosRows.map((s) => [
        s.cluster,
        { text: s.hypervisor, tone: s.hypervisor.startsWith("ESX") ? "warn" : "good" },
        s.aosVersion,
      ]),
    },
  });

  // Hidden firmware/version slides (guide: hide foundation/BIOS/BMC/NIC/NIC fw)
  const firmwareSlides: { id: string; title: string; col: string; sample: () => string }[] = [
    { id: "sw-foundation", title: "Foundation Version", col: "Foundation", sample: () => "5.6.1" },
    { id: "sw-bios", title: "BIOS Version", col: "BIOS", sample: () => "PB42.300" },
    { id: "sw-bmc", title: "BMC Version", col: "BMC", sample: () => "8.1.13" },
    { id: "sw-nic", title: "NIC Version", col: "NIC Driver", sample: () => "4.18.0" },
    { id: "sw-nic-fw", title: "NIC Firmware Version", col: "NIC Firmware", sample: () => "22.36.1010" },
  ];
  for (const f of firmwareSlides) {
    slides.push({
      id: f.id,
      section: "Software Versions",
      title: f.title,
      talkTrack: "Guide recommends hiding this — usually not relevant to the customer conversation.",
      defaultHidden: true,
      content: {
        type: "table",
        columns: ["Cluster", f.col],
        rows: aosRows.map((s) => [s.cluster, f.sample()]),
      },
    });
  }

  // 13 — Support Case History
  slides.push({
    id: "support-cases",
    section: "Support",
    title: `Support Cases`,
    subtitle: "Recent case history",
    talkTrack:
      "Good moment to ask about their support experience. Skip this if there's an active P1/P2 case. (The guide hides the per-node trend and closure-tag slides.)",
    insight:
      openP1P2 > 0
        ? { tone: "warn", text: "Active P1/P2 in play — consider omitting this slide and addressing the live case directly." }
        : { tone: "good", text: "All recent cases closed — affirm the support relationship." },
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
  const hiddenSupport: { id: string; title: string }[] = [
    { id: "support-cases-per-node", title: "Cases Per Node Trend" },
    { id: "support-defects-per-node", title: "Software Defects Per Node Trend" },
    { id: "support-closure-tags", title: "Cases by Closure Tags" },
  ];
  for (const h of hiddenSupport) {
    slides.push({
      id: h.id,
      section: "Support",
      title: h.title,
      talkTrack: "Guide recommends hiding this support trend slide.",
      defaultHidden: true,
      content: {
        type: "lines",
        unit: "",
        series: [{ label: "Trend", points: r.supportCases.map((_, i) => 1 + ((i * 7) % 4)) }],
      },
    });
  }

  // 14 — Cluster Summary
  slides.push({
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

  // 15 — Prism Central Summary
  slides.push({
    id: "pc-summary",
    section: "Inventory",
    title: "Prism Central Summary",
    talkTrack: "Like AOS, check the PC version against EOM/EOS dates (same support-portal page).",
    insight: { tone: eolTone(r.prismCentral.pcEos), text: `PC ${r.prismCentral.pcVersion} — EOS ${r.prismCentral.pcEos}.` },
    defaultHidden: false,
    content: {
      type: "table",
      columns: ["PC Name", "Size", "Clusters Managed", "PC Version", "EOM", "EOS", "Last Pulse"],
      rows: [
        [
          r.prismCentral.name,
          r.prismCentral.size,
          String(r.prismCentral.clustersManaged),
          r.prismCentral.pcVersion,
          { text: r.prismCentral.pcEom, tone: eolTone(r.prismCentral.pcEom) },
          { text: r.prismCentral.pcEos, tone: eolTone(r.prismCentral.pcEos) },
          r.prismCentral.lastPulse,
        ],
      ],
    },
  });

  // 16 — Blocks & SW Assets (Hardware Support)
  const expiring = r.blocks.filter((b) => b.contractStatus !== "Under Support");
  slides.push({
    id: "blocks-assets",
    section: "Hardware",
    title: "Blocks & SW Assets",
    subtitle: "Hardware support status",
    talkTrack:
      "Confirms whether nodes are under hardware support (NX nodes only; other vendors handle their own). This view shows status, not the contract expiry — check Assets → Blocks in the support portal for exact dates. A SAM usually covers renewals. If hardware is near the 4–5 year mark, open a refresh conversation.",
    insight: expiring.length
      ? { tone: "warn", text: `${expiring.length} block(s) approaching the 4–5 year mark — open a hardware refresh conversation.` }
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
        { text: b.contractStatus, tone: b.contractStatus === "Under Support" ? "good" : "warn" },
        b.cores,
      ]),
    },
  });

  // 17 — Resource Utilization as on Pulse Date
  slides.push({
    id: "resource-pulse",
    section: "Capacity & Utilization",
    title: "Resource Utilization as on Pulse Date",
    subtitle: `Peak utilization · last Pulse ${r.lastPulse}`,
    talkTrack: "Snapshot of peak CPU / memory / storage at the last Pulse. Anything sustained above 75% is a capacity conversation.",
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

  // 18 — Open Discoveries
  if (r.discoveries.length) {
    slides.push({
      id: "discoveries",
      section: "Recommendations",
      title: "Open Discoveries",
      subtitle: "Proactive findings from Pulse",
      talkTrack: "Walk through proactive findings and the recommended remediation. Tie each to a concrete next step.",
      defaultHidden: false,
      content: {
        type: "table",
        columns: ["Cluster", "Policy", "Description", "Severity", "Recommendation"],
        rows: r.discoveries.map((d) => [d.cluster, d.policy, d.description, d.severity, d.recommendation]),
      },
    });
  }

  // 19 — Recommendation summary
  const rec = r.recommendations;
  slides.push({
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
          label: "Aging Assets",
          stats: [
            { label: "4+ Years", value: String(rec.agingAssets4Plus), tone: rec.agingAssets4Plus ? "warn" : "good" },
            { label: "3–4 Years", value: String(rec.agingAssets3to4) },
          ],
        },
        {
          label: "Capacity Alerts",
          stats: [
            { label: "> 75% capacity", value: String(rec.over75Capacity), tone: rec.over75Capacity ? "warn" : "good" },
            { label: "Forecast > 90%", value: String(rec.forecast90), tone: rec.forecast90 ? "warn" : "good" },
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

  // 20 — Thank You
  slides.push({
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
      preparedBy: r.team.se.join(", "),
      dateLabel: todayLabel(),
      lastPulse: r.lastPulse,
    },
    slides,
  };
}
