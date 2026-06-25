import { NUTANIX, NUTANIX_FONT, HEALTH, type HealthTone } from "./nutanix-brand";
import type { Cell, QbrDeckMeta, QbrSlide, SlideContent } from "./qbr-deck";

// Client-side .pptx exporter built on pptxgenjs. Renders the curated QBR deck in
// the official Nutanix brand style (16:9, Montserrat, brand palette) with the
// uploaded customer logo placed on every slide. Kept framework-agnostic so it
// can be reused by a future server-side export route.

const CHART_COLORS = [NUTANIX.purple, NUTANIX.cyan, NUTANIX.green, NUTANIX.coral, NUTANIX.teal];

function toneStyle(tone?: HealthTone): { color: string; fill: string } {
  switch (tone) {
    case "good":
      return { color: HEALTH.good, fill: HEALTH.goodFill };
    case "warn":
      return { color: HEALTH.warn, fill: HEALTH.warnFill };
    case "bad":
      return { color: HEALTH.bad, fill: HEALTH.badFill };
    default:
      return { color: NUTANIX.ink, fill: "FFFFFF" };
  }
}

const cellText = (c: Cell) => (typeof c === "string" ? c : c.text);
const cellTone = (c: Cell): HealthTone | undefined => (typeof c === "string" ? undefined : c.tone);

const PAGE_W = 13.333;
const PAGE_H = 7.5;
const MARGIN = 0.6;

type Slide = {
  addText: (t: unknown, o: unknown) => void;
  addShape: (s: unknown, o: unknown) => void;
  addTable: (rows: unknown, o: unknown) => void;
  addChart: (type: unknown, data: unknown, o: unknown) => void;
  addImage: (o: unknown) => void;
  background?: unknown;
};

