import { NUTANIX, NUTANIX_FONT } from "./nutanix-brand";
import type { QbrDeckMeta, QbrSlide } from "./qbr-deck";
import { compileSlide, niceAxisMax, pageNumberElement, type SlideElement, type TextElement } from "./qbr-layout";

// Client-side .pptx exporter built on pptxgenjs. It is a thin mapper over the
// shared layout IR (compileSlide): every element becomes a NATIVE, editable
// PowerPoint object (addText -> text box, addShape -> shape, addTable -> table,
// addChart -> live chart, addImage -> picture). Because the preview consumes the
// exact same element list, the downloaded deck is positioned identically to what
// the SE sees on screen. Framework-agnostic so it can be reused server-side.

type Slide = {
  addText: (t: unknown, o: unknown) => void;
  addShape: (s: unknown, o: unknown) => void;
  addTable: (rows: unknown, o: unknown) => void;
  addChart: (type: unknown, data: unknown, o: unknown) => void;
  addImage: (o: unknown) => void;
  addNotes: (notes: string) => void;
  background?: unknown;
};

// Fetch an image asset (served from /public) and convert to a base64 data URL so
// pptxgenjs can embed it directly. Runs client-side during export.
async function fetchAsDataUrl(url: string): Promise<string> {
  const abs = typeof window !== "undefined" && url.startsWith("/") ? window.location.origin + url : url;
  const res = await fetch(abs);
  if (!res.ok) throw new Error(`asset ${url} -> ${res.status}`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

function textRuns(el: TextElement) {
  if (el.lines) {
    return el.lines.map((t) => ({
      text: t,
      options: {
        bullet: { code: "2022", indent: 14 },
        breakLine: true,
        color: el.color,
        bold: el.bold,
        italic: el.italic,
        fontFace: el.fontFace,
        fontSize: el.fontSize,
        paraSpaceAfter: 6,
      },
    }));
  }
  return (el.runs ?? []).map((r) => ({
    text: r.text,
    options: {
      color: r.color ?? el.color,
      bold: r.bold ?? el.bold,
      italic: r.italic ?? el.italic,
      fontFace: el.fontFace,
      fontSize: el.fontSize,
    },
  }));
}

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

  // Resolved base64 data URLs for non-data image assets (brand art, logos).
  const assetCache = new Map<string, string>();

  const shapeType = (kind: string) => {
    switch (kind) {
      case "roundRect":
        return SHAPE.roundRect;
      case "ellipse":
        return SHAPE.ellipse;
      case "line":
        return SHAPE.line;
      default:
        return SHAPE.rect;
    }
  };

  const place = (slide: Slide, el: SlideElement) => {
    switch (el.kind) {
      case "shape": {
        if (el.shape === "line") {
          slide.addShape(SHAPE.line, { x: el.x, y: el.y, w: el.w, h: el.h, line: el.line ? { color: el.line.color, width: el.line.width } : undefined });
          return;
        }
        slide.addShape(shapeType(el.shape), {
          x: el.x,
          y: el.y,
          w: el.w,
          h: el.h,
          rectRadius: el.rectRadius,
          fill: el.fill ? { color: el.fill } : { type: "none" },
          line: el.line ? { color: el.line.color, width: el.line.width } : { type: "none" },
        });
        return;
      }
      case "text": {
        slide.addText(textRuns(el), {
          x: el.x,
          y: el.y,
          w: el.w,
          h: el.h,
          align: el.align ?? "left",
          valign: el.valign ?? "top",
          fontFace: el.fontFace,
          fontSize: el.fontSize,
          color: el.color,
          bold: el.bold,
          italic: el.italic,
          charSpacing: el.charSpacing,
        });
        return;
      }
      case "image": {
        const src = el.dataUrl.startsWith("data:") ? el.dataUrl : assetCache.get(el.dataUrl);
        if (!src) return; // asset failed to load; skip rather than crash the export
        slide.addImage({ data: src, x: el.x, y: el.y, w: el.w, h: el.h, sizing: { type: "contain", w: el.w, h: el.h } });
        return;
      }
      case "table": {
        const header = el.header.map((cell) => ({
          text: cell.text,
          options: { bold: cell.bold, color: cell.color, fill: cell.fill ? { color: cell.fill } : undefined, align: cell.align ?? "left", valign: "middle", fontFace: NUTANIX_FONT.body, fontSize: 11 },
        }));
        const body = el.rows.map((row) =>
          row.map((cell) => ({
            text: cell.text,
            options: { bold: cell.bold, color: cell.color, fill: cell.fill ? { color: cell.fill } : undefined, align: cell.align ?? "left", valign: "middle", fontFace: NUTANIX_FONT.body, fontSize: 10 },
          })),
        );
        slide.addTable([header, ...body], {
          x: el.x,
          y: el.y,
          w: el.w,
          h: el.h,
          border: { type: "solid", color: el.borderColor, pt: 0.5 },
          autoPage: false,
          rowH: el.rowH,
        });
        return;
      }
      case "chart": {
        if (el.chart === "bar" && el.barSeries) {
          const data = [{ name: "series", labels: el.barSeries.map((d) => d.label), values: el.barSeries.map((d) => d.value) }];
          const axisMax = niceAxisMax(Math.max(...el.barSeries.map((d) => d.value), el.max ?? 0, 1));
          slide.addChart(CHART.bar, data, {
            x: el.x,
            y: el.y,
            w: el.w,
            h: el.h,
            barDir: "col",
            chartColors: el.colors,
            showValue: true,
            dataLabelColor: NUTANIX.ink,
            dataLabelFontFace: NUTANIX_FONT.body,
            dataLabelFontSize: 11,
            showLegend: false,
            showTitle: false,
            // x-axis (categories)
            catAxisLabelColor: NUTANIX.gray,
            catAxisLabelFontFace: NUTANIX_FONT.body,
            catAxisLabelFontSize: 10,
            catAxisLineColor: NUTANIX.slate,
            // y-axis (values) with even ticks + light gridlines
            showValAxisTitle: false,
            valAxisHidden: false,
            valAxisMinVal: 0,
            valAxisMaxVal: axisMax,
            valAxisMajorUnit: axisMax / 4,
            valAxisLabelColor: NUTANIX.gray,
            valAxisLabelFontFace: NUTANIX_FONT.body,
            valAxisLabelFontSize: 10,
            valAxisLineShow: false,
            valGridLine: { color: NUTANIX.line, style: "solid", size: 1 },
            barGapWidthPct: 60,
          });
        } else if (el.chart === "line" && el.lineSeries) {
          const labels = el.xLabels ?? el.lineSeries[0]?.points.map((_, idx) => String(idx + 1)) ?? [];
          const data = el.lineSeries.map((ser) => ({ name: ser.label, labels, values: ser.points }));
          const axisMax = niceAxisMax(Math.max(...el.lineSeries.flatMap((s) => s.points), 1));
          slide.addChart(CHART.line, data, {
            x: el.x,
            y: el.y,
            w: el.w,
            h: el.h,
            chartColors: el.colors,
            lineSize: 3,
            lineSmooth: true,
            showLegend: Boolean(el.showLegend),
            legendPos: "b",
            legendColor: NUTANIX.gray,
            showTitle: false,
            // x-axis (categories)
            catAxisLabelColor: NUTANIX.gray,
            catAxisLabelFontFace: NUTANIX_FONT.body,
            catAxisLabelFontSize: 10,
            catAxisLineColor: NUTANIX.slate,
            // y-axis (values) with even ticks + light gridlines
            valAxisHidden: false,
            valAxisMinVal: 0,
            valAxisMaxVal: axisMax,
            valAxisMajorUnit: axisMax / 4,
            valAxisLabelColor: NUTANIX.gray,
            valAxisLabelFontFace: NUTANIX_FONT.body,
            valAxisLabelFontSize: 10,
            valAxisLineShow: false,
            valGridLine: { color: NUTANIX.line, style: "solid", size: 1 },
          });
        }
        return;
      }
    }
  };

  // Compile once, then prefetch every non-data image asset (brand backgrounds,
  // Nutanix logo/mark) to a base64 data URL so they embed reliably in the .pptx.
  const compiledAll = slides.map((s) => compileSlide(s, meta, logoDataUrl));
  const assetPaths = new Set<string>();
  for (const c of compiledAll) {
    if (c.backgroundImage && !c.backgroundImage.startsWith("data:")) assetPaths.add(c.backgroundImage);
    for (const el of c.elements) {
      if (el.kind === "image" && !el.dataUrl.startsWith("data:")) assetPaths.add(el.dataUrl);
    }
  }
  for (const p of assetPaths) {
    try {
      assetCache.set(p, await fetchAsDataUrl(p));
    } catch {
      // leave uncached; image elements/backgrounds resolve to nothing and are skipped
    }
  }

  compiledAll.forEach((compiled, i) => {
    const s = slides[i];
    const slide = pptx.addSlide() as unknown as Slide;
    const bgData = compiled.backgroundImage
      ? compiled.backgroundImage.startsWith("data:")
        ? compiled.backgroundImage
        : assetCache.get(compiled.backgroundImage)
      : undefined;
    if (bgData) slide.background = { data: bgData };
    else if (compiled.background) slide.background = { color: compiled.background };

    compiled.elements.forEach((el) => place(slide, el));

    // page number (cover slides omit it)
    if (s.content.type !== "title" && s.content.type !== "closing") {
      place(slide, pageNumberElement(i + 1));
    }

    // native PowerPoint speaker notes
    if (s.speakerNotes) slide.addNotes(s.speakerNotes);
  });

  await pptx.writeFile({ fileName: `QBR - ${meta.customer}.pptx` });
}
