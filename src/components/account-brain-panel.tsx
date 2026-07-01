"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  ChevronDown,
  FileText,
  ListChecks,
  Lock,
  Mail,
  NotebookPen,
  Plus,
  Sparkles,
  UploadCloud,
  Users,
  Video,
  X,
} from "lucide-react";
import { ingestAccountDataAction } from "@/lib/actions";
import { Button } from "@/components/ui";
import { BrainIcon, ContextSwitch, SourceBadge } from "@/components/brain-ui";
import type { BrainItem, BrainItemType, BrainSection, BrainSummary } from "@/lib/account-ai";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const SECTION_ICON: Record<BrainItemType, React.ReactNode> = {
  opportunity: <Briefcase className="h-4 w-4" />,
  transcript: <Video className="h-4 w-4" />,
  note: <NotebookPen className="h-4 w-4" />,
  contact: <Users className="h-4 w-4" />,
  task: <ListChecks className="h-4 w-4" />,
  asset: <FileText className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
};

// Keyed by owning deal too, mirroring how the server stores exclusions
// (`dealId:itemType:itemId`), so synthetic per-deal ids can never collide
// across an account's opportunities.
const itemKey = (item: { dealId: string; itemType: BrainItemType; id: string }) =>
  `${item.dealId}:${item.itemType}:${item.id}`;

// --- One toggleable knowledge row ------------------------------------------

