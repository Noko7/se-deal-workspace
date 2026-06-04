"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarPlus,
  Check,
  ClipboardList,
  Copy,
  Download,
  Loader2,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { AttachToMeetingModal } from "@/components/attach-to-meeting-modal";
import { MarkdownView } from "@/components/markdown-view";
import {
  DEFAULT_MEETING_SYSTEM_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  type NoteKind,
  SAMPLE_MEETING_NOTES,
  SAMPLE_NOTES,
} from "@/lib/note-formatter";
import { MAX_NOTES_LENGTH } from "@/lib/sanitize";

type LlmStatus =
  | { configured: false }
  | { configured: true; reachable: boolean; model: string; baseUrl: string; detail: string };

const SECONDARY_BTN =
  "flex items-center gap-1.5 rounded-md bg-white px-2.5 py-2 text-xs font-medium text-charcoal-800 hover:bg-charcoal-50 disabled:opacity-50";
const SECONDARY_BORDER = { border: "1px solid var(--color-charcoal-300)" };

const KIND_META: Record<NoteKind, { label: string; sample: string }> = {
  plan: { label: "Implementation Plan", sample: SAMPLE_NOTES },
  meeting: { label: "Meeting Notes", sample: SAMPLE_MEETING_NOTES },
};

function StatusBadge({ status }: { status: LlmStatus | null }) {
  if (status === null) {
    return <span className="text-xs text-charcoal-400">Checking LLM…</span>;
  }
  if (!status.configured) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-charcoal-100 px-2.5 py-1 text-[11px] font-medium text-charcoal-600">
        <span className="h-1.5 w-1.5 rounded-full bg-charcoal-400" /> LLM not configured
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
        status.reachable ? "bg-[#eef8d8] text-[#3f5e0a]" : "bg-[#ffe7e0] text-[#9a3b27]"
      }`}
      title={status.detail}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${status.reachable ? "bg-[#3f5e0a]" : "bg-[#9a3b27]"}`} />
      {status.reachable ? `Local LLM · ${status.model}` : "LLM unreachable"}
    </span>
  );
}

