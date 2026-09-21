import { HEALTH, NUTANIX, NUTANIX_FONT } from "./nutanix-brand";
import {
  basePlatformLabel,
  capacityRows,
  cpuSummary,
  formatPct,
  hardwareRollup,
  memorySummary,
  nodeCores,
  nodeRawStorageTB,
  optionComparison,
  proposalHelpers,
  purchasedProducts,
  recommendedOption,
  storageSummary,
  type HardwareOption,
  type ProposalDoc,
} from "./proposal-doc";
import type { ProposalCluster, ProposalScenario } from "./sizer-import";
import { LICENSE_CATALOG } from "./license-catalog";
import { drivesPerNode, emptyDriveSlots, platformSpecFor } from "./hardware-images";
import type { ProductKey } from "./nutanix-icons";
import { allLicensingPages, licensingPagesFor, type ProductLicensing } from "./product-editions";
import type { Cell } from "./nci-editions";
import { IMPLEMENTATION_ADDON_NOTE, IMPLEMENTATION_PLAN, SUPPORT_PROGRAMS } from "./nci-editions";

// An image plus its intrinsic pixel dimensions, so the exporter can place it at
// the correct aspect ratio (no stretching / squashing) regardless of the box.
export type ImgAsset = { data: string; w: number; h: number };

export type ProposalBrandImages = {
  productIcons?: Partial<Record<ProductKey, ImgAsset>>; // purchased-product icons
  coverBg?: ImgAsset; // Nutanix brand-template title background (16:9)
  sectionBg?: ImgAsset; // brand-template section-divider background (16:9)
  wordmarkWhite?: ImgAsset; // white NUTANIX wordmark (for dark covers)
  markBlack?: ImgAsset; // black Nutanix "X" mark (for light content slides)
  pureLogo?: ImgAsset; // external-storage partner (Pure Storage) logo
};

// Client-side .pptx exporter for the proposal deck, built on pptxgenjs in the
// official Nutanix brand style (16:9, Montserrat, brand palette).
//
// Layout rules this file holds itself to:
//   * Every stacked block derives its y from a declared row pitch, and every
//     row's content height is provably shorter than that pitch. Nothing is
//     eyeballed, so no two text boxes can collide.
//   * Filled containers are used only where elevation means something. Grouping
//     is done with hairline rules and negative space instead of boxing
//     everything in rounded cards.
//   * Purple is the single accent. Coral appears only to flag a genuine
//     exception (a resource sized past 100%).

const { fmtInt, tib } = proposalHelpers;

const PAGE_W = 13.333;
const PAGE_H = 7.5;
const MARGIN = 0.68;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Vertical anchors shared by every content slide.
const RULE_Y = 1.62; // hairline under the slide title
const BODY_TOP = 1.86; // first line of slide content
const BODY_BOTTOM = 6.74; // last pixel content may occupy, above the footer
const BODY_H = BODY_BOTTOM - BODY_TOP;

// Neutral fills. Kept deliberately close to white so tinted blocks read as a
// change in paper rather than as a coloured card.
const TINT = "F7F5FE"; // faintest purple wash, for selected rows / zebra striping
const TRACK = "ECEAF4"; // utilization bar track

// Cluster capacity block. This is the part of the deck most likely to be read
// closely, so its geometry is declared rather than eyeballed. Each row stacks:
//   label 0.22  |  value + percentage 0.40  |  bar 0.10  |  detail 0.20
// which is 1.02in at its tallest, inside a 1.18in pitch. That 0.16in clearance
// is what guarantees no bar or caption can reach the row beneath it.
const CAP_ROW_PITCH = 1.18;
const CAP_LABEL_H = 0.22;
const CAP_VALUE_H = 0.4;
const CAP_BAR_OFFSET = 0.7; // from row top
const CAP_DETAIL_OFFSET = 0.84;

// Capability matrices are paginated by hand rather than by pptxgenjs autoPage,
// which spills overflow onto a bare slide with no title, rule or page number.
// 17 rows at 0.24in plus the header fit the body area with room for a wrap.
const MATRIX_ROWS_PER_PAGE = 17;

type Slide = {
  addText: (t: unknown, o: unknown) => void;
  addShape: (s: unknown, o: unknown) => void;
  addTable: (rows: unknown, o: unknown) => void;
  addImage: (o: unknown) => void;
  background?: unknown;
};

