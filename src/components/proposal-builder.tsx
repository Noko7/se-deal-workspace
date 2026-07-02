"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlignLeft, Building2, Check, ChevronDown, Download, FileDown, FileJson, FileText, HelpCircle, ImagePlus, Layers, ListChecks, Loader2, Receipt, RefreshCw, Save, Sparkles, Upload, X, Zap } from "lucide-react";
import { parseSizerScenario, type ProposalScenario } from "@/lib/sizer-import";
import { applyDealMode, buildProposalDoc, EXTERNAL_STORAGE_VENDORS, proposalHelpers, purchasedProducts, type ChallengeGroups, type ProposalDoc } from "@/lib/proposal-doc";
import type { ProposalOppOption } from "@/lib/data";
import { buildSampleScenario, SAMPLE_PROPOSAL_LABEL } from "@/lib/proposal-sample";
import { exportProposalToPptx, type ProposalBrandImages, type ImgAsset } from "@/lib/proposal-pptx";
import { hardwareImageFor, hardwareRearImageFor } from "@/lib/hardware-images";
import { getProductIcon } from "@/lib/nutanix-icons";
import { type EditionKey } from "@/lib/nci-editions";
import { BASE_PLATFORMS, hasBrandIcon, isBasePlatform, LICENSE_CATALOG, LICENSE_PRODUCT_ORDER, licenseBlurb, newLicenseLine, type LicenseLine, type LicenseProductKey } from "@/lib/license-catalog";
import { ProposalBomPreview, ProposalTwoPager } from "@/components/proposal-preview";
import { ProposalOppPicker } from "@/components/proposal-opp-picker";
import { Button } from "@/components/ui";

const linesToArray = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const arrayToLines = (a: string[]) => a.join("\n");