function downloadMarkdown(markdown: string, title: string) {
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const slug = (title || "notes")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  anchor.href = url;
  anchor.download = `${slug || "notes"}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function NoteFormatterTool() {
  const searchParams = useSearchParams();
  const [kindState, setKindState] = useState<NoteKind>("plan");
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [showSystemPrompt, setShowSystemPrompt] = useState(true);
  const [copied, setCopied] = useState(false);

  const [promptDefaults, setPromptDefaults] = useState<Record<NoteKind, string>>({
    plan: DEFAULT_SYSTEM_PROMPT,
    meeting: DEFAULT_MEETING_SYSTEM_PROMPT,
  });

  const [llmStatus, setLlmStatus] = useState<LlmStatus | null>(null);
  const [aiMarkdown, setAiMarkdown] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [truncatedNotice, setTruncatedNotice] = useState(false);

  const [attachOpen, setAttachOpen] = useState(false);
  const [attachedTo, setAttachedTo] = useState<{ accountName: string; subject: string } | null>(null);
  const lockedToPlan = searchParams.get("locked") === "1";
  const urlKind = searchParams.get("noteType");
  const kind: NoteKind =
    lockedToPlan
      ? "plan"
      : urlKind === "plan" || urlKind === "meeting"
        ? urlKind
        : kindState;

  useEffect(() => {
    let active = true;
    fetch("/api/note-format", { method: "GET" })
      .then((response) => response.json())
      .then((status: LlmStatus & { defaultSystemPrompt?: string; defaultMeetingSystemPrompt?: string }) => {
        if (!active) return;
        setLlmStatus(status);
        const nextDefaults: Record<NoteKind, string> = {
          plan: status.defaultSystemPrompt ?? DEFAULT_SYSTEM_PROMPT,
          meeting: status.defaultMeetingSystemPrompt ?? DEFAULT_MEETING_SYSTEM_PROMPT,
        };
        setPromptDefaults(nextDefaults);
        setSystemPrompt((current) => (current === DEFAULT_SYSTEM_PROMPT ? nextDefaults.plan : current));
      })
      .catch(() => active && setLlmStatus({ configured: false }));
    return () => {
      active = false;
    };
  }, []);

  const changeKind = (next: NoteKind) => {
    if (lockedToPlan) {
      return;
    }
    setKindState((prev) => {
      if (prev !== next) {
        setSystemPrompt((current) => (current === promptDefaults[prev] ? promptDefaults[next] : current));
        setAiMarkdown(null);
        setAiError(null);
      }
      return next;
    });
  };

  const hasInput = notes.trim().length > 0;
  const isMeeting = kind === "meeting";
  const activeMarkdown = aiMarkdown ?? "";
  const overLimit = notes.length > MAX_NOTES_LENGTH;
  const hasOutput = Boolean(aiMarkdown);

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(activeMarkdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const runAiFormat = async () => {
    if (!hasInput || aiLoading || !(llmStatus?.configured ?? false)) {
      return;
    }
    setAiLoading(true);
    setAiError(null);
    setTruncatedNotice(false);
    try {
      const response = await fetch("/api/note-format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes,
          title,
          instructions,
          systemPrompt,
          kind,
          includeHelpers: true,
          includeQuestions: true,
        }),
      });
      const data = (await response.json()) as { ok: boolean; markdown?: string; error?: string; truncated?: boolean };
      if (!response.ok || !data.ok || !data.markdown) {
        throw new Error(data.error ?? `Request failed (HTTP ${response.status}).`);
      }
      setAiMarkdown(data.markdown);
      setTruncatedNotice(Boolean(data.truncated));
    } catch (error) {
      setAiError((error as Error).message);
      setAiMarkdown(null);
    } finally {
      setAiLoading(false);
    }
  };

  const clearAll = () => {
    setNotes("");
    setTitle("");
    setInstructions("");
    setAiMarkdown(null);
    setAiError(null);
    setTruncatedNotice(false);
    setAttachedTo(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[230px]">
          <label htmlFor="note-type" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-charcoal-500">
            Note Type
          </label>
          <select
            id="note-type"
            value={kind}
            onChange={(event) => changeKind(event.target.value as NoteKind)}
            disabled={lockedToPlan}
            className="w-full border-0 bg-iris-500 px-3 py-2 text-sm font-semibold text-white focus:ring-2 focus:ring-iris-300"
          >
            <option value="plan" className="bg-white text-charcoal-900">
              Implementation Plan
            </option>
            <option value="meeting" className="bg-white text-charcoal-900">
              Meeting Notes
            </option>
          </select>
          {lockedToPlan ? (
            <p className="mt-1 text-[11px] text-charcoal-500">Locked by deal policy: technical-close deals require implementation notes.</p>
          ) : null}
        </div>
        <div className="ml-auto">
          <StatusBadge status={llmStatus} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
        <section className="flex min-h-[500px] flex-col overflow-hidden rounded-xl border border-charcoal-200 bg-white lg:h-[calc(100vh-250px)] lg:max-h-[820px]">
          <header className="flex items-center justify-between gap-2 border-b border-charcoal-200 px-4 py-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold text-charcoal-900">
              <ClipboardList className="h-4 w-4 text-iris-500" /> Raw Notes
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setNotes(KIND_META[kind].sample)}
                className={SECONDARY_BTN}
                style={SECONDARY_BORDER}
              >
                <Sparkles className="h-3.5 w-3.5 text-iris-500" /> Sample
              </button>
              <button type="button" disabled={!hasInput} onClick={clearAll} className={SECONDARY_BTN} style={SECONDARY_BORDER}>
                <Trash2 className="h-3.5 w-3.5" /> Clear
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
            <div className="space-y-1.5">
              <label htmlFor="noteTitle">{isMeeting ? "Meeting Title" : "Plan Title"}</label>
              <input
                id="noteTitle"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={isMeeting ? "e.g. Acme Bank DR discovery" : "e.g. DR cluster rollout for Acme Bank"}
                className="w-full"
              />
              <p className="text-xs text-charcoal-500">Optional — auto-derived from your notes if left blank.</p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="systemPrompt">System Prompt</label>
                <div className="flex items-center gap-2">
                  {systemPrompt !== promptDefaults[kind] ? (
                    <button
                      type="button"
                      onClick={() => setSystemPrompt(promptDefaults[kind])}
                      className="bg-transparent p-0 text-[11px] font-semibold normal-case tracking-normal text-iris-600 hover:text-iris-700"
                    >
                      Reset
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShowSystemPrompt((value) => !value)}
                    className="bg-transparent p-0 text-[11px] font-semibold normal-case tracking-normal text-iris-600 hover:text-iris-700"
                  >
                    {showSystemPrompt ? "Hide" : "Edit"}
                  </button>
                </div>
              </div>
              {showSystemPrompt ? (
                <textarea
                  id="systemPrompt"
                  value={systemPrompt}
                  onChange={(event) => setSystemPrompt(event.target.value)}
                  rows={5}
                  className="w-full resize-y font-mono text-[11px] leading-relaxed"
                  placeholder="Instructions sent to the model as the system message…"
                />
              ) : (
                <p className="truncate rounded-md bg-charcoal-50 px-2.5 py-2 text-xs text-charcoal-500">
                  {systemPrompt.split("\n")[0]}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="noteInput">Raw Notes</label>
              <textarea
                id="noteInput"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    runAiFormat();
                  }
                }}
                rows={10}
                placeholder={
                  isMeeting
                    ? "Date: …\nAttendees: …\nNotes:\n- …"
                    : "Dump your meeting notes, scratchpad, or action items here…"
                }
                className="w-full resize-y font-mono text-xs leading-relaxed"
              />
              <div className="flex items-center justify-between text-[11px] text-charcoal-400">
                <span>
                  {isMeeting ? "Tip: lead with Date:, Attendees:, Notes:" : "Bullets, dashes, or plain lines all work"}
                </span>
                <span className={overLimit ? "font-medium text-[#9a3b27]" : ""}>
                  {notes.length.toLocaleString()} / {MAX_NOTES_LENGTH.toLocaleString()}
                </span>
              </div>
              {overLimit ? (
                <p className="rounded-md bg-[#ffe7e0] px-3 py-2 text-xs text-[#9a3b27]">
                  Notes exceed {MAX_NOTES_LENGTH.toLocaleString()} characters and will be truncated before formatting.
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="noteInstructions">Extra Instructions</label>
              <textarea
                id="noteInstructions"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                rows={3}
                placeholder={
                  isMeeting ? "e.g. highlight risks and owner names" : "e.g. keep it under 8 steps, call out security risks"
                }
                className="w-full resize-y"
              />
            </div>
          </div>

          <div className="border-t border-charcoal-200 p-3">
            <button
              type="button"
              disabled={!hasInput || aiLoading || !(llmStatus?.configured ?? false)}
              onClick={runAiFormat}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-iris-500 px-3 py-2.5 text-sm font-semibold text-white hover:bg-iris-600 disabled:opacity-50"
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {aiLoading ? "Formatting with local LLM…" : `Format ${isMeeting ? "meeting notes" : "plan"} with AI`}
            </button>
            {llmStatus && !llmStatus.configured ? (
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                The LLM isn&apos;t configured. Set <code className="font-mono">LLM_BASE_URL</code> (see Integrations).
              </p>
            ) : null}
            <p className="mt-1.5 text-center text-[11px] text-charcoal-400">⌘/Ctrl + Enter to format</p>
          </div>
        </section>

        <section className="flex min-h-[500px] flex-col overflow-hidden rounded-xl border border-charcoal-200 bg-charcoal-50 lg:h-[calc(100vh-250px)] lg:max-h-[820px]">
          <header className="flex items-center justify-between gap-2 border-b border-charcoal-200 px-4 py-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold text-charcoal-900">
              <Wand2 className="h-4 w-4 text-iris-500" /> Formatted Notes
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!hasOutput}
                onClick={() => setAttachOpen(true)}
                className="flex items-center gap-1.5 rounded-md bg-iris-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-iris-600 disabled:opacity-50"
              >
                <CalendarPlus className="h-3.5 w-3.5" /> Attach to meeting
              </button>
              <button
                type="button"
                disabled={!hasOutput}
                onClick={copyMarkdown}
                className={SECONDARY_BTN}
                style={SECONDARY_BORDER}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                disabled={!hasOutput}
                onClick={() => downloadMarkdown(activeMarkdown, title)}
                className={SECONDARY_BTN}
                style={SECONDARY_BORDER}
              >
                <Download className="h-3.5 w-3.5" /> .md
              </button>
            </div>
          </header>

          {attachedTo ? (
            <div className="flex items-center gap-2 border-b border-charcoal-200 bg-[#eef8d8] px-4 py-2 text-xs text-[#3f5e0a]">
              <Check className="h-3.5 w-3.5" />
              Attached to <span className="font-semibold">{attachedTo.accountName}</span> · {attachedTo.subject}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {aiLoading ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <Loader2 className="h-7 w-7 animate-spin text-iris-500" />
                <p className="text-sm font-semibold text-charcoal-700">Asking the local LLM…</p>
                <p className="text-xs text-charcoal-500">Formatting your notes.</p>
              </div>
            ) : aiError ? (
              <div className="rounded-md bg-[#ffe7e0] px-3 py-2 text-sm text-[#9a3b27]">
                <p className="font-semibold">Couldn&apos;t format with the LLM</p>
                <p className="mt-1 text-xs">{aiError}</p>
              </div>
            ) : aiMarkdown ? (
              <div className="space-y-3">
                {truncatedNotice ? (
                  <p className="rounded-md bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
                    Notes were truncated to {MAX_NOTES_LENGTH.toLocaleString()} characters before formatting.
                  </p>
                ) : null}
                <MarkdownView markdown={aiMarkdown} />
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <ClipboardList className="h-8 w-8 text-charcoal-300" />
                <p className="text-sm font-semibold text-charcoal-700">Your formatted notes appear here</p>
                <p className="text-xs text-charcoal-500">
                  Start typing or load the sample, then click <span className="font-semibold">Format with AI</span>.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      <AttachToMeetingModal
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        markdown={activeMarkdown}
        onAttached={(info) => setAttachedTo(info)}
      />
    </div>
  );
}
