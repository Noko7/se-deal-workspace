"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  ClipboardList,
  Copy,
  Download,
  ListChecks,
  Loader2,
  Sparkles,
  Trash2,
  Users,
  Wand2,
} from "lucide-react";
import { AttachToMeetingModal } from "@/components/attach-to-meeting-modal";
import { MarkdownView } from "@/components/markdown-view";
import {
  DEFAULT_MEETING_SYSTEM_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  formatNotes,
  type FormatOptions,
  type NoteKind,
  SAMPLE_MEETING_NOTES,
  SAMPLE_NOTES,
} from "@/lib/note-formatter";
import { MAX_NOTES_LENGTH } from "@/lib/sanitize";

type Mode = "ai" | "instant";

type LlmStatus =
  | { configured: false }
  | { configured: true; reachable: boolean; model: string; baseUrl: string; detail: string };

const SECONDARY_BTN =
  "flex items-center gap-1.5 rounded-md bg-white px-2.5 py-2 text-xs font-medium text-charcoal-800 hover:bg-charcoal-50 disabled:opacity-50";
const SECONDARY_BORDER = { border: "1px solid var(--color-charcoal-300)" };

const KIND_META: Record<NoteKind, { label: string; icon: typeof ListChecks; sample: string }> = {
  plan: { label: "Implementation Plan", icon: ListChecks, sample: SAMPLE_NOTES },
  meeting: { label: "Meeting Notes", icon: CalendarClock, sample: SAMPLE_MEETING_NOTES },
};

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md bg-charcoal-50 px-2.5 py-2 text-xs font-medium normal-case tracking-normal text-charcoal-700">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 accent-iris-600"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="bg-white px-3 py-2">
      <p className="text-base font-semibold text-iris-600">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-charcoal-500">{label}</p>
    </div>
  );
}

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

