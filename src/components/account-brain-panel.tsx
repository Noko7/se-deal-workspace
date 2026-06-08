"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  FileText,
  NotebookPen,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { SideBrainIcon } from "@/components/side-brain-icon";
import { ingestAccountDataAction } from "@/lib/actions";
import { Button, StatusPill } from "@/components/ui";
import type { BrainGroup, BrainSummary } from "@/lib/account-ai";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const ROLE_TONE: Record<string, "info" | "neutral" | "good"> = { SE: "info", AE: "neutral", SAM: "good" };

function GroupedNotes({ groups }: { groups: BrainGroup[] }) {
  const withNotes = groups.filter((g) => g.notes.length > 0);
  if (withNotes.length === 0) return <p className="px-3 py-2 text-sm text-charcoal-400">No notes ingested yet.</p>;
  return (
    <div className="space-y-3 px-3 py-2">
      {withNotes.map((group) => (
        <div key={group.key}>
          <p className="mb-1 text-xs font-semibold text-charcoal-600">
            {group.label}
            {group.date ? <span className="font-normal text-charcoal-400"> · {fmtDate(group.date)}</span> : null}
          </p>
          <ul className="space-y-1.5">
            {group.notes.map((note) => (
              <li key={note.id} className="rounded-md border border-charcoal-200 bg-white p-2">
                <div className="mb-1 flex items-center gap-2">
                  <StatusPill tone={ROLE_TONE[note.role] ?? "neutral"}>{note.role}</StatusPill>
                  <span className="truncate text-[11px] text-charcoal-400">{note.author}</span>
                  <span className="ml-auto text-[11px] text-charcoal-400">{fmtDate(note.createdAt)}</span>
                </div>
                <p className="text-sm text-charcoal-700">{note.body}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function GroupedAssets({ groups }: { groups: BrainGroup[] }) {
  const withAssets = groups.filter((g) => g.assets.length > 0);
  if (withAssets.length === 0) return <p className="px-3 py-2 text-sm text-charcoal-400">No documents ingested yet.</p>;
  return (
    <div className="space-y-3 px-3 py-2">
      {withAssets.map((group) => (
        <div key={group.key}>
          <p className="mb-1 text-xs font-semibold text-charcoal-600">
            {group.label}
            {group.date ? <span className="font-normal text-charcoal-400"> · {fmtDate(group.date)}</span> : null}
          </p>
          <ul className="space-y-1.5">
            {group.assets.map((asset) => (
              <li
                key={asset.id}
                className="flex items-center justify-between gap-2 rounded-md border border-charcoal-200 bg-white p-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-charcoal-800">{asset.title}</span>
                  <span className="text-[11px] text-charcoal-400">{asset.sourceTool}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-iris-600">
                    {asset.type.replaceAll("_", " ")}
                  </span>
                  <span className="text-[11px] text-charcoal-400">{fmtDate(asset.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Bullet({
  icon,
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-charcoal-200">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 bg-charcoal-50 px-3 py-2 text-left hover:bg-charcoal-100"
      >
        <span className="text-iris-600">{icon}</span>
        <span className="text-sm font-semibold text-charcoal-800">{title}</span>
        {meta ? <span className="text-xs text-charcoal-500">{meta}</span> : null}
        <ChevronDown className={`ml-auto h-4 w-4 text-charcoal-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="border-t border-charcoal-200 bg-white">{children}</div> : null}
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
  const [openBullets, setOpenBullets] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<"note" | "asset">("note");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const toggle = (key: string) =>
    setOpenBullets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const meetingGroups = summary.groups.filter((g) => g.meetingId);
  const typeMeta = summary.assetTypeCounts.map((t) => `${t.count} ${t.type.replaceAll("_", " ").toLowerCase()}`).join(", ");

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
        aria-label="Account-AI brain"
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-charcoal-200 p-5">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-charcoal-900">
              <SideBrainIcon className="h-5 w-5 text-iris-600" /> Account-AI Brain
            </h2>
            <p className="mt-0.5 truncate text-sm text-charcoal-500">
              Everything {summary.accountName}&apos;s AI has ingested. Knowledge base is isolated to this account.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-charcoal-200 bg-white p-1.5 text-charcoal-600 hover:bg-charcoal-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-2">
            {[
              ["Meetings", summary.meetingCount],
              ["Notes", summary.noteCount],
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
            <div className="rounded-lg border border-charcoal-200 bg-white p-3">
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

          {/* Expandable bullets */}
          <Bullet
            icon={<NotebookPen className="h-4 w-4" />}
            title="Notes"
            meta={`${summary.noteCount} ingested · grouped by meeting`}
            open={openBullets.has("notes")}
            onToggle={() => toggle("notes")}
          >
            <GroupedNotes groups={summary.groups} />
          </Bullet>

          <Bullet
            icon={<FileText className="h-4 w-4" />}
            title="Documents & assets"
            meta={typeMeta || `${summary.assetCount} ingested`}
            open={openBullets.has("assets")}
            onToggle={() => toggle("assets")}
          >
            <GroupedAssets groups={summary.groups} />
          </Bullet>
        </div>

        {/* Add to brain */}
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
                {meetingGroups.map((group) => (
                  <option key={group.meetingId ?? group.key} value={group.meetingId ?? ""}>
                    {group.label}
                    {group.date ? ` · ${fmtDate(group.date)}` : ""}
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
      </aside>
    </>
  );
}
