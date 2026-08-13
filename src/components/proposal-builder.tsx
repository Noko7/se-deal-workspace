"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, Download, FileDown, FileJson, FileText, HelpCircle, ImagePlus, Layers, Pencil, Receipt, RefreshCw, Sparkles, Upload, X, ZoomIn, ZoomOut } from "lucide-react";
import { EditableText } from "@/components/inline-edit";
import { parseSizerScenario, type ProposalScenario } from "@/lib/sizer-import";
import { applyDealMode, buildProposalDoc, EXTERNAL_STORAGE_VENDORS, purchasedProducts, type ProposalDoc } from "@/lib/proposal-doc";
import { buildSampleScenario, SAMPLE_PROPOSAL_LABEL } from "@/lib/proposal-sample";
import { exportProposalToPptx, type ProposalBrandImages, type ImgAsset } from "@/lib/proposal-pptx";
import { hardwareImageFor, hardwareRearImageFor } from "@/lib/hardware-images";
import { getProductIcon } from "@/lib/nutanix-icons";
import { type EditionKey } from "@/lib/nci-editions";
import { BASE_PLATFORMS, hasBrandIcon, isBasePlatform, LICENSE_CATALOG, LICENSE_PRODUCT_ORDER, licenseBlurb, newLicenseLine, type LicenseLine, type LicenseProductKey } from "@/lib/license-catalog";
import { ProposalBomPreview, ProposalTwoPager } from "@/components/proposal-preview";
import { Button } from "@/components/ui";

// Fluid-CSS motion (MOTION_INTENSITY 6): a single easing curve and a tactile
// press, applied to every interactive surface so the whole tool feels physical.
// Compositor-only (transform), so it stays at 60fps on the print-heavy page.
const TACTILE =
  "transition-[transform,background-color,border-color,box-shadow,color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:translate-y-[1px]";
// A soft, accent-tinted diffusion shadow — depth without an outer neon glow.
const SURFACE_SHADOW = "shadow-[0_18px_40px_-28px_rgba(120,85,250,0.45)]";

// Shared style for selectable toggle chips. Selected reads as a tinted, outlined
// chip (not a solid purple block) so a row of them stays clean and legible.
function toggleClass(selected: boolean): string {
  return [
    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold",
    TACTILE,
    "active:scale-[0.98]",
    selected
      ? "border-iris-400 bg-iris-100 text-iris-700 ring-1 ring-iris-200"
      : "border-charcoal-300 bg-white text-charcoal-700 hover:-translate-y-px hover:border-iris-400 hover:bg-iris-50",
  ].join(" ");
}

// Non-spinner working indicator (three breathing dots). The skill bans generic
// circular spinners for loading; this reuses the shared breathe keyframe.
function WorkingDots({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="sizer-breathe h-1.5 w-1.5 rounded-full bg-current"
          style={{ animationDelay: `${i * 220}ms` }}
        />
      ))}
    </span>
  );
}

function measureDataUrl(data: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = data;
  });
}

// Fetch an image and return it as a data URL together with its intrinsic pixel
// size, so the .pptx exporter can place it without distorting the aspect ratio.
async function loadImageAsset(url: string): Promise<ImgAsset | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const data = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (!data) return null;
    const dims = await measureDataUrl(data);
    if (!dims) return null;
    return { data, w: dims.w, h: dims.h };
  } catch {
    return null;
  }
}

