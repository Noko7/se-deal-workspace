// QBR file import — parses the two real CS360 downloads into a Cs360HealthReport
// (the same shape the deck builder already consumes), fully client-side:
//   - "QBR Report"    : the CS360 Pro QBR Generator PowerPoint (.pptx)
//   - "Health Report" : the CS360 Pro TAM Health Check Word doc (.docx)
//
// Both Office files are just zips of XML, so we unzip with JSZip and read the
// slide / document tables with the browser DOMParser. Nothing here touches the
// network — the customer's data never leaves the browser.
//
// A few QBR data points are rendered by CS360 as chart *images* with no
// underlying numbers in the export (Feature Adoption, the resource-utilization
// trend lines, exact AOS EoM/EoS dates, capability adoption, certifications).
// Those are reconstructed from the numbers we *do* have (peak/avg utilization,
// licenses, DR tier) or defaulted, and every slide stays click-to-edit so the SE
// can adjust before exporting. See notes inline.

import type {
  BlockRow,
  Cs360HealthReport,
  CapabilityRow,
  ClusterSummaryRow,
  ClusterUtil,
  DiscoveryRow,
  LicenseRow,
  ResourceMetric,
  SoftwareVersionRow,
} from "./cs360";

// --- zip + xml helpers ------------------------------------------------------

type Grid = string[][];

async function readZipXml(file: File, match: (path: string) => boolean): Promise<string[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const paths = Object.keys(zip.files).filter((p) => match(p) && !zip.files[p].dir);
  return Promise.all(paths.map((p) => zip.files[p].async("string")));
}

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function descByLocal(root: Element | Document, local: string): Element[] {
  return Array.from(root.getElementsByTagName("*")).filter((e) => e.localName === local);
}

function directByLocal(el: Element, local: string): Element[] {
  const out: Element[] = [];
  const kids = el.childNodes;
  for (let i = 0; i < kids.length; i++) {
    const n = kids[i];
    if (n.nodeType === 1 && (n as Element).localName === local) out.push(n as Element);
  }
  return out;
}

// Text of one table cell: join its <t> runs per paragraph, paragraphs by newline.
function cellText(tc: Element): string {
  const paras = descByLocal(tc, "p");
  const lines = paras.map((p) => descByLocal(p, "t").map((t) => t.textContent ?? "").join(""));
  return lines.join("\n").trim();
}

// Every table in an XML part, as a grid of trimmed cell strings.
function tablesFromXml(xml: string): Grid[] {
  const doc = parseXml(xml);
  return descByLocal(doc, "tbl").map((tbl) =>
    directByLocal(tbl, "tr").map((tr) => directByLocal(tr, "tc").map(cellText)),
  );
}

// --- small utilities --------------------------------------------------------

const norm = (s: string): string => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function num(s: string | undefined | null): number {
  if (s == null) return 0;
  // Handles integers, decimals, and leading-dot decimals like ".03%".
  const m = String(s).replace(/,/g, "").match(/-?(?:\d+\.\d+|\.\d+|\d+)/);
  return m ? parseFloat(m[0]) : 0;
}

function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** First table whose header row (row 0) contains all given keywords. */
function findTable(tables: Grid[], ...keywords: string[]): Grid | null {
  for (const t of tables) {
    if (!t.length) continue;
    const hdr = t[0].map(norm).join(" ");
    if (keywords.every((k) => hdr.includes(norm(k)))) return t;
  }
  return null;
}

// Per-cluster average CPU/memory from the Health Report docx. Each cluster
// section has a "Cluster Configuration" table (naming the cluster) followed by a
// "Capacity Usage" table carrying the averages, so we track the current cluster
// as we walk the document's tables in order.
function docxAvgByCluster(tables: Grid[]): Map<string, { cpu: number; mem: number }> {
  const out = new Map<string, { cpu: number; mem: number }>();
  let current = "";
  for (const t of tables) {
    const kv: Record<string, string> = {};
    for (const row of t) if (row.length >= 2) kv[norm(row[0])] = row[1];
    if (kv.clustername) current = kv.clustername;
    if (current && kv.averageclustercpuusage) {
      out.set(norm(current), { cpu: num(kv.averageclustercpuusage), mem: num(kv.averageclustermemoryusage) });
    }
  }
  return out;
}