function ItemRow({
  item,
  included,
  busy,
  disabled,
  expanded,
  onToggleInclude,
  onToggleExpand,
}: {
  item: BrainItem;
  included: boolean;
  busy: boolean;
  disabled: boolean;
  expanded: boolean;
  onToggleInclude: () => void;
  onToggleExpand: () => void;
}) {
  const hasBody = Boolean(item.body && item.body.trim());
  return (
    <li
      className={`rounded-lg border transition-colors ${
        included ? "border-charcoal-200 bg-white" : "border-dashed border-charcoal-200 bg-charcoal-50/60"
      }`}
    >
      <div className="flex items-start gap-2.5 p-2.5">
        <div className="pt-0.5">
          <ContextSwitch
            size="sm"
            checked={included}
            disabled={disabled}
            busy={busy}
            onChange={onToggleInclude}
            label={`${included ? "Remove" : "Add"} “${item.title}” ${included ? "from" : "to"} the AI context`}
          />
        </div>
        <button
          type="button"
          onClick={onToggleExpand}
          disabled={!hasBody}
          className={`min-w-0 flex-1 rounded-md bg-transparent p-0 text-left font-normal hover:bg-transparent focus-visible:ring-2 focus-visible:ring-iris-400 disabled:opacity-100 ${
            hasBody ? "cursor-pointer" : "cursor-default"
          }`}
          aria-expanded={hasBody ? expanded : undefined}
        >
          <div className="flex items-center gap-2">
            <span
              className={`truncate text-sm font-medium ${included ? "text-charcoal-800" : "text-charcoal-400"}`}
            >
              {item.title}
            </span>
            {hasBody ? (
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-charcoal-400 transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <SourceBadge source={item.source} />
            {item.detail ? (
              <span className="truncate text-[11px] text-charcoal-500">{item.detail}</span>
            ) : null}
            {item.date ? <span className="text-[11px] text-charcoal-400">· {fmtDate(item.date)}</span> : null}
            {!included ? (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-charcoal-400">
                Not in context
              </span>
            ) : null}
          </div>
        </button>
      </div>
      {hasBody && expanded ? (
        <div className="border-t border-charcoal-200 bg-charcoal-50/70 px-3 py-2">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-charcoal-700">{item.body}</p>
        </div>
      ) : null}
    </li>
  );
}

// --- A collapsible source section ------------------------------------------

function Section({
  section,
  includedMap,
  pending,
  expandedItems,
  locked,
  open,
  onToggleOpen,
  onToggleItem,
  onToggleExpand,
  onBulk,
}: {
  section: BrainSection;
  includedMap: Record<string, boolean>;
  pending: Set<string>;
  expandedItems: Set<string>;
  locked: boolean;
  open: boolean;
  onToggleOpen: () => void;
  onToggleItem: (item: BrainItem) => void;
  onToggleExpand: (key: string) => void;
  onBulk: (section: BrainSection, included: boolean) => void;
}) {
  const includedCount = section.items.filter((i) => includedMap[itemKey(i)]).length;
  const allIn = includedCount === section.items.length;
  const noneIn = includedCount === 0;

  return (
    <div className="overflow-hidden rounded-xl border border-charcoal-200">
      <div className="flex items-center gap-2 bg-charcoal-50 px-3 py-2">
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md bg-transparent p-0 text-left font-normal text-charcoal-800 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-iris-400"
        >
          <span className="text-iris-600">{SECTION_ICON[section.key]}</span>
          <span className="truncate text-sm font-semibold text-charcoal-800">{section.label}</span>
          <span className="shrink-0 text-xs text-charcoal-500">
            {includedCount}/{section.items.length} in context
          </span>
          <ChevronDown
            className={`ml-auto h-4 w-4 shrink-0 text-charcoal-500 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open ? (
        <div className="border-t border-charcoal-200 bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-charcoal-100 px-3 py-1.5">
            <span className="text-[11px] text-charcoal-400">{section.description}</span>
            {!locked && section.items.length > 1 ? (
              <span className="flex items-center gap-1 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => onBulk(section, true)}
                  disabled={allIn}
                  className="rounded bg-transparent px-1.5 py-0.5 font-medium text-iris-600 hover:bg-iris-50 disabled:text-charcoal-300 disabled:opacity-100 disabled:hover:bg-transparent"
                >
                  All
                </button>
                <span className="text-charcoal-300">·</span>
                <button
                  type="button"
                  onClick={() => onBulk(section, false)}
                  disabled={noneIn}
                  className="rounded bg-transparent px-1.5 py-0.5 font-medium text-charcoal-500 hover:bg-charcoal-100 disabled:text-charcoal-300 disabled:opacity-100 disabled:hover:bg-transparent"
                >
                  None
                </button>
              </span>
            ) : null}
          </div>
          <ul className="space-y-1.5 p-2.5">
            {section.items.map((item) => {
              const key = itemKey(item);
              return (
                <ItemRow
                  key={key}
                  item={item}
                  included={includedMap[key] ?? item.included}
                  busy={pending.has(key)}
                  disabled={locked || pending.has(key)}
                  expanded={expandedItems.has(key)}
                  onToggleInclude={() => onToggleItem(item)}
                  onToggleExpand={() => onToggleExpand(key)}
                />
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function AccountBrainPanel({
  open,
  onClose,
  summary,
  dealId,
}: {
  open: boolean;
  onClose: () => void;
  summary: BrainSummary;
  dealId: string;
}) {
  const locked = summary.aiOptOut;
  const closeRef = useRef<HTMLButtonElement>(null);

  // Local include state keyed by `${itemType}:${id}`, seeded from the summary
  // and updated optimistically. Reset whenever a different account loads.
  const seed = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const section of summary.sections) {
      for (const item of section.items) map[itemKey(item)] = item.included;
    }
    return map;
  }, [summary]);

  const [includedMap, setIncludedMap] = useState<Record<string, boolean>>(seed);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  // Start with every source section collapsed so opening the brain reads clean;
  // the user expands only what they want to inspect.
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set<string>());
  const [error, setError] = useState<string | null>(null);
  // Drag-and-drop upload state for the "add data" dropzone.
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0 || uploading) return;
    setUploadMsg(null);
    setUploading(true);
    try {
      let ok = 0;
      for (const file of files) {
        const form = new FormData();
        form.append("dealId", dealId);
        form.append("file", file);
        const res = await fetch("/api/account-brain/upload", { method: "POST", body: form });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!data.ok) throw new Error(data.error ?? "Upload failed.");
        ok += 1;
      }
      setUploadMsg(`Added ${ok} ${ok === 1 ? "file" : "files"} to the brain. Refreshing…`);
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      setUploadMsg(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  // Local state is seeded from props at mount. The workspace passes key={dealId}
  // so switching accounts remounts this panel with a fresh, correct baseline.

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Move focus into the dialog for keyboard + screen-reader users.
    const t = window.setTimeout(() => closeRef.current?.focus(), 60);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  const includedCount = summary.sections
    .flatMap((s) => s.items)
    .filter((i) => includedMap[itemKey(i)] ?? i.included).length;

  const persist = async (items: BrainItem[], included: boolean) => {
    const keys = items.map(itemKey);
    setError(null);
    setPending((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => next.add(k));
      return next;
    });
    setIncludedMap((prev) => {
      const next = { ...prev };
      keys.forEach((k) => (next[k] = included));
      return next;
    });
    try {
      const res = await fetch("/api/account-brain/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          included,
          // Each item carries its owning opportunity so exclusions persist
          // against the right deal (an account spans several opps).
          items: items.map((i) => ({ itemType: i.itemType, itemId: i.id, dealId: i.dealId })),
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Could not update context.");
    } catch (e) {
      // Revert the optimistic change on failure.
      setIncludedMap((prev) => {
        const next = { ...prev };
        keys.forEach((k) => (next[k] = !included));
        return next;
      });
      setError(e instanceof Error ? e.message : "Could not update context.");
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        keys.forEach((k) => next.delete(k));
        return next;
      });
    }
  };

  const toggleItem = (item: BrainItem) => {
    if (locked) return;
    void persist([item], !(includedMap[itemKey(item)] ?? item.included));
  };

  const bulkSection = (section: BrainSection, included: boolean) => {
    if (locked) return;
    const changed = section.items.filter((i) => (includedMap[itemKey(i)] ?? i.included) !== included);
    if (changed.length > 0) void persist(changed, included);
  };

  const toggleExpand = (key: string) =>
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleSectionOpen = (key: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 dark:bg-black/60 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${summary.accountName} Account-AI brain`}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-charcoal-200 p-5">
          <div className="flex min-w-0 items-start gap-3">
            <BrainIcon size="lg" />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-charcoal-900">Account-AI Brain</h2>
              <p className="mt-0.5 text-sm text-charcoal-500">
                Everything <span className="font-semibold text-charcoal-800">{summary.accountName}</span>&apos;s AI has
                ingested. Toggle any item to keep it out of the context without deleting it.
              </p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close brain"
            className="rounded-full border border-charcoal-200 bg-white p-1.5 text-charcoal-600 hover:bg-charcoal-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-iris-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {locked ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">AI usage opted out</p>
                <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-200/80">
                  {summary.accountName} has opted out of AI usage at Nutanix. Their data is shown for reference only and
                  is never sent to Account-AI.
                </p>
              </div>
            </div>
          ) : null}

          {/* Context coverage */}
          <div className="rounded-xl border border-iris-200 bg-iris-50 p-3 dark:border-iris-500/30">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-iris-700">
                <Sparkles className="h-3.5 w-3.5" /> In context
              </p>
              <p className="text-sm font-semibold text-iris-700">
                {includedCount} / {summary.totalCount} items
              </p>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/70 dark:bg-black/30">
              <div
                className="h-full rounded-full bg-iris-500 transition-all duration-300"
                style={{ width: `${summary.totalCount ? (includedCount / summary.totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[
              ["Zoom", summary.transcriptCount],
              ["Notes", summary.noteCount],
              ["People", summary.contactCount],
              ["Tasks", summary.taskCount],
              ["Docs", summary.assetCount],
              ["Emails", summary.emailCount],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-charcoal-200 bg-charcoal-50 px-2 py-2 text-center">
                <p className="text-base font-semibold text-iris-600">{value}</p>
                <p className="text-[10px] uppercase tracking-wide text-charcoal-500">{label}</p>
              </div>
            ))}
          </div>

          {/* Topics */}
          {summary.topics.length > 0 ? (
            <div className="rounded-xl border border-charcoal-200 bg-white p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-charcoal-500">
                <Sparkles className="h-3.5 w-3.5 text-iris-500" /> Main topics in the notes
              </p>
              <div className="flex flex-wrap gap-1.5">
                {summary.topics.map((topic) => (
                  <span key={topic} className="rounded-full bg-iris-100 px-2.5 py-1 text-xs font-medium text-iris-700">
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          ) : null}

          {/* Sections */}
          {summary.sections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-charcoal-200 p-8 text-center text-sm text-charcoal-400">
              Nothing has been ingested for this account yet. Add a note or document below to start its brain.
            </div>
          ) : (
            <div className="space-y-3">
              {summary.sections.map((section) => (
                <Section
                  key={section.key}
                  section={section}
                  includedMap={includedMap}
                  pending={pending}
                  expandedItems={expandedItems}
                  locked={locked}
                  open={openSections.has(section.key)}
                  onToggleOpen={() => toggleSectionOpen(section.key)}
                  onToggleItem={toggleItem}
                  onToggleExpand={toggleExpand}
                  onBulk={bulkSection}
                />
              ))}
            </div>
          )}
        </div>

        {/* Add to brain */}
        {!locked ? (
          <div className="border-t border-charcoal-200 bg-charcoal-50 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-charcoal-500">
              <Plus className="h-3.5 w-3.5 text-iris-500" /> Add data to this account&apos;s brain
            </p>

            {/* Drag-and-drop: the primary way to add data. */}
            <div
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
                void uploadFiles(Array.from(e.dataTransfer.files));
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-iris-400 ${
                dragOver
                  ? "border-iris-400 bg-iris-50"
                  : "border-charcoal-300 bg-white hover:border-iris-300 hover:bg-iris-50/40"
              }`}
            >
              <UploadCloud className={`h-6 w-6 ${dragOver ? "text-iris-600" : "text-charcoal-400"}`} />
              <p className="text-sm font-medium text-charcoal-700">
                {uploading ? "Uploading…" : "Drag & drop files here"}
              </p>
              <p className="text-[11px] text-charcoal-500">
                Decks, collector output, RVTools, PDFs, notes — or click to browse
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void uploadFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </div>
            {uploadMsg ? <p className="mt-2 text-[11px] text-charcoal-500">{uploadMsg}</p> : null}

            {/* Or paste a quick note. */}
            <form action={ingestAccountDataAction} className="mt-3 space-y-2">
              <input type="hidden" name="dealId" value={dealId} />
              <input type="hidden" name="kind" value="note" />
              <input type="hidden" name="role" value="SE" />
              <textarea
                name="body"
                rows={2}
                required
                placeholder="…or paste a quick note (Zoom summary, discovery detail) for the AI to learn."
                className="w-full text-sm"
              />
              <div className="flex justify-end">
                <Button type="submit" className="px-3 py-1.5 text-xs">
                  Add note
                </Button>
              </div>
            </form>
          </div>
        ) : null}
      </aside>
    </>
  );
}