export function ProposalBuilder({ defaultSe }: { defaultSe: string }) {
  const [doc, setDoc] = useState<ProposalDoc | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  // Zoom multiplier on top of the fit-to-width scale (1 = fit). Lets an SE zoom
  // in to edit small text comfortably; the container scrolls when zoomed past fit.
  const [zoom, setZoom] = useState(1);
  const [tab, setTab] = useState<"twopager" | "bom">("twopager");
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<null | "pdf" | "pptx">(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  function loadScenario(scenario: ProposalScenario) {
    const built = buildProposalDoc(scenario);
    if (!built.meta.preparedBy || built.meta.preparedBy === "Nutanix SE") built.meta.preparedBy = defaultSe;
    setDoc(built);
    setError(null);
  }

  async function handleFile(file: File) {
    if (file.type && !/json/i.test(file.type) && !/\.json$/i.test(file.name)) {
      setDoc(null);
      setError("That is not a JSON file. Export your scenario from sizer.nutanix.com as JSON and try again.");
      return;
    }
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      loadScenario(parseSizerScenario(json));
    } catch (err) {
      setDoc(null);
      setError(err instanceof Error ? err.message : "Could not read that file. Upload a Nutanix Sizer scenario JSON export.");
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await handleFile(file);
  }

  // Shared drag-and-drop handlers for the upload dropzone.
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!dragging) setDragging(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  function patch(updater: (d: ProposalDoc) => ProposalDoc) {
    setDoc((d) => (d ? updater(structuredCloneSafe(d)) : d));
  }

  function exportPdf() {
    setExporting("pdf");
    setTab("twopager");
    // allow the print surface to mount, then print
    window.setTimeout(() => {
      window.print();
      setExporting(null);
    }, 200);
  }

  async function exportPptx() {
    if (!doc) return;
    setExporting("pptx");
    try {
      const skus = new Set<string>();
      doc.scenario.clusters.forEach((c) => c.models.forEach((m) => skus.add(m.sku)));
      const images: Record<string, ImgAsset> = {};
      const rearImages: Record<string, ImgAsset> = {};
      const brand: ProposalBrandImages = { productIcons: {} };
      const usesPure = Boolean(doc.options?.externalStorage) && (doc.options?.externalStorageVendor ?? "Pure Storage") === "Pure Storage";
      await Promise.all([
        ...[...skus].map(async (sku) => {
          const path = hardwareImageFor(sku);
          if (path) {
            const asset = await loadImageAsset(path);
            if (asset) images[sku] = asset;
          }
          const rearPath = hardwareRearImageFor(sku);
          if (rearPath) {
            const rear = await loadImageAsset(rearPath);
            if (rear) rearImages[sku] = rear;
          }
        }),
        ...purchasedProducts(doc).map(async (p) => {
          const asset = await loadImageAsset(getProductIcon(p, "Color", "text"));
          if (asset) brand.productIcons![p] = asset;
        }),
        loadImageAsset("/brand/deck-cover.png").then((a) => { if (a) brand.coverBg = a; }),
        loadImageAsset("/brand/nutanix-wordmark-white.png").then((a) => { if (a) brand.wordmarkWhite = a; }),
        loadImageAsset("/brand/nutanix-mark-black.png").then((a) => { if (a) brand.markBlack = a; }),
        usesPure ? loadImageAsset("/brand/pure-storage.png").then((a) => { if (a) brand.pureLogo = a; }) : Promise.resolve(),
      ]);
      // The uploaded customer logo is already a data URL; measure it for aspect-safe placement.
      let logoAsset: ImgAsset | null = null;
      if (logo) {
        const dims = await measureDataUrl(logo);
        if (dims) logoAsset = { data: logo, w: dims.w, h: dims.h };
      }
      await exportProposalToPptx(doc, logoAsset, images, brand, rearImages);
    } finally {
      setExporting(null);
    }
  }

  // --- Upload step -----------------------------------------------------------
  // Anti-center-bias (DESIGN_VARIANCE 8): a left-aligned brief on a fractional
  // grid, with the dropzone as the right-hand asset. Collapses to one column
  // under md so it never scrolls sideways on phones.
  if (!doc) {
    return (
      <div className="grid items-stretch gap-6 md:grid-cols-[1.05fr_0.95fr]">
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />

        <div className="sizer-rise flex flex-col" style={{ "--index": 0 } as React.CSSProperties}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-iris-600">Solution Brief · BOM Deck</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-charcoal-900 md:text-2xl">
                Turn a Sizer export into a customer-ready proposal.
              </h2>
              <p className="mt-1.5 max-w-[46ch] text-sm leading-relaxed text-charcoal-500">
                Drop a Nutanix Sizer scenario and get an on-brand 2-page brief and a polished BOM deck — editable inline, exportable to PDF and PowerPoint.
              </p>
            </div>
            <HelpPopover />
          </div>

          <ol className="mb-4 divide-y divide-charcoal-100 rounded-2xl border border-charcoal-200 bg-white">
            {UPLOAD_STEPS.map((step, i) => (
              <li
                key={i}
                className="sizer-rise flex items-start gap-3 px-4 py-3"
                style={{ "--index": i + 1 } as React.CSSProperties}
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-iris-50 text-[11px] font-bold text-iris-700 ring-1 ring-iris-100">
                  {i + 1}
                </span>
                <span className="text-[13px] leading-relaxed text-charcoal-600">{step}</span>
              </li>
            ))}
          </ol>

          <div className="mt-auto flex flex-wrap items-center gap-3">
            <button
              onClick={() => loadScenario(buildSampleScenario(defaultSe))}
              className={`inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-iris-700 ring-1 ring-iris-200 hover:-translate-y-px hover:bg-iris-50 ${TACTILE}`}
            >
              <Sparkles className="h-4 w-4" /> Load {SAMPLE_PROPOSAL_LABEL}
            </button>
            <span className="text-xs text-charcoal-400">No export handy? Start from a sample.</span>
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
            >
              <X className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          onDragOver={onDragOver}
          onDragEnter={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          aria-label="Upload or drop a Nutanix Sizer scenario JSON file"
          className={`sizer-rise flex min-h-[16rem] w-full flex-col items-start justify-center gap-4 rounded-2xl border-2 border-dashed p-8 text-left ${TACTILE} active:scale-[0.99] ${
            dragging
              ? "scale-[1.01] border-iris-500 bg-iris-100 ring-4 ring-iris-200/60"
              : `border-charcoal-300 bg-white hover:-translate-y-0.5 hover:border-iris-400 hover:bg-iris-50/40 ${SURFACE_SHADOW} dark:border-iris-500/40 dark:bg-charcoal-50`
          }`}
          style={{ "--index": 1 } as React.CSSProperties}
        >
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-2xl text-iris-600 ${TACTILE} ${dragging ? "scale-110 bg-iris-200" : "bg-iris-100"}`}
          >
            <Upload className="h-7 w-7" strokeWidth={1.75} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-charcoal-900">
            {dragging ? "Drop to build the proposal" : "Drop a Sizer scenario"}
          </span>
          <span className="max-w-sm text-sm leading-relaxed text-charcoal-500">
            In sizer.nutanix.com, open your scenario, then Actions → Export → JSON. Drag the file here, or click anywhere in this panel to browse.
          </span>
          <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-iris-600">
            <FileJson className="h-4 w-4" /> Accepts .json
          </span>
        </button>
      </div>
    );
  }

  // --- Builder ---------------------------------------------------------------
  return (
    <div className="space-y-4">
      <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
      <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={onLogo} />

      <div className={`sizer-rise flex flex-wrap items-center gap-3 rounded-2xl border border-charcoal-200 bg-white p-3 ${SURFACE_SHADOW}`} style={{ "--index": 0 } as React.CSSProperties}>
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-iris-50 text-iris-600">
            <FileJson className="h-5 w-5" strokeWidth={1.75} />
            <span className="sizer-breathe absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-mantis ring-2 ring-white" aria-hidden />
          </span>
          <div>
            <EditableText
              inline
              value={doc.meta.customer}
              className="text-sm font-semibold tracking-tight text-charcoal-900"
              onCommit={(v) =>
                patch((d) => {
                  const defaultTitle = d.options.externalStorage
                    ? `Nutanix with External Storage Proposal for ${d.meta.customer}`
                    : `Nutanix Solution Proposal for ${d.meta.customer}`;
                  if (d.meta.title === defaultTitle) {
                    d.meta.title = d.options.externalStorage
                      ? `Nutanix with External Storage Proposal for ${v}`
                      : `Nutanix Solution Proposal for ${v}`;
                  }
                  d.meta.customer = v;
                  return d;
                })
              }
            />
            <p className="text-xs text-charcoal-500">
              {doc.scenario.totals.clusters} clusters · {doc.scenario.totals.nodes} nodes · {doc.scenario.totals.cores} cores
            </p>
          </div>
        </div>
        <span className="flex flex-1 items-center justify-center gap-1.5 text-xs text-charcoal-500">
          <Pencil className="h-3.5 w-3.5 text-iris-500" /> Click any text on the page to edit it.
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {logo ? (
            <span className="flex items-center gap-2 rounded-lg border border-charcoal-300 bg-white px-2 py-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="logo" className="h-6 w-auto max-w-[90px] object-contain" />
              <button onClick={() => setLogo(null)} className={`rounded bg-transparent text-charcoal-400 hover:text-rose-600 ${TACTILE}`} aria-label="Remove logo">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : (
            <Button tone="secondary" className={TACTILE} onClick={() => logoInput.current?.click()}>
              <span className="flex items-center gap-1.5"><ImagePlus className="h-4 w-4" strokeWidth={1.75} /> Customer logo</span>
            </Button>
          )}
          <Button tone="secondary" className={TACTILE} onClick={() => fileInput.current?.click()}>
            <span className="flex items-center gap-1.5"><RefreshCw className="h-4 w-4" strokeWidth={1.75} /> Change file</span>
          </Button>
          <Button className={TACTILE} onClick={exportPdf} disabled={exporting !== null}>
            <span className="flex items-center gap-1.5">{exporting === "pdf" ? <WorkingDots /> : <FileDown className="h-4 w-4" strokeWidth={1.75} />} 2-Pager PDF</span>
          </Button>
          <Button className={TACTILE} onClick={exportPptx} disabled={exporting !== null}>
            <span className="flex items-center gap-1.5">{exporting === "pptx" ? <WorkingDots /> : <Download className="h-4 w-4" strokeWidth={1.75} />} BOM .pptx</span>
          </Button>
          <HelpPopover />
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[380px_1fr]">
        {/* Editor — flows the full height of the page (no internal scroll cap). */}
        <div className="sizer-rise space-y-3 pr-1" style={{ "--index": 1 } as React.CSSProperties}>
          <Section title="Deal type" icon={<FileText className="h-4 w-4" />} defaultOpen>
            {/* Switching to external storage reframes the customer-facing copy. */}
            <div>
              <p className="mb-1 text-[11px] font-semibold text-charcoal-600">Deal type</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  [false, "Full platform"],
                  [true, "External storage"],
                ] as const).map(([ext, label]) => {
                  const selected = Boolean(doc.options?.externalStorage) === ext;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setDoc((d) => (d ? applyDealMode(d, ext) : d))}
                      aria-pressed={selected}
                      className={toggleClass(selected)}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${selected ? "border-iris-500 bg-iris-500 text-white" : "border-charcoal-300"}`}>
                        {selected ? <Check className="h-3 w-3" /> : null}
                      </span>
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-charcoal-400">External storage reframes the narrative around Nutanix compute (AHV) running against an external enterprise array.</p>
              {doc.options?.externalStorage ? (
                <div className="mt-2">
                  <p className="mb-1 text-[11px] font-semibold text-charcoal-600">External storage array</p>
                  <div className="grid grid-cols-2 gap-2">
                    {EXTERNAL_STORAGE_VENDORS.map((v) => {
                      const selected = (doc.options?.externalStorageVendor ?? "Pure Storage") === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setDoc((d) => (d ? applyDealMode(d, true, v) : d))}
                          aria-pressed={selected}
                          className={toggleClass(selected)}
                        >
                          <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${selected ? "border-iris-500 bg-iris-500 text-white" : "border-charcoal-300"}`}>
                            {selected ? <Check className="h-3 w-3" /> : null}
                          </span>
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          </Section>

          <Section title="Software scope" icon={<Receipt className="h-4 w-4" />} defaultOpen>
            <LicensingEditor doc={doc} patch={patch} />
            <Field label="Support term" value={doc.meta.supportTerm} onChange={(v) => patch((d) => ((d.meta.supportTerm = v), d))} />
            <label className="flex items-center gap-2 text-xs font-medium text-charcoal-700">
              <input
                type="checkbox"
                checked={doc.options?.includeSoftwareSlides ?? true}
                onChange={(e) => patch((d) => ((d.options ??= { includeSoftwareSlides: true, externalStorage: false, externalStorageVendor: "Pure Storage" }), (d.options.includeSoftwareSlides = e.target.checked), d))}
                className="h-4 w-4 accent-iris-500"
              />
              Include full NCI editions comparison + support slides in the .pptx
            </label>
          </Section>
        </div>

        {/* Preview */}
        <div className="sizer-rise space-y-3" style={{ "--index": 2 } as React.CSSProperties}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-xl border border-charcoal-300 bg-charcoal-100 p-1 text-sm">
              <button onClick={() => setTab("twopager")} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold ${TACTILE} ${tab === "twopager" ? "bg-white text-iris-700 shadow-sm ring-1 ring-iris-200" : "bg-transparent text-charcoal-700 hover:bg-white/60 hover:text-charcoal-900"}`}>
                <FileText className="h-4 w-4" strokeWidth={1.75} /> 2-Pager (PDF)
              </button>
              <button onClick={() => setTab("bom")} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold ${TACTILE} ${tab === "bom" ? "bg-white text-iris-700 shadow-sm ring-1 ring-iris-200" : "bg-transparent text-charcoal-700 hover:bg-white/60 hover:text-charcoal-900"}`}>
                <Layers className="h-4 w-4" strokeWidth={1.75} /> BOM Deck
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden items-center gap-1.5 text-[11px] font-medium text-charcoal-400 sm:flex">
                <span className="sizer-breathe h-2 w-2 rounded-full bg-mantis" aria-hidden />
                {exporting ? "Preparing export" : "Live preview"}
              </span>
              {tab === "twopager" ? (
                <div className="inline-flex items-center gap-1 rounded-xl border border-charcoal-300 bg-white p-1 text-xs">
                  <button onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))} disabled={zoom <= 0.5} className={`rounded-lg bg-transparent p-1.5 text-charcoal-700 hover:bg-iris-50 hover:text-iris-700 disabled:cursor-not-allowed disabled:opacity-40 ${TACTILE}`} aria-label="Zoom out" title="Zoom out">
                    <ZoomOut className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button onClick={() => setZoom(1)} className={`min-w-[3.5rem] rounded-lg bg-transparent px-2 py-1 text-center font-semibold text-charcoal-800 hover:bg-charcoal-100 ${TACTILE}`} title="Reset to fit width">
                    {Math.round(zoom * 100)}%
                  </button>
                  <button onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))} disabled={zoom >= 2} className={`rounded-lg bg-transparent p-1.5 text-charcoal-700 hover:bg-iris-50 hover:text-iris-700 disabled:cursor-not-allowed disabled:opacity-40 ${TACTILE}`} aria-label="Zoom in" title="Zoom in">
                    <ZoomIn className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {/* Export shimmer scrim: a layout-matched sweep instead of a spinner. */}
          <div className={`relative rounded-2xl ${exporting ? "sizer-shimmer" : ""}`}>
            {tab === "twopager" ? (
              <div className={`rounded-2xl border border-charcoal-200 bg-charcoal-100 p-4 ${SURFACE_SHADOW}`}>
                <PreviewScaler zoom={zoom}>
                  <ProposalTwoPager doc={doc} logo={logo} editable patch={patch} />
                </PreviewScaler>
              </div>
            ) : (
              <ProposalBomPreview doc={doc} />
            )}
          </div>
        </div>
      </div>

      {/* Off-screen print surface for the 2-page PDF. */}
      <div className="proposal-print-root" aria-hidden>
        <ProposalTwoPager doc={doc} logo={logo} />
      </div>
    </div>
  );
}

// Scales the fixed 816px Letter pages to fit the preview column, times an
// optional zoom multiplier. Measures the container with a ResizeObserver (same
// pattern as the QBR slide frame) and reserves the exact scaled box, so nothing
// clips or overlaps below; the container scrolls when zoomed past fit width.
const PROPOSAL_PAGE_W = 816;

function PreviewScaler({ children, zoom = 1 }: { children: React.ReactNode; zoom?: number }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const [contentH, setContentH] = useState(0);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const update = () => {
      setFit(Math.min(1, outer.clientWidth / PROPOSAL_PAGE_W));
      setContentH(inner.offsetHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  const scale = fit * zoom;
  const scaledW = PROPOSAL_PAGE_W * scale;

  return (
    <div ref={outerRef} className="w-full overflow-auto">
      {/* Reserves the scaled footprint and centers the page when it fits. */}
      <div className="relative mx-auto" style={{ width: scaledW || undefined, height: contentH * scale || undefined }}>
        <div
          ref={innerRef}
          className="absolute left-0 top-0 flex flex-col items-center gap-5 [&>.proposal-page]:shadow-xl"
          style={{ width: PROPOSAL_PAGE_W, transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

// Concise, no-jargon steps for the upload screen's left column.
const UPLOAD_STEPS: string[] = [
  "In Sizer, set the licensing (NCI edition, NCI-C for external storage, or EUC) — this tool reads it from your export.",
  "Export the scenario as JSON: Actions → Export → JSON.",
  "Drop the file on the right, then review, edit inline, and export to PDF or PowerPoint.",
];

// A small "?" button that reveals plain, no-jargon usage steps. Closes on
// Escape or an outside click, and is fully keyboard reachable.
const HELP_STEPS: string[] = [
  "In Sizer, size the scenario and set the correct Nutanix licensing (NCI edition, NCI-C for external storage, or EUC). This tool reads the licensing from your export, so set it there first.",
  "Export the scenario as JSON: Actions, then Export, then JSON.",
  "Drag the JSON file onto this page, or click the upload area to browse.",
  "Review the 2-page brief and BOM deck, edit any text inline, then export to PDF or PowerPoint.",
];

function HelpPopover({ align = "right" }: { align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="How to use the Proposal Builder"
        className={`flex h-10 w-10 items-center justify-center rounded-full border border-charcoal-300 bg-white text-iris-600 hover:-translate-y-px hover:border-iris-400 hover:bg-iris-50 hover:text-iris-700 ${TACTILE}`}
      >
        <HelpCircle className="h-6 w-6" strokeWidth={1.75} />
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="How to use the Proposal Builder"
          className={`absolute z-30 mt-2 w-80 rounded-xl border border-charcoal-200 bg-white p-4 shadow-xl ${align === "right" ? "right-0" : "left-0"}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-charcoal-900">How to use this tool</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close help" className="rounded-md bg-transparent p-0.5 text-charcoal-400 hover:text-charcoal-700">
              <X className="h-4 w-4" />
            </button>
          </div>
          <ol className="space-y-2">
            {HELP_STEPS.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-xs leading-relaxed text-charcoal-600">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-iris-100 text-[11px] font-semibold text-iris-700">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 rounded-lg bg-iris-50 px-2.5 py-2 text-[11px] leading-relaxed text-iris-700">
            Tip: external storage builds are detected automatically and reframe the copy and logos.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, icon, defaultOpen, children }: { title: string; icon: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="overflow-hidden rounded-2xl border border-charcoal-200 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`flex w-full items-center justify-between bg-transparent px-3.5 py-3 text-left hover:bg-charcoal-50 ${TACTILE}`}>
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-charcoal-800">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-iris-50 text-iris-600">{icon}</span>
          {title}
        </span>
        <ChevronDown className={`h-4 w-4 text-charcoal-400 transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${open ? "rotate-180 text-iris-500" : ""}`} strokeWidth={1.75} />
      </button>
      {open ? <div className="space-y-3 border-t border-charcoal-100 px-3.5 py-3.5">{children}</div> : null}
    </div>
  );
}

function structuredCloneSafe<T>(obj: T): T {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function Field({ label, value, onChange, helper }: { label: string; value: string; onChange: (v: string) => void; helper?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-charcoal-700">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full" />
      {helper ? <span className="block text-[11px] text-charcoal-400">{helper}</span> : null}
    </label>
  );
}

function LicensingEditor({ doc, patch }: { doc: ProposalDoc; patch: (u: (d: ProposalDoc) => ProposalDoc) => void }) {
  const lines = doc.licensing.lines;
  const baseLine = lines.find((l) => isBasePlatform(l.product)) ?? null;
  const addonLines = lines.filter((l) => !isBasePlatform(l.product));

  const updateLine = (id: string, mut: (l: LicenseLine) => void) =>
    patch((d) => {
      const l = d.licensing.lines.find((x) => x.id === id);
      if (l) {
        mut(l);
        if (l.product === "CloudInfrastructure" || l.product === "ComputeInfrastructure") d.meta.edition = l.tier as EditionKey;
      }
      return d;
    });
  const removeLine = (id: string) =>
    patch((d) => ((d.licensing.lines = d.licensing.lines.filter((x) => x.id !== id || isBasePlatform(x.product))), d));
  const setTerm = (n: number) =>
    patch((d) => ((d.licensing.termYears = Math.max(1, Math.round(n) || 1)), d));

  // Swap the base platform (NCI <-> EUC) in place, keeping the licensed quantity.
  const setBasePlatform = (product: LicenseProductKey) =>
    patch((d) => {
      const cat = LICENSE_CATALOG[product];
      const preferredTier = cat.tiers.includes("Pro") ? "Pro" : cat.tiers[cat.tiers.length - 1];
      const base = d.licensing.lines.find((l) => isBasePlatform(l.product));
      if (base) {
        const keepTier = cat.tiers.includes(base.tier) ? base.tier : preferredTier;
        base.product = product;
        base.unit = cat.unit;
        base.tier = keepTier;
      } else {
        d.licensing.lines = [newLicenseLine(product, { tier: preferredTier }), ...d.licensing.lines];
      }
      if (product === "CloudInfrastructure" || product === "ComputeInfrastructure") {
        const t = d.licensing.lines.find((l) => l.product === product)?.tier;
        d.meta.edition = (t as EditionKey) ?? "Pro";
      }
      return d;
    });

  // Add-on chips toggle a product line on/off.
  const toggleAddon = (product: LicenseProductKey) =>
    patch((d) => {
      const exists = d.licensing.lines.some((l) => l.product === product);
      d.licensing.lines = exists
        ? d.licensing.lines.filter((l) => l.product !== product)
        : [...d.licensing.lines, newLicenseLine(product)];
      return d;
    });

  return (
    <div className="rounded-2xl border border-charcoal-200 bg-charcoal-50/60 p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-iris-700">Included software</p>
        <label className="flex items-center gap-1.5 text-xs font-medium text-charcoal-600">
          Term
          <input type="number" min={1} value={doc.licensing.termYears} onChange={(e) => setTerm(Number(e.target.value))} className="w-14 text-center" />
          yrs
        </label>
      </div>

      {/* Base platform: NCI, NCI-C (external storage), or EUC (mutually exclusive). */}
      <p className="mb-1 text-[11px] font-semibold text-charcoal-600">Base platform <span className="font-normal text-charcoal-400">(choose one)</span></p>
      <div className="mb-2 grid grid-cols-3 gap-2">
        {BASE_PLATFORMS.map((p) => {
          const selected = baseLine?.product === p;
          return (
            <button key={p} type="button" onClick={() => setBasePlatform(p)} aria-pressed={selected} className={toggleClass(selected)}>
              <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${selected ? "border-iris-500 bg-iris-500 text-white" : "border-charcoal-300"}`}>
                {selected ? <Check className="h-3 w-3" /> : null}
              </span>
              {LICENSE_CATALOG[p].label}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {(baseLine ? [baseLine, ...addonLines] : addonLines).map((l) => {
          const cat = LICENSE_CATALOG[l.product];
          const base = isBasePlatform(l.product);
          return (
            <div key={l.id} className={`rounded-xl border p-2.5 ${base ? "border-iris-200 bg-iris-50/60" : "border-charcoal-200 bg-white"}`}>
              <div className="flex items-center gap-2">
                {/* Brand icon where one exists; EUC and NCI-C fall back to a text badge. */}
                {hasBrandIcon(l.product) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={getProductIcon(l.product, "Color", "abbreviated")} alt={cat.label} className="h-5 w-5 shrink-0 object-contain" />
                ) : (
                  <span className="flex h-5 shrink-0 items-center rounded bg-iris-600 px-1.5 text-[10px] font-extrabold text-white">{cat.label}</span>
                )}
                <span className="text-xs font-semibold text-charcoal-800">{cat.label}{base ? " (base)" : ""}</span>
                <span className="ml-auto truncate text-[11px] text-charcoal-500">{cat.category}</span>
                {!base ? (
                  <button onClick={() => removeLine(l.id)} className={`rounded bg-transparent text-charcoal-400 hover:text-rose-600 ${TACTILE}`} aria-label="Remove line">
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              {/* Tier descriptor, e.g. "NCI Pro: Rich data services, resilience and management features". */}
              <p className="mt-1 text-[11px] leading-snug text-charcoal-500">
                <span className="font-semibold text-iris-700">{cat.label} {l.tier}:</span> {licenseBlurb(l.product, l.tier)}
              </p>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                <label className="space-y-0.5">
                  <span className="text-[10px] text-charcoal-500">Tier / edition</span>
                  <select value={l.tier} onChange={(e) => updateLine(l.id, (x) => { x.tier = e.target.value; })} className="w-full text-xs">
                    {cat.tiers.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="space-y-0.5">
                  <span className="text-[10px] text-charcoal-500">Quantity ({l.unit})</span>
                  <input type="number" min={0} value={l.qty} onChange={(e) => updateLine(l.id, (x) => { x.qty = Number(e.target.value) || 0; })} className="w-full text-xs" />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mb-1 mt-3 text-[11px] font-semibold text-charcoal-600">Add-on software <span className="font-normal text-charcoal-400">(tap to include)</span></p>
      <div className="flex flex-wrap gap-1.5">
        {LICENSE_PRODUCT_ORDER.map((p) => {
          const added = addonLines.some((l) => l.product === p);
          return (
            <button key={p} type="button" onClick={() => toggleAddon(p)} aria-pressed={added} className={toggleClass(added)}>
              {added ? <Check className="h-3 w-3 text-iris-500" /> : <span className="text-charcoal-400">+</span>}
              {LICENSE_CATALOG[p].label}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-charcoal-500">Scope only. Commercial pricing is handled in a separate quote.</p>
    </div>
  );
}
