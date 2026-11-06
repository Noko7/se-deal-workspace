// Install Base Report — add-on chart reports (browser-only, deterministic).
//
// Reproduces the three PDF "prompts" as code: per-AE Current Metrics, per-AE
// N-1 Metrics, and a Specific-Accounts chart. Charts are drawn to a <canvas> and
// returned as PNG data URLs for embedding into the Excel workbook. No AI.

import { parsePercent } from "./rules";
import type { MergedRow } from "./parse";

const RED = "#E23B3B";
const BLUE = "#2E6FE2";
const GREEN = "#2F9E44";

export type ChartImage = { title: string; dataUrl: string; widthPx: number; heightPx: number };

type Series = { label: string; color: string; values: (number | null)[] };

type AccountAgg = {
  account: string;
  ae: string;
  cpu: number | null;
  mem: number | null;
  stor: number | null;
  n1cpu: number | null;
  n1mem: number | null;
  n1stor: number | null;
};

const maxOrNull = (a: number | null, b: number | null): number | null => {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
};

// One account can span several clusters; aggregate each metric as the worst
// (max) usage across the account's clusters — the "high utilization" signal.
function aggregateByAccount(rows: MergedRow[]): AccountAgg[] {
  const byAccount = new Map<string, AccountAgg>();
  for (const r of rows) {
    const account = (r.accountName ?? "").trim();
    if (!account) continue;
    const key = account.toLowerCase();
    const cur =
      byAccount.get(key) ??
      { account, ae: (r.accountExecutive ?? "").trim(), cpu: null, mem: null, stor: null, n1cpu: null, n1mem: null, n1stor: null };
    if (!cur.ae && r.accountExecutive) cur.ae = r.accountExecutive.trim();
    cur.cpu = maxOrNull(cur.cpu, parsePercent(r.cpuUsedPct));
    cur.mem = maxOrNull(cur.mem, parsePercent(r.memoryUsedPct));
    cur.stor = maxOrNull(cur.stor, parsePercent(r.storageUsedPct));
    cur.n1cpu = maxOrNull(cur.n1cpu, parsePercent(r.n1CpuPct));
    cur.n1mem = maxOrNull(cur.n1mem, parsePercent(r.n1MemoryPct));
    cur.n1stor = maxOrNull(cur.n1stor, parsePercent(r.n1StoragePct));
    byAccount.set(key, cur);
  }
  return [...byAccount.values()];
}

const sumMetrics = (vals: (number | null)[]): number => vals.reduce<number>((s, v) => s + (v ?? 0), 0);

// --- Canvas drawing ---------------------------------------------------------