// A segmented control. Generic over the option value.
function Segmented<T extends string>({
  value,
  options,
  onChange,
  activeClass = "bg-white text-charcoal-900 shadow-sm",
}: {
  value: T;
  options: { value: T; label: string; icon: typeof ListChecks }[];
  onChange: (next: T) => void;
  activeClass?: string;
}) {
  return (
    <div className="inline-flex rounded-lg border border-charcoal-200 bg-charcoal-50 p-0.5 text-xs font-medium">
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`rounded-md px-3 py-1.5 transition ${
              active ? activeClass : "bg-transparent text-charcoal-600 hover:text-charcoal-900"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5" /> {option.label}
            </span>
          </button>
        );
      })}
    </div>
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
  const [mode, setMode] = useState<Mode>("instant");
  const [kind, setKind] = useState<NoteKind>("plan");
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [includeHelpers, setIncludeHelpers] = useState(true);
  const [includeQuestions, setIncludeQuestions] = useState(true);
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

  useEffect(() => {
    let active = true;
    fetch("/api/note-format", { method: "GET" })
      .then((response) => response.json())
      .then((status: LlmStatus & { defaultSystemPrompt?: string; defaultMeetingSystemPrompt?: string }) => {
        if (!active) {
          return;
        }
        setLlmStatus(status);
        const nextDefaults: Record<NoteKind, string> = {
          plan: status.defaultSystemPrompt ?? DEFAULT_SYSTEM_PROMPT,
          meeting: status.defaultMeetingSystemPrompt ?? DEFAULT_MEETING_SYSTEM_PROMPT,
        };
        setPromptDefaults(nextDefaults);
        setSystemPrompt((current) => (current === DEFAULT_SYSTEM_PROMPT ? nextDefaults.plan : current));
        if (status.configured && status.reachable) {
          setMode("ai");
        }
      })
      .catch(() => active && setLlmStatus({ configured: false }));
    return () => {
      active = false;
    };
  }, []);

  const changeKind = (next: NoteKind) => {
    setKind((prev) => {
      if (prev !== next) {
        setSystemPrompt((current) => (current === promptDefaults[prev] ? promptDefaults[next] : current));
        setAiMarkdown(null);
        setAiError(null);
      }
      return next;
    });
  };

  const options: FormatOptions = useMemo(
    () => ({ title, includeHelpers, includeQuestions, kind }),
    [title, includeHelpers, includeQuestions, kind],
  );
  const instant = useMemo(() => formatNotes(notes, options), [notes, options]);
  const hasInput = notes.trim().length > 0;
  const isMeeting = kind === "meeting";

  const activeMarkdown = mode === "ai" ? aiMarkdown ?? "" : instant.markdown;
  const overLimit = notes.length > MAX_NOTES_LENGTH;
  const hasOutput = mode === "ai" ? Boolean(aiMarkdown) : hasInput;

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
        body: JSON.stringify({ notes, title, instructions, systemPrompt, kind, includeHelpers, includeQuestions }),
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

  const helpersLabel = isMeeting ? "Action items" : "Helper tasks";

  return (
    <div className="space-y-4">
      <SectionToolbar
        kind={kind}
        mode={mode}
        onKindChange={changeKind}
        onModeChange={setMode}
        status={llmStatus}
      />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
        {/* ── Raw Notes panel ─────────────────────────────────────────── */}
        <section className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-charcoal-200 bg-white lg:h-[calc(100vh-260px)] lg:max-h-[780px]">
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
              <label htmlFor="noteInput">Raw Notes</label>
              <textarea
                id="noteInput"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                onKeyDown={(event) => {
                  if (mode === "ai" && (event.metaKey || event.ctrlKey) && event.key === "Enter") {
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

            {mode === "ai" ? (
              <div className="space-y-1.5">
                <label htmlFor="noteInstructions">Extra Instructions</label>
                <input
                  id="noteInstructions"
                  value={instructions}
                  onChange={(event) => setInstructions(event.target.value)}
                  placeholder={
                    isMeeting ? "e.g. highlight risks and owner names" : "e.g. keep it under 8 steps, call out security risks"
                  }
                  className="w-full"
                />
              </div>
            ) : null}

            {mode === "ai" ? (
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
                    rows={6}
                    className="w-full resize-y font-mono text-[11px] leading-relaxed"
                    placeholder="Instructions sent to the model as the system message…"
                  />
                ) : (
                  <p className="truncate rounded-md bg-charcoal-50 px-2.5 py-2 text-xs text-charcoal-500">
                    {systemPrompt.split("\n")[0]}
                  </p>
                )}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Toggle label={helpersLabel} checked={includeHelpers} onChange={setIncludeHelpers} />
              <Toggle label="Open questions" checked={includeQuestions} onChange={setIncludeQuestions} />
            </div>
          </div>

          {/* Sticky action footer keeps the primary CTA reachable on laptops. */}
          {mode === "ai" ? (
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
                  The LLM isn&apos;t configured. Set <code className="font-mono">LLM_BASE_URL</code> (see Integrations), or
                  use Instant mode.
                </p>
              ) : null}
              <p className="mt-1.5 text-center text-[11px] text-charcoal-400">⌘/Ctrl + Enter to format</p>
            </div>
          ) : null}
        </section>

        {/* ── Formatted Notes panel ───────────────────────────────────── */}
        <section className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-charcoal-200 bg-charcoal-50 lg:h-[calc(100vh-260px)] lg:max-h-[780px]">
          <header className="flex items-center justify-between gap-2 border-b border-charcoal-200 px-4 py-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold text-charcoal-900">
              <ListChecks className="h-4 w-4 text-iris-500" /> Formatted Notes
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
                onClick={() => downloadMarkdown(activeMarkdown, mode === "ai" ? title : instant.title)}
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
            {mode === "ai" ? (
              aiLoading ? (
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
                  <Wand2 className="h-8 w-8 text-charcoal-300" />
                  <p className="text-sm font-semibold text-charcoal-700">Ready when you are</p>
                  <p className="text-xs text-charcoal-500">
                    Add notes and hit <span className="font-semibold">Format with AI</span> to generate output.
                  </p>
                </div>
              )
            ) : hasInput ? (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold text-charcoal-900">{instant.title}</h2>

                {isMeeting && instant.date ? (
                  <p className="text-sm text-charcoal-700">
                    <span className="font-semibold text-charcoal-900">Date:</span> {instant.date}
                  </p>
                ) : null}

                {isMeeting && instant.attendees.length > 0 ? (
                  <section className="space-y-1.5">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-iris-600">
                      <Users className="h-3.5 w-3.5" /> Attendees
                    </h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-charcoal-700">
                      {instant.attendees.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {instant.overview.length > 0 ? (
                  <section className="space-y-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-iris-600">
                      {isMeeting ? "Summary" : "Overview"}
                    </h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-charcoal-700">
                      {instant.overview.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {instant.steps.length > 0 ? (
                  <section className="space-y-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-iris-600">Implementation Plan</h3>
                    <ol className="space-y-1.5 text-sm text-charcoal-800">
                      {instant.steps.map((line, index) => (
                        <li key={line} className="flex gap-2.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-iris-100 text-[11px] font-semibold text-iris-700">
                            {index + 1}
                          </span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}

                {includeHelpers && instant.helpers.length > 0 ? (
                  <section className="space-y-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-iris-600">
                      {isMeeting ? "Action Items" : "Helper Tasks"}
                    </h3>
                    <ul className="space-y-1 text-sm text-charcoal-700">
                      {instant.helpers.map((line) => (
                        <li key={line} className="flex items-start gap-2">
                          <span aria-hidden className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-charcoal-300 text-transparent">
                            <Check className="h-3 w-3" />
                          </span>
                          {line}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {includeQuestions && instant.questions.length > 0 ? (
                  <section className="space-y-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-iris-600">Open Questions</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-charcoal-700">
                      {instant.questions.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <ClipboardList className="h-8 w-8 text-charcoal-300" />
                <p className="text-sm font-semibold text-charcoal-700">Your formatted notes appear here</p>
                <p className="text-xs text-charcoal-500">
                  Start typing or load the sample to see your notes turn into clean Markdown.
                </p>
              </div>
            )}
          </div>

          {mode === "instant" ? (
            <div className="grid grid-cols-4 gap-px border-t border-charcoal-200 bg-charcoal-200 text-center">
              {isMeeting ? (
                <>
                  <Stat value={instant.attendees.length} label="Attendees" />
                  <Stat value={instant.overview.length} label="Summary" />
                  <Stat value={instant.helpers.length} label="Actions" />
                  <Stat value={instant.questions.length} label="Questions" />
                </>
              ) : (
                <>
                  <Stat value={instant.steps.length} label="Steps" />
                  <Stat value={instant.helpers.length} label="Helpers" />
                  <Stat value={instant.questions.length} label="Questions" />
                  <Stat value={instant.overview.length} label="Context" />
                </>
              )}
            </div>
          ) : null}
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

// Top toolbar with the note-type and mode selectors plus the LLM status badge.
function SectionToolbar({
  kind,
  mode,
  onKindChange,
  onModeChange,
  status,
}: {
  kind: NoteKind;
  mode: Mode;
  onKindChange: (next: NoteKind) => void;
  onModeChange: (next: Mode) => void;
  status: LlmStatus | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-charcoal-500">Type</span>
        <Segmented<NoteKind>
          value={kind}
          onChange={onKindChange}
          options={[
            { value: "plan", label: "Implementation Plan", icon: ListChecks },
            { value: "meeting", label: "Meeting Notes", icon: CalendarClock },
          ]}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-charcoal-500">Engine</span>
        <Segmented<Mode>
          value={mode}
          onChange={onModeChange}
          activeClass="bg-iris-500 text-white"
          options={[
            { value: "ai", label: "AI (Local LLM)", icon: Wand2 },
            { value: "instant", label: "Instant", icon: ListChecks },
          ]}
        />
      </div>
      <div className="ml-auto">
        <StatusBadge status={status} />
      </div>
    </div>
  );
}
