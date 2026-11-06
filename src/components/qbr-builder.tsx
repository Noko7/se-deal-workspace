"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Building2,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileDown,
  FileText,
  ImagePlus,
  Info,
  Lightbulb,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { buildQbrDeck, type QbrDeck, type QbrSlide } from "@/lib/qbr-deck";
import { parseQbrFiles } from "@/lib/qbr-import";
import type { HealthTone } from "@/lib/nutanix-brand";
import { removeImageBackground } from "@/lib/remove-bg";
import { exportDeckToPptx } from "@/lib/qbr-pptx";
import { QbrSlideBoard, QbrSlideFrame } from "@/components/qbr-slide";
import { Button } from "@/components/ui";

const CS360_ACCOUNTS_URL = "https://csinsights.nutanix.com/hx/accounts/all";

// One labeled drag-and-drop / click-to-browse target for a single report file.
function FileDropZone({
  label,
  badge,
  hint,
  accept,
  file,
  onFile,
  onClear,
}: {
  label: string;
  badge: string;
  hint: string;
  accept: string;
  file: File | null;
  onFile: (f: File) => void;
  onClear: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-1.5">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-charcoal-600">
        {label}
        <span className="rounded-full bg-iris-100 px-2 py-0.5 text-[10px] font-medium normal-case text-iris-700">{badge}</span>
      </span>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragOver) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) onFile(dropped);
        }}
        className={`flex min-h-[104px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center transition ${
          dragOver
            ? "border-iris-500 bg-iris-100"
            : file
              ? "border-emerald-300 bg-emerald-50"
              : "border-charcoal-300 bg-white hover:border-iris-400 hover:bg-iris-50/60"
        }`}
      >
        {file ? (
          <>
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            <span className="w-full truncate text-sm font-medium text-charcoal-800" title={file.name}>
              {file.name}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="bg-transparent text-xs font-medium text-charcoal-500 hover:text-rose-600"
            >
              Remove
            </button>
          </>
        ) : (
          <>
            <UploadCloud className="h-6 w-6 text-iris-500" />
            <span className="text-sm font-medium text-charcoal-800">Drag &amp; drop, or click to browse</span>
            <span className="text-xs text-charcoal-500">{hint}</span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            if (picked) onFile(picked);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

const TONES: HealthTone[] = ["good", "warn", "bad", "neutral"];

export function QbrBuilder({ defaultSe }: { defaultSe: string }) {
  const [qbrFile, setQbrFile] = useState<File | null>(null);
  const [healthFile, setHealthFile] = useState<File | null>(null);
  const [importNotes, setImportNotes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deck, setDeck] = useState<QbrDeck | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string>("");
  const [logo, setLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [logoModalOpen, setLogoModalOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pendingLogo, setPendingLogo] = useState<string | null>(null); // uploaded, awaiting bg-removal choice
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [bgRemoving, setBgRemoving] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  function clearLogo() {
    setLogo(null);
    setLogoName(null);
  }

  const slideById = useMemo(() => {
    const map = new Map<string, QbrSlide>();
    deck?.slides.forEach((s) => map.set(s.id, s));
    return map;
  }, [deck]);

  const orderedSlides = useMemo(() => order.map((id) => slideById.get(id)).filter(Boolean) as QbrSlide[], [order, slideById]);
  const visibleSlides = useMemo(() => orderedSlides.filter((s) => !hidden[s.id]), [orderedSlides, hidden]);
  const activeSlide = slideById.get(activeId) ?? null;

  // Parse the two uploaded CS360 downloads into a health report, then build the
  // exact same deck we've always built (hidden slides, insights, and all).
  async function build() {
    if (!qbrFile) return;
    setLoading(true);
    setError(null);
    try {
      const { report, notes } = await parseQbrFiles(qbrFile, healthFile, { se: defaultSe });
      const built = buildQbrDeck(report);
      setDeck(built);
      setImportNotes(notes);
      setOrder(built.slides.map((s) => s.id));
      const initHidden: Record<string, boolean> = {};
      built.slides.forEach((s) => (initHidden[s.id] = s.defaultHidden));
      setHidden(initHidden);
      setActiveId(built.slides[0]?.id ?? "");
    } catch (e) {
      console.error(e);
      setError(
        "Couldn't read those files. Make sure the QBR Report is the CS360 .pptx and the Health Report is the .docx, then try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setDeck(null);
    setOrder([]);
    setHidden({});
    setActiveId("");
    setImportNotes([]);
    setError(null);
    setQbrFile(null);
    setHealthFile(null);
  }

  function move(id: string, dir: -1 | 1) {
    setOrder((prev) => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function patchSlide(id: string, patch: Partial<QbrSlide>) {
    setDeck((d) => (d ? { ...d, slides: d.slides.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : d));
  }

  // Immutable deep-set used by inline editing. Preserves a table Cell's tone
  // when only its text changes (Cell = string | { text, tone }).
  function applyLeaf(existing: unknown, value: unknown): unknown {
    if (typeof value === "string" && existing && typeof existing === "object" && "text" in (existing as Record<string, unknown>)) {
      return { ...(existing as Record<string, unknown>), text: value };
    }
    return value;
  }
  function setIn(obj: unknown, segments: string[], value: unknown): unknown {
    const [head, ...rest] = segments;
    if (Array.isArray(obj)) {
      const idx = Number(head);
      const copy = obj.slice();
      copy[idx] = rest.length ? setIn(copy[idx], rest, value) : applyLeaf(copy[idx], value);
      return copy;
    }
    const copy = { ...(obj as Record<string, unknown>) };
    copy[head] = rest.length ? setIn(copy[head], rest, value) : applyLeaf(copy[head], value);
    return copy;
  }
  function patchByPath(slideId: string, path: string, value: string | string[] | number) {
    const segs = path.split(".");
    if (segs[0] === "meta") {
      setDeck((d) => (d ? { ...d, meta: setIn(d.meta, segs.slice(1), value) as typeof d.meta } : d));
      return;
    }
    setDeck((d) => (d ? { ...d, slides: d.slides.map((s) => (s.id === slideId ? (setIn(s, segs, value) as QbrSlide) : s)) } : d));
  }

  function readLogoFile(file?: File | null) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    // Stage the upload and ask about background removal before committing it.
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPendingLogo(reader.result);
        setPendingName(file.name);
      }
    };
    reader.readAsDataURL(file);
  }
  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    readLogoFile(e.target.files?.[0]);
    setLogoModalOpen(false);
    e.target.value = "";
  }

  async function confirmLogo(removeBg: boolean) {
    if (!pendingLogo) return;
    setLogoName(pendingName);
    if (!removeBg) {
      setLogo(pendingLogo);
      setPendingLogo(null);
      setPendingName(null);
      return;
    }
    setBgRemoving(true);
    try {
      setLogo(await removeImageBackground(pendingLogo));
    } catch {
      setLogo(pendingLogo); // fall back to the original on any failure
    } finally {
      setBgRemoving(false);
      setPendingLogo(null);
      setPendingName(null);
    }
  }

  // Checkerboard so transparency is obvious in the preview.
  const CHECKER =
    "repeating-conic-gradient(#e9e9ef 0% 25%, #ffffff 0% 50%) 50% / 16px 16px";

  const bgPromptModal = pendingLogo ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-charcoal-900/50 p-4" onClick={() => !bgRemoving && setPendingLogo(null)}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-charcoal-900">Remove the logo background?</h4>
          <button onClick={() => !bgRemoving && setPendingLogo(null)} className="bg-transparent text-charcoal-400 hover:text-charcoal-700" aria-label="Close" disabled={bgRemoving}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-xs text-charcoal-500">
          Most logos download on a solid white background. Removing it lets the logo sit cleanly on the slides. Your foreground stays untouched.
        </p>
        <div className="mb-4 flex items-center justify-center rounded-lg border border-charcoal-200 p-4" style={{ background: CHECKER }}>
          <img src={pendingLogo} alt="logo preview" className="h-20 w-auto max-w-[220px] object-contain" />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button tone="secondary" onClick={() => confirmLogo(false)} disabled={bgRemoving}>
            Keep original
          </Button>
          <Button onClick={() => confirmLogo(true)} disabled={bgRemoving}>
            <span className="flex items-center gap-1.5">
              {bgRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {bgRemoving ? "Removing..." : "Remove background"}
            </span>
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  const logoModal = logoModalOpen ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-900/50 p-4" onClick={() => setLogoModalOpen(false)}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-charcoal-900">Add customer logo</h4>
          <button onClick={() => setLogoModalOpen(false)} className="bg-transparent text-charcoal-400 hover:text-charcoal-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            readLogoFile(e.dataTransfer.files?.[0]);
            setLogoModalOpen(false);
          }}
          onPaste={(e) => {
            const f = e.clipboardData.files?.[0];
            if (f) {
              readLogoFile(f);
              setLogoModalOpen(false);
            }
          }}
          onClick={() => logoInput.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center transition ${
            dragging ? "border-iris-500 bg-iris-50" : "border-charcoal-300 bg-charcoal-50 hover:border-iris-400 hover:bg-iris-50/60"
          }`}
        >
          <UploadCloud className="h-8 w-8 text-iris-500" />
          <p className="text-sm font-medium text-charcoal-800">Drag &amp; drop a logo here</p>
          <p className="text-xs text-charcoal-500">or click to browse your files. PNG, JPG, or SVG.</p>
        </div>
        {logo ? (
          <div className="mt-3 flex items-center gap-3 rounded-md border border-charcoal-200 bg-white px-3 py-2">
            <img src={logo} alt="logo" className="h-8 w-auto max-w-[120px] object-contain" />
            <span className="text-xs text-charcoal-500">Current logo</span>
            <button onClick={clearLogo} className="ml-auto bg-transparent text-charcoal-400 hover:text-rose-600" aria-label="Remove logo">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  ) : null;

  async function exportPptx() {
    if (!deck) return;
    setExporting(true);
    try {
      await exportDeckToPptx(deck.meta, visibleSlides, logo);
    } finally {
      setExporting(false);
    }
  }

  // --- Import step: guide the SE to the CS360 downloads, then upload them -----
  if (!deck) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-charcoal-200 bg-gradient-to-br from-iris-50 to-white p-6">
          <div className="flex items-center gap-2 text-xs font-medium text-iris-700">
            <FileText className="h-4 w-4" />
            Build a QBR deck from your CS360 downloads
          </div>

          <ol className="mt-4 list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-charcoal-700 marker:font-semibold marker:text-iris-600">
            <li>
              Visit CS360, then locate and click the account you wish to build a QBR deck for:{" "}
              <a
                href={CS360_ACCOUNTS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-iris-600 underline decoration-iris-300 underline-offset-2 hover:text-iris-700"
              >
                csinsights.nutanix.com/hx/accounts/all
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </li>
            <li>
              On the left side bar, click the dropdown arrow next to <strong>&ldquo;Clusters&rdquo;</strong> and select{" "}
              <strong>&ldquo;Cluster Summary&rdquo;</strong>
            </li>
            <li>
              Click the <strong>&ldquo;Actions&rdquo;</strong> button at the top left of the page and download both the{" "}
              <strong>&ldquo;QBR Report&rdquo;</strong> (.pptx) and <strong>&ldquo;Health Report&rdquo;</strong> (.docx)
            </li>
            <li>Drag &amp; drop, or upload, both files into their spots below</li>
          </ol>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <FileDropZone
              label="QBR Report"
              badge=".pptx"
              hint="Nutanix QBR for … .pptx"
              accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              file={qbrFile}
              onFile={(f) => {
                setQbrFile(f);
                setError(null);
              }}
              onClear={() => setQbrFile(null)}
            />
            <FileDropZone
              label="Health Report"
              badge=".docx"
              hint="Nutanix TAM Healthcheck … .docx"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              file={healthFile}
              onFile={(f) => {
                setHealthFile(f);
                setError(null);
              }}
              onClear={() => setHealthFile(null)}
            />
          </div>

          <div className="mt-4 space-y-1.5">
            <span className="block text-xs font-semibold uppercase tracking-wide text-charcoal-600">Customer logo (optional)</span>
            <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={onLogo} />
            {logo ? (
              <div className="flex h-10 items-center gap-2 rounded-md border border-charcoal-300 bg-white px-3">
                <ImagePlus className="h-4 w-4 shrink-0 text-iris-500" />
                <span className="truncate text-sm text-charcoal-700">{logoName ?? "Logo added"}</span>
                <button onClick={clearLogo} className="ml-auto shrink-0 text-charcoal-400 hover:text-rose-600" aria-label="Remove logo">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button onClick={() => setLogoModalOpen(true)} className="flex h-10 w-full items-center gap-2 rounded-md border border-dashed border-charcoal-300 bg-white px-3 text-sm text-charcoal-600 hover:border-iris-400 hover:text-iris-600">
                <ImagePlus className="h-4 w-4" /> Upload logo (placed throughout the deck)
              </button>
            )}
          </div>
          {logoModal}
          {bgPromptModal}

          {error ? (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="mt-5 flex items-center gap-3">
            <Button onClick={build} disabled={loading || !qbrFile || !healthFile}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Building your QBR deck…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Build QBR Deck
                </span>
              )}
            </Button>
            <span className="text-xs text-charcoal-500">
              Files are read in your browser and never uploaded anywhere.
            </span>
          </div>
        </div>
      </div>
    );
  }

  // --- Builder ---------------------------------------------------------------
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-charcoal-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-iris-50 text-iris-600">
            <Building2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-charcoal-900">{deck.meta.customer}</p>
            <p className="text-xs text-charcoal-500">
              {deck.meta.vertical ? `${deck.meta.vertical} · ` : ""}
              {visibleSlides.length} of {orderedSlides.length} slides included
            </p>
          </div>
        </div>
        <span className="flex flex-1 items-center justify-center gap-1.5 text-xs text-charcoal-500">
          <Pencil className="h-3.5 w-3.5 text-iris-500" /> Click any text on the slide to edit it.
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={onLogo} />
          <Button tone="secondary" onClick={() => setLogoModalOpen(true)}>
            <span className="flex items-center gap-1.5">
              <ImagePlus className="h-4 w-4" /> {logo ? "Change logo" : "Add logo"}
            </span>
          </Button>
          <Button tone="secondary" onClick={reset}>
            <span className="flex items-center gap-1.5">
              <RefreshCw className="h-4 w-4" /> New deck
            </span>
          </Button>
          <Button tone="secondary" onClick={() => window.print()}>
            <span className="flex items-center gap-1.5">
              <FileDown className="h-4 w-4" /> PDF
            </span>
          </Button>
          <Button onClick={exportPptx} disabled={exporting}>
            <span className="flex items-center gap-1.5">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export .pptx
            </span>
          </Button>
        </div>
      </div>

      {importNotes.length ? (
        <details className="group rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
            <Info className="h-4 w-4 shrink-0" />
            A few fields aren&rsquo;t in the CS360 export and were derived or defaulted — every slide stays editable
            <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-xs leading-relaxed text-amber-800/90">
            {importNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Slide rail - stretches to match the editor column height */}
        <div className="relative min-w-0 lg:min-h-0">
          <div className="max-h-[60vh] space-y-1 overflow-y-auto rounded-lg border border-charcoal-200 bg-charcoal-50 p-2 lg:absolute lg:inset-0 lg:max-h-none">
          {orderedSlides.map((s, i) => {
            const isHidden = hidden[s.id];
            const isActive = s.id === activeId;
            return (
              <div
                key={s.id}
                className={`group flex items-stretch gap-1.5 rounded-lg border bg-white transition ${
                  isActive ? "border-iris-300 shadow-sm ring-1 ring-iris-200" : "border-charcoal-200 hover:border-charcoal-300"
                } ${isHidden ? "opacity-60" : ""}`}
              >
                <button
                  onClick={() => setActiveId(s.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-l-lg bg-transparent px-2 py-2 text-left hover:bg-charcoal-50"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
                      isActive ? "bg-iris-500 text-white" : "bg-iris-50 text-iris-700"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className={`block truncate text-[13px] font-semibold ${isHidden ? "text-charcoal-500" : "text-charcoal-900"}`}>
                      {s.title}
                    </span>
                    <span className="block truncate text-[11px] text-charcoal-500">{isHidden ? "Hidden · " : ""}{s.section}</span>
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-0.5 pr-1.5">
                  <span className="flex flex-col opacity-0 transition group-hover:opacity-100">
                    <button onClick={() => move(s.id, -1)} className="rounded bg-transparent px-1 py-0.5 text-charcoal-400 hover:bg-charcoal-100 hover:text-charcoal-700" aria-label="Move up">
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button onClick={() => move(s.id, 1)} className="rounded bg-transparent px-1 py-0.5 text-charcoal-400 hover:bg-charcoal-100 hover:text-charcoal-700" aria-label="Move down">
                      <ArrowDown className="h-3 w-3" />
                    </button>
                  </span>
                  <button
                    onClick={() => setHidden((h) => ({ ...h, [s.id]: !h[s.id] }))}
                    className={`shrink-0 rounded-md bg-transparent p-1.5 ${
                      isHidden ? "text-charcoal-400 hover:bg-charcoal-100 hover:text-charcoal-700" : "text-iris-500 hover:bg-iris-50 hover:text-iris-700"
                    }`}
                    aria-label={isHidden ? "Show slide" : "Hide slide"}
                  >
                    {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            );
          })}
          </div>
        </div>

        {/* Preview + editor */}
        <div className="min-w-0 space-y-4">
          {activeSlide ? (
            <>
              <div className="relative">
                <QbrSlideFrame
                  slide={activeSlide}
                  meta={deck.meta}
                  logo={logo}
                  page={orderedSlides.findIndex((s) => s.id === activeSlide.id) + 1}
                  editable
                  onPatch={(path, value) => patchByPath(activeSlide.id, path, value)}
                />
                {hidden[activeSlide.id] ? (
                  <div className="absolute right-3 top-3 rounded-full bg-charcoal-900/80 px-3 py-1 text-xs font-medium text-white">Hidden from export</div>
                ) : null}
              </div>

              {/* SE coaching - collapsible purple bar (Health Check Guide) */}
              {activeSlide.talkTrack ? (
                <div className="overflow-hidden rounded-xl border border-iris-200 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setCoachOpen((o) => !o)}
                    className="flex w-full items-center gap-2 bg-gradient-to-r from-iris-500 to-iris-700 px-4 py-2.5 text-left text-white"
                  >
                    <Lightbulb className="h-4 w-4" />
                    <span className="text-sm font-semibold">SE coaching</span>
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium">Health Check Guide</span>
                    <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${coachOpen ? "rotate-180" : ""}`} />
                  </button>
                  {coachOpen ? (
                    <div className="bg-white p-3">
                      <textarea value={activeSlide.talkTrack} rows={3} onChange={(e) => patchSlide(activeSlide.id, { talkTrack: e.target.value })} className="w-full" />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* SE Insight - single-line field, same height as the bars above/below */}
              <div className="flex items-center gap-2 rounded-xl border border-charcoal-200 bg-white px-4 py-1.5 shadow-sm">
                <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-iris-700">SE Insight</span>
                <select
                  value={activeSlide.insight?.tone ?? "neutral"}
                  onChange={(e) =>
                    patchSlide(activeSlide.id, {
                      insight: { tone: e.target.value as HealthTone, text: activeSlide.insight?.text ?? "" },
                    })
                  }
                  className="h-7 w-24 shrink-0 py-0 text-xs"
                >
                  {TONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  value={activeSlide.insight?.text ?? ""}
                  placeholder="Callout shown on the slide"
                  onChange={(e) =>
                    patchSlide(activeSlide.id, {
                      insight: e.target.value ? { tone: activeSlide.insight?.tone ?? "neutral", text: e.target.value } : undefined,
                    })
                  }
                  className={`h-7 flex-1 py-0 text-xs ${activeSlide.insightHidden ? "opacity-50" : ""}`}
                />
                <button
                  type="button"
                  onClick={() => patchSlide(activeSlide.id, { insightHidden: !activeSlide.insightHidden })}
                  disabled={!activeSlide.insight}
                  title={activeSlide.insightHidden ? "Show insight on slide" : "Hide insight from slide"}
                  className={`shrink-0 rounded-md bg-transparent p-1 ${
                    activeSlide.insightHidden ? "text-charcoal-400 hover:bg-charcoal-100 hover:text-charcoal-700" : "text-iris-500 hover:bg-iris-50 hover:text-iris-700"
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {activeSlide.insightHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Speaker notes - collapsible single-line bar (exported as PPT notes) */}
              <div className="overflow-hidden rounded-xl border border-charcoal-200 shadow-sm">
                <button
                  type="button"
                  onClick={() => setNotesOpen((o) => !o)}
                  className="flex w-full items-center gap-2 bg-white px-4 py-2.5 text-left text-charcoal-700"
                >
                  <FileText className="h-4 w-4 text-iris-600" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-iris-700">Speaker notes</span>
                  {!notesOpen ? <span className="min-w-0 flex-1 truncate text-xs text-charcoal-400">{activeSlide.speakerNotes}</span> : <span className="flex-1" />}
                  <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-charcoal-400 transition-transform ${notesOpen ? "rotate-180" : ""}`} />
                </button>
                {notesOpen ? (
                  <div className="border-t border-charcoal-100 bg-white p-3">
                    <textarea
                      value={activeSlide.speakerNotes ?? ""}
                      rows={3}
                      placeholder="Speaker notes exported into the PowerPoint notes pane"
                      onChange={(e) => patchSlide(activeSlide.id, { speakerNotes: e.target.value })}
                      className="w-full"
                    />
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Off-screen print surface - full-fidelity one slide per page for PDF. */}
      <div className="qbr-print-root" aria-hidden>
        {visibleSlides.map((s, i) => (
          <div key={s.id} className="qbr-print-page">
            <QbrSlideBoard slide={s} meta={deck.meta} logo={logo} page={i + 1} />
          </div>
        ))}
      </div>
      {logoModal}
      {bgPromptModal}
    </div>
  );
}