function drawGroupedBarChart(opts: {
  title: string;
  categories: string[];
  series: Series[];
  yLabel: string;
  xLabel: string;
}): ChartImage {
  const scale = 2; // render at 2x for crisp embedding
  const W = 900;
  const H = 520;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { title: opts.title, dataUrl: "", widthPx: W, heightPx: H };
  ctx.scale(scale, scale);
  ctx.textBaseline = "alphabetic";

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const padL = 70;
  const padR = 24;
  const padTop = 78;
  const padBottom = 128;
  const plotW = W - padL - padR;
  const plotH = H - padTop - padBottom;
  const plotBottom = padTop + plotH;

  // Y scale: at least 0–100, expanded to fit N-1 values that exceed 100.
  const maxVal = Math.max(
    100,
    ...opts.series.flatMap((s) => s.values.map((v) => v ?? 0)),
  );
  const yMax = Math.ceil(maxVal / 20) * 20;

  // Title
  ctx.fillStyle = "#1f1f24";
  ctx.font = "bold 20px Montserrat, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(opts.title, W / 2, 34);

  // Legend
  const legendY = 56;
  ctx.font = "13px Montserrat, Arial, sans-serif";
  const legendItems = opts.series.map((s) => ({ label: s.label, color: s.color }));
  const legendWidths = legendItems.map((it) => 18 + ctx.measureText(it.label).width + 22);
  const legendTotal = legendWidths.reduce((a, b) => a + b, 0);
  let lx = W / 2 - legendTotal / 2;
  ctx.textAlign = "left";
  legendItems.forEach((it, i) => {
    ctx.fillStyle = it.color;
    ctx.fillRect(lx, legendY - 10, 12, 12);
    ctx.fillStyle = "#1f1f24";
    ctx.fillText(it.label, lx + 18, legendY);
    lx += legendWidths[i];
  });

  // Gridlines + Y ticks
  ctx.strokeStyle = "#e5e5ea";
  ctx.fillStyle = "#5d5d66";
  ctx.font = "12px Montserrat, Arial, sans-serif";
  ctx.textAlign = "right";
  const step = yMax <= 100 ? 20 : yMax <= 160 ? 40 : 50;
  for (let v = 0; v <= yMax; v += step) {
    const y = plotBottom - (v / yMax) * plotH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.fillText(`${v}%`, padL - 8, y + 4);
  }

  // Axes
  ctx.strokeStyle = "#9a9aa3";
  ctx.beginPath();
  ctx.moveTo(padL, padTop);
  ctx.lineTo(padL, plotBottom);
  ctx.lineTo(padL + plotW, plotBottom);
  ctx.stroke();

  // Bars
  const n = opts.categories.length;
  const s = opts.series.length;
  const groupW = plotW / Math.max(n, 1);
  const groupPad = groupW * 0.18;
  const barsW = groupW - groupPad * 2;
  const barW = barsW / Math.max(s, 1);

  opts.categories.forEach((cat, ci) => {
    const gx = padL + ci * groupW + groupPad;
    opts.series.forEach((ser, si) => {
      const v = ser.values[ci] ?? 0;
      const h = (v / yMax) * plotH;
      const x = gx + si * barW;
      const y = plotBottom - h;
      ctx.fillStyle = ser.color;
      ctx.fillRect(x, y, barW - 2, h);
    });
    // X label (rotated for long account names)
    ctx.save();
    ctx.translate(padL + ci * groupW + groupW / 2, plotBottom + 10);
    ctx.rotate(-Math.PI / 6);
    ctx.fillStyle = "#1f1f24";
    ctx.font = "12px Montserrat, Arial, sans-serif";
    ctx.textAlign = "right";
    const label = cat.length > 26 ? `${cat.slice(0, 25)}…` : cat;
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });

  // Axis labels
  ctx.fillStyle = "#1f1f24";
  ctx.font = "13px Montserrat, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(opts.xLabel, padL + plotW / 2, H - 8);
  ctx.save();
  ctx.translate(18, padTop + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(opts.yLabel, 0, 0);
  ctx.restore();

  return { title: opts.title, dataUrl: canvas.toDataURL("image/png"), widthPx: W, heightPx: H };
}

// --- Report builders --------------------------------------------------------

export type ReportOptions = {
  /** Comma/newline-separated account names for the Specific-Accounts chart. */
  specificAccounts: string;
};

// Current Metrics: one chart per Account Executive. Accounts with any of CPU /
// Memory / Storage > 75%, top 5 by combined usage.
function currentMetricsCharts(aggs: AccountAgg[]): ChartImage[] {
  const byAe = new Map<string, AccountAgg[]>();
  for (const a of aggs) {
    const ae = a.ae || "Unassigned";
    (byAe.get(ae) ?? byAe.set(ae, []).get(ae)!).push(a);
  }
  const charts: ChartImage[] = [];
  for (const [ae, list] of [...byAe.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const qualifying = list
      .filter((a) => (a.cpu ?? 0) > 75 || (a.mem ?? 0) > 75 || (a.stor ?? 0) > 75)
      .sort((a, b) => sumMetrics([b.cpu, b.mem, b.stor]) - sumMetrics([a.cpu, a.mem, a.stor]))
      .slice(0, 5);
    if (qualifying.length === 0) continue;
    charts.push(
      drawGroupedBarChart({
        title: `${ae}'s Accounts with Current Metrics Above 70%`,
        categories: qualifying.map((a) => a.account),
        series: [
          { label: "CPU Used %", color: RED, values: qualifying.map((a) => a.cpu) },
          { label: "Memory Used %", color: BLUE, values: qualifying.map((a) => a.mem) },
          { label: "Storage Used %", color: GREEN, values: qualifying.map((a) => a.stor) },
        ],
        yLabel: "Usage Percentage",
        xLabel: "Account Name",
      }),
    );
  }
  return charts;
}

// N-1 Metrics: one chart per Account Executive. Accounts with any N-1 metric
// > 70%, top 5 by combined N-1 usage.
function n1MetricsCharts(aggs: AccountAgg[]): ChartImage[] {
  const byAe = new Map<string, AccountAgg[]>();
  for (const a of aggs) {
    const ae = a.ae || "Unassigned";
    (byAe.get(ae) ?? byAe.set(ae, []).get(ae)!).push(a);
  }
  const charts: ChartImage[] = [];
  for (const [ae, list] of [...byAe.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const qualifying = list
      .filter((a) => (a.n1cpu ?? 0) > 70 || (a.n1mem ?? 0) > 70 || (a.n1stor ?? 0) > 70)
      .sort((a, b) => sumMetrics([b.n1cpu, b.n1mem, b.n1stor]) - sumMetrics([a.n1cpu, a.n1mem, a.n1stor]))
      .slice(0, 5);
    if (qualifying.length === 0) continue;
    charts.push(
      drawGroupedBarChart({
        title: `${ae}'s Accounts with N-1 Metrics Above 70%`,
        categories: qualifying.map((a) => a.account),
        series: [
          { label: "N-1 CPU Use %", color: RED, values: qualifying.map((a) => a.n1cpu) },
          { label: "N-1 Memory Use %", color: BLUE, values: qualifying.map((a) => a.n1mem) },
          { label: "N-1 Storage Use %", color: GREEN, values: qualifying.map((a) => a.n1stor) },
        ],
        yLabel: "Usage Percentage",
        xLabel: "Account Name",
      }),
    );
  }
  return charts;
}

function specificAccountsChart(aggs: AccountAgg[], specificAccounts: string): ChartImage | null {
  const names = specificAccounts
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length === 0) return null;
  const byName = new Map(aggs.map((a) => [a.account.toLowerCase(), a]));
  const picked = names
    .map((name) => byName.get(name.toLowerCase()))
    .filter((a): a is AccountAgg => a !== undefined);
  if (picked.length === 0) return null;
  return drawGroupedBarChart({
    title: "Usage Metrics for Selected Accounts",
    categories: picked.map((a) => a.account),
    series: [
      { label: "CPU Used %", color: RED, values: picked.map((a) => a.cpu) },
      { label: "Memory Used %", color: BLUE, values: picked.map((a) => a.mem) },
      { label: "Storage Used %", color: GREEN, values: picked.map((a) => a.stor) },
    ],
    yLabel: "Usage Percentage",
    xLabel: "Account Name",
  });
}

export type ReportCharts = {
  current: ChartImage[];
  n1: ChartImage[];
  specific: ChartImage | null;
};

/** Build all add-on charts from the merged rows. Runs entirely in the browser. */
export function buildReportCharts(rows: MergedRow[], options: ReportOptions): ReportCharts {
  const aggs = aggregateByAccount(rows);
  return {
    current: currentMetricsCharts(aggs),
    n1: n1MetricsCharts(aggs),
    specific: specificAccountsChart(aggs, options.specificAccounts),
  };
}