export async function exportDeckToPptx(
  meta: QbrDeckMeta,
  slides: QbrSlide[],
  logoDataUrl: string | null,
): Promise<void> {
  const mod = await import("pptxgenjs");
  const PptxGenJS = mod.default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 (16:9)
  pptx.author = "Nutanix SE Workspace";
  pptx.company = "Nutanix";
  pptx.title = `QBR for ${meta.customer}`;

  const SHAPE = pptx.ShapeType;
  const CHART = pptx.ChartType;

  const addLogo = (slide: Slide, opts: { x: number; y: number; h: number }) => {
    if (!logoDataUrl) return;
    slide.addImage({ data: logoDataUrl, x: opts.x, y: opts.y, h: opts.h, w: opts.h * 2.4, sizing: { type: "contain", w: opts.h * 2.4, h: opts.h } });
  };

  const addChrome = (slide: Slide, title: string, subtitle: string | undefined, page: number) => {
    // left accent bar
    slide.addShape(SHAPE.rect, { x: MARGIN, y: 0.5, w: 0.14, h: 0.62, fill: { color: NUTANIX.purple } });
    slide.addText(title, {
      x: MARGIN + 0.28,
      y: 0.42,
      w: 9.5,
      h: 0.7,
      fontFace: NUTANIX_FONT.heading,
      fontSize: 28,
      bold: true,
      color: NUTANIX.ink,
    });
    if (subtitle) {
      slide.addText(subtitle, {
        x: MARGIN + 0.28,
        y: 1.12,
        w: 9.5,
        h: 0.35,
        fontFace: NUTANIX_FONT.body,
        fontSize: 12,
        color: NUTANIX.slate,
      });
    }
    addLogo(slide, { x: PAGE_W - MARGIN - 1.7, y: 0.5, h: 0.5 });
    // header rule
    slide.addShape(SHAPE.line, { x: MARGIN, y: 1.6, w: PAGE_W - MARGIN * 2, h: 0, line: { color: NUTANIX.line, width: 1 } });
    // footer
    slide.addText(`Nutanix Confidential  ·  ${meta.customer}`, {
      x: MARGIN,
      y: PAGE_H - 0.45,
      w: 8,
      h: 0.3,
      fontFace: NUTANIX_FONT.body,
      fontSize: 8,
      color: NUTANIX.slate,
    });
    slide.addText(String(page), {
      x: PAGE_W - MARGIN - 0.6,
      y: PAGE_H - 0.45,
      w: 0.6,
      h: 0.3,
      align: "right",
      fontFace: NUTANIX_FONT.body,
      fontSize: 8,
      color: NUTANIX.slate,
    });
  };

  const addInsight = (slide: Slide, insight: QbrSlide["insight"]) => {
    if (!insight) return;
    const ts = toneStyle(insight.tone);
    const y = PAGE_H - 1.15;
    slide.addShape(SHAPE.roundRect, { x: MARGIN, y, w: PAGE_W - MARGIN * 2, h: 0.6, rectRadius: 0.06, fill: { color: ts.fill }, line: { type: "none" } });
    slide.addText(
      [
        { text: "SE Insight   ", options: { bold: true, color: ts.color } },
        { text: insight.text, options: { color: NUTANIX.ink } },
      ],
      { x: MARGIN + 0.2, y, w: PAGE_W - MARGIN * 2 - 0.4, h: 0.6, valign: "middle", fontFace: NUTANIX_FONT.body, fontSize: 11 },
    );
  };

  const contentBottom = (insight: QbrSlide["insight"]) => (insight ? PAGE_H - 1.4 : PAGE_H - 0.7);

  slides.forEach((s, i) => {
    const slide = pptx.addSlide() as unknown as Slide;
    const page = i + 1;
    const c = s.content as SlideContent;

    if (c.type === "title" || c.type === "closing") {
      slide.background = { color: NUTANIX.deepPurple };
      slide.addShape(SHAPE.rect, { x: 0, y: 0, w: PAGE_W, h: PAGE_H, fill: { color: NUTANIX.deepPurple }, line: { type: "none" } });
      // accent diagonal blocks
      slide.addShape(SHAPE.rect, { x: PAGE_W - 3.2, y: 0, w: 3.2, h: 0.28, fill: { color: NUTANIX.purple }, line: { type: "none" } });
      slide.addShape(SHAPE.rect, { x: PAGE_W - 1.9, y: 0, w: 1.9, h: 0.55, fill: { color: NUTANIX.cyan }, line: { type: "none" } });
      if (c.type === "title") {
        slide.addText("QUARTERLY BUSINESS REVIEW", { x: 1.0, y: 2.5, w: 11, h: 0.5, fontFace: NUTANIX_FONT.body, fontSize: 16, color: NUTANIX.cyan, charSpacing: 3 });
        slide.addText(meta.customer, { x: 1.0, y: 3.0, w: 11.3, h: 1.4, fontFace: NUTANIX_FONT.heading, fontSize: 48, bold: true, color: "FFFFFF" });
        slide.addText(`${meta.vertical}  ·  ${meta.dateLabel}`, { x: 1.0, y: 4.5, w: 11, h: 0.4, fontFace: NUTANIX_FONT.body, fontSize: 14, color: "D8CCFF" });
        slide.addText(`Prepared by ${meta.preparedBy}`, { x: 1.0, y: 4.95, w: 11, h: 0.4, fontFace: NUTANIX_FONT.body, fontSize: 12, color: "B9A7F2" });
        if (logoDataUrl) slide.addImage({ data: logoDataUrl, x: 1.0, y: 0.9, h: 0.8, w: 2.4, sizing: { type: "contain", w: 2.4, h: 0.8 } });
      } else {
        slide.addText(c.message, { x: 0, y: 3.0, w: PAGE_W, h: 1.2, align: "center", fontFace: NUTANIX_FONT.heading, fontSize: 44, bold: true, color: "FFFFFF" });
        slide.addText(meta.customer, { x: 0, y: 4.3, w: PAGE_W, h: 0.5, align: "center", fontFace: NUTANIX_FONT.body, fontSize: 16, color: NUTANIX.cyan });
      }
      return;
    }

    addChrome(slide, s.title, s.subtitle, page);
    const top = 1.85;
    const bottom = contentBottom(s.insight);
    const h = bottom - top;

    switch (c.type) {
      case "agenda": {
        c.items.forEach((item, idx) => {
          const y = top + idx * (h / c.items.length);
          slide.addShape(SHAPE.rect, { x: MARGIN, y: y + 0.05, w: 0.5, h: 0.5, fill: { color: NUTANIX.cloud }, line: { type: "none" } });
          slide.addText(String(idx + 1), { x: MARGIN, y: y + 0.05, w: 0.5, h: 0.5, align: "center", valign: "middle", bold: true, color: NUTANIX.purple, fontFace: NUTANIX_FONT.heading, fontSize: 16 });
          slide.addText(item, { x: MARGIN + 0.7, y, w: 11, h: h / c.items.length, valign: "middle", fontFace: NUTANIX_FONT.body, fontSize: 16, color: NUTANIX.ink });
        });
        break;
      }
      case "team": {
        const cols = Math.min(c.members.length, 4);
        const gap = 0.3;
        const cardW = (PAGE_W - MARGIN * 2 - gap * (cols - 1)) / cols;
        const cardH = Math.min(h, 3.6);
        const y0 = top + (h - cardH) / 2;
        c.members.forEach((m, mi) => {
          const x = MARGIN + mi * (cardW + gap);
          const initials = m.name.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "-";
          slide.addShape(SHAPE.roundRect, { x, y: y0, w: cardW, h: cardH, rectRadius: 0.08, fill: { color: "FBFAFF" }, line: { color: NUTANIX.mist, width: 1 } });
          const av = 1.0;
          slide.addShape(SHAPE.ellipse, { x: x + (cardW - av) / 2, y: y0 + 0.4, w: av, h: av, fill: { color: NUTANIX.purple }, line: { type: "none" } });
          slide.addText(initials, { x: x + (cardW - av) / 2, y: y0 + 0.4, w: av, h: av, align: "center", valign: "middle", color: "FFFFFF", bold: true, fontSize: 22, fontFace: NUTANIX_FONT.heading });
          slide.addText(m.name, { x: x + 0.1, y: y0 + 1.55, w: cardW - 0.2, h: 0.4, align: "center", bold: true, fontSize: 16, color: NUTANIX.ink, fontFace: NUTANIX_FONT.heading });
          slide.addText(m.role, { x: x + 0.1, y: y0 + 1.95, w: cardW - 0.2, h: 0.4, align: "center", fontSize: 12, color: NUTANIX.purple, fontFace: NUTANIX_FONT.body });
        });
        break;
      }
      case "bullets": {
        const cols = c.columns ?? c.groups.length;
        const gap = 0.4;
        const colW = (PAGE_W - MARGIN * 2 - gap * (cols - 1)) / cols;
        c.groups.forEach((g, gi) => {
          const x = MARGIN + (gi % cols) * (colW + gap);
          const y = top + Math.floor(gi / cols) * (h / Math.ceil(c.groups.length / cols));
          let cursor = y;
          if (g.heading) {
            slide.addText(g.heading, { x, y: cursor, w: colW, h: 0.4, bold: true, fontSize: 15, color: NUTANIX.purple, fontFace: NUTANIX_FONT.heading });
            cursor += 0.5;
          }
          const runs = g.items.map((it) => ({ text: it, options: { bullet: { code: "2022", indent: 14 }, color: NUTANIX.ink, fontSize: 13, fontFace: NUTANIX_FONT.body, paraSpaceAfter: 8, breakLine: true } }));
          slide.addText(runs, { x, y: cursor, w: colW, h: h - (cursor - y) - 0.1, valign: "top" });
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
        const barW = PAGE_W - MARGIN * 2 - labelW - valueW - 0.4;
        c.items.forEach((it, ii) => {
          const y = y0 + ii * rowH;
          const max = it.max ?? globalMax;
          const w = Math.max(0.04, (it.value / (max || 1))) * barW;
          const ts = toneStyle(it.tone);
          const barColor = it.tone ? ts.color : NUTANIX.purple;
          slide.addText(it.label, { x: MARGIN, y, w: labelW, h: rowH, align: "right", valign: "middle", fontSize: 12, color: NUTANIX.ink, fontFace: NUTANIX_FONT.body });
          slide.addShape(SHAPE.roundRect, { x: barX, y: y + rowH / 2 - 0.11, w: barW, h: 0.22, rectRadius: 0.11, fill: { color: "EEEEF6" }, line: { type: "none" } });
          slide.addShape(SHAPE.roundRect, { x: barX, y: y + rowH / 2 - 0.11, w, h: 0.22, rectRadius: 0.11, fill: { color: barColor }, line: { type: "none" } });
          slide.addText(it.display ?? `${it.value}${c.unit ?? ""}`, { x: barX + barW + 0.15, y, w: valueW, h: rowH, valign: "middle", bold: true, fontSize: 13, color: barColor, fontFace: NUTANIX_FONT.heading });
        });
        break;
      }
      case "metrics": {
        const groups = c.groups;
        const cols = groups.length > 2 ? 2 : groups.length;
        const rows = Math.ceil(groups.length / cols);
        const gap = 0.3;
        const cardW = (PAGE_W - MARGIN * 2 - gap * (cols - 1)) / cols;
        const cardH = (h - gap * (rows - 1)) / rows;
        groups.forEach((g, gi) => {
          const col = gi % cols;
          const row = Math.floor(gi / cols);
          const x = MARGIN + col * (cardW + gap);
          const y = top + row * (cardH + gap);
          slide.addShape(SHAPE.roundRect, { x, y, w: cardW, h: cardH, rectRadius: 0.06, fill: { color: "FBFAFF" }, line: { color: NUTANIX.mist, width: 1 } });
          slide.addShape(SHAPE.rect, { x, y, w: cardW, h: 0.06, fill: { color: NUTANIX.purple }, line: { type: "none" } });
          slide.addText(g.label.toUpperCase(), { x: x + 0.2, y: y + 0.12, w: cardW - 0.4, h: 0.3, fontFace: NUTANIX_FONT.heading, fontSize: 11, bold: true, color: NUTANIX.purple, charSpacing: 1 });
          const statTop = y + 0.5;
          const statH = (cardH - 0.6) / Math.max(1, g.stats.length);
          g.stats.forEach((st, si) => {
            const sy = statTop + si * statH;
            slide.addText(st.label, { x: x + 0.2, y: sy, w: cardW - 1.6, h: statH, valign: "middle", fontFace: NUTANIX_FONT.body, fontSize: 11, color: NUTANIX.gray });
            slide.addText(st.value, { x: x + cardW - 1.6, y: sy, w: 1.4, h: statH, align: "right", valign: "middle", fontFace: NUTANIX_FONT.heading, fontSize: 14, bold: true, color: toneStyle(st.tone).color });
          });
        });
        break;
      }
      case "kpis": {
        const cols = Math.min(c.kpis.length, 4);
        const gap = 0.3;
        const cardW = (PAGE_W - MARGIN * 2 - gap * (cols - 1)) / cols;
        c.kpis.forEach((k, ki) => {
          const x = MARGIN + (ki % cols) * (cardW + gap);
          const y = top + Math.floor(ki / cols) * 2;
          slide.addShape(SHAPE.roundRect, { x, y, w: cardW, h: 1.7, rectRadius: 0.06, fill: { color: "FBFAFF" }, line: { color: NUTANIX.mist, width: 1 } });
          slide.addText(k.value, { x, y: y + 0.2, w: cardW, h: 0.9, align: "center", fontFace: NUTANIX_FONT.heading, fontSize: 34, bold: true, color: toneStyle(k.tone).color });
          slide.addText(k.label, { x, y: y + 1.1, w: cardW, h: 0.4, align: "center", fontFace: NUTANIX_FONT.body, fontSize: 11, color: NUTANIX.gray });
        });
        break;
      }
      case "features": {
        const cols = 3;
        const gap = 0.3;
        const cardW = (PAGE_W - MARGIN * 2 - gap * (cols - 1)) / cols;
        const rows = Math.ceil(c.features.length / cols);
        const cardH = (h - gap * (rows - 1)) / rows;
        c.features.forEach((f, fi) => {
          const x = MARGIN + (fi % cols) * (cardW + gap);
          const y = top + Math.floor(fi / cols) * (cardH + gap);
          slide.addShape(SHAPE.roundRect, { x, y, w: cardW, h: cardH, rectRadius: 0.06, fill: { color: "FBFAFF" }, line: { color: NUTANIX.mist, width: 1 } });
          slide.addText(f.label, { x: x + 0.25, y: y + 0.2, w: cardW - 1.4, h: 0.4, fontFace: NUTANIX_FONT.heading, fontSize: 15, bold: true, color: NUTANIX.ink });
          const badge = toneStyle(f.on ? "good" : "neutral");
          slide.addShape(SHAPE.roundRect, { x: x + cardW - 1.15, y: y + 0.22, w: 0.9, h: 0.34, rectRadius: 0.17, fill: { color: badge.fill }, line: { type: "none" } });
          slide.addText(f.on ? "ON" : "OFF", { x: x + cardW - 1.15, y: y + 0.22, w: 0.9, h: 0.34, align: "center", valign: "middle", bold: true, fontSize: 10, color: f.on ? HEALTH.good : NUTANIX.gray, fontFace: NUTANIX_FONT.body });
          slide.addText(f.note, { x: x + 0.25, y: y + 0.7, w: cardW - 0.5, h: cardH - 0.85, fontFace: NUTANIX_FONT.body, fontSize: 10, color: NUTANIX.gray });
        });
        break;
      }
      case "bars": {
        const data = [{ name: s.title, labels: c.series.map((d) => d.label), values: c.series.map((d) => d.value) }];
        slide.addChart(CHART.bar, data, {
          x: MARGIN,
          y: top,
          w: PAGE_W - MARGIN * 2,
          h,
          barDir: "col",
          chartColors: [NUTANIX.purple],
          showValue: true,
          dataLabelColor: NUTANIX.ink,
          dataLabelFontFace: NUTANIX_FONT.body,
          dataLabelFontSize: 11,
          showLegend: false,
          showTitle: false,
          catAxisLabelColor: NUTANIX.gray,
          valAxisHidden: true,
          valGridLine: { style: "none" },
          catAxisLabelFontFace: NUTANIX_FONT.body,
          barGapWidthPct: 60,
        });
        break;
      }
      case "lines": {
        const labels = c.series[0]?.points.map((_, idx) => `T${idx + 1}`) ?? [];
        const data = c.series.map((ser) => ({ name: ser.label, labels, values: ser.points }));
        slide.addChart(CHART.line, data, {
          x: MARGIN,
          y: top,
          w: PAGE_W - MARGIN * 2,
          h,
          chartColors: CHART_COLORS,
          lineSize: 3,
          lineSmooth: true,
          showLegend: c.series.length > 1,
          legendPos: "b",
          legendColor: NUTANIX.gray,
          showTitle: false,
          catAxisLabelColor: NUTANIX.gray,
          valAxisLabelColor: NUTANIX.gray,
          valGridLine: { color: NUTANIX.line, style: "solid", size: 1 },
          catAxisLabelFontFace: NUTANIX_FONT.body,
        });
        break;
      }
      case "table": {
        const header = c.columns.map((col) => ({
          text: col,
          options: { bold: true, color: "FFFFFF", fill: { color: NUTANIX.purple }, fontFace: NUTANIX_FONT.body, fontSize: 11, align: "left", valign: "middle" },
        }));
        const body = c.rows.map((row, ri) =>
          row.map((cell) => {
            const ts = toneStyle(cellTone(cell));
            const toned = cellTone(cell);
            return {
              text: cellText(cell),
              options: {
                color: toned ? ts.color : NUTANIX.ink,
                fill: { color: toned ? ts.fill : ri % 2 ? "F7F6FD" : "FFFFFF" },
                fontFace: NUTANIX_FONT.body,
                fontSize: 10,
                bold: Boolean(toned),
                valign: "middle",
              },
            };
          }),
        );
        slide.addTable([header, ...body], {
          x: MARGIN,
          y: top,
          w: PAGE_W - MARGIN * 2,
          h: c.note ? h - 0.3 : h,
          border: { type: "solid", color: NUTANIX.line, pt: 0.5 },
          autoPage: false,
          rowH: Math.min(0.5, (h - 0.4) / Math.max(1, c.rows.length + 1)),
        });
        if (c.note) {
          slide.addText(c.note, { x: MARGIN, y: bottom - 0.25, w: PAGE_W - MARGIN * 2, h: 0.25, fontFace: NUTANIX_FONT.body, fontSize: 8, italic: true, color: NUTANIX.slate });
        }
        break;
      }
    }

    addInsight(slide, s.insight);
  });

  await pptx.writeFile({ fileName: `QBR - ${meta.customer}.pptx` });
}
