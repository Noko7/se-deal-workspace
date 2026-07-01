import { NUTANIX, NUTANIX_FONT } from "./nutanix-brand";
import {
  basePlatformLabel,
  cpuSummary,
  hardwareRollup,
  memorySummary,
  nodeCores,
  nodeRawStorageTB,
  proposalHelpers,
  purchasedProducts,
  storageSummary,
  type ProposalDoc,
} from "./proposal-doc";
import type { ProposalCluster } from "./sizer-import";
import { LICENSE_CATALOG } from "./license-catalog";
import { drivesPerNode, emptyDriveSlots, platformSpecFor } from "./hardware-images";
import type { ProductKey } from "./nutanix-icons";
import {
  Cell as EditionCell,
  EDITION_IDEAL,
  EDITION_TAGLINE,
  EDITIONS,
  EditionSection,
  IMPLEMENTATION_ADDON_NOTE,
  IMPLEMENTATION_PLAN,
  NCI_EDITION_MATRIX,
  NCI_EDITIONS_SOURCE,
  NCM_EDITION_IDEAL,
  NCM_EDITION_MATRIX,
  NCM_EDITION_TAGLINE,
  SUPPORT_PROGRAMS,
} from "./nci-editions";

// An image plus its intrinsic pixel dimensions, so the exporter can place it at
// the correct aspect ratio (no stretching / squashing) regardless of the box.
export type ImgAsset = { data: string; w: number; h: number };

export type ProposalBrandImages = {
  productIcons?: Partial<Record<ProductKey, ImgAsset>>; // purchased-product icons
  coverBg?: ImgAsset; // Nutanix brand-template title background (16:9)
  wordmarkWhite?: ImgAsset; // white NUTANIX wordmark (for dark covers)
  markBlack?: ImgAsset; // black Nutanix "X" mark (for light content slides)
  pureLogo?: ImgAsset; // external-storage partner (Pure Storage) logo
};

// Client-side .pptx exporter for the BOM proposal deck. Built on pptxgenjs in
// the official Nutanix brand style (16:9, Montserrat, brand palette). This is a
// modernized take on the legacy "BOM Proposal" deck: a clean cover, an
// executive summary, an aggregate solution summary, one tidy slide per cluster,
// an aggregate Bill of Materials, node spec sheets (with product diagrams when
// available), implementation considerations, and a close.

