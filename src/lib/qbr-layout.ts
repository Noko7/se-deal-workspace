import { NUTANIX, NUTANIX_FONT, HEALTH, type HealthTone } from "./nutanix-brand";
import type { Cell, QbrDeckMeta, QbrSlide } from "./qbr-deck";

// Single source of truth for QBR slide layout. compileSlide() turns a QbrSlide
// into a flat list of absolutely-positioned elements on the 13.333in x 7.5in
// (16:9) board. The SAME element list drives:
//   - the on-screen preview (src/components/qbr-slide.tsx), rendered as
//     absolutely-positioned HTML so the SE can click any text to edit it, and
//   - the native .pptx export (src/lib/qbr-pptx.ts), mapped 1:1 onto pptxgenjs
//     (addText / addShape / addTable / addChart / addImage).
// Because both renderers consume identical coordinates, fonts and colors, the
// preview is true what-you-see-is-what-you-get and every exported element stays
// a native, editable PowerPoint object.

export const PX_PER_IN = 96;
export const PAGE_W = 13.333;
export const PAGE_H = 7.5;
const MARGIN = 0.6;

// pt -> px on the 96 dpi board (PowerPoint sizes fonts in points).
export const ptToPx = (pt: number) => (pt * PX_PER_IN) / 72;

export type Align = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";

export interface EditMeta {
  // dot-path into the QbrSlide (or "meta.*" for deck-level fields).
  path: string;
  // "lines" -> commit value as string[] split on newlines (bulleted lists).
  // "number" -> commit value parsed to a finite number.
  kind?: "text" | "lines" | "number";
  multiline?: boolean;
}

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string; // bare hex
}

export interface TextElement {
  kind: "text";
  x: number;
  y: number;
  w: number;
  h: number;
  runs?: TextRun[]; // single paragraph (inline runs)
  lines?: string[]; // bulleted list (one bullet per entry)
  bulletColor?: string;
  fontFace: string;
  fontSize: number; // pt
  color: string; // bare hex (default run color)
  bold?: boolean;
  italic?: boolean;
  align?: Align;
  valign?: VAlign;
  charSpacing?: number; // pt
  edit?: EditMeta;
}

export interface ShapeElement {
  kind: "shape";
  shape: "rect" | "roundRect" | "ellipse" | "line";
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string; // bare hex
  line?: { color: string; width: number };
  rectRadius?: number;
}

export interface ImageElement {
  kind: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  dataUrl: string;
}

export interface TableCell {
  text: string;
  bold?: boolean;
  color?: string; // bare hex
  fill?: string; // bare hex
  align?: Align;
  edit?: EditMeta;
}

export interface TableElement {
  kind: "table";
  x: number;
  y: number;
  w: number;
  h: number;
  header: TableCell[];
  rows: TableCell[][];
  rowH: number;
  borderColor: string;
}

export interface ChartElement {
  kind: "chart";
  chart: "bar" | "line";
  x: number;
  y: number;
  w: number;
  h: number;
  unit?: string;
  max?: number;
  colors: string[]; // bare hex
  showLegend?: boolean;
  // bar
  barSeries?: { label: string; value: number; labelPath?: string; valuePath?: string }[];
  // line
  lineSeries?: { label: string; points: number[]; labelPath?: string }[];
}

export type SlideElement = TextElement | ShapeElement | ImageElement | TableElement | ChartElement;

export interface CompiledSlide {
  background?: string; // bare hex (board background; undefined -> white)
  elements: SlideElement[];
}

// --- helpers -----------------------------------------------------------------

function toneColor(tone?: HealthTone): string {
  switch (tone) {
    case "good":
      return HEALTH.good;
    case "warn":
      return HEALTH.warn;
    case "bad":
      return HEALTH.bad;
    default:
      return NUTANIX.ink;
  }
}
function toneFill(tone?: HealthTone): string {
  switch (tone) {
    case "good":
      return HEALTH.goodFill;
    case "warn":
      return HEALTH.warnFill;
    case "bad":
      return HEALTH.badFill;
    default:
      return "FFFFFF";
  }
}