/** A CS360 label/value mini-table (first cell of the header repeats the title). */
function kvTable(tables: Grid[], title: string): Record<string, string> {
  for (const t of tables) {
    if (t.length && t[0].length && norm(t[0][0]) === norm(title)) {
      const map: Record<string, string> = {};
      for (const row of t.slice(1)) if (row.length >= 2) map[norm(row[0])] = row[1];
      return map;
    }
  }
  return {};
}

function isoAddYears(iso: string, years: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

// Reconstruct a representative 12-point utilization curve between a baseline and
// the real peak. CS360 exports the trend as an image (no per-sample data), so we
// anchor to the two real numbers we have (average + peak) and keep it
// deterministic per cluster/metric so the deck is stable across reloads.
function seriesFromAvgPeak(seed: string, avg: number, peak: number): number[] {
  let h = 2166136261 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
  const base = Math.max(0, Math.min(avg, peak) * 0.85);
  const top = Math.max(avg, peak);
  const pts = Array.from({ length: 12 }, (_, i) => {
    const trend = base + (top - base) * (i / 11);
    return round(Math.max(0, Math.min(100, trend + (rand() - 0.5) * Math.max(1, top * 0.08))), 1);
  });
  pts[11] = round(top, 1); // ensure the peak (which drives the insight) is preserved
  return pts;
}

// --- customer name ----------------------------------------------------------

// Prefer the file name ("Nutanix QBR for <Customer>_<timestamp>.pptx"), fall
// back to the QBR title slide ("Quarterly Business Review FOR <Customer>").
function customerFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  const m = base.match(/(?:qbr|health\s*check|healthcheck)\s+(?:for|report\s+for)\s+(.+)/i);
  let out = m ? m[1] : base;
  out = out.replace(/_\d{6,}.*$/, "").trim(); // strip the CS360 _<timestamp> suffix
  return out || "Customer";
}

// ---------------------------------------------------------------------------

export interface QbrImportResult {
  report: Cs360HealthReport;
  /** Fields not present in the export that were derived or defaulted. */
  notes: string[];
}

/**
 * Parse the QBR Report (.pptx) and optional Health Report (.docx) into a
 * Cs360HealthReport. The pptx carries almost everything; the docx enriches it
 * (per-cluster average CPU/memory, foundation versions).
 */