// Shared style for selectable toggle chips. Selected reads as a tinted, outlined
// chip (not a solid purple block) so a row of them stays clean and legible.
function toggleClass(selected: boolean): string {
  return [
    "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition",
    selected
      ? "border-iris-400 bg-iris-50 text-iris-700 ring-1 ring-iris-200"
      : "border-charcoal-200 bg-white text-charcoal-600 hover:border-iris-300 hover:bg-iris-50/40",
  ].join(" ");
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

// First paragraph of a Salesforce narrative field, capped so a long "Why now"
// note doesn't blow out a one-line intro slot on the brief.
function firstParagraph(text: string, max = 420): string {
  const para = text.split(/\n\s*\n/)[0]?.trim() ?? "";
  return para.length > max ? `${para.slice(0, max).trimEnd()}…` : para;
}

// Prefill proposal fields from a linked opportunity. Only fills what the deal
// actually has — no fabricated narrative.
function applyOppToDoc(d: ProposalDoc, opp: ProposalOppOption): ProposalDoc {
  if (d.meta.title === `Nutanix Solution Proposal for ${d.meta.customer}`) {
    d.meta.title = `Nutanix Solution Proposal for ${opp.accountName}`;
  }
  d.meta.customer = opp.accountName;
  d.meta.opportunityName = opp.dealName;
  if (opp.whyNow?.trim()) d.challengesIntro = firstParagraph(opp.whyNow);
  if (opp.whyNutanix?.trim()) d.benefitsIntro = firstParagraph(opp.whyNutanix);
  return d;
}

// Plain-text summary of the proposed design, saved as a note so the Account AI
// can reason over the proposal without parsing the exported deck.
function proposalSummaryText(doc: ProposalDoc): string {
  const { fmtInt, tib } = proposalHelpers;
  const t = doc.scenario.totals;
  const lines: (string | null)[] = [
    `Proposal saved from Proposal Builder: ${doc.meta.title}`,
    `Prepared by ${doc.meta.preparedBy} on ${doc.meta.dateLabel}.`,
    "",
    `Proposed design: ${fmtInt(t.nodes)} nodes across ${fmtInt(t.clusters)} cluster(s) · ${fmtInt(t.cores)} cores · ${fmtInt(t.ramGiB)} GB RAM · ${tib(t.ssdTiB + t.hddTiB)} usable.`,
    doc.options?.externalStorage
      ? `External storage design: primary storage on ${doc.options.externalStorageVendor} over NVMe/TCP.`
      : null,
    "",
    "Software scope:",
    ...doc.licensing.lines.map(
      (l) => `- ${LICENSE_CATALOG[l.product].label} ${l.tier}: ${fmtInt(l.qty)} ${l.unit} (${doc.licensing.termYears}-year term)`,
    ),
    "",
    "Executive summary:",
    doc.executiveSummary,
  ];
  return lines.filter((x): x is string => x !== null).join("\n");
}

export function ProposalBuilder({ defaultSe, opps = [] }: { defaultSe: string; opps?: ProposalOppOption[] }) {
  const [doc, setDoc] = useState<ProposalDoc | null>(null);
  // What the preview/print surface renders. Kept slightly behind `doc` so typing
  // in the editor stays snappy; synced automatically (debounced) or on demand.
  const [previewDoc, setPreviewDoc] = useState<ProposalDoc | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [logo, setLogo] = useState<string | null>(null);
  const [tab, setTab] = useState<"twopager" | "bom">("twopager");
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<null | "pdf" | "pptx">(null);
  const [dragging, setDragging] = useState(false);
  const [linkedDealId, setLinkedDealId] = useState<string>("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const fileInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  const previewStale = doc !== previewDoc;
  const linkedOpp = useMemo(() => opps.find((o) => o.dealId === linkedDealId) ?? null, [opps, linkedDealId]);

  // Link (or re-link) the proposal to an opportunity and prefill from it.
  function linkOpportunity(dealId: string) {
    setLinkedDealId(dealId);
    setSaveState("idle");
    const opp = opps.find((o) => o.dealId === dealId);
    if (!opp) return;
    setDoc((d) => {
      if (!d) return d;
      const next = applyOppToDoc(structuredCloneSafe(d), opp);
      setPreviewDoc(next);
      return next;
    });
  }

  async function saveToAccount() {
    if (!doc || !linkedOpp || saveState === "saving") return;
    setSaveState("saving");
    try {
      const res = await fetch("/api/proposal/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: linkedOpp.dealId,
          title: doc.meta.title,
          summary: proposalSummaryText(doc),
        }),
      });
      setSaveState(res.ok ? "saved" : "error");
    } catch {
      setSaveState("error");
    }
  }

  // Debounced auto-sync of the preview after edits.
  useEffect(() => {
    if (!doc || !autoRefresh) return;
    const id = window.setTimeout(() => setPreviewDoc(doc), 150);
    return () => window.clearTimeout(id);
  }, [doc, autoRefresh]);

  function loadScenario(scenario: ProposalScenario) {
    let built = buildProposalDoc(scenario);
    if (!built.meta.preparedBy || built.meta.preparedBy === "Nutanix SE") built.meta.preparedBy = defaultSe;
    const opp = opps.find((o) => o.dealId === linkedDealId);
    if (opp) built = applyOppToDoc(built, opp);
    setDoc(built);
    setPreviewDoc(built);
    setError(null);
    setSaveState("idle");
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
    setPreviewDoc(doc); // make sure the print surface reflects the latest edits
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
  if (!doc) {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-charcoal-900">Proposal Builder</h2>
            <p className="text-xs text-charcoal-500">Turn a Nutanix Sizer export into a customer-ready brief and BOM deck.</p>
          </div>
          <HelpPopover />
        </div>
        <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          onDragOver={onDragOver}
          onDragEnter={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          aria-label="Upload or drop a Nutanix Sizer scenario JSON file"
          className={`flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition ${
            dragging
              ? "border-iris-500 bg-iris-100 ring-2 ring-iris-300"
              : "border-iris-300 bg-gradient-to-br from-iris-50 to-white hover:border-iris-400 dark:border-iris-500/50 dark:from-iris-100 dark:to-charcoal-50 dark:hover:border-iris-400"
          }`}
        >
          <span className={`flex h-12 w-12 items-center justify-center rounded-full text-iris-600 transition ${dragging ? "scale-110 bg-iris-200" : "bg-iris-100"}`}>
            <Upload className="h-6 w-6" />
          </span>
          <span className="text-base font-semibold text-charcoal-900">
            {dragging ? "Drop the JSON to build the proposal" : "Upload a Nutanix Sizer scenario (JSON)"}
          </span>
          <span className="max-w-md text-sm text-charcoal-500">
            In sizer.nutanix.com open your scenario, then Actions, Export, JSON. Drag the file here or click to browse. We&apos;ll build
            an on-brand 2-page Solution Brief and a polished BOM deck from it.
          </span>
        </button>
        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">{error}</p> : null}
        {opps.length ? (
          <div className="mx-auto w-full max-w-xl space-y-2 rounded-lg border border-charcoal-200 bg-white px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-charcoal-700">
              <Building2 className="h-4 w-4 text-iris-500" /> Search accounts &amp; link an opportunity
            </span>
            <ProposalOppPicker opps={opps} value={linkedDealId} onSelect={linkOpportunity} variant="full" />
            <p className="text-center text-[11px] text-charcoal-400">
              Prefills the customer, opportunity, and Salesforce narrative — and lets you save the proposal back to the account for the Account AI.
            </p>
          </div>
        ) : null}
        <div className="flex items-center justify-center gap-2 text-sm text-charcoal-500">
          <span>No export handy?</span>
          <button onClick={() => loadScenario(buildSampleScenario(defaultSe))} className="inline-flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 font-medium text-iris-600 ring-1 ring-iris-200 hover:bg-iris-50">
            <Sparkles className="h-4 w-4" /> Load {SAMPLE_PROPOSAL_LABEL}
          </button>
        </div>
      </div>
    );
  }

  // --- Builder ---------------------------------------------------------------
  return (
    <div className="space-y-4">
      <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
      <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={onLogo} />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-charcoal-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-iris-50 text-iris-600">
            <FileJson className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-charcoal-900">{doc.meta.customer}</p>
            <p className="text-xs text-charcoal-500">
              {doc.scenario.totals.clusters} clusters · {doc.scenario.totals.nodes} nodes · {doc.scenario.totals.cores} cores
            </p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {logo ? (
            <span className="flex items-center gap-2 rounded-md border border-charcoal-300 bg-white px-2 py-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="logo" className="h-6 w-auto max-w-[90px] object-contain" />
              <button onClick={() => setLogo(null)} className="text-charcoal-400 hover:text-rose-600" aria-label="Remove logo">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : (
            <Button tone="secondary" onClick={() => logoInput.current?.click()}>
              <span className="flex items-center gap-1.5"><ImagePlus className="h-4 w-4" /> Customer logo</span>
            </Button>
          )}
          <Button tone="secondary" onClick={() => fileInput.current?.click()}>
            <span className="flex items-center gap-1.5"><RefreshCw className="h-4 w-4" /> Change file</span>
          </Button>
          {opps.length ? (
            <ProposalOppPicker opps={opps} value={linkedDealId} onSelect={linkOpportunity} variant="compact" />
          ) : null}
          {linkedOpp ? (
            <Button tone="secondary" onClick={saveToAccount} disabled={saveState === "saving"}>
              <span className="flex items-center gap-1.5">
                {saveState === "saving" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saveState === "saved" ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saveState === "saved" ? "Saved to account" : saveState === "error" ? "Retry save" : "Save to account"}
              </span>
            </Button>
          ) : null}
          <Button tone="secondary" onClick={exportPdf} disabled={exporting !== null}>
            <span className="flex items-center gap-1.5">{exporting === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} 2-Pager PDF</span>
          </Button>
          <Button onClick={exportPptx} disabled={exporting !== null}>
            <span className="flex items-center gap-1.5">{exporting === "pptx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} BOM .pptx</span>
          </Button>
          <HelpPopover />
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[380px_1fr]">
        {/* Editor — flows the full height of the page (no internal scroll cap). */}
        <div className="space-y-3 pr-1">
          <Section title="Proposal details" icon={<FileText className="h-4 w-4" />} defaultOpen>
            {/* Deal type: switching to external storage reframes the customer-facing copy. */}
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
            <Field label="Title" value={doc.meta.title} onChange={(v) => patch((d) => ((d.meta.title = v), d))} />
            <Field
              label="Customer / account"
              value={doc.meta.customer}
              onChange={(v) =>
                patch((d) => {
                  // Keep the headline title in sync with the account name until the
                  // SE manually edits the title to something custom.
                  if (d.meta.title === `Nutanix Solution Proposal for ${d.meta.customer}`) {
                    d.meta.title = `Nutanix Solution Proposal for ${v}`;
                  }
                  d.meta.customer = v;
                  return d;
                })
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prepared by" value={doc.meta.preparedBy} onChange={(v) => patch((d) => ((d.meta.preparedBy = v), d))} />
              <Field label="Date" value={doc.meta.dateLabel} onChange={(v) => patch((d) => ((d.meta.dateLabel = v), d))} />
            </div>
            <Field label="Opportunity" value={doc.meta.opportunityName ?? ""} onChange={(v) => patch((d) => ((d.meta.opportunityName = v || null), d))} />
          </Section>

          <Section title="Narrative" icon={<AlignLeft className="h-4 w-4" />} defaultOpen>
            <TextArea label="Executive summary" rows={5} value={doc.executiveSummary} onChange={(v) => patch((d) => ((d.executiveSummary = v), d))} />
            <TextArea label="Quote" rows={2} value={doc.quote.text} onChange={(v) => patch((d) => ((d.quote.text = v), d))} />
            <Field label="Quote author" value={doc.quote.author} onChange={(v) => patch((d) => ((d.quote.author = v), d))} />
          </Section>

          <Section title="Challenges & outcomes" icon={<ListChecks className="h-4 w-4" />}>
            <GroupEditor title="Current challenges" intro={doc.challengesIntro} groups={doc.challenges}
              onIntro={(v) => patch((d) => ((d.challengesIntro = v), d))}
              onGroups={(g) => patch((d) => ((d.challenges = g), d))} />
            <GroupEditor title="Proposed benefits" intro={doc.benefitsIntro} groups={doc.benefits}
              onIntro={(v) => patch((d) => ((d.benefitsIntro = v), d))}
              onGroups={(g) => patch((d) => ((d.benefits = g), d))} />
            <div className="grid grid-cols-2 gap-3">
              <TextArea label="Current state" rows={4} value={arrayToLines(doc.currentState)} onChange={(v) => patch((d) => ((d.currentState = linesToArray(v)), d))} />
              <TextArea label="Proposed state" rows={4} value={arrayToLines(doc.proposedState)} onChange={(v) => patch((d) => ((d.proposedState = linesToArray(v)), d))} />
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
              />
              Include full NCI editions comparison + support slides in the .pptx
            </label>
          </Section>
        </div>

        {/* Preview */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border border-charcoal-200 bg-charcoal-50 p-1 text-sm">
              <button onClick={() => setTab("twopager")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition ${tab === "twopager" ? "bg-white text-iris-700 shadow-sm ring-1 ring-iris-200" : "text-charcoal-500 hover:text-charcoal-800"}`}>
                <FileText className="h-4 w-4" /> 2-Pager (PDF)
              </button>
              <button onClick={() => setTab("bom")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition ${tab === "bom" ? "bg-white text-iris-700 shadow-sm ring-1 ring-iris-200" : "text-charcoal-500 hover:text-charcoal-800"}`}>
                <Layers className="h-4 w-4" /> BOM Deck
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAutoRefresh((v) => !v)}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${autoRefresh ? "border-iris-200 bg-iris-50 text-iris-700" : "border-charcoal-200 bg-white text-charcoal-500"}`}
                title="Auto-update the preview as you type"
              >
                <Zap className={`h-3.5 w-3.5 ${autoRefresh ? "fill-iris-400 text-iris-500" : ""}`} /> Live
              </button>
              <button
                type="button"
                onClick={() => setPreviewDoc(doc)}
                disabled={!previewStale}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition ${previewStale ? "border-iris-600 bg-iris-600 text-white hover:bg-iris-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}
                title="Update the preview now"
              >
                {previewStale ? <RefreshCw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                {previewStale ? "Refresh preview" : "Up to date"}
              </button>
            </div>
          </div>

          {tab === "twopager" ? (
            <div className="rounded-xl border border-charcoal-200 bg-charcoal-100 p-4">
              <PreviewScaler>
                <ProposalTwoPager doc={previewDoc ?? doc} logo={logo} />
              </PreviewScaler>
            </div>
          ) : (
            <ProposalBomPreview doc={previewDoc ?? doc} />
          )}
        </div>
      </div>

      {/* Off-screen print surface for the 2-page PDF. */}
      <div className="proposal-print-root" aria-hidden>
        <ProposalTwoPager doc={previewDoc ?? doc} logo={logo} />
      </div>
    </div>
  );
}

// Scales the fixed 816px Letter pages down to fit the preview column. Measures
// the container with a ResizeObserver (same pattern as the QBR slide frame) and
// reserves the exact scaled height, so nothing clips or overlaps content below.
const PROPOSAL_PAGE_W = 816;

function PreviewScaler({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [contentH, setContentH] = useState(0);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const update = () => {
      setScale(Math.min(1, outer.clientWidth / PROPOSAL_PAGE_W));
      setContentH(inner.offsetHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outerRef} className="relative w-full" style={{ height: contentH * scale || undefined }}>
      <div
        ref={innerRef}
        className="absolute left-1/2 top-0 flex flex-col items-center gap-5 [&>.proposal-page]:shadow-xl"
        style={{ width: PROPOSAL_PAGE_W, transform: `translateX(-50%) scale(${scale})`, transformOrigin: "top center" }}
      >
        {children}
      </div>
    </div>
  );
}

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
        className="flex h-8 w-8 items-center justify-center rounded-full border border-charcoal-200 bg-white text-charcoal-500 transition hover:border-iris-300 hover:text-iris-600"
      >
        <HelpCircle className="h-4 w-4" />
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
    <div className="rounded-lg border border-charcoal-200 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition hover:bg-charcoal-50">
        <span className="flex items-center gap-2 text-sm font-semibold text-charcoal-800">
          <span className="text-iris-500">{icon}</span>
          {title}
        </span>
        <ChevronDown className={`h-4 w-4 text-charcoal-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="space-y-3 border-t border-charcoal-100 px-3 py-3">{children}</div> : null}
    </div>
  );
}

function structuredCloneSafe<T>(obj: T): T {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-charcoal-700">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full" />
    </label>
  );
}

// Textarea that grows to fit its content (no inner scrollbar, no fixed height).
function AutoTextarea({ value, onChange, minRows = 2, placeholder, className = "" }: { value: string; onChange: (v: string) => void; minRows?: number; placeholder?: string; className?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full resize-none overflow-hidden ${className}`}
    />
  );
}

function TextArea({ label, value, rows, onChange }: { label: string; value: string; rows: number; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-charcoal-700">{label}</span>
      <AutoTextarea value={value} minRows={rows} onChange={onChange} />
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
    <div className="rounded-lg border border-charcoal-200 bg-charcoal-50/60 p-3">
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
            <div key={l.id} className={`rounded-md border p-2 ${base ? "border-iris-200 bg-iris-50/60" : "border-charcoal-200 bg-white"}`}>
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
                  <button onClick={() => removeLine(l.id)} className="text-charcoal-400 hover:text-rose-600" aria-label="Remove line">
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

function GroupEditor({
  title,
  intro,
  groups,
  onIntro,
  onGroups,
}: {
  title: string;
  intro: string;
  groups: ChallengeGroups;
  onIntro: (v: string) => void;
  onGroups: (g: ChallengeGroups) => void;
}) {
  const set = (key: keyof ChallengeGroups, v: string) => onGroups({ ...groups, [key]: v.split("\n").map((l) => l.trim()).filter(Boolean) });
  return (
    <div className="rounded-lg border border-charcoal-200 bg-charcoal-50/60 p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-iris-700">{title}</p>
      <div className="mb-2">
        <AutoTextarea value={intro} minRows={2} onChange={onIntro} placeholder="Intro line" />
      </div>
      <div className="space-y-2">
        {(["technical", "operational", "financial"] as const).map((k) => (
          <label key={k} className="block space-y-1">
            <span className="text-[11px] font-medium capitalize text-charcoal-600">{k} (one per line)</span>
            <AutoTextarea value={groups[k].join("\n")} minRows={2} onChange={(v) => set(k, v)} />
          </label>
        ))}
      </div>
    </div>
  );
}
