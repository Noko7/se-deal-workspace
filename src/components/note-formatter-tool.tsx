"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ClipboardList,
  Copy,
  Download,
  ListChecks,
  Loader2,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { FormRow, SectionHeader } from "@/components/ui";
import { MarkdownView } from "@/components/markdown-view";
import { DEFAULT_SYSTEM_PROMPT, formatNotes, SAMPLE_NOTES, type FormatOptions } from "@/lib/note-formatter";

type Mode = "ai" | "instant";

type LlmStatus =
  | { configured: false }
  | { configured: true; reachable: boolean; model: string; baseUrl: string; detail: string };

const SECONDARY_BTN =
  "flex items-center gap-1.5 rounded-md bg-white px-2.5 py-2 text-xs font-medium text-charcoal-800 hover:bg-charcoal-50 disabled:opacity-50";
const SECONDARY_BORDER = { border: "1px solid var(--color-charcoal-300)" };

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

function downloadMarkdown(markdown: string, title: string) {
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const slug = (title || "implementation-plan")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  anchor.href = url;
  anchor.download = `${slug || "implementation-plan"}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function NoteFormatterTool() {
  const [mode, setMode] = useState<Mode>("instant");
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [includeHelpers, setIncludeHelpers] = useState(true);
  const [includeQuestions, setIncludeQuestions] = useState(true);
  const [copied, setCopied] = useState(false);

  const [llmStatus, setLlmStatus] = useState<LlmStatus | null>(null);
  const [aiMarkdown, setAiMarkdown] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Probe the local LLM once on mount; default to AI mode when it's reachable.
  useEffect(() => {
    let active = true;
    fetch("/api/note-format", { method: "GET" })
      .then((response) => response.json())
      .then((status: LlmStatus & { defaultSystemPrompt?: string }) => {
        if (!active) {
          return;
        }
        setLlmStatus(status);
        // Reflect a server-side LLM_SYSTEM_PROMPT override, but only if the user
        // hasn't already edited the field away from the bundled default.
        if (status.defaultSystemPrompt) {
          setSystemPrompt((current) => (current === DEFAULT_SYSTEM_PROMPT ? status.defaultSystemPrompt! : current));
        }
        if (status.configured && status.reachable) {
          setMode("ai");
        }
      })
      .catch(() => active && setLlmStatus({ configured: false }));
    return () => {
      active = false;
    };
  }, []);

  const options: FormatOptions = useMemo(
    () => ({ title, includeHelpers, includeQuestions }),
    [title, includeHelpers, includeQuestions],
  );
  const instant = useMemo(() => formatNotes(notes, options), [notes, options]);
  const hasInput = notes.trim().length > 0;

  // The markdown shown/copied depends on the active mode.
  const activeMarkdown = mode === "ai" ? aiMarkdown ?? "" : instant.markdown;

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
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await fetch("/api/note-format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes, title, instructions, systemPrompt, includeHelpers, includeQuestions }),
      });
      const data = (await response.json()) as { ok: boolean; markdown?: string; error?: string };
      if (!response.ok || !data.ok || !data.markdown) {
        throw new Error(data.error ?? `Request failed (HTTP ${response.status}).`);
      }
      setAiMarkdown(data.markdown);
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
  };

  const canCopy = mode === "ai" ? Boolean(aiMarkdown) : hasInput;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Format Notes"
        subtitle="Paste raw notes, then format them into an implementation plan with helper tasks and open questions."
        action={<StatusBadge status={llmStatus} />}
      />

      <div className="inline-flex rounded-lg border border-charcoal-200 bg-charcoal-50 p-0.5 text-xs font-medium">
        <button
          type="button"
          onClick={() => setMode("ai")}
          className={`rounded-md px-3 py-1.5 transition ${
            mode === "ai" ? "bg-iris-500 text-white" : "bg-transparent text-charcoal-600 hover:text-charcoal-900"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Wand2 className="h-3.5 w-3.5" /> AI (Local LLM)
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMode("instant")}
          className={`rounded-md px-3 py-1.5 transition ${
            mode === "instant" ? "bg-iris-500 text-white" : "bg-transparent text-charcoal-600 hover:text-charcoal-900"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5" /> Instant (offline)
          </span>
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <FormRow label="Plan Title" htmlFor="noteTitle" helper="Optional — auto-derived from your notes if left blank.">
            <input
              id="noteTitle"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. DR cluster rollout for Acme Bank"
            />
          </FormRow>

          <FormRow label="Raw Notes" htmlFor="noteInput" helper="Bullets, dashes, or plain lines all work.">
            <textarea
              id="noteInput"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={mode === "ai" ? 12 : 16}
              placeholder="Dump your meeting notes, scratchpad, or action items here…"
              className="font-mono text-xs leading-relaxed"
            />
          </FormRow>

          {mode === "ai" ? (
            <FormRow
              label="Extra Instructions"
              htmlFor="noteInstructions"
              helper="Optional — steer the model (tone, audience, focus areas)."
            >
              <input
                id="noteInstructions"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="e.g. keep it under 8 steps and call out security risks"
              />
            </FormRow>
          ) : null}

          {mode === "ai" ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="systemPrompt">System Prompt</label>
                <div className="flex items-center gap-2">
                  {systemPrompt !== DEFAULT_SYSTEM_PROMPT ? (
                    <button
                      type="button"
                      onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
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
                  rows={7}
                  className="font-mono text-[11px] leading-relaxed"
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
            <Toggle label="Helper tasks" checked={includeHelpers} onChange={setIncludeHelpers} />
            <Toggle label="Open questions" checked={includeQuestions} onChange={setIncludeQuestions} />
            <button
              type="button"
              onClick={() => setNotes(SAMPLE_NOTES)}
              className={`${SECONDARY_BTN} ml-auto`}
              style={SECONDARY_BORDER}
            >
              <Sparkles className="h-3.5 w-3.5 text-iris-500" /> Sample
            </button>
            <button type="button" disabled={!hasInput} onClick={clearAll} className={SECONDARY_BTN} style={SECONDARY_BORDER}>
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </button>
          </div>

          {mode === "ai" ? (
            <button
              type="button"
              disabled={!hasInput || aiLoading || !(llmStatus?.configured ?? false)}
              onClick={runAiFormat}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-iris-500 px-3 py-2.5 text-sm font-semibold text-white hover:bg-iris-600 disabled:opacity-50"
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {aiLoading ? "Formatting with local LLM…" : "Format with AI"}
            </button>
          ) : null}

          {mode === "ai" && llmStatus && !llmStatus.configured ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              The LLM isn&apos;t configured. Set <code className="font-mono">LLM_BASE_URL</code> (see the Integrations
              tab), or use Instant mode for offline formatting.
            </p>
          ) : null}
        </div>

        <div className="flex min-h-[420px] flex-col rounded-xl border border-charcoal-200 bg-charcoal-50">
          <div className="flex items-center justify-between gap-2 border-b border-charcoal-200 px-4 py-2.5">
            <span className="flex items-center gap-2 text-sm font-semibold text-charcoal-900">
              <ListChecks className="h-4 w-4 text-iris-500" /> {mode === "ai" ? "AI Plan" : "Formatted Plan"}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!canCopy}
                onClick={copyMarkdown}
                className="flex items-center gap-1.5 rounded-md bg-iris-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-iris-600 disabled:opacity-50"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy MD"}
              </button>
              <button
                type="button"
                disabled={!canCopy}
                onClick={() => downloadMarkdown(activeMarkdown, mode === "ai" ? title : instant.title)}
                className="flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-charcoal-800 hover:bg-charcoal-50 disabled:opacity-50"
                style={SECONDARY_BORDER}
              >
                <Download className="h-3.5 w-3.5" /> .md
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4">
            {mode === "ai" ? (
              aiLoading ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <Loader2 className="h-7 w-7 animate-spin text-iris-500" />
                  <p className="text-sm font-semibold text-charcoal-700">Asking the local LLM…</p>
                  <p className="text-xs text-charcoal-500">Formatting your notes into a plan.</p>
                </div>
              ) : aiError ? (
                <div className="rounded-md bg-[#ffe7e0] px-3 py-2 text-sm text-[#9a3b27]">
                  <p className="font-semibold">Couldn&apos;t format with the LLM</p>
                  <p className="mt-1 text-xs">{aiError}</p>
                </div>
              ) : aiMarkdown ? (
                <MarkdownView markdown={aiMarkdown} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                  <Wand2 className="h-8 w-8 text-charcoal-300" />
                  <p className="text-sm font-semibold text-charcoal-700">Ready when you are</p>
                  <p className="text-xs text-charcoal-500">
                    Add notes and hit <span className="font-semibold">Format with AI</span> to generate a plan with your
                    local model.
                  </p>
                </div>
              )
            ) : hasInput ? (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold text-charcoal-900">{instant.title}</h2>

                {instant.overview.length > 0 ? (
                  <section className="space-y-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-iris-600">Overview</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-charcoal-700">
                      {instant.overview.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}

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

                {includeHelpers && instant.helpers.length > 0 ? (
                  <section className="space-y-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-iris-600">Helper Tasks</h3>
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
                <p className="text-sm font-semibold text-charcoal-700">Your formatted plan appears here</p>
                <p className="text-xs text-charcoal-500">
                  Start typing or load the sample to see notes turn into an implementation plan.
                </p>
              </div>
            )}
          </div>

          {mode === "instant" ? (
            <div className="grid grid-cols-4 gap-px border-t border-charcoal-200 bg-charcoal-200 text-center">
              <Stat value={instant.steps.length} label="Steps" />
              <Stat value={instant.helpers.length} label="Helpers" />
              <Stat value={instant.questions.length} label="Questions" />
              <Stat value={instant.overview.length} label="Context" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