export async function parseQbrFiles(
  pptx: File,
  docx: File | null,
  options: { se?: string } = {},
): Promise<QbrImportResult> {
  const notes: string[] = [];

  const slideXmls = await readZipXml(pptx, (p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
  const pptxTables: Grid[] = slideXmls.flatMap(tablesFromXml);

  const docxTables: Grid[] = docx
    ? (await readZipXml(docx, (p) => p === "word/document.xml")).flatMap(tablesFromXml)
    : [];

  // --- customer / team ------------------------------------------------------
  const customer = customerFromFileName(pptx.name);

  const teamTable = findTable(pptxTables, "Account Executive", "System Engineer");
  const teamRow = teamTable?.[1] ?? [];
  const ae = teamRow[0] || "-";
  const se = options.se?.trim() || teamRow[1] || "-";
  const executiveSponsor = teamRow[2] || "-";
  const tam = teamRow[3] || "-";
  const csResident = teamRow[4] || "-";

  // --- summary --------------------------------------------------------------
  const assets = kvTable(pptxTables, "Assets");
  const adopt = kvTable(pptxTables, "Adoptions & Activations");
  const cases = kvTable(pptxTables, "Open Cases");
  const cx = kvTable(pptxTables, "Customer Experience");

  const nps = num(cx.netpromoterscorelast90days);

  // --- cluster utilization (Resource Utilization as on Pulse Date) ----------
  const utilTable = findTable(pptxTables, "Max CPU", "Max Storage");
  const clusterUtilization: ClusterUtil[] = (utilTable?.slice(1) ?? []).map((r) => ({
    name: r[0],
    cpuMaxPct: num(r[2]), // Max CPU %  (skips the CPU Cores column at r[1])
    memMaxPct: num(r[6]), // Max Memory %
    storageMaxPct: num(r[10]), // Max Storage %
  }));

  // --- cluster summary ------------------------------------------------------
  const csumTable = findTable(pptxTables, "Cluster Name", "License Class", "User VM Count");
  const lastPulse = csumTable?.[1]?.[9] || "";
  const clusterSummary: ClusterSummaryRow[] = (csumTable?.slice(1) ?? []).map((r) => ({
    name: r[0],
    licenseClass: r[1],
    licenseType: r[2],
    userVms: num(r[3]),
    nodes: num(r[4]),
    blocks: num(r[5]),
    aosVersion: r[6],
    hypervisor: r[7],
    ncc: r[8],
    lastPulse: r[9],
  }));

  // --- software versions (AOS EoM/EoS aren't in the export) -----------------
  const softwareVersions: SoftwareVersionRow[] = clusterSummary.map((c) => ({
    cluster: c.name,
    aosVersion: c.aosVersion,
    aosEom: "-",
    aosEos: "-",
    hypervisor: c.hypervisor,
    ncc: c.ncc,
  }));

  // --- prism central --------------------------------------------------------
  const pcTable = findTable(pptxTables, "PC Name", "PC Size");
  const pcRow = pcTable?.[1] ?? [];
  const prismCentral = {
    name: pcRow[0] || "-",
    size: pcRow[3] || "-",
    clustersManaged: num(pcRow[4]),
    pcVersion: pcRow[5] || "-",
    pcEom: "-",
    pcEos: "-",
    ncc: pcRow[6] || "-",
    lastPulse: pcRow[7] || lastPulse,
  };

  // --- licenses -------------------------------------------------------------
  const licTable = findTable(pptxTables, "License Name", "Entitled Quantity");
  const licenses: LicenseRow[] = (licTable?.slice(1) ?? []).map((r) => ({
    cluster: r[0],
    name: r[1],
    tier: r[3],
    attribute: r[4],
    created: r[5],
    expiry: r[6],
    status: (r[7] as LicenseRow["status"]) || "Activated",
    entitled: num(r[8]),
    used: num(r[9]), // Quantity Used By Cluster
    unused: num(r[11]),
  }));

  const coreLic = licenses.filter((l) => norm(l.attribute) === "cores");
  const entitledCores = coreLic.reduce((a, l) => a + l.entitled, 0);
  const usedCores = coreLic.reduce((a, l) => a + l.used, 0);
  const activationPct = entitledCores ? round((usedCores / entitledCores) * 100, 1) : num(adopt.totallicenseactivation);
  const productTier =
    coreLic.find((l) => /nci/i.test(l.tier) && !/replication/i.test(l.tier))?.tier ||
    clusterSummary[0]?.licenseType.split(",")[0].trim() ||
    "NCI Pro";

  // --- blocks & SW assets ---------------------------------------------------
  const blocks: BlockRow[] = [];
  for (const t of pptxTables) {
    if (t.length && t[0].length && norm(t[0][0]).startsWith("serialno")) {
      for (const r of t.slice(1)) {
        blocks.push({
          serial: r[0],
          model: r[1],
          cluster: r[2],
          nodes: r[3],
          location: r[6],
          shipDate: r[7],
          contractStatus: r[8],
          ssd: r[10],
          cores: r[11],
        });
      }
    }
  }
  const nodeBlocks = blocks.filter((b) => num(b.nodes) > 0);

  // --- node purchase history (chart-only; derive from block ship years) -----
  const byYear = new Map<number, number>();
  for (const b of nodeBlocks) {
    const yr = new Date(b.shipDate).getFullYear();
    if (!Number.isNaN(yr)) byYear.set(yr, (byYear.get(yr) ?? 0) + Math.max(1, num(b.nodes)));
  }
  const nodePurchaseHistory = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, nodes]) => ({ year, nodes }));
  if (!nodePurchaseHistory.length) nodePurchaseHistory.push({ year: new Date().getFullYear(), nodes: num(assets.nodesreportedbypulse) });

  // --- discoveries ----------------------------------------------------------
  const discTable = findTable(pptxTables, "Policy Name", "Severity");
  const discoveries: DiscoveryRow[] = (discTable?.slice(1) ?? []).map((r) => ({
    cluster: r[0],
    policy: r[2],
    description: r[3],
    severity: r[7],
    recommendation: r[9] || r[r.length - 1] || "",
  }));

  // --- PnP 2.0 readiness ----------------------------------------------------
  const pnpTable = findTable(pptxTables, "PnP 2.0 Ready");
  const pnpRows = pnpTable?.slice(1) ?? [];
  const pnpReady = pnpRows.filter((r) => norm(r[1]) === "true").length;
  const prismCentrals = pcTable ? Math.max(1, (pcTable.length ?? 1) - 1) : 1;
  const peClusters = clusterSummary.length;
  const allClusters = peClusters + prismCentrals;

  // --- recommendations ------------------------------------------------------
  const aging = kvTable(pptxTables, "Aging Assets");
  const swEol = kvTable(pptxTables, "SW End of Life");
  const capAlerts = kvTable(pptxTables, "Capacity Alerts");
  const licAct = kvTable(pptxTables, "License Activation");
  const supRenew = kvTable(pptxTables, "Support Renewals");
  const nccAlerts = kvTable(pptxTables, "NCC Alerts");
  const discSummaryTable = kvTable(pptxTables, "Discoveries");
  const activeDiscoveries = Object.entries(discSummaryTable).reduce((a, [k]) => a + (/^\d+$/.test(k) ? num(k) : 0), 0) || discoveries.length;

  // --- feature adoption (chart-only; reconstruct from DR tier + PC) ---------
  const hasDrTier = licenses.some((l) => /replication/i.test(l.tier)) || clusterSummary.some((c) => /dr/i.test(c.name));
  const featureAdoption = {
    compression: true, // recommended default; not reported in the export
    deduplication: false,
    erasureCoding: false,
    asyncDr: hasDrTier,
    prismCentral: Boolean(pcTable),
    metroAvailability: false,
  };
  notes.push("Feature Adoption is rendered as a chart in the QBR export (no data). Compression/dedup/erasure-coding/metro were defaulted — edit them on the slide if needed.");

  // --- resource utilization trend (chart-only; rebuild from avg + peak) -----
  // Primary source: the QBR pptx "Resource Utilization (Last 24-hours)" table.
  // Fallback: the Health Report docx per-cluster "Capacity Usage" tables.
  const avgTable = findTable(pptxTables, "Avg CPU", "Avg Memory");
  const avgByCluster = new Map<string, { cpu: number; mem: number }>();
  for (const r of avgTable?.slice(1) ?? []) avgByCluster.set(norm(r[0]), { cpu: num(r[2]), mem: num(r[4]) });
  for (const [cluster, avg] of docxAvgByCluster(docxTables)) {
    if (!avgByCluster.has(cluster)) avgByCluster.set(cluster, avg);
  }

  const resourceUtilization: ResourceMetric[] = (["CPU", "Memory", "Storage"] as const).map((metric) => ({
    metric,
    unit: "%",
    series: clusterUtilization.map((c) => {
      const avg = avgByCluster.get(norm(c.name));
      const peak = metric === "CPU" ? c.cpuMaxPct : metric === "Memory" ? c.memMaxPct : c.storageMaxPct;
      const average = metric === "CPU" ? avg?.cpu ?? peak * 0.85 : metric === "Memory" ? avg?.mem ?? peak * 0.85 : peak * 0.85;
      return { cluster: c.name, points: seriesFromAvgPeak(`${metric}:${c.name}`, average, peak) };
    }),
  }));
  notes.push("Resource-utilization trend lines are chart images in the export; the curves are reconstructed from the real average and peak values.");

  // --- support (the QBR export carries no per-case history) -----------------
  const supportCases: Cs360HealthReport["supportCases"] = [];
  notes.push("No support-case history is included in the QBR export, so the Support slides show no cases.");
  const supportOverview = {
    sinceDate: lastPulse ? isoAddYears(lastPulse, -1) : "",
    open: 0,
    closed: 0,
    byInitialPriority: { p1: 0, p2: 0, p3: 0, p4: 0, rfe: 0 },
  };

  // --- certifications & capability adoption (Progress-Report data, absent) --
  const certifications = [
    { label: "NCA Certified", users: 0, pct: 0 },
    { label: "NCM Certified", users: 0, pct: 0 },
    { label: "NCP Certified", users: 0, pct: 0 },
    { label: "Uncertified Portal Users", users: 0, pct: 0 },
  ];
  notes.push("Certification counts aren't in the QBR/Health export — shown as 0; edit on the slide if you have the numbers.");

  const capabilityAdoption: CapabilityRow[] = [
    { version: "2.0", capability: "Deployment Scale", usage: "Power" },
    { version: "2.0", capability: "Enterprise Data Services", usage: featureAdoption.compression ? "Power" : "Standard" },
    { version: "2.0", capability: "Enterprise Compute", usage: "Power" },
    { version: "2.0", capability: "Data Protection & Disaster Recovery", usage: featureAdoption.asyncDr ? "Standard" : "Usage Unknown" },
    { version: "2.0", capability: "Security", usage: "Standard" },
    { version: "2.0", capability: "Networking & Network Security", usage: featureAdoption.metroAvailability ? "Standard" : "Usage Unknown" },
    { version: "2.0", capability: "Management & Analytics", usage: featureAdoption.prismCentral ? "Standard" : "Usage Unknown" },
  ];

  // --- renewals (from license expiry) ---------------------------------------
  const earliest = coreLic.map((l) => l.expiry).filter(Boolean).sort()[0] || "";
  const renewals = {
    sinceLabel: "Next 12 Months",
    items: earliest ? [{ product: `${productTier} - Cores`, earliest: earliest.slice(0, 7).replace("-", "/") }] : [],
    totalQuantity: entitledCores,
    licenseType: productTier,
    renewalPeriod: earliest.slice(0, 7),
  };

  // --- eos software (recommendations reports none near EoL) -----------------
  const eosSoftware: never[] = [];

  const report: Cs360HealthReport = {
    account: { name: customer, vertical: "" },
    pulseEnabled: true,
    lastPulse,
    team: { ae, se, sam: "-", ase: csResident, executiveSponsor, tam, csResident },
    summary: {
      activeClusters: num(assets.activeclusters),
      totalClusters: num(assets.totalclusters),
      prismCentrals,
      blocksAndSwAssets: num(assets.blocksswassets),
      nodes: num(assets.nodesreportedbypulse),
      vms: num(assets.vmsreportedbypulse),
      totalLicenseActivation: num(adopt.totallicenseactivation),
      ahvAdoption: num(adopt.ahvadoption),
      pulseHdAdoption: num(adopt.pulsehdadoption),
      uptimePct: num(cx.uptime12monthaverage),
      npsScore: nps > 0 ? nps : null,
      openCases: {
        p1: num(cases.p1cases),
        p2: num(cases.p2cases),
        p3: num(cases.p3cases),
        p4: num(cases.p4cases),
        rfe: num(cases.rfe),
      },
    },
    clusterUtilization,
    nodePurchaseHistory,
    licenses,
    featureAdoption,
    resourceUtilization,
    softwareVersions,
    supportCases,
    clusterSummary,
    prismCentral,
    blocks,
    discoveries,
    recommendations: {
      agingAssets4Plus: num(aging["4years"]),
      agingAssets3to4: num(aging["34years"]),
      eolClusters: num(swEol.eol),
      eolUnder6mo: num(swEol.eolin6months),
      over75Capacity: num(capAlerts["75capacity"]),
      forecast90: num(capAlerts.forecast90inlast3months),
      licensesNotActivated12: num(licAct["12months"]),
      supportRenewals0to6: num(supRenew["06months"]),
      supportRenewals6to12: num(supRenew["612months"]),
      nccCritical: num(nccAlerts.critical),
    },
    pnpReadiness: {
      allClusters,
      peClusters,
      prismCentrals,
      licensed: allClusters,
      ready: pnpReady,
      insufficientData: 0,
      prereqNotMet: 0,
    },
    licenseActivationLabel: `${Math.round(usedCores)} / ${Math.round(entitledCores)} (${Math.round(activationPct)}%)`,
    licenseActivationPct: activationPct,
    productTier,
    capabilityAdoption,
    supportOverview,
    renewals,
    certifications,
    eosSoftware,
    blocksReview: {
      totalBlocks: nodeBlocks.length,
      age3to5: num(aging["34years"]),
      ageOver5: num(aging["4years"]),
      eomNow: eosSoftware.length,
      eomUnder1yr: 0,
    },
    discoveriesSummary: {
      critical: discoveries.filter((d) => /critical/i.test(d.severity)).length,
      warning: discoveries.filter((d) => !/critical/i.test(d.severity)).length,
      active: activeDiscoveries,
    },
  };

  return { report, notes };
}
