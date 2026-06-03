// Deterministic, offline note formatter. Takes freeform notes (bullets, dumps,
// meeting scribbles) and structures them into an implementation plan with helper
// tasks and open questions. No network, no AI — pure heuristics so it's instant
// and predictable.

export type FormatOptions = {
  title: string;
  includeHelpers: boolean;
  includeQuestions: boolean;
};

export type FormattedNotes = {
  title: string;
  overview: string[];
  steps: string[];
  helpers: string[];
  questions: string[];
  markdown: string;
};

// Verbs that imply a concrete build/change action -> Implementation Plan.
const ACTION_VERBS = [
  "add", "build", "create", "implement", "set up", "setup", "configure", "deploy",
  "write", "integrate", "remove", "delete", "migrate", "refactor", "update", "fix",
  "design", "wire", "enable", "disable", "install", "support", "render", "expose",
  "generate", "parse", "store", "cache", "optimize", "move", "rename", "replace",
  "build out", "scaffold", "hook up", "connect", "extend", "ship", "land",
];

// Verbs that imply a supporting / follow-up action -> Helper Tasks.
const HELPER_VERBS = [
  "verify", "check", "confirm", "ask", "follow up", "follow-up", "review", "document",
  "note", "ensure", "test", "validate", "double-check", "double check", "sync",
  "reach out", "email", "ping", "schedule", "investigate", "research", "clarify",
  "coordinate", "share", "send", "loop in", "track", "monitor", "measure",
];

// Cues that mean "this is a thing to do" even without a leading verb.
const TODO_CUES = ["todo", "to-do", "need to", "needs to", "should", "must", "have to", "action:"];

const QUESTION_CUES = ["q:", "question:", "open question", "unknown:", "tbd"];

const BULLET_PREFIX = /^\s*(?:[-*•‣◦·]|\d+[.)]|\[\s?[xX ]?\]|[a-zA-Z][.)])\s+/;
const LABEL_PREFIX = /^\s*(?:context|goal|background|summary|overview|objective)\s*[:\-—]\s*/i;

function startsWithAny(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((needle) => lower === needle || lower.startsWith(`${needle} `) || lower.startsWith(`${needle}:`));
}

function containsAny(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((needle) => lower.includes(needle));
}

function cleanLine(raw: string): string {
  let line = raw.replace(BULLET_PREFIX, "").trim();
  line = line.replace(LABEL_PREFIX, "").trim();
  line = line.replace(/[;,]\s*$/, "").trim();
  if (line.length === 0) {
    return line;
  }
  return line.charAt(0).toUpperCase() + line.slice(1);
}

type Kind = "step" | "helper" | "question" | "overview";

function classify(raw: string, cleaned: string): Kind {
  const trimmed = raw.trim();
  if (trimmed.endsWith("?") || startsWithAny(cleaned, QUESTION_CUES) || containsAny(cleaned, ["open question"])) {
    return "question";
  }
  if (startsWithAny(cleaned, HELPER_VERBS)) {
    return "helper";
  }
  if (startsWithAny(cleaned, ACTION_VERBS) || startsWithAny(cleaned, TODO_CUES)) {
    return "step";
  }
  // A bullet that doesn't clearly read as context is most likely an action item.
  if (BULLET_PREFIX.test(raw) && !LABEL_PREFIX.test(raw)) {
    return "step";
  }
  return "overview";
}

function deriveTitle(parsed: { overview: string[]; steps: string[] }): string {
  const source = parsed.overview[0] ?? parsed.steps[0] ?? "Implementation Plan";
  const firstSentence = source.split(/[.!?]/)[0].trim();
  const words = firstSentence.split(/\s+/).slice(0, 9).join(" ");
  return words.length > 0 ? words : "Implementation Plan";
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (item.length > 0 && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function buildMarkdown(result: Omit<FormattedNotes, "markdown">, options: FormatOptions): string {
  const blocks: string[] = [`# ${result.title}`];

  if (result.overview.length > 0) {
    blocks.push(["## Overview", ...result.overview.map((line) => `- ${line}`)].join("\n"));
  }

  if (result.steps.length > 0) {
    blocks.push(
      ["## Implementation Plan", ...result.steps.map((line, index) => `${index + 1}. ${line}`)].join("\n"),
    );
  }

  if (options.includeHelpers && result.helpers.length > 0) {
    blocks.push(["## Helper Tasks", ...result.helpers.map((line) => `- [ ] ${line}`)].join("\n"));
  }

  if (options.includeQuestions && result.questions.length > 0) {
    blocks.push(["## Open Questions", ...result.questions.map((line) => `- ${line}`)].join("\n"));
  }

  return blocks.join("\n\n");
}

export function formatNotes(input: string, options: FormatOptions): FormattedNotes {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const overview: string[] = [];
  const steps: string[] = [];
  const helpers: string[] = [];
  const questions: string[] = [];

  for (const raw of lines) {
    const cleaned = cleanLine(raw);
    if (cleaned.length === 0) {
      continue;
    }
    switch (classify(raw, cleaned)) {
      case "question":
        questions.push(cleaned.endsWith("?") ? cleaned : `${cleaned}?`);
        break;
      case "helper":
        helpers.push(cleaned);
        break;
      case "step":
        steps.push(cleaned);
        break;
      default:
        overview.push(cleaned);
    }
  }

  // Never produce an empty plan: if nothing was classified as an action but we
  // have content, treat the overview lines as the steps instead.
  if (steps.length === 0 && overview.length > 0) {
    steps.push(...overview.splice(0, overview.length));
  }

  const partial = {
    title: options.title.trim() || deriveTitle({ overview, steps }),
    overview: dedupe(overview),
    steps: dedupe(steps),
    helpers: options.includeHelpers ? dedupe(helpers) : [],
    questions: options.includeQuestions ? dedupe(questions) : [],
  };

  return { ...partial, markdown: buildMarkdown(partial, options) };
}

// Default system prompt used for the AI (LLM) path. Lives here (client-safe) so
// the UI can pre-fill the editable System Prompt field; the user can replace it
// entirely. The server falls back to this when no prompt is supplied.
export const DEFAULT_SYSTEM_PROMPT = [
  "You are a senior systems engineer assistant that turns messy notes into a clean, actionable implementation plan.",
  "Return GitHub-flavored Markdown ONLY (no preamble, no surrounding code fences).",
  "Use these sections, in this order, and omit any that have no content:",
  "- `# <title>` — a short, specific title (use the provided title if given).",
  "- `## Overview` — 1-4 bullets of context/background.",
  "- `## Implementation Plan` — a numbered, ordered list of concrete, actionable steps.",
  "- `## Helper Tasks` — a checkbox list (`- [ ]`) of supporting/follow-up tasks.",
  "- `## Open Questions` — a bullet list of unresolved questions.",
  "Be concise; preserve the author's intent; do not invent facts, names, or numbers that aren't implied by the notes.",
].join("\n");

export const SAMPLE_NOTES = `Customer wants HA across two sites for their core banking app
context: current setup is single cluster, no DR

set up a second Nutanix cluster at the DR site
configure Protection Domains for the banking VMs
enable async replication with a 15 min RPO
write a runbook for failover and failback

verify network latency between sites is under 5ms
confirm licensing covers the second cluster
ask the customer for their RTO target

what hypervisor are they standardizing on?
do they need synchronous replication for any tier-0 apps?`;