export async function exportProposalToPptx(
  doc: ProposalDoc,
  logo: ImgAsset | null,
  nodeImages: Record<string, ImgAsset>,
  brand: ProposalBrandImages = {},
  nodeRearImages: Record<string, ImgAsset> = {},
): Promise<void> {
  const mod = await import("pptxgenjs");
  const PptxGenJS = mod.default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Nutanix SE Workspace";
  pptx.company = "Nutanix";
  pptx.title = `Solution Proposal for ${doc.meta.customer}`;

  const SHAPE = pptx.ShapeType;

  // Options always exist for documents built by buildProposalDoc; fall back to a
  // synthetic single option so an older saved doc still exports.
  const options: HardwareOption[] =
    doc.hardwareOptions?.length > 0
      ? doc.hardwareOptions
      : [
          {
            id: "hw_legacy",
            label: "Option A",
            name: `${doc.meta.vendor} platform`,
            vendor: doc.meta.vendor,
            sourceFile: null,
            recommended: true,
            scenario: doc.scenario,
          },
        ];
  const multiOption = options.length > 1;
  const recommended = recommendedOption(doc) ?? options[0];

  // --- primitives ------------------------------------------------------------

  type Box = { x: number; y: number; w: number; h: number };

  // Place an image contained within a box at its true aspect ratio (never
  // stretched). Aligns within the leftover space of the box.
  const placeImage = (
    slide: Slide,
    img: ImgAsset | null | undefined,
    box: Box,
    halign: "left" | "center" | "right" = "center",
    valign: "top" | "middle" | "bottom" = "middle",
  ) => {
    if (!img || !img.w || !img.h) return;
    const ar = img.w / img.h;
    let w = box.w;
    let h = w / ar;
    if (h > box.h) {
      h = box.h;
      w = h * ar;
    }
    const x = halign === "left" ? box.x : halign === "right" ? box.x + box.w - w : box.x + (box.w - w) / 2;
    const y = valign === "top" ? box.y : valign === "bottom" ? box.y + box.h - h : box.y + (box.h - h) / 2;
    slide.addImage({ data: img.data, x, y, w, h });
  };

  const hairline = (slide: Slide, x: number, y: number, w: number, color: string = NUTANIX.line) =>
    slide.addShape(SHAPE.line, { x, y, w, h: 0, line: { color, width: 0.75 } });

  // Small uppercase kicker in the accent colour. Used instead of coloured bars
  // and filled headers to introduce a block.
  const eyebrow = (slide: Slide, text: string, x: number, y: number, w: number, color: string = NUTANIX.purple) =>
    slide.addText(text.toUpperCase(), {
      x,
      y,
      w,
      h: 0.24,
      fontFace: NUTANIX_FONT.heading,
      fontSize: 9,
      bold: true,
      color,
      charSpacing: 2,
      valign: "middle",
    });

  let page = 0;
  const newSlide = () => {
    page += 1;
    return pptx.addSlide() as unknown as Slide;
  };

  // Standard content-slide chrome: kicker, title, optional subtitle, brand mark,
  // hairline, and footer. No filled header band — the rule carries the structure.
  const addChrome = (slide: Slide, kicker: string, title: string, subtitle?: string) => {
    eyebrow(slide, kicker, MARGIN, 0.46, 7.5);
    slide.addText(title, {
      x: MARGIN,
      y: 0.72,
      w: 9.6,
      h: 0.52,
      fontFace: NUTANIX_FONT.heading,
      fontSize: 25,
      bold: true,
      color: NUTANIX.ink,
      valign: "middle",
    });
    if (subtitle) {
      slide.addText(subtitle, {
        x: MARGIN,
        y: 1.26,
        w: 9.6,
        h: 0.28,
        fontFace: NUTANIX_FONT.body,
        fontSize: 11,
        color: NUTANIX.slate,
        valign: "middle",
      });
    }
    placeImage(slide, brand.markBlack, { x: PAGE_W - MARGIN - 0.56, y: 0.52, w: 0.56, h: 0.46 }, "right", "middle");
    hairline(slide, MARGIN, RULE_Y, CONTENT_W);
    slide.addText(`Nutanix Confidential  ·  ${doc.meta.customer}`, {
      x: MARGIN,
      y: PAGE_H - 0.44,
      w: 8,
      h: 0.26,
      fontFace: NUTANIX_FONT.body,
      fontSize: 8,
      color: NUTANIX.slate,
      valign: "middle",
    });
    slide.addText(String(page), {
      x: PAGE_W - MARGIN - 0.6,
      y: PAGE_H - 0.44,
      w: 0.6,
      h: 0.26,
      align: "right",
      fontFace: NUTANIX_FONT.body,
      fontSize: 8,
      color: NUTANIX.slate,
      valign: "middle",
    });
  };

  // Full-bleed divider that breaks the deck into readable parts.
  const addDivider = (kicker: string, title: string, blurb?: string) => {
    const slide = newSlide();
    slide.background = { color: NUTANIX.deepPurple };
    if (brand.sectionBg) slide.addImage({ data: brand.sectionBg.data, x: 0, y: 0, w: PAGE_W, h: PAGE_H });
    else if (brand.coverBg) slide.addImage({ data: brand.coverBg.data, x: 0, y: 0, w: PAGE_W, h: PAGE_H });

    // Left-weighted composition: the title sits on the first third, never centred.
    slide.addText(kicker.toUpperCase(), {
      x: 1.0,
      y: 3.06,
      w: 8,
      h: 0.28,
      fontFace: NUTANIX_FONT.body,
      fontSize: 11,
      color: NUTANIX.cyan,
      charSpacing: 3,
      valign: "middle",
    });
    slide.addText(title, {
      x: 1.0,
      y: 3.42,
      w: 9.4,
      h: 0.92,
      fontFace: NUTANIX_FONT.display,
      fontSize: 40,
      color: "FFFFFF",
      valign: "middle",
    });
    slide.addShape(SHAPE.rect, { x: 1.0, y: 4.46, w: 1.5, h: 0.035, fill: { color: NUTANIX.cyan }, line: { type: "none" } });
    if (blurb) {
      slide.addText(blurb, {
        x: 1.0,
        y: 4.7,
        w: 7.6,
        h: 0.7,
        fontFace: NUTANIX_FONT.body,
        fontSize: 13,
        color: "D8CCFF",
        lineSpacingMultiple: 1.2,
        valign: "top",
      });
    }
  };

  // A horizontal strip of figures separated by hairlines rather than boxed into
  // cards. Numbers lead with weight; purple stays on the rule above them.
  const addMetricBand = (slide: Slide, y: number, metrics: { v: string; l: string }[]) => {
    if (!metrics.length) return;
    const colW = CONTENT_W / metrics.length;
    slide.addShape(SHAPE.rect, { x: MARGIN, y, w: CONTENT_W, h: 0.03, fill: { color: NUTANIX.purple }, line: { type: "none" } });
    metrics.forEach((m, i) => {
      const x = MARGIN + i * colW;
      if (i > 0) {
        slide.addShape(SHAPE.line, { x, y: y + 0.18, w: 0, h: 1.0, line: { color: NUTANIX.line, width: 0.75 } });
      }
      slide.addText(m.v, {
        x: x + 0.22,
        y: y + 0.24,
        w: colW - 0.44,
        h: 0.52,
        fontFace: NUTANIX_FONT.heading,
        fontSize: 24,
        bold: true,
        color: NUTANIX.ink,
        valign: "middle",
      });
      slide.addText(m.l.toUpperCase(), {
        x: x + 0.22,
        y: y + 0.8,
        w: colW - 0.44,
        h: 0.26,
        fontFace: NUTANIX_FONT.body,
        fontSize: 8.5,
        color: NUTANIX.slate,
        charSpacing: 1.4,
        valign: "middle",
      });
    });
  };

  // A utilization gauge. Square ends keep the geometry honest at small fills —
  // a rounded cap on a 2%-wide bar reads as a blob and overstates the value.
  const addUtilizationBar = (slide: Slide, x: number, y: number, w: number, pct: number) => {
    const H = 0.1;
    slide.addShape(SHAPE.rect, { x, y, w, h: H, fill: { color: TRACK }, line: { type: "none" } });
    const over = pct > 100;
    const fillW = (Math.min(Math.max(pct, 0), 100) / 100) * w;
    // A zero-width shape is skipped outright rather than drawn as a sliver.
    if (fillW <= 0.005) return;
    slide.addShape(SHAPE.rect, {
      x,
      y,
      w: fillW,
      h: H,
      fill: { color: over ? NUTANIX.coral : NUTANIX.purple },
      line: { type: "none" },
    });
  };

  const tableHeader = (labels: string[], aligns: ("left" | "right" | "center")[] = []) =>
    labels.map((h, ci) => ({
      text: h,
      options: {
        bold: true,
        color: NUTANIX.ink,
        fill: { color: "FFFFFF" },
        fontFace: NUTANIX_FONT.body,
        fontSize: 10,
        align: aligns[ci] ?? (ci === 0 ? "left" : "left"),
        valign: "middle",
        border: [
          { type: "none" },
          { type: "none" },
          { type: "solid", color: NUTANIX.purple, pt: 1.25 },
          { type: "none" },
        ],
      },
    }));

  // --- 1. Cover --------------------------------------------------------------
  {
    const slide = newSlide();
    slide.background = { color: NUTANIX.deepPurple };
    if (brand.coverBg) {
      slide.addImage({ data: brand.coverBg.data, x: 0, y: 0, w: PAGE_W, h: PAGE_H });
    } else {
      slide.addShape(SHAPE.rect, { x: 0, y: 0, w: PAGE_W, h: PAGE_H, fill: { color: NUTANIX.deepPurple }, line: { type: "none" } });
    }
    placeImage(slide, brand.wordmarkWhite, { x: 1.0, y: 0.7, w: 3.4, h: 0.5 }, "left", "middle");
    placeImage(slide, logo, { x: PAGE_W - 1.0 - 3.0, y: 0.62, w: 3.0, h: 0.7 }, "right", "middle");

    slide.addText(doc.options?.externalStorage ? "STORAGE PROPOSAL" : "SOLUTION PROPOSAL", {
      x: 1.0,
      y: 2.62,
      w: 11,
      h: 0.34,
      fontFace: NUTANIX_FONT.body,
      fontSize: 13,
      color: NUTANIX.cyan,
      charSpacing: 3.4,
      valign: "middle",
    });
    slide.addText(doc.meta.customer, {
      x: 1.0,
      y: 3.04,
      w: 11.3,
      h: 1.16,
      fontFace: NUTANIX_FONT.heading,
      fontSize: 42,
      bold: true,
      color: "FFFFFF",
      valign: "middle",
    });
    slide.addShape(SHAPE.rect, { x: 1.0, y: 4.32, w: 1.5, h: 0.035, fill: { color: NUTANIX.cyan }, line: { type: "none" } });
    slide.addText(`${doc.meta.opportunityName ? doc.meta.opportunityName + "  ·  " : ""}${doc.meta.dateLabel}`, {
      x: 1.0,
      y: 4.54,
      w: 11,
      h: 0.32,
      fontFace: NUTANIX_FONT.body,
      fontSize: 13,
      color: "D8CCFF",
      valign: "middle",
    });
    const contactLines = doc.contacts
      .filter((c) => c.name || c.email)
      .map((c) => `${c.name}${c.title ? ", " + c.title : ""}${c.email ? "  ·  " + c.email : ""}${c.phone ? "  ·  " + c.phone : ""}`);
    slide.addText(contactLines.join("\n") || `Prepared by ${doc.meta.preparedBy}`, {
      x: 1.0,
      y: 5.12,
      w: 11,
      h: 1.1,
      fontFace: NUTANIX_FONT.body,
      fontSize: 12,
      color: "B9A7F2",
      lineSpacingMultiple: 1.24,
      valign: "top",
    });
  }

  // --- 2. Executive summary --------------------------------------------------
  {
    const slide = newSlide();
    addChrome(slide, "Overview", "Executive Summary", doc.meta.opportunityName ?? undefined);

    // Asymmetric: narrative on a comfortable measure at the left, the design's
    // defining choice pulled out on the right.
    slide.addText(doc.executiveSummary, {
      x: MARGIN,
      y: BODY_TOP,
      w: 7.7,
      h: 2.2,
      fontFace: NUTANIX_FONT.body,
      fontSize: 13.5,
      color: NUTANIX.ink,
      lineSpacingMultiple: 1.3,
      valign: "top",
    });

    const asideX = MARGIN + 8.3;
    const asideW = CONTENT_W - 8.3;
    slide.addShape(SHAPE.rect, { x: asideX, y: BODY_TOP, w: 0.035, h: 2.0, fill: { color: NUTANIX.purple }, line: { type: "none" } });
    eyebrow(slide, "Licensed as", asideX + 0.24, BODY_TOP, asideW - 0.24);
    slide.addText(basePlatformLabel(doc), {
      x: asideX + 0.24,
      y: BODY_TOP + 0.3,
      w: asideW - 0.24,
      h: 0.46,
      fontFace: NUTANIX_FONT.heading,
      fontSize: 20,
      bold: true,
      color: NUTANIX.ink,
      valign: "middle",
    });
    slide.addText(
      `${doc.licensing.termYears}-year subscription term  ·  ${doc.meta.supportTerm}`,
      {
        x: asideX + 0.24,
        y: BODY_TOP + 0.8,
        w: asideW - 0.24,
        h: 0.5,
        fontFace: NUTANIX_FONT.body,
        fontSize: 11,
        color: NUTANIX.gray,
        lineSpacingMultiple: 1.2,
        valign: "top",
      },
    );
    if (multiOption) {
      slide.addText(`${options.length} hardware options proposed; ${recommended.label} recommended.`, {
        x: asideX + 0.24,
        y: BODY_TOP + 1.36,
        w: asideW - 0.24,
        h: 0.6,
        fontFace: NUTANIX_FONT.body,
        fontSize: 10.5,
        italic: true,
        color: NUTANIX.slate,
        lineSpacingMultiple: 1.2,
        valign: "top",
      });
    }

    const t = recommended.scenario.totals;
    addMetricBand(slide, 4.66, [
      { v: fmtInt(t.nodes), l: "Total nodes" },
      { v: fmtInt(t.cores), l: "CPU cores" },
      { v: `${fmtInt(t.ramGiB)} GB`, l: "Memory" },
      { v: tib(t.ssdTiB + t.hddTiB), l: "Usable storage" },
      { v: fmtInt(t.clusters), l: "Clusters" },
    ]);
    slide.addText(
      multiOption
        ? `Figures describe ${recommended.label} — ${recommended.name}.`
        : `Figures describe the proposed ${recommended.name} build.`,
      {
        x: MARGIN,
        y: 5.94,
        w: CONTENT_W,
        h: 0.28,
        fontFace: NUTANIX_FONT.body,
        fontSize: 9.5,
        color: NUTANIX.slate,
        valign: "middle",
      },
    );
  }

  // --- 3. The design ---------------------------------------------------------
  addDivider(
    "Part one",
    "The proposed design",
    multiOption
      ? `${options.length} hardware builds sized against the same workload, cluster by cluster.`
      : "Cluster topology, capacity and headroom for the sized workload.",
  );

  if (multiOption) addOptionComparison();

  for (const option of options) {
    addSolutionSummary(option);
    for (const cluster of option.scenario.clusters) addClusterSlide(option, cluster);
  }

  // --- option comparison -----------------------------------------------------
  function addOptionComparison() {
    const slide = newSlide();
    addChrome(
      slide,
      "Hardware",
      "Hardware Options",
      `${options.length} builds for the same workload — ${recommended.label} is recommended`,
    );

    const metrics = optionComparison(doc);
    const labelW = 2.5;
    const colW = (CONTENT_W - labelW) / options.length;

    // Column headers carry the option identity; the recommendation is marked by
    // a purple rule and tinted column rather than a loud filled block.
    options.forEach((o, i) => {
      const x = MARGIN + labelW + i * colW;
      if (o.recommended) {
        slide.addShape(SHAPE.rect, { x, y: BODY_TOP, w: colW, h: BODY_BOTTOM - BODY_TOP - 0.3, fill: { color: TINT }, line: { type: "none" } });
      }
      slide.addShape(SHAPE.rect, {
        x: x + 0.14,
        y: BODY_TOP + 0.08,
        w: colW - 0.28,
        h: 0.03,
        fill: { color: o.recommended ? NUTANIX.purple : NUTANIX.line },
        line: { type: "none" },
      });
      slide.addText(o.label, {
        x: x + 0.14,
        y: BODY_TOP + 0.18,
        w: colW - 0.28,
        h: 0.34,
        fontFace: NUTANIX_FONT.heading,
        fontSize: 15,
        bold: true,
        color: o.recommended ? NUTANIX.purple : NUTANIX.ink,
        valign: "middle",
      });
      slide.addText(o.recommended ? "Recommended" : o.vendor, {
        x: x + 0.14,
        y: BODY_TOP + 0.54,
        w: colW - 0.28,
        h: 0.26,
        fontFace: NUTANIX_FONT.body,
        fontSize: 9,
        bold: o.recommended,
        color: o.recommended ? NUTANIX.purple : NUTANIX.slate,
        charSpacing: 1.2,
        valign: "middle",
      });
    });

    // Declared pitch, content proven shorter: rows hold 10.5pt text in a 0.34in
    // box inside a 0.52in pitch, so adjacent rows cannot touch.
    const ROWS_TOP = BODY_TOP + 0.96;
    const PITCH = Math.min(0.52, (BODY_BOTTOM - 0.34 - ROWS_TOP) / metrics.length);
    metrics.forEach((m, ri) => {
      const y = ROWS_TOP + ri * PITCH;
      hairline(slide, MARGIN, y, CONTENT_W, NUTANIX.line);
      slide.addText(m.label, {
        x: MARGIN,
        y: y + 0.06,
        w: labelW - 0.2,
        h: PITCH - 0.12,
        fontFace: NUTANIX_FONT.body,
        fontSize: 10,
        color: NUTANIX.gray,
        valign: "middle",
      });
      m.values.forEach((v, ci) => {
        const o = options[ci];
        slide.addText(v, {
          x: MARGIN + labelW + ci * colW + 0.14,
          y: y + 0.06,
          w: colW - 0.28,
          h: PITCH - 0.12,
          fontFace: NUTANIX_FONT.body,
          fontSize: 10.5,
          bold: o?.recommended,
          color: o?.recommended ? NUTANIX.ink : NUTANIX.gray,
          valign: "middle",
        });
      });
    });
    hairline(slide, MARGIN, ROWS_TOP + metrics.length * PITCH, CONTENT_W);
  }

  // --- per-option solution summary ------------------------------------------
  function addSolutionSummary(option: HardwareOption) {
    const slide = newSlide();
    const subtitle = doc.options?.externalStorage
      ? `${option.name}  ·  External storage: ${doc.options.externalStorageVendor}`
      : `${option.name}  ·  ${doc.meta.supportTerm}`;
    addChrome(
      slide,
      multiOption ? `${option.label}${option.recommended ? " · Recommended" : ""}` : "Solution",
      "Nutanix Solution Summary",
      subtitle,
    );

    const rollup = hardwareRollup(option.scenario);
    const header = tableHeader(
      ["Hardware", "Nodes", "CPU", "Cores", "RAM (GB)", "Raw Storage (TB)"],
      ["left", "right", "left", "right", "right", "right"],
    );
    const aligns: ("left" | "right")[] = ["left", "right", "left", "right", "right", "right"];
    const body = rollup.map((r, ri) =>
      [r.sku, String(r.nodes), r.cpuSummary, fmtInt(r.cores), fmtInt(r.ramGiB), r.rawStorageTB.toFixed(1)].map((c, ci) => ({
        text: c,
        options: {
          color: ci === 0 ? NUTANIX.ink : NUTANIX.gray,
          fill: { color: ri % 2 ? TINT : "FFFFFF" },
          fontFace: NUTANIX_FONT.body,
          fontSize: 10.5,
          bold: ci === 0,
          align: aligns[ci],
          valign: "middle",
        },
      })),
    );
    slide.addTable([header, ...body], {
      x: MARGIN,
      y: BODY_TOP,
      w: CONTENT_W,
      colW: [3.0, 0.95, 3.85, 1.15, 1.35, 1.67],
      border: { type: "solid", color: "FFFFFF", pt: 0 },
      rowH: 0.46,
      autoPage: false,
    });

    const t = option.scenario.totals;
    addMetricBand(slide, 4.9, [
      { v: fmtInt(t.clusters), l: "Clusters" },
      { v: fmtInt(t.nodes), l: "Nodes" },
      { v: fmtInt(t.cores), l: "CPU cores" },
      { v: `${fmtInt(t.ramGiB)} GB`, l: "Memory" },
      { v: tib(t.ssdTiB + t.hddTiB), l: "Usable storage" },
    ]);

    if (doc.options?.externalStorage) {
      if (doc.options.externalStorageVendor === "Pure Storage" && brand.pureLogo) {
        slide.addText("Primary storage delivered by", {
          x: MARGIN,
          y: 6.24,
          w: 2.6,
          h: 0.36,
          fontFace: NUTANIX_FONT.body,
          fontSize: 10,
          color: NUTANIX.slate,
          valign: "middle",
        });
        placeImage(slide, brand.pureLogo, { x: MARGIN + 2.7, y: 6.2, w: 2.2, h: 0.44 }, "left", "middle");
      } else {
        slide.addText(`Primary storage delivered by an external ${doc.options.externalStorageVendor} array over NVMe/TCP.`, {
          x: MARGIN,
          y: 6.24,
          w: CONTENT_W,
          h: 0.36,
          fontFace: NUTANIX_FONT.body,
          fontSize: 10,
          italic: true,
          color: NUTANIX.slate,
          valign: "middle",
        });
      }
    }
  }

  // --- per-cluster slide -----------------------------------------------------
  function addClusterSlide(option: HardwareOption, cluster: ProposalCluster) {
    const slide = newSlide();
    // The kicker already carries the option identity, so the subtitle stays on
    // what is specific to this cluster.
    const kicker = multiOption ? `${option.label} · Cluster` : "Cluster";
    const subtitleParts = [
      cluster.solutionType,
      `${cluster.nodes} ${cluster.nodes === 1 ? "node" : "nodes"}`,
      [...new Set(cluster.models.map((m) => m.sku))].join(" + "),
    ].filter(Boolean);
    addChrome(slide, kicker, cluster.name, subtitleParts.join("  ·  "));

    const colGap = 0.52;
    const colW = (CONTENT_W - colGap) / 2;
    const rx = MARGIN + colW + colGap;

    // Left — capacity and utilization.
    eyebrow(slide, "Cluster capacity", MARGIN, BODY_TOP, colW);
    hairline(slide, MARGIN, BODY_TOP + 0.3, colW, NUTANIX.mist);

    const rowsTop = BODY_TOP + 0.44;
    capacityRows(cluster).forEach((row, i) => {
      const y = rowsTop + i * CAP_ROW_PITCH;

      slide.addText(row.label, {
        x: MARGIN,
        y,
        w: colW,
        h: CAP_LABEL_H,
        fontFace: NUTANIX_FONT.body,
        fontSize: 10,
        color: NUTANIX.slate,
        valign: "middle",
      });

      // Value and percentage share one line: the figure reads left, how much of
      // it is consumed reads right, and the bar below spans the same measure.
      slide.addText(row.value, {
        x: MARGIN,
        y: y + CAP_LABEL_H,
        w: colW * 0.6,
        h: CAP_VALUE_H,
        fontFace: NUTANIX_FONT.heading,
        fontSize: 19,
        bold: true,
        color: NUTANIX.ink,
        valign: "middle",
      });
      if (row.pctLabel) {
        const over = (row.pct ?? 0) > 100;
        slide.addText(`${row.pctLabel} utilized`, {
          x: MARGIN + colW * 0.6,
          y: y + CAP_LABEL_H,
          w: colW * 0.4,
          h: CAP_VALUE_H,
          align: "right",
          fontFace: NUTANIX_FONT.body,
          fontSize: 11,
          bold: over,
          // Coral is legible as a bar but not as body text, so an over-subscribed
          // figure is called out in the deeper alert tone instead.
          color: over ? HEALTH.bad : NUTANIX.gray,
          valign: "middle",
        });
        addUtilizationBar(slide, MARGIN, y + CAP_BAR_OFFSET, colW, row.pct as number);
      }

      if (row.detail) {
        slide.addText(row.detail, {
          x: MARGIN,
          y: y + CAP_DETAIL_OFFSET,
          w: colW,
          h: 0.2,
          fontFace: NUTANIX_FONT.body,
          fontSize: 8.5,
          color: NUTANIX.slate,
          valign: "middle",
        });
      }

      // Divider sits inside the pitch clearance, never against the next label.
      if (i < 2) hairline(slide, MARGIN, y + CAP_ROW_PITCH - 0.1, colW, NUTANIX.mist);
    });

    if (cluster.failover.nMinus1 != null) {
      const n2 = cluster.failover.nMinus2;
      slide.addText(
        `Resiliency: ${formatPct(cluster.failover.nMinus1)}% utilized at N-1${n2 != null ? `  ·  ${formatPct(n2)}% at N-2` : ""}`,
        {
          x: MARGIN,
          y: rowsTop + 3 * CAP_ROW_PITCH + 0.06,
          w: colW,
          h: 0.3,
          fontFace: NUTANIX_FONT.body,
          fontSize: 10,
          italic: true,
          color: NUTANIX.slate,
          valign: "middle",
        },
      );
    }

    // Right — the node models that make up the cluster. Pitch adapts to the
    // model count so a four-model cluster cannot run off the bottom.
    eyebrow(slide, "Recommended hardware", rx, BODY_TOP, colW);
    hairline(slide, rx, BODY_TOP + 0.3, colW, NUTANIX.mist);

    const modelsTop = BODY_TOP + 0.44;
    const modelsBottom = BODY_BOTTOM - 0.34; // reserve the license footnote line
    const count = Math.max(1, cluster.models.length);
    const pitch = Math.min(1.34, (modelsBottom - modelsTop) / count);
    const specFont = pitch < 1.0 ? 8.5 : 9.5;

    cluster.models.forEach((m, i) => {
      const y = modelsTop + i * pitch;
      slide.addText(`${m.nodes}× ${m.sku}`, {
        x: rx,
        y,
        w: colW,
        h: 0.32,
        fontFace: NUTANIX_FONT.heading,
        fontSize: 14,
        bold: true,
        color: NUTANIX.ink,
        valign: "middle",
      });
      const specs = [`CPU  ${cpuSummary(m)}`, `Memory  ${memorySummary(m)}`, `Storage  ${storageSummary(m)}`];
      slide.addText(
        specs.map((s) => ({
          text: s,
          options: {
            fontSize: specFont,
            color: NUTANIX.gray,
            fontFace: NUTANIX_FONT.body,
            breakLine: true,
            paraSpaceAfter: 3,
          },
        })),
        { x: rx, y: y + 0.32, w: colW, h: pitch - 0.42, valign: "top" },
      );
      if (i < count - 1) hairline(slide, rx, y + pitch - 0.08, colW, NUTANIX.mist);
    });

    if (cluster.license) {
      const parts = [
        `NCI ${cluster.license.edition}`,
        cluster.license.cores ? `${fmtInt(cluster.license.cores)} cores` : null,
        cluster.license.termMonths ? `${cluster.license.termMonths} months` : null,
      ].filter(Boolean);
      slide.addText(`Licensed: ${parts.join("  ·  ")}`, {
        x: rx,
        y: BODY_BOTTOM - 0.3,
        w: colW,
        h: 0.3,
        fontFace: NUTANIX_FONT.body,
        fontSize: 10,
        italic: true,
        color: NUTANIX.slate,
        valign: "middle",
      });
    }
  }

  // --- 4. Platform -----------------------------------------------------------
  addDivider("Part two", "The platform", "Node specifications and the components that make up each build.");

  // Node spec sheets — unique SKUs across every proposed option.
  const seen = new Set<string>();
  for (const option of options) {
    for (const cluster of option.scenario.clusters) {
      for (const m of cluster.models) {
        if (seen.has(m.sku)) continue;
        seen.add(m.sku);
        addNodeSpecSlide(option, m);
      }
    }
  }

  function addNodeSpecSlide(option: HardwareOption, m: ProposalCluster["models"][number]) {
    const slide = newSlide();
    const plat = platformSpecFor(m.sku);
    const genLabel = plat ? `${plat.family}  ·  ${plat.generation}  ·  ${plat.formFactor}` : "Configure-to-order platform specification";
    addChrome(slide, multiOption ? `${option.label} · Node` : "Node", m.sku, genLabel);

    const frontImg = nodeImages[m.sku];
    const rearImg = nodeRearImages[m.sku];
    const hasImg = Boolean(frontImg || rearImg);

    const used = drivesPerNode(m.drives);
    const empty = emptyDriveSlots(m.sku, m.drives);
    const bays = plat?.maxDriveBays ?? null;

    // The spec table always keeps to the left column. Letting it span the full
    // width when no render exists would put it underneath the platform
    // reference block, which lives in the right column either way.
    const specW = 6.5;
    const specs: [string, string][] = [
      ["Server Compute", cpuSummary(m)],
      ["Memory", memorySummary(m)],
      ["Storage Capacity", storageSummary(m)],
      ["Network", m.nic ?? "N/A"],
      ["Nodes / Block", String(m.nodesInBlock)],
      ["Cores / Node", String(nodeCores(m) || "N/A")],
      ["Raw Storage / Node", `${nodeRawStorageTB(m).toFixed(2)} TB`],
    ];
    if (bays != null) specs.push(["Drive Bays", `${used} of ${bays} populated${empty != null ? `  ·  ${empty} empty` : ""}`]);
    if (m.gpu) specs.push(["GPU", m.gpu]);

    const header = tableHeader(["Specification", "Detail"]);
    const body = specs.map((row, ri) =>
      row.map((c, ci) => ({
        text: c,
        options: {
          color: ci === 0 ? NUTANIX.ink : NUTANIX.gray,
          fill: { color: ri % 2 ? TINT : "FFFFFF" },
          fontFace: NUTANIX_FONT.body,
          fontSize: 10,
          bold: ci === 0,
          valign: "middle",
        },
      })),
    );
    slide.addTable([header, ...body], {
      x: MARGIN,
      y: BODY_TOP,
      w: specW,
      colW: [2.15, specW - 2.15],
      border: { type: "solid", color: "FFFFFF", pt: 0 },
      rowH: 0.42,
      autoPage: false,
    });

    const rx = MARGIN + 6.9;
    const rw = CONTENT_W - 6.9;
    let refTop = BODY_TOP;
    if (hasImg) {
      eyebrow(slide, "Product diagram", rx, BODY_TOP, rw);
      let iy = BODY_TOP + 0.34;
      if (frontImg) {
        slide.addText("Front", { x: rx, y: iy, w: rw, h: 0.2, fontFace: NUTANIX_FONT.body, fontSize: 8.5, color: NUTANIX.slate, valign: "middle" });
        placeImage(slide, frontImg, { x: rx, y: iy + 0.22, w: rw, h: 0.95 }, "center", "middle");
        iy += 1.24;
      }
      if (rearImg) {
        slide.addText("Rear", { x: rx, y: iy, w: rw, h: 0.2, fontFace: NUTANIX_FONT.body, fontSize: 8.5, color: NUTANIX.slate, valign: "middle" });
        placeImage(slide, rearImg, { x: rx, y: iy + 0.22, w: rw, h: 0.95 }, "center", "middle");
        iy += 1.24;
      }
      refTop = iy + 0.16;
    }

    if (plat) {
      const rows: [string, string][] = [
        ["Form factor", plat.formFactor],
        ["CPU", plat.cpu],
        ["Cores/CPU", plat.coreRange],
        ["Memory", plat.memoryRange],
        ["Storage", plat.storage],
      ];
      if (plat.gpu) rows.push(["GPU", plat.gpu]);
      if (bays != null) rows.push(["Drive bays", `${bays} (${empty ?? 0} unused)`]);
      rows.push(["Best for", plat.useCases]);

      // Without renders the right column is free, so the reference starts at the
      // top of the content area and can afford a larger size.
      const py = hasImg ? refTop : BODY_TOP;
      const boxH = BODY_BOTTOM - py;
      const fs = hasImg ? 8.5 : 10;
      eyebrow(slide, "Platform reference", rx, py, rw);
      hairline(slide, rx, py + 0.28, rw, NUTANIX.mist);
      slide.addText(
        rows.flatMap((r) => [
          { text: `${r[0]}   `, options: { bold: true, fontFace: NUTANIX_FONT.body, fontSize: fs, color: NUTANIX.purple, breakLine: false } },
          { text: r[1], options: { fontFace: NUTANIX_FONT.body, fontSize: fs, color: NUTANIX.ink, breakLine: true, paraSpaceAfter: hasImg ? 2 : 5 } },
        ]),
        { x: rx, y: py + 0.38, w: rw, h: Math.max(0.5, boxH - 0.44), valign: "top" },
      );
    }
  }

  // Bill of materials, one per proposed option.
  for (const option of options) addBomSlide(option);

  function addBomSlide(option: HardwareOption) {
    const slide = newSlide();
    addChrome(
      slide,
      multiOption ? `${option.label} · Components` : "Components",
      "Bill of Materials",
      `${option.name}  ·  aggregated hardware and software line items`,
    );
    const hw = aggregateComponents(option.scenario, "hardware");
    const sw = aggregateComponents(option.scenario, "software");
    const rows = [...hw, ...sw];

    if (!rows.length) {
      // Sample scenarios and some OEM exports carry no component detail. Say so
      // plainly rather than printing an empty grid.
      slide.addText("No component-level detail in this Sizer export.", {
        x: MARGIN,
        y: BODY_TOP + 0.4,
        w: CONTENT_W,
        h: 0.4,
        fontFace: NUTANIX_FONT.heading,
        fontSize: 15,
        bold: true,
        color: NUTANIX.ink,
        valign: "middle",
      });
      slide.addText(
        "Sizer omits the component breakdown for this scenario type. The configured hardware is described on the Solution Summary and node specification slides.",
        { x: MARGIN, y: BODY_TOP + 0.86, w: 7.4, h: 0.8, fontFace: NUTANIX_FONT.body, fontSize: 11.5, color: NUTANIX.gray, lineSpacingMultiple: 1.25, valign: "top" },
      );
      return;
    }

    const header = tableHeader(["Code", "Description", "Qty"], ["left", "left", "right"]);
    const body = rows.map((r, ri) =>
      [r.code, r.description, String(r.qty)].map((c, ci) => ({
        text: c,
        options: {
          color: ci === 0 ? NUTANIX.ink : NUTANIX.gray,
          fill: { color: ri % 2 ? TINT : "FFFFFF" },
          fontFace: NUTANIX_FONT.body,
          fontSize: 9,
          bold: ci === 0,
          valign: "middle",
          align: ci === 2 ? "right" : "left",
        },
      })),
    );
    slide.addTable([header, ...body], {
      x: MARGIN,
      y: BODY_TOP,
      w: CONTENT_W,
      colW: [2.5, 8.15, 1.32],
      border: { type: "solid", color: "FFFFFF", pt: 0 },
      rowH: 0.26,
      autoPage: true,
      autoPageRepeatHeader: true,
      autoPageHeaderRows: 1,
    });
  }

  // --- 5. Software and licensing --------------------------------------------
  addDivider(
    "Part three",
    "Software and licensing",
    "What the design licenses, how each product is metered, and what every edition includes.",
  );

  addSoftwareScope();

  // A licensing page per product: the tier ladder, then the capability matrix.
  const pages = doc.options?.includeAllLicensingPages
    ? allLicensingPages().map((licensing) => ({
        licensing,
        selectedTier: doc.licensing.lines.find((l) => l.product === licensing.product)?.tier ?? "",
      }))
    : licensingPagesFor(doc.licensing.lines.map((l) => ({ product: l.product, tier: l.tier })));

  for (const { licensing, selectedTier } of pages) {
    addLicensingLadder(licensing, selectedTier);
    addLicensingMatrix(licensing, selectedTier);
  }

  if (doc.options?.includeSoftwareSlides ?? true) addSupportPrograms();

  function addSoftwareScope() {
    const slide = newSlide();
    addChrome(
      slide,
      "Software",
      "Included Software",
      `${basePlatformLabel(doc)}  ·  ${doc.licensing.termYears}-year subscription term`,
    );

    // Product lockups run as a band across the top of the content area.
    const prods = purchasedProducts(doc).filter((p) => brand.productIcons?.[p]);
    let tableY = BODY_TOP;
    if (prods.length) {
      let ix = MARGIN;
      const iconBoxW = Math.min(2.0, CONTENT_W / prods.length - 0.2);
      for (const p of prods) {
        if (ix + iconBoxW > MARGIN + CONTENT_W) break;
        placeImage(slide, brand.productIcons?.[p], { x: ix, y: BODY_TOP, w: iconBoxW, h: 0.62 }, "left", "middle");
        ix += iconBoxW + 0.22;
      }
      hairline(slide, MARGIN, BODY_TOP + 0.82, CONTENT_W, NUTANIX.mist);
      tableY = BODY_TOP + 1.0;
    }

    const header = tableHeader(["Software", "Metering", "Tier / edition", "Quantity"], ["left", "left", "left", "right"]);
    const body = doc.licensing.lines.map((l, ri) => {
      const cat = LICENSE_CATALOG[l.product];
      const cells: { text: string; opt: Record<string, unknown> }[] = [
        { text: cat.label, opt: { bold: true, color: NUTANIX.ink } },
        { text: cat.category, opt: { color: NUTANIX.gray } },
        { text: l.tier, opt: { color: NUTANIX.ink } },
        { text: `${fmtInt(l.qty)} ${l.unit}`, opt: { align: "right", color: NUTANIX.ink } },
      ];
      return cells.map((c) => ({
        text: c.text,
        options: {
          fill: { color: ri % 2 ? TINT : "FFFFFF" },
          fontFace: NUTANIX_FONT.body,
          fontSize: 11,
          valign: "middle",
          ...c.opt,
        },
      }));
    });
    slide.addTable([header, ...body], {
      x: MARGIN,
      y: tableY,
      w: CONTENT_W,
      colW: [2.0, 4.6, 2.9, 2.47],
      border: { type: "solid", color: "FFFFFF", pt: 0 },
      rowH: 0.42,
      autoPage: false,
    });

    slide.addText(
      "Software scope for the proposed design. NCI is licensed per physical CPU core; add-on products follow their own metering. Commercial pricing is provided in a separate quote.",
      { x: MARGIN, y: PAGE_H - 0.88, w: CONTENT_W, h: 0.3, fontFace: NUTANIX_FONT.body, fontSize: 9.5, color: NUTANIX.slate, valign: "middle" },
    );
  }

  // The tier ladder. Tiers stack as full-width rows on a 2fr/4fr/5fr split
  // rather than a row of equal cards, so the page works for one, two or three
  // tiers without the layout changing character.
  function addLicensingLadder(lic: ProductLicensing, selectedTier: string) {
    const slide = newSlide();
    addChrome(slide, `Licensing · ${lic.abbrev}`, `${lic.name} Editions`, lic.meter);

    const n = lic.tiers.length;
    const pitch = Math.min(1.68, (BODY_H - 0.5) / n);
    const nameW = 2.3;
    const taglineW = 4.3;
    const idealW = CONTENT_W - nameW - taglineW - 0.5;

    lic.tiers.forEach((tier, i) => {
      const y = BODY_TOP + i * pitch;
      const selected = tier === selectedTier;
      if (selected) {
        slide.addShape(SHAPE.rect, { x: MARGIN, y, w: CONTENT_W, h: pitch - 0.14, fill: { color: TINT }, line: { type: "none" } });
        slide.addShape(SHAPE.rect, { x: MARGIN, y, w: 0.045, h: pitch - 0.14, fill: { color: NUTANIX.purple }, line: { type: "none" } });
      } else {
        hairline(slide, MARGIN, y, CONTENT_W, NUTANIX.mist);
      }

      slide.addText(tier.toUpperCase(), {
        x: MARGIN + 0.26,
        y: y + 0.16,
        w: nameW,
        h: 0.42,
        fontFace: NUTANIX_FONT.heading,
        fontSize: 17,
        bold: true,
        color: selected ? NUTANIX.purple : NUTANIX.ink,
        valign: "middle",
      });
      if (selected) {
        slide.addText("QUOTED IN THIS DESIGN", {
          x: MARGIN + 0.26,
          y: y + 0.58,
          w: nameW,
          h: 0.24,
          fontFace: NUTANIX_FONT.body,
          fontSize: 8,
          bold: true,
          color: NUTANIX.purple,
          charSpacing: 1.2,
          valign: "middle",
        });
      }
      slide.addText(lic.tagline[tier] ?? "", {
        x: MARGIN + nameW + 0.4,
        y: y + 0.16,
        w: taglineW,
        h: pitch - 0.44,
        fontFace: NUTANIX_FONT.heading,
        fontSize: 13,
        bold: true,
        color: NUTANIX.ink,
        lineSpacingMultiple: 1.16,
        valign: "top",
      });
      slide.addText(lic.ideal[tier] ?? "", {
        x: MARGIN + nameW + taglineW + 0.6,
        y: y + 0.18,
        w: idealW,
        h: pitch - 0.44,
        fontFace: NUTANIX_FONT.body,
        fontSize: 11,
        color: NUTANIX.gray,
        lineSpacingMultiple: 1.2,
        valign: "top",
      });
    });

    slide.addText(`Source: ${lic.source}`, {
      x: MARGIN,
      y: PAGE_H - 0.88,
      w: CONTENT_W,
      h: 0.3,
      fontFace: NUTANIX_FONT.body,
      fontSize: 8.5,
      color: NUTANIX.slate,
      valign: "middle",
    });
  }

  function matrixCell(v: Cell): { text: string; color: string } {
    if (v === true) return { text: "Included", color: "3F5E0A" };
    if (v === false) return { text: "—", color: NUTANIX.slate };
    if (v === "addon") return { text: "Add-on", color: "9A3B27" };
    return { text: String(v), color: NUTANIX.ink };
  }

  function paginateSections(lic: ProductLicensing): ProductLicensing["sections"][] {
    const pages: ProductLicensing["sections"][] = [];
    let current: ProductLicensing["sections"] = [];
    let rows = 0;
    for (const section of lic.sections) {
      const needed = 1 + section.rows.length; // section heading + its rows
      if (rows + needed > MATRIX_ROWS_PER_PAGE && current.length) {
        pages.push(current);
        current = [];
        rows = 0;
      }
      current.push(section);
      rows += needed;
    }
    if (current.length) pages.push(current);
    return pages;
  }

  function addLicensingMatrix(lic: ProductLicensing, selectedTier: string) {
    const pages = paginateSections(lic);
    pages.forEach((sections, pi) => addLicensingMatrixPage(lic, selectedTier, sections, pi, pages.length));
  }

  function addLicensingMatrixPage(
    lic: ProductLicensing,
    selectedTier: string,
    sections: ProductLicensing["sections"],
    pageIndex: number,
    pageCount: number,
  ) {
    const slide = newSlide();
    const selIdx = lic.tiers.indexOf(selectedTier);
    const base = selIdx >= 0 ? `${selectedTier} is quoted in this design` : "Capability summary by edition";
    addChrome(
      slide,
      `Licensing · ${lic.abbrev}`,
      `${lic.name} Capabilities`,
      pageCount > 1 ? `${base}  ·  ${pageIndex + 1} of ${pageCount}` : base,
    );

    const featureW = lic.tiers.length >= 3 ? 5.9 : lic.tiers.length === 2 ? 6.6 : 8.2;
    const tierW = (CONTENT_W - featureW) / lic.tiers.length;

    const header = [
      {
        text: "Capability",
        options: {
          bold: true,
          color: NUTANIX.ink,
          fill: { color: "FFFFFF" },
          fontFace: NUTANIX_FONT.body,
          fontSize: 10,
          valign: "middle",
          border: [{ type: "none" }, { type: "none" }, { type: "solid", color: NUTANIX.purple, pt: 1.25 }, { type: "none" }],
        },
      },
      ...lic.tiers.map((t, ci) => ({
        text: t,
        options: {
          bold: true,
          color: ci === selIdx ? NUTANIX.purple : NUTANIX.ink,
          fill: { color: "FFFFFF" },
          fontFace: NUTANIX_FONT.body,
          fontSize: 10,
          align: "center",
          valign: "middle",
          border: [{ type: "none" }, { type: "none" }, { type: "solid", color: NUTANIX.purple, pt: 1.25 }, { type: "none" }],
        },
      })),
    ];

    const rows: unknown[][] = [];
    for (const section of sections) {
      rows.push([
        {
          text: section.title.toUpperCase(),
          options: {
            bold: true,
            color: NUTANIX.purple,
            fill: { color: "FFFFFF" },
            fontFace: NUTANIX_FONT.heading,
            fontSize: 9,
            charSpacing: 1.4,
            valign: "middle",
            colspan: lic.tiers.length + 1,
          },
        },
      ]);
      for (const r of section.rows) {
        rows.push([
          { text: r.feature, options: { color: NUTANIX.ink, fontFace: NUTANIX_FONT.body, fontSize: 9, valign: "middle" } },
          ...r.cells.map((v, ci) => {
            const c = matrixCell(v);
            const isSel = ci === selIdx;
            return {
              text: c.text,
              options: {
                align: "center",
                valign: "middle",
                color: c.color,
                bold: isSel,
                fill: { color: isSel ? TINT : "FFFFFF" },
                fontFace: NUTANIX_FONT.body,
                fontSize: 9,
              },
            };
          }),
        ]);
      }
    }

    slide.addTable([header, ...rows], {
      x: MARGIN,
      y: BODY_TOP - 0.06,
      w: CONTENT_W,
      colW: [featureW, ...lic.tiers.map(() => tierW)],
      border: { type: "solid", color: NUTANIX.line, pt: 0.5 },
      rowH: 0.24,
      autoPage: false,
      valign: "middle",
    });
  }

  function addSupportPrograms() {
    const slide = newSlide();
    addChrome(slide, "Support", "Product Support Programs", "Coverage and response commitments by program");

    // Two programs presented as compared columns over a shared row of labels —
    // the same structure as the hardware comparison, so the deck reads
    // consistently rather than switching to a card grid here.
    const labels = SUPPORT_PROGRAMS[0]?.rows.map((r) => r.label) ?? [];
    const labelW = 3.2;
    const colW = (CONTENT_W - labelW) / SUPPORT_PROGRAMS.length;

    SUPPORT_PROGRAMS.forEach((p, i) => {
      const x = MARGIN + labelW + i * colW;
      slide.addShape(SHAPE.rect, { x: x + 0.14, y: BODY_TOP + 0.08, w: colW - 0.28, h: 0.03, fill: { color: NUTANIX.purple }, line: { type: "none" } });
      slide.addText(p.name, {
        x: x + 0.14,
        y: BODY_TOP + 0.18,
        w: colW - 0.28,
        h: 0.36,
        fontFace: NUTANIX_FONT.heading,
        fontSize: 16,
        bold: true,
        color: NUTANIX.ink,
        valign: "middle",
      });
      slide.addText(p.ideal, {
        x: x + 0.14,
        y: BODY_TOP + 0.6,
        w: colW - 0.28,
        h: 0.8,
        fontFace: NUTANIX_FONT.body,
        fontSize: 10.5,
        color: NUTANIX.gray,
        lineSpacingMultiple: 1.2,
        valign: "top",
      });
    });

    const ROWS_TOP = BODY_TOP + 1.54;
    const PITCH = Math.min(0.62, (BODY_BOTTOM - 0.4 - ROWS_TOP) / Math.max(1, labels.length));
    labels.forEach((label, ri) => {
      const y = ROWS_TOP + ri * PITCH;
      hairline(slide, MARGIN, y, CONTENT_W, NUTANIX.line);
      slide.addText(label, {
        x: MARGIN,
        y: y + 0.06,
        w: labelW - 0.2,
        h: PITCH - 0.12,
        fontFace: NUTANIX_FONT.body,
        fontSize: 11,
        color: NUTANIX.gray,
        valign: "middle",
      });
      SUPPORT_PROGRAMS.forEach((p, ci) => {
        slide.addText(p.rows[ri]?.value ?? "—", {
          x: MARGIN + labelW + ci * colW + 0.14,
          y: y + 0.06,
          w: colW - 0.28,
          h: PITCH - 0.12,
          fontFace: NUTANIX_FONT.heading,
          fontSize: 12,
          bold: true,
          color: NUTANIX.ink,
          valign: "middle",
        });
      });
    });
    hairline(slide, MARGIN, ROWS_TOP + labels.length * PITCH, CONTENT_W);

    slide.addText("** 4-hour parts arrival is not available in all locations. Next-business-day delivery varies by region.", {
      x: MARGIN,
      y: PAGE_H - 0.88,
      w: CONTENT_W,
      h: 0.3,
      fontFace: NUTANIX_FONT.body,
      fontSize: 8.5,
      color: NUTANIX.slate,
      valign: "middle",
    });
  }

  // --- 6. Delivery -----------------------------------------------------------
  addDivider("Part four", "Getting to production", "Deployment workstreams, enablement, and the prerequisites to confirm.");

  // Implementation plan: four workstreams as vertical lanes divided by rules.
  {
    const slide = newSlide();
    addChrome(slide, "Delivery", "Implementation Plan", "How the platform gets deployed, migrated and handed over");
    const n = IMPLEMENTATION_PLAN.length;
    const colW = CONTENT_W / n;
    IMPLEMENTATION_PLAN.forEach((phase, i) => {
      const x = MARGIN + i * colW;
      if (i > 0) slide.addShape(SHAPE.line, { x, y: BODY_TOP, w: 0, h: BODY_H - 0.4, line: { color: NUTANIX.line, width: 0.75 } });
      const innerX = x + (i === 0 ? 0 : 0.28);
      const innerW = colW - (i === 0 ? 0.28 : 0.42);

      slide.addShape(SHAPE.rect, { x: innerX, y: BODY_TOP, w: 0.42, h: 0.03, fill: { color: NUTANIX.purple }, line: { type: "none" } });
      slide.addText(String(i + 1).padStart(2, "0"), {
        x: innerX,
        y: BODY_TOP + 0.12,
        w: innerW,
        h: 0.3,
        fontFace: NUTANIX_FONT.heading,
        fontSize: 11,
        bold: true,
        color: NUTANIX.purple,
        charSpacing: 1.4,
        valign: "middle",
      });
      slide.addText(phase.title, {
        x: innerX,
        y: BODY_TOP + 0.46,
        w: innerW,
        h: 0.56,
        fontFace: NUTANIX_FONT.heading,
        fontSize: 15,
        bold: true,
        color: NUTANIX.ink,
        valign: "top",
      });
      slide.addText(phase.subtitle, {
        x: innerX,
        y: BODY_TOP + 1.04,
        w: innerW,
        h: 0.44,
        fontFace: NUTANIX_FONT.body,
        fontSize: 10,
        italic: true,
        color: NUTANIX.slate,
        lineSpacingMultiple: 1.15,
        valign: "top",
      });
      slide.addText(
        phase.items.map((s) => ({
          text: s,
          options: {
            bullet: { code: "2022", indent: 12 },
            fontSize: 10.5,
            color: NUTANIX.gray,
            fontFace: NUTANIX_FONT.body,
            breakLine: true,
            paraSpaceAfter: 8,
          },
        })),
        { x: innerX, y: BODY_TOP + 1.62, w: innerW, h: BODY_H - 2.0, valign: "top" },
      );
    });
    slide.addText(IMPLEMENTATION_ADDON_NOTE, {
      x: MARGIN,
      y: PAGE_H - 0.88,
      w: CONTENT_W,
      h: 0.3,
      fontFace: NUTANIX_FONT.body,
      fontSize: 9.5,
      italic: true,
      color: NUTANIX.slate,
      valign: "middle",
    });
  }

  // Implementation considerations — numbered prerequisites on a narrow measure.
  {
    const slide = newSlide();
    addChrome(slide, "Delivery", "Implementation Considerations", "Networking, power and deployment prerequisites to confirm");
    const items = [
      "Two top-of-rack switches per cluster, per Nutanix physical networking best practice.",
      "At least two 10/25GbE ports per node, plus one 1GbE out-of-band (IPMI) port for Foundation.",
      "Switch ports and SFP+/SFP28 transceivers or twinax cables are required, sourced via the partner.",
      "Nutanix ships C14-to-C13 PDU-style power cables only; PSU redundancy requires 110V where applicable.",
      "Confirm power and cooling headroom in the destination racks.",
      "Confirm Windows and SQL Server licensing with your licensing partner.",
    ];
    const PITCH = Math.min(0.78, (BODY_H - 0.2) / items.length);
    items.forEach((text, i) => {
      const y = BODY_TOP + i * PITCH;
      hairline(slide, MARGIN, y, 9.6, NUTANIX.mist);
      slide.addText(String(i + 1).padStart(2, "0"), {
        x: MARGIN,
        y: y + 0.1,
        w: 0.6,
        h: PITCH - 0.2,
        fontFace: NUTANIX_FONT.heading,
        fontSize: 11,
        bold: true,
        color: NUTANIX.purple,
        valign: "middle",
      });
      slide.addText(text, {
        x: MARGIN + 0.7,
        y: y + 0.1,
        w: 8.9,
        h: PITCH - 0.2,
        fontFace: NUTANIX_FONT.body,
        fontSize: 12,
        color: NUTANIX.ink,
        lineSpacingMultiple: 1.18,
        valign: "middle",
      });
    });
    hairline(slide, MARGIN, BODY_TOP + items.length * PITCH, 9.6, NUTANIX.mist);
  }

  // --- 7. Close --------------------------------------------------------------
  {
    const slide = newSlide();
    slide.background = { color: NUTANIX.deepPurple };
    if (brand.coverBg) slide.addImage({ data: brand.coverBg.data, x: 0, y: 0, w: PAGE_W, h: PAGE_H });
    else slide.addShape(SHAPE.rect, { x: 0, y: 0, w: PAGE_W, h: PAGE_H, fill: { color: NUTANIX.deepPurple }, line: { type: "none" } });
    placeImage(slide, brand.wordmarkWhite, { x: 1.0, y: 0.7, w: 3.4, h: 0.5 }, "left", "middle");
    slide.addText("Thank you", {
      x: 1.0,
      y: 3.2,
      w: 9,
      h: 1.0,
      fontFace: NUTANIX_FONT.display,
      fontSize: 44,
      color: "FFFFFF",
      valign: "middle",
    });
    slide.addShape(SHAPE.rect, { x: 1.0, y: 4.3, w: 1.5, h: 0.035, fill: { color: NUTANIX.cyan }, line: { type: "none" } });
    slide.addText(doc.meta.customer, {
      x: 1.0,
      y: 4.52,
      w: 9,
      h: 0.4,
      fontFace: NUTANIX_FONT.body,
      fontSize: 15,
      color: NUTANIX.cyan,
      valign: "middle",
    });
    const close = doc.contacts.filter((c) => c.name || c.email);
    if (close.length) {
      slide.addText(
        close.map((c) => `${c.name}${c.title ? ", " + c.title : ""}${c.email ? "  ·  " + c.email : ""}`).join("\n"),
        { x: 1.0, y: 5.06, w: 9, h: 0.9, fontFace: NUTANIX_FONT.body, fontSize: 12, color: "B9A7F2", lineSpacingMultiple: 1.24, valign: "top" },
      );
    }
  }

  const fileSuffix = multiOption ? ` (${options.length} hardware options)` : "";
  await pptx.writeFile({ fileName: `Solution Proposal - ${doc.meta.customer}${fileSuffix}.pptx` });
}

type BomLine = { code: string; description: string; qty: number };

function aggregateComponents(scenario: ProposalScenario, kind: "hardware" | "software"): BomLine[] {
  const map = new Map<string, BomLine>();
  for (const cluster of scenario.clusters) {
    for (const m of cluster.models) {
      for (const c of m.components) {
        const isSoftware = /^SW-|Term-Months|Foundation|Controller VM|Prism|Support/i.test(c.code);
        const wantSoftware = kind === "software";
        if (Boolean(isSoftware) !== wantSoftware) continue;
        const qty = c.totalQty ?? 0;
        if (!qty && kind === "hardware") continue;
        const prev = map.get(c.code);
        if (prev) prev.qty += qty;
        else map.set(c.code, { code: c.code, description: c.description, qty });
      }
    }
    // Licenses live in cblBudgetaryQuoteInfo -> captured on cluster.license
    if (kind === "software" && cluster.license) {
      const code = `SW-NCI-${cluster.license.edition.toUpperCase()}`;
      const prev = map.get(code);
      const qty = cluster.license.cores ?? 0;
      if (prev) prev.qty += qty;
      else map.set(code, { code, description: `NCI ${cluster.license.edition} subscription (cores)`, qty });
    }
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}
