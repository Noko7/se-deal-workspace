"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Boxes, Check, ChevronDown, Download, FileDown, FileJson, FileSpreadsheet, FileText, HelpCircle, ImagePlus, Layers, Pencil, Plus, Receipt, RefreshCw, Server, ShieldCheck, Sparkles, Star, Upload, X, ZoomIn, ZoomOut } from "lucide-react";
import { EditableText } from "@/components/inline-edit";
import { parseSizerScenario, type ProposalScenario } from "@/lib/sizer-import";
import {
  addHardwareOption,
  applyDealMode,
  buildProposalDoc,
  EXTERNAL_STORAGE_VENDORS,
  optionComparison,
  purchasedProducts,
  recommendedOption,
  removeHardwareOption,
  setEnvironment,
  setRecommendedOption,
  type CurrentEnvironment,
  type ProposalDoc,
} from "@/lib/proposal-doc";
import { parseSizerWorkbook } from "@/lib/simple-sizer";
import type { SizerSource } from "@/lib/simple-sizer-core";
import { fmtInt, fmtRam } from "@/lib/sizer-format";
import { buildSampleAlternateScenario, buildSampleScenario, SAMPLE_PROPOSAL_LABEL } from "@/lib/proposal-sample";
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
  // Which proposed hardware option the BOM tab is showing. Falls back to the
  // recommended one whenever the id no longer exists.
  const [previewOptionId, setPreviewOptionId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  function loadScenarios(scenarios: { scenario: ProposalScenario; sourceFile: string | null }[]) {
    if (!scenarios.length) return;
    let built = buildProposalDoc(scenarios[0].scenario, scenarios[0].sourceFile);
    if (!built.meta.preparedBy || built.meta.preparedBy === "Nutanix SE") built.meta.preparedBy = defaultSe;
    for (const s of scenarios.slice(1)) built = addHardwareOption(built, s.scenario, s.sourceFile);
    setDoc(built);
    setPreviewOptionId(null);
    setError(null);
  }

  // Parse every dropped file. Each valid Sizer export becomes one proposed
  // hardware option, so an SE can compare an NX build against an OEM build (or a
  // distributed build against a consolidated one) in a single deck.
  async function readSizerFiles(files: File[]): Promise<{
    parsed: { scenario: ProposalScenario; sourceFile: string }[];
    failures: { name: string; message: string }[];
  }> {
    const parsed: { scenario: ProposalScenario; sourceFile: string }[] = [];
    const failures: { name: string; message: string }[] = [];
    for (const file of files) {
      if (file.type && !/json/i.test(file.type) && !/\.json$/i.test(file.name)) {
        failures.push({ name: file.name, message: "Not a JSON file." });
        continue;
      }
      try {
        parsed.push({ scenario: parseSizerScenario(JSON.parse(await file.text())), sourceFile: file.name });
      } catch (err) {
        failures.push({
          name: file.name,
          message: err instanceof Error ? err.message : "Could not read that file.",
        });
      }
    }
    return { parsed, failures };
  }

  // Report partial success honestly: load what parsed, name what did not.
  function reportFailures(failures: { name: string; message: string }[], loadedCount: number) {
    if (!failures.length) {
      setError(null);
      return;
    }
    if (!loadedCount) {
      setError(failures.length === 1 ? failures[0].message : `None of the ${failures.length} files could be read as a Nutanix Sizer export.`);
      return;
    }
    setError(`Skipped ${failures.length} file${failures.length > 1 ? "s" : ""}: ${failures.map((f) => f.name).join(", ")}`);
  }

  async function handleFiles(files: File[], mode: "replace" | "add") {
    if (!files.length) return;
    const { parsed, failures } = await readSizerFiles(files);

    if (mode === "replace") {
      if (!parsed.length) {
        setDoc(null);
        reportFailures(failures, 0);
        return;
      }
      loadScenarios(parsed);
      reportFailures(failures, parsed.length);
      return;
    }

    if (parsed.length) {
      setDoc((d) => {
        if (!d) return d;
        let next = structuredCloneSafe(d);
        for (const p of parsed) next = addHardwareOption(next, p.scenario, p.sourceFile);
        return next;
      });
    }
    reportFailures(failures, parsed.length);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    await handleFiles(files, "replace");
  }

  async function onAddFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    await handleFiles(files, "add");
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
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void handleFiles(files, "replace");
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
      // Every proposed option contributes node spec sheets, so collect renders
      // across all of them rather than only the recommended build.
      const skus = new Set<string>();
      const scenarios = doc.hardwareOptions?.length ? doc.hardwareOptions.map((o) => o.scenario) : [doc.scenario];
      scenarios.forEach((s) => s.clusters.forEach((c) => c.models.forEach((m) => skus.add(m.sku))));
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
        loadImageAsset("/brand/deck-section.jpg").then((a) => { if (a) brand.sectionBg = a; }),
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
        <input ref={fileInput} type="file" multiple accept="application/json,.json" className="hidden" onChange={onFile} />

        <div className="sizer-rise flex flex-col" style={{ "--index": 0 } as React.CSSProperties}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-iris-600">Solution Brief · BOM Deck</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-charcoal-900 md:text-2xl">
                Turn a Sizer export into a customer-ready proposal.
              </h2>
              <p className="mt-1.5 max-w-[46ch] text-sm leading-relaxed text-charcoal-500">
                Drop one Nutanix Sizer scenario, or several to put competing hardware builds side by side. You get an on-brand 2-page brief and a polished deck — editable inline, exportable to PDF and PowerPoint.
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
              onClick={() =>
                loadScenarios([
                  { scenario: buildSampleScenario(defaultSe), sourceFile: null },
                  { scenario: buildSampleAlternateScenario(defaultSe), sourceFile: null },
                ])
              }
              className={`inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-iris-700 ring-1 ring-iris-200 hover:-translate-y-px hover:bg-iris-50 ${TACTILE}`}
            >
              <Sparkles className="h-4 w-4" /> Load {SAMPLE_PROPOSAL_LABEL}
            </button>
            <span className="text-xs text-charcoal-400">No export handy? The sample loads two hardware options to compare.</span>
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
          aria-label="Upload or drop one or more Nutanix Sizer scenario JSON files"
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
            {dragging ? "Drop to build the proposal" : "Drop your Sizer scenarios"}
          </span>
          <span className="max-w-sm text-sm leading-relaxed text-charcoal-500">
            In sizer.nutanix.com, open your scenario, then Actions → Export → JSON. Drag the files here, or click anywhere in this panel to browse.
          </span>
          <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-iris-600">
            <FileJson className="h-4 w-4" /> Accepts .json · drop several to compare hardware
          </span>
        </button>
      </div>
    );
  }

  // --- Builder ---------------------------------------------------------------
  // The option the BOM tab is showing. A stale id (after a removal) resolves
  // back to the recommended build rather than blanking the preview.
  const previewedOption =
    doc.hardwareOptions?.find((o) => o.id === previewOptionId) ?? recommendedOption(doc) ?? null;

  return (
    <div className="space-y-4">
      <input ref={fileInput} type="file" multiple accept="application/json,.json" className="hidden" onChange={onFile} />
      <input ref={addInput} type="file" multiple accept="application/json,.json" className="hidden" onChange={onAddFiles} />
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
              {doc.hardwareOptions?.length > 1 ? ` · ${doc.hardwareOptions.length} hardware options` : ""}
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
          <Button tone="secondary" className={TACTILE} onClick={() => addInput.current?.click()}>
            <span className="flex items-center gap-1.5"><Plus className="h-4 w-4" strokeWidth={1.75} /> Add hardware</span>
          </Button>
          <Button tone="secondary" className={TACTILE} onClick={() => fileInput.current?.click()}>
            <span className="flex items-center gap-1.5"><RefreshCw className="h-4 w-4" strokeWidth={1.75} /> Start over</span>
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
          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
            >
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}

          <Section title="Hardware options" icon={<Server className="h-4 w-4" />} defaultOpen>
            <HardwareOptionsEditor
              doc={doc}
              patch={patch}
              onAdd={() => addInput.current?.click()}
              previewOptionId={previewOptionId}
              onPreview={setPreviewOptionId}
            />
          </Section>

          <Section title="Current environment" icon={<Boxes className="h-4 w-4" />} defaultOpen>
            <CurrentEnvironmentEditor
              environment={doc.environment}
              onSet={(env) => patch((d) => setEnvironment(d, env))}
            />
          </Section>

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

            <div className="space-y-2 border-t border-charcoal-100 pt-3">
              <p className="text-[11px] font-semibold text-charcoal-600">Licensing pages in the .pptx</p>
              <label className="flex items-start gap-2 text-xs font-medium text-charcoal-700">
                <input
                  type="checkbox"
                  checked={doc.options?.includeSoftwareSlides ?? true}
                  onChange={(e) => patch((d) => ((d.options.includeSoftwareSlides = e.target.checked), d))}
                  className="mt-0.5 h-4 w-4 accent-iris-500"
                />
                <span>
                  Support program comparison
                  <span className="block text-[11px] font-normal text-charcoal-400">Coverage and response commitments.</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs font-medium text-charcoal-700">
                <input
                  type="checkbox"
                  checked={doc.options?.includeAllLicensingPages ?? false}
                  onChange={(e) => patch((d) => ((d.options.includeAllLicensingPages = e.target.checked), d))}
                  className="mt-0.5 h-4 w-4 accent-iris-500"
                />
                <span>
                  Every product in the portfolio
                  <span className="block text-[11px] font-normal text-charcoal-400">
                    {doc.options?.includeAllLicensingPages
                      ? "All 11 products get an edition ladder and capability matrix."
                      : "Off: only the products this design licenses get licensing pages."}
                  </span>
                </span>
              </label>
            </div>
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
              {/* Which hardware option the BOM preview is showing. Only earns its
                  place on screen once there is more than one to choose from. */}
              {tab === "bom" && doc.hardwareOptions?.length > 1 ? (
                <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-charcoal-300 bg-white p-1 text-xs">
                  {doc.hardwareOptions.map((o) => {
                    const active = previewedOption?.id === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setPreviewOptionId(o.id)}
                        aria-pressed={active}
                        title={o.name}
                        className={`rounded-lg px-2.5 py-1 font-semibold ${TACTILE} ${
                          active ? "bg-iris-100 text-iris-700 ring-1 ring-iris-200" : "bg-transparent text-charcoal-600 hover:bg-charcoal-100"
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          {o.label}
                          {o.recommended ? <Star className="h-3 w-3 fill-current text-iris-500" strokeWidth={1.75} /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
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
              <ProposalBomPreview doc={doc} scenario={previewedOption?.scenario} />
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

// Manage the proposed hardware builds: rename them, pick which one the proposal
// recommends, and drop the ones that did not make the cut. One option is always
// recommended, and the last remaining option cannot be removed — a proposal has
// to describe some hardware.
function HardwareOptionsEditor({
  doc,
  patch,
  onAdd,
  previewOptionId,
  onPreview,
}: {
  doc: ProposalDoc;
  patch: (u: (d: ProposalDoc) => ProposalDoc) => void;
  onAdd: () => void;
  previewOptionId: string | null;
  onPreview: (id: string) => void;
}) {
  const options = doc.hardwareOptions ?? [];
  const multi = options.length > 1;

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] leading-relaxed text-charcoal-500">
        {multi
          ? "The deck opens with a side-by-side comparison, then covers each build in full. The recommended option drives the executive summary and the per-core licensing quantity."
          : "Add a second Sizer export to propose an alternative build. The deck will compare them side by side."}
      </p>

      <div className="space-y-2">
        {options.map((o) => {
          const t = o.scenario.totals;
          const previewing = previewOptionId === o.id;
          return (
            <div
              key={o.id}
              className={`rounded-xl border p-2.5 ${
                o.recommended ? "border-iris-200 bg-iris-50/60" : "border-charcoal-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-extrabold ${
                    o.recommended ? "bg-iris-600 text-white" : "bg-charcoal-200 text-charcoal-700"
                  }`}
                >
                  {o.label.replace("Option ", "")}
                </span>
                <EditableText
                  inline
                  value={o.name}
                  className="min-w-0 flex-1 truncate text-xs font-semibold text-charcoal-800"
                  onCommit={(v) =>
                    patch((d) => {
                      const target = d.hardwareOptions.find((x) => x.id === o.id);
                      if (target) target.name = v || target.name;
                      return d;
                    })
                  }
                />
                {multi ? (
                  <button
                    onClick={() => patch((d) => removeHardwareOption(d, o.id))}
                    className={`rounded bg-transparent text-charcoal-400 hover:text-rose-600 ${TACTILE}`}
                    aria-label={`Remove ${o.label}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              <p className="mt-1 text-[11px] text-charcoal-500">
                {t.clusters} clusters · {t.nodes} nodes · {fmtCompact(t.cores)} cores · {fmtCompact(t.ramGiB)} GB
              </p>
              {o.sourceFile ? (
                <p className="truncate text-[10px] text-charcoal-400" title={o.sourceFile}>
                  {o.sourceFile}
                </p>
              ) : null}

              {multi ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => patch((d) => setRecommendedOption(d, o.id))}
                    aria-pressed={o.recommended}
                    disabled={o.recommended}
                    className={`${toggleClass(o.recommended)} disabled:cursor-default`}
                  >
                    <Star className={`h-3 w-3 ${o.recommended ? "fill-current text-iris-500" : "text-charcoal-400"}`} strokeWidth={1.75} />
                    {o.recommended ? "Recommended" : "Recommend"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onPreview(o.id)}
                    aria-pressed={previewing}
                    className={toggleClass(previewing)}
                  >
                    <Layers className="h-3 w-3" strokeWidth={1.75} />
                    Preview
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className={`flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-charcoal-300 bg-white px-3 py-2 text-xs font-semibold text-charcoal-600 hover:-translate-y-px hover:border-iris-400 hover:bg-iris-50/50 hover:text-iris-700 ${TACTILE}`}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add another Sizer export
      </button>

      {multi ? (
        <div className="rounded-xl border border-charcoal-200 bg-white p-2.5">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-iris-700">Side by side</p>
          <dl className="space-y-1">
            {optionComparison(doc)
              .filter((m) => m.label !== "Platform" && m.label !== "Node models")
              .map((m) => (
                <div key={m.label} className="flex items-baseline gap-2 border-b border-charcoal-100 pb-1 last:border-0">
                  <dt className="w-24 shrink-0 text-[10px] text-charcoal-500">{m.label}</dt>
                  <dd className="flex min-w-0 flex-1 gap-2">
                    {m.values.map((v, i) => (
                      <span
                        key={i}
                        className={`min-w-0 flex-1 truncate text-[10px] ${
                          options[i]?.recommended ? "font-semibold text-charcoal-900" : "text-charcoal-500"
                        }`}
                        title={v}
                      >
                        {v}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

// Thousands separators for the compact option summaries.
const fmtCompact = (n: number) => Math.round(n).toLocaleString("en-US");

// The three inventory exports the Simple Sizer parser understands. Detection is
// manual — the workbooks look similar enough that guessing is unreliable — so
// the SE tells us which one they are handing over.
const ENV_SOURCES: { value: SizerSource; label: string }[] = [
  { value: "collector_excel", label: "Collector" },
  { value: "rvtools", label: "RVTools" },
  { value: "liveoptics", label: "LiveOptics" },
];

// Full provenance labels for the parsed summary.
const ENV_SOURCE_LABEL: Record<SizerSource, string> = {
  collector_excel: "Nutanix Collector",
  rvtools: "VMware RVTools",
  liveoptics: "Dell LiveOptics",
};

const MAX_ENV_BYTES = 30 * 1024 * 1024; // 30 MB, matching the Simple Sizer cap.

// The customer's estate as it runs today, parsed from a Nutanix Collector,
// VMware RVTools or Dell LiveOptics Excel export. This is separate from the
// proposed-hardware Sizer JSON above: it describes what the customer has now and
// anchors a "Current environment" deck section against the proposed build.
//
// Privacy is the point here. The workbook is read entirely in this browser via
// the Simple Sizer's parser and is never uploaded, so a customer's inventory
// never reaches the server or the network — the same promise the Simple Sizer
// makes on screen.
function CurrentEnvironmentEditor({
  environment,
  onSet,
}: {
  environment: CurrentEnvironment | null;
  onSet: (env: CurrentEnvironment | null) => void;
}) {
  const [source, setSource] = useState<SizerSource>("collector_excel");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function ingest(file: File) {
    if (parsing) return;
    // Same gate as the Simple Sizer: only real .xlsx/.xls workbooks. A raw
    // Collector ZIP or a CSV can't be read here, and saying so up front beats a
    // cryptic parser error further down.
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setError("That needs to be an .xlsx or .xls export. ZIPs and CSVs aren't supported here.");
      return;
    }
    if (file.size === 0) {
      setError("That file is empty. Re-export from the source tool and try again.");
      return;
    }
    if (file.size > MAX_ENV_BYTES) {
      setError("That file is over 30 MB. Trim the export or split it before uploading.");
      return;
    }

    setParsing(true);
    setError(null);
    try {
      // Parsed here in the browser. The workbook bytes are never uploaded, so a
      // customer's inventory never reaches the server or the network at all.
      const bytes = await file.arrayBuffer();
      // Yield a frame first so the reading state paints before the parse blocks
      // the main thread — a large export takes a moment.
      await new Promise((resolve) => window.setTimeout(resolve, 0));

      const parsed = parseSizerWorkbook(bytes, source, file.name, file.size);
      if (!parsed.clusterDetails.length) {
        throw new Error("No clusters were found in that file. Check that it's the full export and matches the selected export type.");
      }
      onSet({ parsed, sourceFile: file.name, source: parsed.source });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong reading the file.");
    } finally {
      setParsing(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void ingest(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void ingest(file);
  }

  return (
    <div className="space-y-3">
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onPick} />

      <p className="text-[11px] leading-relaxed text-charcoal-500">
        Add the customer&apos;s estate as it runs today, from a Nutanix Collector, VMware RVTools or Dell LiveOptics export.
        It anchors a Current environment section against the proposed build. Optional — a proposal is complete without it.
      </p>

      {/* Privacy promise, kept accurate: this parse happens in the browser and
          nothing is uploaded. Mirrors the Simple Sizer's on-screen copy. */}
      <p className="flex items-start gap-2 rounded-xl border border-charcoal-200 bg-charcoal-50 px-3 py-2 text-[11px] leading-relaxed text-charcoal-600">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mantis" strokeWidth={1.75} />
        <span>
          <span className="font-semibold text-charcoal-800">Your file never leaves this machine.</span> The workbook is read
          in your browser, not uploaded to a server. Nothing is stored, so closing this tab discards it.
        </span>
      </p>

      {environment ? (
        <EnvironmentSummary
          environment={environment}
          onRemove={() => {
            onSet(null);
            setError(null);
          }}
        />
      ) : (
        <>
          {/* Manual source pick, using the shared chip styling so it reads the
              same as the licensing and deal-type selectors above. */}
          <div>
            <p className="mb-1 text-[11px] font-semibold text-charcoal-600">
              Export type <span className="font-normal text-charcoal-400">(match your file)</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {ENV_SOURCES.map((s) => {
                const selected = source === s.value;
                return (
                  <button key={s.value} type="button" onClick={() => setSource(s.value)} aria-pressed={selected} className={toggleClass(selected)}>
                    <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${selected ? "border-iris-500 bg-iris-500 text-white" : "border-charcoal-300"}`}>
                      {selected ? <Check className="h-3 w-3" /> : null}
                    </span>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {parsing ? (
            <EnvironmentReadingSkeleton />
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                if (!dragging) setDragging(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                if (!dragging) setDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragging(false);
              }}
              onDrop={onDrop}
              aria-label="Upload or drop a Collector, RVTools or LiveOptics Excel export"
              className={`flex w-full flex-col items-start gap-2 rounded-xl border-2 border-dashed p-4 text-left ${TACTILE} active:scale-[0.99] ${
                dragging
                  ? "scale-[1.005] border-iris-500 bg-iris-100 ring-4 ring-iris-200/60"
                  : "border-charcoal-300 bg-white hover:-translate-y-px hover:border-iris-400 hover:bg-iris-50/40"
              }`}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-iris-600 ${TACTILE} ${dragging ? "scale-105 bg-iris-200" : "bg-iris-100"}`}>
                <FileSpreadsheet className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <span className="text-xs font-semibold text-charcoal-800">
                {dragging ? "Drop to read the estate" : "Drop an Excel export, or click to browse"}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-charcoal-400">
                <Upload className="h-3 w-3" strokeWidth={1.75} /> .xlsx or .xls, up to 30 MB
              </span>
            </button>
          )}

          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
            >
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

// Compact read-out of a parsed estate. Hairline-ruled rows rather than a grid of
// boxes, matching the rest of the editor column. Every figure is read straight
// off the ParsedEnvironment so it can never disagree with the Simple Sizer.
function EnvironmentSummary({ environment, onRemove }: { environment: CurrentEnvironment; onRemove: () => void }) {
  const p = environment.parsed;
  const rows: { k: string; v: string; sub?: string }[] = [
    { k: "Source", v: ENV_SOURCE_LABEL[environment.source] },
    { k: "Clusters", v: fmtInt(p.clusters) },
    { k: "Hosts", v: fmtInt(p.hosts) },
    {
      k: "VMs",
      v: fmtInt(p.all.vms),
      sub: p.powerStateKnown ? `${fmtInt(p.poweredOn.vms)} on · ${fmtInt(p.poweredOff.vms)} off` : "power state not in export",
    },
    { k: "Total cores", v: fmtInt(p.totalCpuCores) },
    { k: "Memory", v: fmtRam(p.totalMemoryGiB) },
  ];

  return (
    <div className="rounded-xl border border-iris-200 bg-iris-50/60 p-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white text-iris-600 ring-1 ring-iris-200">
          <FileSpreadsheet className="h-3 w-3" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-charcoal-800" title={environment.sourceFile}>
          {environment.sourceFile}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className={`rounded bg-transparent text-charcoal-400 hover:text-rose-600 ${TACTILE}`}
          aria-label="Remove current environment"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <dl className="mt-2 divide-y divide-charcoal-100 border-t border-charcoal-200/70 text-[11px]">
        {rows.map((r) => (
          <div key={r.k} className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="shrink-0 text-charcoal-500">{r.k}</dt>
            <dd className="min-w-0 text-right">
              <span className="font-semibold tabular-nums text-charcoal-900">{r.v}</span>
              {r.sub ? <span className="ml-1.5 text-[10px] font-normal text-charcoal-400">{r.sub}</span> : null}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-2 text-[10px] leading-relaxed text-charcoal-400">
        Read and held in this browser tab only. It will anchor the Current environment deck section.
      </p>
    </div>
  );
}

// Loading state for the estate parse: a shimmer skeleton over the breathing
// dots, never a generic spinner (per the design skill).
function EnvironmentReadingSkeleton() {
  return (
    <div className="rounded-xl border border-charcoal-200 bg-white p-4" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2">
        <WorkingDots className="text-iris-500" />
        <span className="text-xs font-medium text-charcoal-600">Reading the export</span>
      </div>
      <div className="mt-3 space-y-2">
        <div className="sizer-shimmer h-2.5 w-2/3 rounded-full bg-charcoal-100" />
        <div className="sizer-shimmer h-2.5 w-1/2 rounded-full bg-charcoal-100" />
        <div className="sizer-shimmer h-2.5 w-3/4 rounded-full bg-charcoal-100" />
      </div>
    </div>
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
