"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  Download,
  Eye,
  EyeOff,
  FileDown,
  ImagePlus,
  Lightbulb,
  Loader2,
  Pencil,
  RefreshCw,
  Server,
  X,
} from "lucide-react";
import { fetchCs360HealthReport } from "@/lib/cs360";
import { buildUclaSampleReport, UCLA_SAMPLE_ACCOUNT } from "@/lib/qbr-sample-ucla";
import { buildQbrDeck, type QbrDeck, type QbrSlide } from "@/lib/qbr-deck";
import type { HealthTone } from "@/lib/nutanix-brand";
import { exportDeckToPptx } from "@/lib/qbr-pptx";
import { QbrSlideBoard, QbrSlideFrame } from "@/components/qbr-slide";
import { Button } from "@/components/ui";

export type AccountLite = { id: string; accountName: string };

const TONES: HealthTone[] = ["good", "warn", "bad", "neutral"];

export function QbrBuilder({ accounts, defaultSe }: { accounts: AccountLite[]; defaultSe: string }) {
  const [selected, setSelected] = useState(accounts[0]?.accountName ?? "");
  const [deck, setDeck] = useState<QbrDeck | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string>("");
  const [logo, setLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  const slideById = useMemo(() => {
    const map = new Map<string, QbrSlide>();
    deck?.slides.forEach((s) => map.set(s.id, s));
    return map;
  }, [deck]);

  const orderedSlides = useMemo(() => order.map((id) => slideById.get(id)).filter(Boolean) as QbrSlide[], [order, slideById]);
  const visibleSlides = useMemo(() => orderedSlides.filter((s) => !hidden[s.id]), [orderedSlides, hidden]);
  const activeSlide = slideById.get(activeId) ?? null;

  function pull() {
    if (!selected) return;
    setLoading(true);
    // Simulated CS360 pull latency so the flow matches the live connector.
    window.setTimeout(() => {
      const report =
        selected === UCLA_SAMPLE_ACCOUNT ? buildUclaSampleReport(defaultSe) : fetchCs360HealthReport(selected, { se: defaultSe });
      const built = buildQbrDeck(report);
      setDeck(built);
      setOrder(built.slides.map((s) => s.id));
      const initHidden: Record<string, boolean> = {};
      built.slides.forEach((s) => (initHidden[s.id] = s.defaultHidden));
      setHidden(initHidden);
      setActiveId(built.slides[0]?.id ?? "");
      setLoading(false);
    }, 850);
  }

  function reset() {
    setDeck(null);
    setOrder([]);
    setHidden({});
    setActiveId("");
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

  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  async function exportPptx() {
    if (!deck) return;
    setExporting(true);
    try {
      await exportDeckToPptx(deck.meta, visibleSlides, logo);
    } finally {
      setExporting(false);
    }
  }

  // --- CS360 connect step ----------------------------------------------------
  if (!deck) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-charcoal-200 bg-gradient-to-br from-iris-50 to-white p-6">
          <div className="flex items-center gap-2 text-xs font-medium text-iris-700">
            <Server className="h-4 w-4" />
            CS360 connector
            <span className="rounded-full bg-iris-100 px-2 py-0.5 text-[11px] text-iris-700">Stubbed (live VPN pull coming soon)</span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-charcoal-900">Build a QBR deck from a customer&apos;s health check</h3>
          <p className="mt-1 max-w-2xl text-sm text-charcoal-600">
            Pick a customer and we&apos;ll pull their auto-generated QBR report (Cluster → Cluster Summary → Actions → Download QBR
            Report), then assemble a curated, on-brand deck following the Jan 2026 Health Check Guide, with SE talk-track on every
            slide and the redundant slides pre-hidden.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-charcoal-800">Customer</span>
              <div className="flex items-center gap-2 rounded-md border border-charcoal-300 bg-white px-3">
                <Building2 className="h-4 w-4 text-charcoal-400" />
                <select value={selected} onChange={(e) => setSelected(e.target.value)} className="w-full border-0 bg-transparent py-2 outline-none">
                  {accounts.map((a) => (
                    <option key={a.id} value={a.accountName}>
                      {a.accountName}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <div className="space-y-1.5">
              <span className="text-sm font-medium text-charcoal-800">Customer logo (optional)</span>
              <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={onLogo} />
              {logo ? (
                <div className="flex items-center gap-3 rounded-md border border-charcoal-300 bg-white px-3 py-1.5">
                  <img src={logo} alt="logo" className="h-8 w-auto max-w-[120px] object-contain" />
                  <button onClick={() => setLogo(null)} className="ml-auto text-charcoal-400 hover:text-rose-600" aria-label="Remove logo">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button onClick={() => logoInput.current?.click()} className="flex w-full items-center gap-2 rounded-md border border-dashed border-charcoal-300 bg-white px-3 py-2 text-sm text-charcoal-600 hover:border-iris-400 hover:text-iris-600">
                  <ImagePlus className="h-4 w-4" /> Upload logo (placed throughout the deck)
                </button>
              )}
            </div>
          </div>

          <div className="mt-5">
            <Button onClick={pull} disabled={loading || !selected}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Pulling report from CS360…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Download className="h-4 w-4" /> Pull QBR Report
                </span>
              )}
            </Button>
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
              {deck.meta.vertical} · {visibleSlides.length} of {orderedSlides.length} slides included
            </p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input ref={logoInput} type="file" accept="image/*" className="hidden" onChange={onLogo} />
          <Button tone="secondary" onClick={() => logoInput.current?.click()}>
            <span className="flex items-center gap-1.5">
              <ImagePlus className="h-4 w-4" /> {logo ? "Change logo" : "Add logo"}
            </span>
          </Button>
          <Button tone="secondary" onClick={reset}>
            <span className="flex items-center gap-1.5">
              <RefreshCw className="h-4 w-4" /> Change customer
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

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Slide rail - stretches to match the editor column height */}
        <div className="relative lg:min-h-0">
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
        <div className="space-y-4">
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
              <p className="flex items-center gap-1.5 text-xs text-charcoal-500">
                <Pencil className="h-3.5 w-3.5 text-iris-500" /> Click any text on the slide to edit it. Changes flow straight into the exported PowerPoint.
              </p>

              {activeSlide.talkTrack ? (
                <div className="overflow-hidden rounded-xl border border-iris-200 bg-white shadow-sm">
                  <div className="flex items-center gap-2 bg-gradient-to-r from-iris-500 to-iris-700 px-4 py-2.5 text-white">
                    <Lightbulb className="h-4 w-4" />
                    <span className="text-sm font-semibold">SE coaching</span>
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium">Health Check Guide</span>
                  </div>
                  <p className="px-4 py-3 text-sm leading-relaxed text-charcoal-700">{activeSlide.talkTrack}</p>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-xl border border-charcoal-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-charcoal-100 bg-gradient-to-r from-iris-50 to-white px-4 py-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-iris-100 text-iris-600">
                    <Pencil className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-charcoal-900">Edit slide</p>
                    <p className="truncate text-xs text-charcoal-500">{activeSlide.section}</p>
                  </div>
                </div>
                <div className="grid gap-4 p-4">
                  <label className="space-y-1.5">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-iris-700">Slide title</span>
                    <input value={activeSlide.title} onChange={(e) => patchSlide(activeSlide.id, { title: e.target.value })} className="w-full" />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-iris-700">Subtitle</span>
                    <input
                      value={activeSlide.subtitle ?? ""}
                      placeholder="Optional subtitle shown under the title"
                      onChange={(e) => patchSlide(activeSlide.id, { subtitle: e.target.value })}
                      className="w-full"
                    />
                  </label>
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-iris-700">SE Insight callout</span>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <select
                        value={activeSlide.insight?.tone ?? "neutral"}
                        onChange={(e) =>
                          patchSlide(activeSlide.id, {
                            insight: { tone: e.target.value as HealthTone, text: activeSlide.insight?.text ?? "" },
                          })
                        }
                        className="w-full shrink-0 sm:w-32"
                      >
                        {TONES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      <input
                        value={activeSlide.insight?.text ?? ""}
                        placeholder="Optional callout shown on the slide"
                        onChange={(e) =>
                          patchSlide(activeSlide.id, {
                            insight: e.target.value
                              ? { tone: activeSlide.insight?.tone ?? "neutral", text: e.target.value }
                              : undefined,
                          })
                        }
                        className="flex-1"
                      />
                    </div>
                  </div>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-iris-700">Coaching / talk-track notes</span>
                    <textarea
                      value={activeSlide.talkTrack}
                      rows={3}
                      onChange={(e) => patchSlide(activeSlide.id, { talkTrack: e.target.value })}
                      className="w-full"
                    />
                  </label>
                </div>
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
    </div>
  );
}
