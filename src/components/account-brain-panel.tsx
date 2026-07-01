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

const itemKey = (item: { itemType: BrainItemType; id: string }) => `${item.itemType}:${item.id}`;

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
          className={`min-w-0 flex-1 text-left ${hasBody ? "cursor-pointer" : "cursor-default"}`}
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
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
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
                  className="rounded px-1.5 py-0.5 text-iris-600 hover:bg-iris-50 disabled:text-charcoal-300 disabled:hover:bg-transparent"
                >
                  All
                </button>
                <span className="text-charcoal-300">·</span>
                <button
                  type="button"
                  onClick={() => onBulk(section, false)}
                  disabled={noneIn}
                  className="rounded px-1.5 py-0.5 text-charcoal-500 hover:bg-charcoal-100 disabled:text-charcoal-300 disabled:hover:bg-transparent"
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
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(summary.sections.map((s) => s.key)),
  );
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"note" | "asset">("note");

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
          items: items.map((i) => ({ itemType: i.itemType, itemId: i.id })),
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

  const meetingOptions = summary.sections
    .find((s) => s.key === "transcript")
    ?.items.map((i) => ({ id: i.id, label: i.title })) ?? [];

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-charcoal-900/30 transition-opacity duration-300 ${
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
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-800">AI usage opted out</p>
                <p className="mt-0.5 text-sm text-amber-700">
                  {summary.accountName} has opted out of AI usage at Nutanix. Their data is shown for reference only and
                  is never sent to Account-AI.
                </p>
              </div>
            </div>
          ) : null}

          {/* Context coverage */}
          <div className="rounded-xl border border-iris-200 bg-iris-50 p-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-iris-700">
                <Sparkles className="h-3.5 w-3.5" /> In context
              </p>
              <p className="text-sm font-semibold text-iris-700">
                {includedCount} / {summary.totalCount} items
              </p>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white">
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
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
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
            <form action={ingestAccountDataAction} className="space-y-2">
              <input type="hidden" name="dealId" value={dealId} />
              <div className="grid grid-cols-2 gap-2">
                <select
                  name="kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as "note" | "asset")}
                  className="text-sm"
                >
                  <option value="note">Note</option>
                  <option value="asset">Document / asset</option>
                </select>
                <select name="meetingId" defaultValue="" className="text-sm">
                  <option value="">Overall brain (account-level)</option>
                  {meetingOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {kind === "note" ? (
                <>
                  <select name="role" defaultValue="SE" className="w-full text-sm">
                    <option value="SE">SE - Systems Engineer</option>
                    <option value="AE">AE - Account Executive</option>
                    <option value="SAM">SAM - Subscription Account Manager</option>
                  </select>
                  <textarea
                    name="body"
                    rows={3}
                    required
                    placeholder="Paste a Zoom summary, discovery note, or context for the Account-AI to learn."
                    className="w-full text-sm"
                  />
                </>
              ) : (
                <>
                  <select name="type" defaultValue="TEXT_BRIEF" className="w-full text-sm">
                    <option value="PRESENTATION">Presentation</option>
                    <option value="WHITEBOARD">Whiteboard</option>
                    <option value="COLLECTOR">Collector</option>
                    <option value="RV_TOOL">RV Tool</option>
                    <option value="ZIP_BUNDLE">Zip Bundle</option>
                    <option value="TEXT_BRIEF">Text Brief</option>
                    <option value="QBR_REPORT">QBR Report</option>
                  </select>
                  <input name="title" required placeholder="Title (e.g. Acme Architecture Deck)" className="w-full text-sm" />
                  <input name="sourceTool" placeholder="Source tool (e.g. PowerPoint)" className="w-full text-sm" />
                  <input name="uri" required placeholder="https:// or file:// location" className="w-full text-sm" />
                  <input name="previewImageUri" placeholder="Preview image URL (optional)" className="w-full text-sm" />
                </>
              )}

              <div className="flex justify-end">
                <Button type="submit" className="px-3 py-1.5 text-xs">
                  Ingest into brain
                </Button>
              </div>
            </form>
          </div>
        ) : null}
      </aside>
    </>
  );
}