const { fmtInt, tib } = proposalHelpers;
const PAGE_W = 13.333;
const PAGE_H = 7.5;
const MARGIN = 0.6;

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

  // Place an image contained within a box at its true aspect ratio (never
  // stretched). Aligns within the leftover space of the box.
  type Box = { x: number; y: number; w: number; h: number };
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

  const addChrome = (slide: Slide, title: string, subtitle: string | undefined, page: number) => {
    slide.addShape(SHAPE.rect, { x: MARGIN, y: 0.5, w: 0.14, h: 0.62, fill: { color: NUTANIX.purple } });
    slide.addText(title, { x: MARGIN + 0.28, y: 0.42, w: 9.5, h: 0.7, fontFace: NUTANIX_FONT.heading, fontSize: 26, bold: true, color: NUTANIX.ink });
    if (subtitle) {
      slide.addText(subtitle, { x: MARGIN + 0.28, y: 1.12, w: 9.5, h: 0.35, fontFace: NUTANIX_FONT.body, fontSize: 12, color: NUTANIX.slate });
    }
    // Brand mark (Nutanix "X") top-right — a brand-template asset, kept subtle.
    placeImage(slide, brand.markBlack, { x: PAGE_W - MARGIN - 0.62, y: 0.5, w: 0.62, h: 0.5 }, "right", "middle");
    slide.addShape(SHAPE.line, { x: MARGIN, y: 1.6, w: PAGE_W - MARGIN * 2, h: 0, line: { color: NUTANIX.line, width: 1 } });
    slide.addText(`Nutanix Confidential  ·  ${doc.meta.customer}`, { x: MARGIN, y: PAGE_H - 0.45, w: 8, h: 0.3, fontFace: NUTANIX_FONT.body, fontSize: 8, color: NUTANIX.slate });
    slide.addText(String(page), { x: PAGE_W - MARGIN - 0.6, y: PAGE_H - 0.45, w: 0.6, h: 0.3, align: "right", fontFace: NUTANIX_FONT.body, fontSize: 8, color: NUTANIX.slate });
  };

  let page = 0;
  const newSlide = () => {
    page += 1;
    return pptx.addSlide() as unknown as Slide;
  };

  // 1 — Cover (official Nutanix brand-template title background)
  {
    const slide = newSlide();
    slide.background = { color: NUTANIX.deepPurple };
    if (brand.coverBg) {
      // 16:9 background fills the slide exactly — same aspect, so no distortion.
      slide.addImage({ data: brand.coverBg.data, x: 0, y: 0, w: PAGE_W, h: PAGE_H });
    } else {
      slide.addShape(SHAPE.rect, { x: 0, y: 0, w: PAGE_W, h: PAGE_H, fill: { color: NUTANIX.deepPurple }, line: { type: "none" } });
    }
    // White Nutanix wordmark (brand asset) top-left.
    placeImage(slide, brand.wordmarkWhite, { x: 1.0, y: 0.7, w: 3.4, h: 0.5 }, "left", "middle");
    // Customer logo top-right, contained at true aspect.
    placeImage(slide, logo, { x: PAGE_W - 1.0 - 3.0, y: 0.62, w: 3.0, h: 0.7 }, "right", "middle");
    slide.addText(doc.options?.externalStorage ? "STORAGE PROPOSAL" : "SOLUTION PROPOSAL", { x: 1.0, y: 2.5, w: 11, h: 0.5, fontFace: NUTANIX_FONT.body, fontSize: 16, color: NUTANIX.cyan, charSpacing: 3 });
    slide.addText(doc.meta.customer, { x: 1.0, y: 3.0, w: 11.3, h: 1.4, fontFace: NUTANIX_FONT.heading, fontSize: 46, bold: true, color: "FFFFFF" });
    slide.addText(`${doc.meta.opportunityName ? doc.meta.opportunityName + "  ·  " : ""}${doc.meta.dateLabel}`, { x: 1.0, y: 4.5, w: 11, h: 0.4, fontFace: NUTANIX_FONT.body, fontSize: 14, color: "D8CCFF" });
    const contactLines = doc.contacts
      .filter((c) => c.name || c.email)
      .map((c) => `${c.name}${c.title ? ", " + c.title : ""}${c.email ? "  ·  " + c.email : ""}${c.phone ? "  ·  " + c.phone : ""}`);
    slide.addText(contactLines.join("\n") || `Prepared by ${doc.meta.preparedBy}`, { x: 1.0, y: 5.15, w: 11, h: 1.2, fontFace: NUTANIX_FONT.body, fontSize: 12, color: "B9A7F2", lineSpacingMultiple: 1.2 });
  }

  // 2 — Executive Summary
  {
    const slide = newSlide();
    addChrome(slide, "Executive Summary", doc.meta.opportunityName ?? undefined, page);
    slide.addText(doc.executiveSummary, { x: MARGIN, y: 1.9, w: PAGE_W - MARGIN * 2, h: 1.6, fontFace: NUTANIX_FONT.body, fontSize: 14, color: NUTANIX.ink, lineSpacingMultiple: 1.25, valign: "top" });
    // KPI tiles for the environment totals
    const t = doc.scenario.totals;
    const kpis = [
      { v: fmtInt(t.nodes), l: "Total Nodes" },
      { v: fmtInt(t.cores), l: "CPU Cores" },
      { v: fmtInt(t.ramGiB) + " GB", l: "Memory" },
      { v: tib(t.ssdTiB + t.hddTiB), l: "Usable Storage" },
      { v: fmtInt(t.clusters), l: "Clusters" },
    ];
    const gap = 0.3;
    const cardW = (PAGE_W - MARGIN * 2 - gap * (kpis.length - 1)) / kpis.length;
    const y = 4.0;
    kpis.forEach((k, i) => {
      const x = MARGIN + i * (cardW + gap);
      slide.addShape(SHAPE.roundRect, { x, y, w: cardW, h: 1.7, rectRadius: 0.06, fill: { color: "FBFAFF" }, line: { color: NUTANIX.mist, width: 1 } });
      slide.addShape(SHAPE.rect, { x, y, w: cardW, h: 0.06, fill: { color: NUTANIX.purple }, line: { type: "none" } });
      slide.addText(k.v, { x, y: y + 0.35, w: cardW, h: 0.7, align: "center", fontFace: NUTANIX_FONT.heading, fontSize: 24, bold: true, color: NUTANIX.purple });
      slide.addText(k.l, { x, y: y + 1.05, w: cardW, h: 0.5, align: "center", fontFace: NUTANIX_FONT.body, fontSize: 11, color: NUTANIX.gray });
    });
  }

  // 3 — Solution Summary (hardware rollup)
  {
    const slide = newSlide();
    const summarySubtitle = doc.options?.externalStorage
      ? `${doc.meta.supportTerm}  ·  External storage: ${doc.options.externalStorageVendor}`
      : doc.meta.supportTerm;
    addChrome(slide, "Nutanix Solution Summary", summarySubtitle, page);
    const rollup = hardwareRollup(doc.scenario);
    const header = ["Hardware", "Nodes", "CPU", "Cores", "RAM (GB)", "Raw Storage (TB)"].map((h) => ({
      text: h,
      options: { bold: true, color: "FFFFFF", fill: { color: NUTANIX.purple }, fontFace: NUTANIX_FONT.body, fontSize: 11, valign: "middle" },
    }));
    const body = rollup.map((r, ri) =>
      [r.sku, String(r.nodes), r.cpuSummary, fmtInt(r.cores), fmtInt(r.ramGiB), r.rawStorageTB.toFixed(1)].map((c, ci) => ({
        text: c,
        options: { color: NUTANIX.ink, fill: { color: ri % 2 ? "F7F6FD" : "FFFFFF" }, fontFace: NUTANIX_FONT.body, fontSize: 11, bold: ci === 0, valign: "middle" },
      })),
    );
    slide.addTable([header, ...body], { x: MARGIN, y: 1.9, w: PAGE_W - MARGIN * 2, colW: [3.1, 1.0, 4.0, 1.2, 1.4, 1.43], border: { type: "solid", color: NUTANIX.line, pt: 0.5 }, rowH: 0.5, autoPage: false });
    // External-storage deals: call out the primary-storage partner (e.g. Pure).
    if (doc.options?.externalStorage && doc.options.externalStorageVendor === "Pure Storage" && brand.pureLogo) {
      slide.addText("Primary storage delivered by", { x: MARGIN, y: PAGE_H - 1.15, w: 3.4, h: 0.4, fontFace: NUTANIX_FONT.body, fontSize: 11, color: NUTANIX.slate, valign: "middle" });
      placeImage(slide, brand.pureLogo, { x: MARGIN + 3.3, y: PAGE_H - 1.2, w: 2.6, h: 0.5 }, "left", "middle");
    } else if (doc.options?.externalStorage) {
      slide.addText(`Primary storage delivered by an external ${doc.options.externalStorageVendor} array over NVMe/TCP.`, { x: MARGIN, y: PAGE_H - 1.1, w: PAGE_W - MARGIN * 2, h: 0.4, fontFace: NUTANIX_FONT.body, fontSize: 11, italic: true, color: NUTANIX.slate });
    }
  }

  // 4..N — One slide per cluster
  for (const cluster of doc.scenario.clusters) {
    addClusterSlide(cluster);
  }

  function addClusterSlide(cluster: ProposalCluster) {
    const slide = newSlide();
    addChrome(slide, `Cluster: ${cluster.name}`, cluster.solutionType ? `${cluster.solutionType} · ${cluster.nodes} nodes` : `${cluster.nodes} nodes`, page);
    const colGap = 0.4;
    const colW = (PAGE_W - MARGIN * 2 - colGap) / 2;
    const top = 1.9;

    // Left: capacity + utilization
    slide.addShape(SHAPE.roundRect, { x: MARGIN, y: top, w: colW, h: 4.4, rectRadius: 0.06, fill: { color: "FBFAFF" }, line: { color: NUTANIX.mist, width: 1 } });
    slide.addText("CLUSTER CAPACITY", { x: MARGIN + 0.25, y: top + 0.2, w: colW - 0.5, h: 0.3, fontFace: NUTANIX_FONT.heading, fontSize: 12, bold: true, color: NUTANIX.purple, charSpacing: 1 });
    const caps = [
      ["CPU Cores", fmtInt(cluster.capacity.cores), cluster.utilization.cpu],
      ["Memory", `${fmtInt(cluster.capacity.ramGiB)} GB`, cluster.utilization.ram],
      ["Usable Storage", tib(cluster.capacity.ssdTiB + cluster.capacity.hddTiB), cluster.utilization.storage],
    ];
    caps.forEach((row, i) => {
      const y = top + 0.7 + i * 0.95;
      slide.addText(String(row[0]), { x: MARGIN + 0.25, y, w: colW - 0.5, h: 0.3, fontFace: NUTANIX_FONT.body, fontSize: 12, color: NUTANIX.gray });
      slide.addText(String(row[1]), { x: MARGIN + 0.25, y: y + 0.28, w: colW - 0.5, h: 0.4, fontFace: NUTANIX_FONT.heading, fontSize: 18, bold: true, color: NUTANIX.ink });
      const util = row[2] as number | null;
      if (util != null) {
        const barW = colW - 0.5;
        const fillW = Math.min(barW, Math.max(0.05, (util / 100) * barW));
        slide.addShape(SHAPE.roundRect, { x: MARGIN + 0.25, y: y + 0.72, w: barW, h: 0.12, rectRadius: 0.06, fill: { color: "EEEEF6" }, line: { type: "none" } });
        slide.addShape(SHAPE.roundRect, { x: MARGIN + 0.25, y: y + 0.72, w: fillW, h: 0.12, rectRadius: 0.06, fill: { color: util > 100 ? NUTANIX.coral : NUTANIX.purple }, line: { type: "none" } });
        slide.addText(`${util}% utilized`, { x: MARGIN + 0.25, y: y + 0.84, w: barW, h: 0.18, fontFace: NUTANIX_FONT.body, fontSize: 9, color: NUTANIX.slate });
      }
    });
    if (cluster.failover.nMinus1 != null) {
      slide.addText(`Resiliency: ${cluster.failover.nMinus1.toFixed(0)}% at N-1${cluster.failover.nMinus2 != null ? ` · ${cluster.failover.nMinus2.toFixed(0)}% at N-2` : ""}`, { x: MARGIN + 0.25, y: top + 3.95, w: colW - 0.5, h: 0.3, fontFace: NUTANIX_FONT.body, fontSize: 10, italic: true, color: NUTANIX.slate });
    }

    // Right: recommended hardware models
    const rx = MARGIN + colW + colGap;
    slide.addShape(SHAPE.roundRect, { x: rx, y: top, w: colW, h: 4.4, rectRadius: 0.06, fill: { color: "FFFFFF" }, line: { color: NUTANIX.mist, width: 1 } });
    slide.addShape(SHAPE.rect, { x: rx, y: top, w: colW, h: 0.06, fill: { color: NUTANIX.purple }, line: { type: "none" } });
    slide.addText("RECOMMENDED HARDWARE", { x: rx + 0.25, y: top + 0.2, w: colW - 0.5, h: 0.3, fontFace: NUTANIX_FONT.heading, fontSize: 12, bold: true, color: NUTANIX.purple, charSpacing: 1 });
    let my = top + 0.65;
    cluster.models.forEach((m) => {
      slide.addText(`${m.nodes}× ${m.sku}`, { x: rx + 0.25, y: my, w: colW - 0.5, h: 0.32, fontFace: NUTANIX_FONT.heading, fontSize: 14, bold: true, color: NUTANIX.ink });
      const specs = [`CPU: ${cpuSummary(m)}`, `Memory: ${memorySummary(m)}`, `Storage: ${storageSummary(m)}`];
      slide.addText(specs.map((s) => ({ text: s, options: { bullet: { code: "2022", indent: 12 }, fontSize: 10, color: NUTANIX.gray, fontFace: NUTANIX_FONT.body, breakLine: true, paraSpaceAfter: 3 } })), { x: rx + 0.25, y: my + 0.34, w: colW - 0.5, h: 0.95, valign: "top" });
      my += 1.45;
    });
    if (cluster.license) {
      slide.addText(`License: NCI ${cluster.license.edition}${cluster.license.cores ? ` · ${fmtInt(cluster.license.cores)} cores` : ""}${cluster.license.termMonths ? ` · ${cluster.license.termMonths} mo` : ""}`, { x: rx + 0.25, y: top + 3.95, w: colW - 0.5, h: 0.3, fontFace: NUTANIX_FONT.body, fontSize: 10, italic: true, color: NUTANIX.slate });
    }
  }

  // BOM — aggregate hardware + software line items
  {
    const slide = newSlide();
    addChrome(slide, "Bill of Materials", "Aggregated hardware components and software licensing", page);
    const hw = aggregateComponents(doc, "hardware");
    const sw = aggregateComponents(doc, "software");
    const header = ["Code", "Description", "Qty"].map((h) => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: NUTANIX.purple }, fontFace: NUTANIX_FONT.body, fontSize: 10, valign: "middle" } }));
    const rows = [...hw, ...sw];
    const body = rows.map((r, ri) =>
      [r.code, r.description, String(r.qty)].map((c, ci) => ({
        text: c,
        options: { color: NUTANIX.ink, fill: { color: ri % 2 ? "F7F6FD" : "FFFFFF" }, fontFace: NUTANIX_FONT.body, fontSize: 9, bold: ci === 0, valign: "middle", align: ci === 2 ? "right" : "left" },
      })),
    );
    slide.addTable([header, ...body], { x: MARGIN, y: 1.85, w: PAGE_W - MARGIN * 2, colW: [2.6, 8.13, 1.4], border: { type: "solid", color: NUTANIX.line, pt: 0.5 }, rowH: 0.26, autoPage: true, autoPageRepeatHeader: true, autoPageHeaderRows: 1 });
  }

  // Licensing summary — auto-selected NCI edition + per-cluster entitlement
  addLicensingSummary();

  // Full NCI + NCM software editions content (optional)
  if (doc.options?.includeSoftwareSlides ?? true) {
    addEditionsOverview();
    addEditionsComparison();
    addNcmEditionsOverview();
    addNcmEditionsComparison();
    addSupportPrograms();
  }

  function addLicensingSummary() {
    const slide = newSlide();
    addChrome(slide, "Included Software", `${basePlatformLabel(doc)} · ${doc.licensing.termYears}-year subscription term`, page);

    // Row of the product icons the design includes (each placed at true aspect).
    const prods = purchasedProducts(doc);
    let ix = MARGIN;
    const iconH = 0.66;
    const iconBoxW = 2.0;
    for (const p of prods) {
      const icon = brand.productIcons?.[p];
      if (!icon) continue;
      if (ix + iconBoxW > PAGE_W - MARGIN) break;
      placeImage(slide, icon, { x: ix, y: 1.85, w: iconBoxW, h: iconH }, "left", "middle");
      ix += iconBoxW + 0.25;
    }

    const tableY = prods.some((p) => brand.productIcons?.[p]) ? 2.75 : 1.95;
    const header = ["Software", "Tier / edition", "Quantity"].map((h, ci) => ({
      text: h,
      options: { bold: true, color: "FFFFFF", fill: { color: NUTANIX.purple }, fontFace: NUTANIX_FONT.body, fontSize: 11, align: ci === 2 ? "right" : "left", valign: "middle" },
    }));
    const body = doc.licensing.lines.map((l, ri) => {
      const cat = LICENSE_CATALOG[l.product];
      return [
        { text: cat.label, opt: { bold: true, align: "left" } },
        { text: l.tier, opt: { align: "left" } },
        { text: `${fmtInt(l.qty)} ${l.unit}`, opt: { align: "right" } },
      ].map((c) => ({ text: c.text, options: { color: NUTANIX.ink, fill: { color: ri % 2 ? "F7F6FD" : "FFFFFF" }, fontFace: NUTANIX_FONT.body, fontSize: 11, valign: "middle", ...c.opt } }));
    });
    slide.addTable([header, ...body], { x: MARGIN, y: tableY, w: PAGE_W - MARGIN * 2, colW: [4.0, 4.0, 4.13], border: { type: "solid", color: NUTANIX.line, pt: 0.5 }, rowH: 0.42, autoPage: false });
    slide.addText("This is the software scope for the proposed design. NCI is licensed per physical CPU core; add-on products follow their own metering. Commercial pricing is provided in a separate quote.", { x: MARGIN, y: PAGE_H - 0.95, w: PAGE_W - MARGIN * 2, h: 0.4, fontFace: NUTANIX_FONT.body, fontSize: 10, color: NUTANIX.slate });
  }

  function addEditionsOverview() {
    const slide = newSlide();
    addChrome(slide, "NCI Software Editions", "Starter · Pro · Ultimate", page);
    const gap = 0.4;
    const cardW = (PAGE_W - MARGIN * 2 - gap * 2) / 3;
    EDITIONS.forEach((e, i) => {
      const x = MARGIN + i * (cardW + gap);
      const selected = e === doc.meta.edition;
      slide.addShape(SHAPE.roundRect, { x, y: 2.0, w: cardW, h: 4.2, rectRadius: 0.08, fill: { color: selected ? NUTANIX.cloud : "FBFAFF" }, line: { color: selected ? NUTANIX.purple : NUTANIX.mist, width: selected ? 2.5 : 1 } });
      slide.addShape(SHAPE.rect, { x, y: 2.0, w: cardW, h: 0.5, fill: { color: selected ? NUTANIX.purple : NUTANIX.slate }, line: { type: "none" } });
      slide.addText(e.toUpperCase(), { x, y: 2.0, w: cardW, h: 0.5, align: "center", valign: "middle", color: "FFFFFF", bold: true, fontFace: NUTANIX_FONT.heading, fontSize: 16 });
      if (selected) slide.addText("✓ SELECTED", { x, y: 2.55, w: cardW, h: 0.3, align: "center", color: NUTANIX.purple, bold: true, fontFace: NUTANIX_FONT.body, fontSize: 10, charSpacing: 1 });
      slide.addText(EDITION_TAGLINE[e], { x: x + 0.25, y: selected ? 3.0 : 2.8, w: cardW - 0.5, h: 1.2, align: "center", fontFace: NUTANIX_FONT.heading, fontSize: 14, bold: true, color: NUTANIX.ink, valign: "top" });
      slide.addText(EDITION_IDEAL[e], { x: x + 0.25, y: 4.3, w: cardW - 0.5, h: 1.7, align: "center", fontFace: NUTANIX_FONT.body, fontSize: 11, color: NUTANIX.gray, valign: "top" });
    });
    slide.addText(`Source: ${NCI_EDITIONS_SOURCE}`, { x: MARGIN, y: PAGE_H - 0.9, w: PAGE_W - MARGIN * 2, h: 0.3, fontFace: NUTANIX_FONT.body, fontSize: 9, color: NUTANIX.slate });
  }

  function editionCell(v: EditionCell): { text: string; tone: "good" | "addon" | "no" | "note" } {
    if (v === true) return { text: "✓", tone: "good" };
    if (v === false) return { text: "No", tone: "no" };
    if (v === "addon") return { text: "Add-on", tone: "addon" };
    return { text: String(v), tone: "note" };
  }

  function addEditionsComparison() {
    const slide = newSlide();
    addChrome(slide, "NCI Software Editions Comparison", `${doc.meta.edition} highlighted`, page);
    const selIdx = EDITIONS.indexOf(doc.meta.edition); // 0..2
    const header = ["Capability", "Starter", "Pro", "Ultimate"].map((h, ci) => ({
      text: h,
      options: { bold: true, color: "FFFFFF", fill: { color: ci - 1 === selIdx ? NUTANIX.indigo : NUTANIX.purple }, fontFace: NUTANIX_FONT.body, fontSize: 10, align: ci === 0 ? "left" : "center", valign: "middle" },
    }));
    const rows: unknown[][] = [];
    for (const section of NCI_EDITION_MATRIX) {
      rows.push([
        { text: section.title, options: { bold: true, color: NUTANIX.purple, fill: { color: "EFEAFE" }, fontFace: NUTANIX_FONT.heading, fontSize: 10, colspan: 4 } },
      ]);
      for (const r of section.rows) {
        const cells = [r.starter, r.pro, r.ultimate].map((v, ci) => {
          const c = editionCell(v);
          const isSel = ci === selIdx;
          const color = c.tone === "good" ? "3F5E0A" : c.tone === "addon" ? "9A3B27" : c.tone === "no" ? NUTANIX.slate : NUTANIX.ink;
          return { text: c.text, options: { align: "center", valign: "middle", color, bold: isSel, fill: { color: isSel ? "F1ECFE" : "FFFFFF" }, fontFace: NUTANIX_FONT.body, fontSize: 9 } };
        });
        rows.push([
          { text: r.feature, options: { color: NUTANIX.ink, fontFace: NUTANIX_FONT.body, fontSize: 9, valign: "middle" } },
          ...cells,
        ]);
      }
    }
    slide.addTable([header, ...rows], { x: MARGIN, y: 1.8, w: PAGE_W - MARGIN * 2, colW: [6.13, 2.0, 2.0, 2.0], border: { type: "solid", color: NUTANIX.line, pt: 0.5 }, rowH: 0.23, autoPage: true, autoPageRepeatHeader: true, autoPageHeaderRows: 1, valign: "middle" });
  }

  function addNcmEditionsOverview() {
    const slide = newSlide();
    addChrome(slide, "NCM Software Editions", "Nutanix Cloud Manager · Starter · Pro · Ultimate", page);
    const gap = 0.4;
    const cardW = (PAGE_W - MARGIN * 2 - gap * 2) / 3;
    EDITIONS.forEach((e, i) => {
      const x = MARGIN + i * (cardW + gap);
      slide.addShape(SHAPE.roundRect, { x, y: 2.0, w: cardW, h: 4.2, rectRadius: 0.08, fill: { color: "FBFAFF" }, line: { color: NUTANIX.mist, width: 1 } });
      slide.addShape(SHAPE.rect, { x, y: 2.0, w: cardW, h: 0.5, fill: { color: NUTANIX.slate }, line: { type: "none" } });
      slide.addText(e.toUpperCase(), { x, y: 2.0, w: cardW, h: 0.5, align: "center", valign: "middle", color: "FFFFFF", bold: true, fontFace: NUTANIX_FONT.heading, fontSize: 16 });
      slide.addText(NCM_EDITION_TAGLINE[e], { x: x + 0.25, y: 2.8, w: cardW - 0.5, h: 1.2, align: "center", fontFace: NUTANIX_FONT.heading, fontSize: 14, bold: true, color: NUTANIX.ink, valign: "top" });
      slide.addText(NCM_EDITION_IDEAL[e], { x: x + 0.25, y: 4.2, w: cardW - 0.5, h: 1.8, align: "center", fontFace: NUTANIX_FONT.body, fontSize: 11, color: NUTANIX.gray, valign: "top" });
    });
    slide.addText(`Source: ${NCI_EDITIONS_SOURCE}`, { x: MARGIN, y: PAGE_H - 0.9, w: PAGE_W - MARGIN * 2, h: 0.3, fontFace: NUTANIX_FONT.body, fontSize: 9, color: NUTANIX.slate });
  }

  function addComparisonTable(title: string, subtitle: string, matrix: EditionSection[], selIdx: number) {
    const slide = newSlide();
    addChrome(slide, title, subtitle, page);
    const header = ["Capability", "Starter", "Pro", "Ultimate"].map((h, ci) => ({
      text: h,
      options: { bold: true, color: "FFFFFF", fill: { color: ci - 1 === selIdx ? NUTANIX.indigo : NUTANIX.purple }, fontFace: NUTANIX_FONT.body, fontSize: 10, align: ci === 0 ? "left" : "center", valign: "middle" },
    }));
    const rows: unknown[][] = [];
    for (const section of matrix) {
      rows.push([
        { text: section.title, options: { bold: true, color: NUTANIX.purple, fill: { color: "EFEAFE" }, fontFace: NUTANIX_FONT.heading, fontSize: 10, colspan: 4 } },
      ]);
      for (const r of section.rows) {
        const cells = [r.starter, r.pro, r.ultimate].map((v, ci) => {
          const c = editionCell(v);
          const isSel = ci === selIdx;
          const color = c.tone === "good" ? "3F5E0A" : c.tone === "addon" ? "9A3B27" : c.tone === "no" ? NUTANIX.slate : NUTANIX.ink;
          return { text: c.text, options: { align: "center", valign: "middle", color, bold: isSel, fill: { color: isSel ? "F1ECFE" : "FFFFFF" }, fontFace: NUTANIX_FONT.body, fontSize: 9 } };
        });
        rows.push([
          { text: r.feature, options: { color: NUTANIX.ink, fontFace: NUTANIX_FONT.body, fontSize: 9, valign: "middle" } },
          ...cells,
        ]);
      }
    }
    slide.addTable([header, ...rows], { x: MARGIN, y: 1.8, w: PAGE_W - MARGIN * 2, colW: [6.13, 2.0, 2.0, 2.0], border: { type: "solid", color: NUTANIX.line, pt: 0.5 }, rowH: 0.23, autoPage: true, autoPageRepeatHeader: true, autoPageHeaderRows: 1, valign: "middle" });
  }

  function addNcmEditionsComparison() {
    addComparisonTable("NCM Software Editions Comparison", "Nutanix Cloud Manager capabilities by edition", NCM_EDITION_MATRIX, -1);
  }

  function addSupportPrograms() {
    const slide = newSlide();
    addChrome(slide, "Product Support Programs", "Choose the right level of support", page);
    const gap = 0.5;
    const cardW = (PAGE_W - MARGIN * 2 - gap) / 2;
    SUPPORT_PROGRAMS.forEach((p, i) => {
      const x = MARGIN + i * (cardW + gap);
      slide.addShape(SHAPE.roundRect, { x, y: 2.0, w: cardW, h: 4.3, rectRadius: 0.08, fill: { color: "FBFAFF" }, line: { color: NUTANIX.mist, width: 1 } });
      slide.addShape(SHAPE.rect, { x, y: 2.0, w: cardW, h: 0.55, fill: { color: NUTANIX.purple }, line: { type: "none" } });
      slide.addText(p.name, { x: x + 0.2, y: 2.0, w: cardW - 0.4, h: 0.55, valign: "middle", color: "FFFFFF", bold: true, fontFace: NUTANIX_FONT.heading, fontSize: 15 });
      slide.addText(p.ideal, { x: x + 0.25, y: 2.7, w: cardW - 0.5, h: 0.9, fontFace: NUTANIX_FONT.body, fontSize: 11, color: NUTANIX.gray, valign: "top" });
      p.rows.forEach((row, ri) => {
        const y = 3.7 + ri * 0.5;
        slide.addText(row.label, { x: x + 0.25, y, w: cardW * 0.6, h: 0.45, valign: "middle", fontFace: NUTANIX_FONT.body, fontSize: 11, color: NUTANIX.gray });
        slide.addText(row.value, { x: x + cardW * 0.6, y, w: cardW * 0.4 - 0.25, h: 0.45, align: "right", valign: "middle", fontFace: NUTANIX_FONT.heading, fontSize: 12, bold: true, color: NUTANIX.ink });
      });
    });
    slide.addText("** 4-hour parts arrival not available in all locations. NBD delivery varies by region.", { x: MARGIN, y: PAGE_H - 0.9, w: PAGE_W - MARGIN * 2, h: 0.3, fontFace: NUTANIX_FONT.body, fontSize: 9, color: NUTANIX.slate });
  }

  // Node spec sheets (unique SKUs, with diagrams when available)
  const seen = new Set<string>();
  for (const cluster of doc.scenario.clusters) {
    for (const m of cluster.models) {
      if (seen.has(m.sku)) continue;
      seen.add(m.sku);
      const slide = newSlide();
      const plat = platformSpecFor(m.sku);
      const genLabel = plat ? `${plat.family} · ${plat.generation} · ${plat.formFactor}` : "Configure-to-order platform specification";
      addChrome(slide, `${m.sku} Node Overview`, genLabel, page);
      const frontImg = nodeImages[m.sku];
      const rearImg = nodeRearImages[m.sku];
      const hasImg = Boolean(frontImg || rearImg);

      // Drive-bay occupancy (empty slots) — only when we know the bay count.
      const used = drivesPerNode(m.drives);
      const empty = emptyDriveSlots(m.sku, m.drives);
      const bays = plat?.maxDriveBays ?? null;

      const specX = MARGIN;
      const specW = hasImg ? 6.6 : PAGE_W - MARGIN * 2;
      const specs: [string, string][] = [
        ["Server Compute", cpuSummary(m)],
        ["Memory", memorySummary(m)],
        ["Storage Capacity", storageSummary(m)],
        ["Network", m.nic ?? "N/A"],
        ["Nodes / Block", String(m.nodesInBlock)],
        ["Cores / Node", String(nodeCores(m) || "N/A")],
        ["Raw Storage / Node", `${nodeRawStorageTB(m).toFixed(2)} TB`],
      ];
      if (bays != null) specs.push(["Drive Bays", `${used} of ${bays} populated${empty != null ? ` · ${empty} empty` : ""}`]);
      if (m.gpu) specs.push(["GPU", m.gpu]);
      const header = ["Specification", "Detail"].map((h) => ({ text: h, options: { bold: true, color: "FFFFFF", fill: { color: NUTANIX.purple }, fontFace: NUTANIX_FONT.body, fontSize: 11, valign: "middle" } }));
      const body = specs.map((row, ri) =>
        row.map((c, ci) => ({ text: c, options: { color: NUTANIX.ink, fill: { color: ri % 2 ? "F7F6FD" : "FFFFFF" }, fontFace: NUTANIX_FONT.body, fontSize: 10, bold: ci === 0, valign: "middle" } })),
      );
      slide.addTable([header, ...body], { x: specX, y: 1.95, w: specW, colW: [2.2, specW - 2.2], border: { type: "solid", color: NUTANIX.line, pt: 0.5 }, rowH: 0.44, autoPage: false });

      // Right column: front + rear product renders (aspect-preserved), then the
      // platform reference envelope.
      const rx = 7.5;
      const rw = 5.0;
      let refTop = 1.95;
      if (hasImg) {
        slide.addText("PRODUCT DIAGRAM", { x: rx, y: 1.9, w: rw, h: 0.3, fontFace: NUTANIX_FONT.heading, fontSize: 11, bold: true, color: NUTANIX.purple, charSpacing: 1 });
        if (frontImg) {
          slide.addText("Front", { x: rx, y: 2.24, w: rw, h: 0.22, fontFace: NUTANIX_FONT.body, fontSize: 9, color: NUTANIX.slate });
          placeImage(slide, frontImg, { x: rx, y: 2.46, w: rw, h: 1.0 }, "center", "middle");
        }
        if (rearImg) {
          slide.addText("Rear", { x: rx, y: 3.52, w: rw, h: 0.22, fontFace: NUTANIX_FONT.body, fontSize: 9, color: NUTANIX.slate });
          placeImage(slide, rearImg, { x: rx, y: 3.74, w: rw, h: 1.0 }, "center", "middle");
        }
        refTop = 4.95;
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
        const py = hasImg ? refTop : 3.4;
        const boxH = PAGE_H - py - 0.7;
        slide.addShape(SHAPE.roundRect, { x: rx, y: py, w: rw, h: boxH, rectRadius: 0.06, fill: { color: "FBFAFF" }, line: { color: NUTANIX.mist, width: 1 } });
        slide.addText("PLATFORM REFERENCE", { x: rx + 0.2, y: py + 0.13, w: rw - 0.4, h: 0.3, fontFace: NUTANIX_FONT.heading, fontSize: 10, bold: true, color: NUTANIX.purple, charSpacing: 1 });
        slide.addText(
          rows.flatMap((r) => [
            { text: `${r[0]}:  `, options: { bold: true, fontFace: NUTANIX_FONT.body, fontSize: hasImg ? 8.5 : 9.5, color: NUTANIX.purple, breakLine: false } },
            { text: r[1], options: { fontFace: NUTANIX_FONT.body, fontSize: hasImg ? 8.5 : 9.5, color: NUTANIX.ink, breakLine: true, paraSpaceAfter: hasImg ? 2 : 4 } },
          ]),
          { x: rx + 0.2, y: py + 0.46, w: rw - 0.4, h: boxH - 0.6, valign: "top" },
        );
      }
    }
  }

  // Implementation plan — the delivery workstreams (Furman-style)
  {
    const slide = newSlide();
    addChrome(slide, "Implementation Plan", "How we get you deployed, migrated, and enabled", page);
    const gap = 0.35;
    const cardW = (PAGE_W - MARGIN * 2 - gap * 3) / 4;
    IMPLEMENTATION_PLAN.forEach((phase, i) => {
      const x = MARGIN + i * (cardW + gap);
      const y = 1.95;
      const h = 4.35;
      slide.addShape(SHAPE.roundRect, { x, y, w: cardW, h, rectRadius: 0.08, fill: { color: "FBFAFF" }, line: { color: NUTANIX.mist, width: 1 } });
      slide.addShape(SHAPE.rect, { x, y, w: cardW, h: 0.7, fill: { color: NUTANIX.purple }, line: { type: "none" } });
      slide.addText(`${i + 1}.  ${phase.title}`, { x: x + 0.15, y, w: cardW - 0.3, h: 0.7, valign: "middle", align: "center", color: "FFFFFF", bold: true, fontFace: NUTANIX_FONT.heading, fontSize: 13 });
      slide.addText(phase.subtitle, { x: x + 0.2, y: y + 0.85, w: cardW - 0.4, h: 0.5, align: "center", fontFace: NUTANIX_FONT.body, fontSize: 10, italic: true, color: NUTANIX.slate, valign: "top" });
      slide.addText(
        phase.items.map((s) => ({ text: s, options: { bullet: { code: "2022", indent: 12 }, fontSize: 10, color: NUTANIX.ink, fontFace: NUTANIX_FONT.body, breakLine: true, paraSpaceAfter: 8 } })),
        { x: x + 0.2, y: y + 1.5, w: cardW - 0.4, h: h - 1.6, valign: "top" },
      );
    });
    slide.addText(IMPLEMENTATION_ADDON_NOTE, { x: MARGIN, y: PAGE_H - 0.9, w: PAGE_W - MARGIN * 2, h: 0.3, fontFace: NUTANIX_FONT.body, fontSize: 10, italic: true, color: NUTANIX.slate });
  }

  // Implementation considerations
  {
    const slide = newSlide();
    addChrome(slide, "Implementation Considerations", "Networking, power, and deployment prerequisites", page);
    const items = [
      "Two top-of-rack switches recommended per Nutanix physical networking best practice.",
      "At least two 10/25GbE ports per node plus one 1GbE out-of-band (IPMI) port for Foundation.",
      "Switch ports and SFP+/SFP28 transceivers or twinax cables are required (sourced via partner).",
      "Nutanix ships C14-to-C13 PDU-style power cables only; PSU redundancy requires 110V where applicable.",
      "Confirm power and cooling headroom in the destination rack(s).",
      "Confirm any Windows/SQL licensing with your licensing partner.",
    ];
    slide.addText(items.map((s) => ({ text: s, options: { bullet: { code: "2022", indent: 16 }, fontSize: 14, color: NUTANIX.ink, fontFace: NUTANIX_FONT.body, paraSpaceAfter: 10, breakLine: true } })), { x: MARGIN, y: 2.0, w: PAGE_W - MARGIN * 2, h: 4.5, valign: "top" });
  }

  // Thank you (mirrors the branded cover)
  {
    const slide = newSlide();
    slide.background = { color: NUTANIX.deepPurple };
    if (brand.coverBg) slide.addImage({ data: brand.coverBg.data, x: 0, y: 0, w: PAGE_W, h: PAGE_H });
    else slide.addShape(SHAPE.rect, { x: 0, y: 0, w: PAGE_W, h: PAGE_H, fill: { color: NUTANIX.deepPurple }, line: { type: "none" } });
    placeImage(slide, brand.wordmarkWhite, { x: 1.0, y: 0.7, w: 3.4, h: 0.5 }, "left", "middle");
    slide.addText("Thank You", { x: 0, y: 3.0, w: PAGE_W, h: 1.2, align: "center", fontFace: NUTANIX_FONT.heading, fontSize: 44, bold: true, color: "FFFFFF" });
    slide.addText(doc.meta.customer, { x: 0, y: 4.3, w: PAGE_W, h: 0.5, align: "center", fontFace: NUTANIX_FONT.body, fontSize: 16, color: NUTANIX.cyan });
  }

  await pptx.writeFile({ fileName: `Solution Proposal - ${doc.meta.customer}.pptx` });
}

type BomLine = { code: string; description: string; qty: number };

function aggregateComponents(doc: ProposalDoc, kind: "hardware" | "software"): BomLine[] {
  const map = new Map<string, BomLine>();
  for (const cluster of doc.scenario.clusters) {
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