const cellText = (c: Cell) => (typeof c === "string" ? c : c.text);
const cellTone = (c: Cell): HealthTone | undefined => (typeof c === "string" ? undefined : c.tone);

const CHART_COLORS = [NUTANIX.purple, NUTANIX.cyan, NUTANIX.green, NUTANIX.coral, NUTANIX.teal];

// --- compile -----------------------------------------------------------------

export function compileSlide(slide: QbrSlide, meta: QbrDeckMeta, logo: string | null): CompiledSlide {
  const c = slide.content;
  const els: SlideElement[] = [];

  // ---- Cover slides (title / closing) --------------------------------------
  if (c.type === "title" || c.type === "closing") {
    // accent blocks (top-right)
    els.push({ kind: "shape", shape: "rect", x: PAGE_W - 3.2, y: 0, w: 3.2, h: 0.28, fill: NUTANIX.purple });
    els.push({ kind: "shape", shape: "rect", x: PAGE_W - 1.9, y: 0, w: 1.9, h: 0.55, fill: NUTANIX.cyan });

    if (c.type === "title") {
      if (logo) els.push({ kind: "image", x: 1.0, y: 0.9, w: 2.4, h: 0.8, dataUrl: logo });
      els.push({ kind: "text", x: 1.0, y: 2.5, w: 11, h: 0.5, runs: [{ text: "QUARTERLY BUSINESS REVIEW" }], fontFace: NUTANIX_FONT.body, fontSize: 16, color: NUTANIX.cyan, charSpacing: 3 });
      els.push({ kind: "text", x: 1.0, y: 3.0, w: 11.3, h: 1.4, runs: [{ text: meta.customer }], fontFace: NUTANIX_FONT.heading, fontSize: 48, bold: true, color: "FFFFFF", edit: { path: "meta.customer" } });
      els.push({ kind: "text", x: 1.0, y: 4.5, w: 11, h: 0.4, runs: [{ text: meta.vertical }], fontFace: NUTANIX_FONT.body, fontSize: 14, color: "D8CCFF", edit: { path: "meta.vertical" } });
      els.push({ kind: "text", x: 1.0, y: 4.95, w: 11, h: 0.4, runs: [{ text: meta.dateLabel }], fontFace: NUTANIX_FONT.body, fontSize: 14, color: "D8CCFF", edit: { path: "meta.dateLabel" } });
      els.push({ kind: "text", x: 1.0, y: 5.45, w: 1.0, h: 0.4, runs: [{ text: "Prepared by" }], fontFace: NUTANIX_FONT.body, fontSize: 12, color: "B9A7F2", valign: "middle" });
      els.push({ kind: "text", x: 1.95, y: 5.45, w: 9, h: 0.4, runs: [{ text: meta.preparedBy }], fontFace: NUTANIX_FONT.body, fontSize: 12, bold: true, color: "D8CCFF", valign: "middle", edit: { path: "meta.preparedBy" } });
      return { background: NUTANIX.deepPurple, elements: els };
    }

    // closing
    els.push({ kind: "text", x: 0, y: 3.0, w: PAGE_W, h: 1.2, runs: [{ text: c.message }], fontFace: NUTANIX_FONT.heading, fontSize: 44, bold: true, color: "FFFFFF", align: "center", edit: { path: "content.message" } });
    els.push({ kind: "text", x: 0, y: 4.3, w: PAGE_W, h: 0.5, runs: [{ text: meta.customer }], fontFace: NUTANIX_FONT.body, fontSize: 16, color: NUTANIX.cyan, align: "center", edit: { path: "meta.customer" } });
    if (logo) els.push({ kind: "image", x: (PAGE_W - 2.0) / 2, y: 5.1, w: 2.0, h: 0.7, dataUrl: logo });
    return { background: NUTANIX.deepPurple, elements: els };
  }

  // ---- Chrome (shared by all content slides) -------------------------------
  els.push({ kind: "shape", shape: "rect", x: MARGIN, y: 0.5, w: 0.14, h: 0.62, fill: NUTANIX.purple });
  els.push({ kind: "text", x: MARGIN + 0.28, y: 0.42, w: 9.5, h: 0.7, runs: [{ text: slide.title }], fontFace: NUTANIX_FONT.heading, fontSize: 28, bold: true, color: NUTANIX.ink, valign: "middle", edit: { path: "title" } });
  if (slide.subtitle !== undefined) {
    els.push({ kind: "text", x: MARGIN + 0.28, y: 1.12, w: 9.5, h: 0.35, runs: [{ text: slide.subtitle }], fontFace: NUTANIX_FONT.body, fontSize: 12, color: NUTANIX.slate, edit: { path: "subtitle" } });
  }
  if (logo) els.push({ kind: "image", x: PAGE_W - MARGIN - 1.2, y: 0.5, w: 1.2, h: 0.5, dataUrl: logo });
  els.push({ kind: "shape", shape: "line", x: MARGIN, y: 1.6, w: PAGE_W - MARGIN * 2, h: 0, line: { color: NUTANIX.line, width: 1 } });

  // footer
  els.push({ kind: "text", x: MARGIN, y: PAGE_H - 0.45, w: 8, h: 0.3, runs: [{ text: `Nutanix Confidential  \u00b7  ${meta.customer}` }], fontFace: NUTANIX_FONT.body, fontSize: 8, color: NUTANIX.slate, valign: "middle" });

  const showInsight = Boolean(slide.insight) && !slide.insightHidden;
  const top = 1.85;
  const bottom = showInsight ? PAGE_H - 1.4 : PAGE_H - 0.7;
  const h = bottom - top;
  const innerW = PAGE_W - MARGIN * 2;

  switch (c.type) {
    case "agenda": {
      const rowH = h / c.items.length;
      c.items.forEach((item, i) => {
        const y = top + i * rowH;
        els.push({ kind: "shape", shape: "rect", x: MARGIN, y: y + 0.05, w: 0.5, h: 0.5, fill: NUTANIX.cloud });
        els.push({ kind: "text", x: MARGIN, y: y + 0.05, w: 0.5, h: 0.5, runs: [{ text: String(i + 1) }], fontFace: NUTANIX_FONT.heading, fontSize: 16, bold: true, color: NUTANIX.purple, align: "center", valign: "middle" });
        els.push({ kind: "text", x: MARGIN + 0.7, y, w: 11, h: rowH, runs: [{ text: item }], fontFace: NUTANIX_FONT.body, fontSize: 16, color: NUTANIX.ink, valign: "middle", edit: { path: `content.items.${i}` } });
      });
      break;
    }
    case "team": {
      const cols = Math.min(c.members.length, 4);
      const gap = 0.3;
      const cardW = (innerW - gap * (cols - 1)) / cols;
      const cardH = Math.min(h, 3.6);
      const y0 = top + (h - cardH) / 2;
      c.members.forEach((m, mi) => {
        const x = MARGIN + mi * (cardW + gap);
        const initials = m.name.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "NA";
        const av = 1.0;
        els.push({ kind: "shape", shape: "roundRect", x, y: y0, w: cardW, h: cardH, rectRadius: 0.08, fill: "FBFAFF", line: { color: NUTANIX.mist, width: 1 } });
        els.push({ kind: "shape", shape: "ellipse", x: x + (cardW - av) / 2, y: y0 + 0.4, w: av, h: av, fill: NUTANIX.purple });
        els.push({ kind: "text", x: x + (cardW - av) / 2, y: y0 + 0.4, w: av, h: av, runs: [{ text: initials }], fontFace: NUTANIX_FONT.heading, fontSize: 22, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
        els.push({ kind: "text", x: x + 0.1, y: y0 + 1.55, w: cardW - 0.2, h: 0.4, runs: [{ text: m.name }], fontFace: NUTANIX_FONT.heading, fontSize: 16, bold: true, color: NUTANIX.ink, align: "center", edit: { path: `content.members.${mi}.name` } });
        els.push({ kind: "text", x: x + 0.1, y: y0 + 1.95, w: cardW - 0.2, h: 0.4, runs: [{ text: m.role }], fontFace: NUTANIX_FONT.body, fontSize: 12, color: NUTANIX.purple, align: "center", edit: { path: `content.members.${mi}.role` } });
      });
      break;
    }
    case "bullets": {
      const cols = c.columns ?? c.groups.length;
      const gap = 0.4;
      const colW = (innerW - gap * (cols - 1)) / cols;
      const rowGroups = Math.ceil(c.groups.length / cols);
      const groupH = h / rowGroups;
      c.groups.forEach((g, gi) => {
        const x = MARGIN + (gi % cols) * (colW + gap);
        const y = top + Math.floor(gi / cols) * groupH;
        let cursor = y;
        if (g.heading !== undefined) {
          els.push({ kind: "text", x, y: cursor, w: colW, h: 0.4, runs: [{ text: g.heading }], fontFace: NUTANIX_FONT.heading, fontSize: 15, bold: true, color: NUTANIX.purple, edit: { path: `content.groups.${gi}.heading` } });
          cursor += 0.5;
        }
        els.push({
          kind: "text",
          x,
          y: cursor,
          w: colW,
          h: groupH - (cursor - y) - 0.1,
          lines: g.items,
          bulletColor: g.tone ? toneColor(g.tone) : NUTANIX.purple,
          fontFace: NUTANIX_FONT.body,
          fontSize: 13,
          color: NUTANIX.ink,
          valign: "top",
          edit: { path: `content.groups.${gi}.items`, kind: "lines", multiline: true },
        });
      });
      break;
    }
    case "meters": {
      const globalMax = Math.max(...c.items.map((x) => x.max ?? x.value), 1);
      const rowH = Math.min(0.55, h / Math.max(1, c.items.length));
      const totalH = rowH * c.items.length;
      const y0 = top + (h - totalH) / 2;
      const labelW = 3.0;
      const valueW = 1.6;
      const barX = MARGIN + labelW + 0.2;
      const barW = innerW - labelW - valueW - 0.4;
      c.items.forEach((it, ii) => {
        const y = y0 + ii * rowH;
        const max = it.max ?? globalMax;
        const w = Math.max(0.04, it.value / (max || 1)) * barW;
        const barColor = it.tone ? toneColor(it.tone) : NUTANIX.purple;
        els.push({ kind: "text", x: MARGIN, y, w: labelW, h: rowH, runs: [{ text: it.label }], fontFace: NUTANIX_FONT.body, fontSize: 12, color: NUTANIX.ink, align: "right", valign: "middle", edit: { path: `content.items.${ii}.label` } });
        els.push({ kind: "shape", shape: "roundRect", x: barX, y: y + rowH / 2 - 0.11, w: barW, h: 0.22, rectRadius: 0.11, fill: "EEEEF6" });
        els.push({ kind: "shape", shape: "roundRect", x: barX, y: y + rowH / 2 - 0.11, w, h: 0.22, rectRadius: 0.11, fill: barColor });
        els.push({ kind: "text", x: barX + barW + 0.15, y, w: valueW, h: rowH, runs: [{ text: it.display ?? `${it.value}${c.unit ?? ""}` }], fontFace: NUTANIX_FONT.heading, fontSize: 13, bold: true, color: barColor, valign: "middle", edit: { path: `content.items.${ii}.display` } });
      });
      break;
    }
    case "metrics": {
      const groups = c.groups;
      const cols = groups.length > 2 ? 2 : groups.length;
      const rows = Math.ceil(groups.length / cols);
      const gap = 0.3;
      const cardW = (innerW - gap * (cols - 1)) / cols;
      const cardH = (h - gap * (rows - 1)) / rows;
      groups.forEach((g, gi) => {
        const col = gi % cols;
        const row = Math.floor(gi / cols);
        const x = MARGIN + col * (cardW + gap);
        const y = top + row * (cardH + gap);
        els.push({ kind: "shape", shape: "roundRect", x, y, w: cardW, h: cardH, rectRadius: 0.06, fill: "FBFAFF", line: { color: NUTANIX.mist, width: 1 } });
        els.push({ kind: "shape", shape: "rect", x, y, w: cardW, h: 0.06, fill: NUTANIX.purple });
        els.push({ kind: "text", x: x + 0.2, y: y + 0.12, w: cardW - 0.4, h: 0.3, runs: [{ text: g.label.toUpperCase() }], fontFace: NUTANIX_FONT.heading, fontSize: 11, bold: true, color: NUTANIX.purple, charSpacing: 1, edit: { path: `content.groups.${gi}.label` } });
        const statTop = y + 0.5;
        const statH = (cardH - 0.6) / Math.max(1, g.stats.length);
        g.stats.forEach((st, si) => {
          const sy = statTop + si * statH;
          els.push({ kind: "text", x: x + 0.2, y: sy, w: cardW - 1.6, h: statH, runs: [{ text: st.label }], fontFace: NUTANIX_FONT.body, fontSize: 11, color: NUTANIX.gray, valign: "middle", edit: { path: `content.groups.${gi}.stats.${si}.label` } });
          els.push({ kind: "text", x: x + cardW - 1.6, y: sy, w: 1.4, h: statH, runs: [{ text: st.value }], fontFace: NUTANIX_FONT.heading, fontSize: 14, bold: true, color: toneColor(st.tone), align: "right", valign: "middle", edit: { path: `content.groups.${gi}.stats.${si}.value` } });
        });
      });
      break;
    }
    case "kpis": {
      const cols = Math.min(c.kpis.length, 4);
      const gap = 0.3;
      const cardW = (innerW - gap * (cols - 1)) / cols;
      c.kpis.forEach((k, ki) => {
        const x = MARGIN + (ki % cols) * (cardW + gap);
        const y = top + Math.floor(ki / cols) * 2;
        els.push({ kind: "shape", shape: "roundRect", x, y, w: cardW, h: 1.7, rectRadius: 0.06, fill: "FBFAFF", line: { color: NUTANIX.mist, width: 1 } });
        els.push({ kind: "text", x, y: y + 0.2, w: cardW, h: 0.9, runs: [{ text: k.value }], fontFace: NUTANIX_FONT.heading, fontSize: 34, bold: true, color: toneColor(k.tone), align: "center", valign: "middle", edit: { path: `content.kpis.${ki}.value` } });
        els.push({ kind: "text", x, y: y + 1.1, w: cardW, h: 0.4, runs: [{ text: k.label }], fontFace: NUTANIX_FONT.body, fontSize: 11, color: NUTANIX.gray, align: "center", edit: { path: `content.kpis.${ki}.label` } });
      });
      break;
    }
    case "features": {
      const cols = 3;
      const gap = 0.3;
      const cardW = (innerW - gap * (cols - 1)) / cols;
      const rows = Math.ceil(c.features.length / cols);
      const cardH = (h - gap * (rows - 1)) / rows;
      c.features.forEach((f, fi) => {
        const x = MARGIN + (fi % cols) * (cardW + gap);
        const y = top + Math.floor(fi / cols) * (cardH + gap);
        els.push({ kind: "shape", shape: "roundRect", x, y, w: cardW, h: cardH, rectRadius: 0.06, fill: "FBFAFF", line: { color: NUTANIX.mist, width: 1 } });
        els.push({ kind: "text", x: x + 0.25, y: y + 0.2, w: cardW - 1.4, h: 0.4, runs: [{ text: f.label }], fontFace: NUTANIX_FONT.heading, fontSize: 15, bold: true, color: NUTANIX.ink, edit: { path: `content.features.${fi}.label` } });
        const badgeFill = f.on ? HEALTH.goodFill : HEALTH.neutralFill;
        const badgeColor = f.on ? HEALTH.good : NUTANIX.gray;
        els.push({ kind: "shape", shape: "roundRect", x: x + cardW - 1.15, y: y + 0.22, w: 0.9, h: 0.34, rectRadius: 0.17, fill: badgeFill });
        els.push({ kind: "text", x: x + cardW - 1.15, y: y + 0.22, w: 0.9, h: 0.34, runs: [{ text: f.on ? "ON" : "OFF" }], fontFace: NUTANIX_FONT.body, fontSize: 10, bold: true, color: badgeColor, align: "center", valign: "middle" });
        els.push({ kind: "text", x: x + 0.25, y: y + 0.7, w: cardW - 0.5, h: cardH - 0.85, runs: [{ text: f.note }], fontFace: NUTANIX_FONT.body, fontSize: 10, color: NUTANIX.gray, valign: "top", edit: { path: `content.features.${fi}.note`, multiline: true } });
      });
      break;
    }
    case "bars": {
      els.push({
        kind: "chart",
        chart: "bar",
        x: MARGIN,
        y: top,
        w: innerW,
        h,
        unit: c.unit,
        max: c.max,
        colors: [NUTANIX.purple],
        barSeries: c.series.map((d, i) => ({ label: d.label, value: d.value, labelPath: `content.series.${i}.label`, valuePath: `content.series.${i}.value` })),
      });
      break;
    }
    case "lines": {
      els.push({
        kind: "chart",
        chart: "line",
        x: MARGIN,
        y: top,
        w: innerW,
        h,
        unit: c.unit,
        colors: CHART_COLORS,
        showLegend: c.series.length > 1,
        lineSeries: c.series.map((ser, i) => ({ label: ser.label, points: ser.points, labelPath: `content.series.${i}.label` })),
      });
      break;
    }
    case "table": {
      const header: TableCell[] = c.columns.map((col, ci) => ({
        text: col,
        bold: true,
        color: "FFFFFF",
        fill: NUTANIX.purple,
        align: "left",
        edit: { path: `content.columns.${ci}` },
      }));
      const rows: TableCell[][] = c.rows.map((row, ri) =>
        row.map((cell, ci) => {
          const tone = cellTone(cell);
          return {
            text: cellText(cell),
            color: tone ? toneColor(tone) : NUTANIX.ink,
            fill: tone ? toneFill(tone) : ri % 2 ? "F7F6FD" : "FFFFFF",
            bold: Boolean(tone),
            align: "left" as Align,
            edit: { path: `content.rows.${ri}.${ci}` },
          };
        }),
      );
      const tableH = c.note ? h - 0.3 : h;
      els.push({
        kind: "table",
        x: MARGIN,
        y: top,
        w: innerW,
        h: tableH,
        header,
        rows,
        rowH: Math.min(0.5, (h - 0.4) / Math.max(1, c.rows.length + 1)),
        borderColor: NUTANIX.line,
      });
      if (c.note !== undefined) {
        els.push({ kind: "text", x: MARGIN, y: bottom - 0.25, w: innerW, h: 0.25, runs: [{ text: c.note }], fontFace: NUTANIX_FONT.body, fontSize: 8, italic: true, color: NUTANIX.slate, edit: { path: "content.note" } });
      }
      break;
    }
    default: {
      // exhaustiveness guard for future content types
      const _never: never = c as never;
      void _never;
    }
  }

  // ---- Insight callout ------------------------------------------------------
  if (showInsight && slide.insight) {
    const fill = toneFill(slide.insight.tone);
    const color = toneColor(slide.insight.tone);
    const y = PAGE_H - 1.15;
    els.push({ kind: "shape", shape: "roundRect", x: MARGIN, y, w: innerW, h: 0.6, rectRadius: 0.06, fill });
    els.push({ kind: "text", x: MARGIN + 0.2, y, w: 1.4, h: 0.6, runs: [{ text: "SE Insight" }], fontFace: NUTANIX_FONT.body, fontSize: 11, bold: true, color, valign: "middle" });
    els.push({ kind: "text", x: MARGIN + 1.55, y, w: innerW - 1.75, h: 0.6, runs: [{ text: slide.insight.text }], fontFace: NUTANIX_FONT.body, fontSize: 11, color: NUTANIX.ink, valign: "middle", edit: { path: "insight.text" } });
  }

  return { elements: els };
}

// Page number is added per-slide by the exporter (it knows the index); the
// preview shows it too via this helper kept here for parity.
export function pageNumberElement(page: number): TextElement {
  return { kind: "text", x: PAGE_W - MARGIN - 0.6, y: PAGE_H - 0.45, w: 0.6, h: 0.3, runs: [{ text: String(page) }], fontFace: NUTANIX_FONT.body, fontSize: 8, color: NUTANIX.slate, align: "right", valign: "middle" };
}

export const LAYOUT = { PAGE_W, PAGE_H, MARGIN, CHART_COLORS };
