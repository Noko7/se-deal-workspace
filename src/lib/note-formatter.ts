// Deterministic, offline note formatter. Takes freeform notes (bullets, dumps,
// meeting scribbles) and structures them into an implementation plan with helper
// tasks and open questions. No network, no AI — pure heuristics so it's instant
// and predictable.

import { sanitizeNotes } from "@/lib/sanitize";

// The kind of note the SE is formatting. "plan" produces an implementation plan;
// "meeting" is the general/regular note mode used in the Deal Workspace.
export type NoteKind = "plan" | "meeting";

export type FormatOptions = {
  title: string;
  includeHelpers: boolean;
  includeQuestions: boolean;
  kind?: NoteKind;
};

export type FormattedNotes = {
  kind: NoteKind;
  title: string;
  /** Meeting date, when parsed from a meeting note. */
  date: string;
  /** Meeting attendees, when parsed from a meeting note. */
  attendees: string[];
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

function buildMeetingMarkdown(result: Omit<FormattedNotes, "markdown">, options: FormatOptions): string {
  const blocks: string[] = [`# ${result.title}`];

  if (result.date) {
    blocks.push(`**Date:** ${result.date}`);
  }

  if (result.attendees.length > 0) {
    blocks.push(["## Attendees", ...result.attendees.map((name) => `- ${name}`)].join("\n"));
  }

  if (result.overview.length > 0) {
    blocks.push(["## Summary", ...result.overview.map((line) => `- ${line}`)].join("\n"));
  }

  if (options.includeHelpers && result.helpers.length > 0) {
    blocks.push(["## Action Items", ...result.helpers.map((line) => `- [ ] ${line}`)].join("\n"));
  }

  if (options.includeQuestions && result.questions.length > 0) {
    blocks.push(["## Open Questions", ...result.questions.map((line) => `- ${line}`)].join("\n"));
  }

  return blocks.join("\n\n");
}

// Recognized section labels in a meeting note (case-insensitive).
const DATE_LABEL = /^(date|when|meeting date)\s*[:\-—]\s*(.*)$/i;
const ATTENDEES_LABEL = /^(attendees|present|participants|people|who)\s*[:\-—]\s*(.*)$/i;
const NOTES_LABEL = /^(notes|discussion|agenda|topics|details)\s*[:\-—]?\s*(.*)$/i;

type MeetingSections = { date: string; attendees: string[]; notes: string[] };

// Split a freeform meeting note into Date / Attendees / Notes. Labels can appear
// inline ("Attendees: a, b") or as a header followed by bullet lines. Anything
// before/without a recognized label is treated as notes.
function parseMeetingSections(lines: string[]): MeetingSections {
  let date = "";
  const attendees: string[] = [];
  const notes: string[] = [];
  let current: "attendees" | "notes" = "notes";

  const pushAttendees = (value: string) => {
    value
      .split(/[,;]|\band\b/i)
      .map((name) => cleanLine(name))
      .filter((name) => name.length > 0)
      .forEach((name) => attendees.push(name));
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;

    const dateMatch = DATE_LABEL.exec(trimmed);
    if (dateMatch) {
      date = dateMatch[2].trim();
      current = "notes";
      continue;
    }

    const attendeesMatch = ATTENDEES_LABEL.exec(trimmed);
    if (attendeesMatch) {
      current = "attendees";
      if (attendeesMatch[2].trim()) pushAttendees(attendeesMatch[2]);
      continue;
    }

    const notesMatch = NOTES_LABEL.exec(trimmed);
    if (notesMatch) {
      current = "notes";
      if (notesMatch[2].trim()) notes.push(notesMatch[2]);
      continue;
    }

    // Continuation lines belong to the most recent section.
    if (current === "attendees") {
      pushAttendees(trimmed);
    } else {
      notes.push(trimmed);
    }
  }

  return { date, attendees: dedupe(attendees), notes };
}

function formatMeeting(input: string, options: FormatOptions): FormattedNotes {
  const lines = input.split(/\r?\n/);
  const sections = parseMeetingSections(lines);

  const overview: string[] = [];
  const helpers: string[] = [];
  const questions: string[] = [];

  for (const raw of sections.notes) {
    const cleaned = cleanLine(raw);
    if (cleaned.length === 0) continue;
    switch (classify(raw, cleaned)) {
      case "question":
        questions.push(cleaned.endsWith("?") ? cleaned : `${cleaned}?`);
        break;
      case "helper":
      case "step":
        // In a meeting context both supporting and action verbs are follow-ups.
        helpers.push(cleaned);
        break;
      default:
        overview.push(cleaned);
    }
  }

  const title =
    options.title.trim() ||
    (sections.date ? `Meeting Notes — ${sections.date}` : deriveTitle({ overview, steps: helpers })) ||
    "Meeting Notes";

  const partial = {
    kind: "meeting" as const,
    title,
    date: sections.date,
    attendees: sections.attendees,
    overview: dedupe(overview),
    steps: [],
    helpers: options.includeHelpers ? dedupe(helpers) : [],
    questions: options.includeQuestions ? dedupe(questions) : [],
  };

  return { ...partial, markdown: buildMeetingMarkdown(partial, options) };
}

export function formatNotes(input: string, options: FormatOptions): FormattedNotes {
  // Always sanitize before parsing so control chars / oversized dumps can't
  // break the heuristics or the rendered output.
  const safe = sanitizeNotes(input).text;

  if (options.kind === "meeting") {
    return formatMeeting(safe, options);
  }

  const lines = safe
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
    kind: "plan" as const,
    title: options.title.trim() || deriveTitle({ overview, steps }),
    date: "",
    attendees: [] as string[],
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
  "You are a senior prompt engineer and principal systems engineer assistant.",
  "Your task is to transform raw, messy engineer notes into a concise implementation plan for execution.",
  "Return PLAIN TEXT ONLY. Never return markdown, code fences, bullet symbols, or decorative formatting.",
  "Write short, information-dense output. Keep it clean and simple, but do not omit important technical details.",
  "Prioritize outcome, sequencing, owners, dependencies, risk, and validation criteria.",
  "If details are ambiguous, preserve uncertainty explicitly in Open Questions instead of inventing facts.",
  "Use this exact structure with blank lines between sections:",
  "Title:",
  "<clear implementation title>",
  "",
  "Scope:",
  "<1-3 lines of what is being delivered>",
  "",
  "Implementation Steps:",
  "1) <step>",
  "2) <step>",
  "",
  "Validation:",
  "<how success will be verified>",
  "",
  "Risks/Dependencies:",
  "<key blockers, assumptions, external dependencies>",
  "",
  "Open Questions:",
  "1) <question only if unresolved items exist>",
  "Compress repetition, remove filler, normalize terminology, and keep signal high.",
].join("\n");

// System prompt for the regular note mode used by most deal workspace note
// capture. Keep this broad and not implementation-plan specific.
export const DEFAULT_MEETING_SYSTEM_PROMPT = [
  "You are a senior prompt engineer and customer-facing systems engineer assistant.",
  "Your task is to transform messy call notes into concise, high-signal regular deal notes.",
  "Return PLAIN TEXT ONLY. No markdown, no bullet symbols, no checkboxes, no decorative formatting.",
  "Summarize for speed of handoff: what happened, why it matters, what happens next, and what is still unknown.",
  "Use this exact structure with blank lines between sections:",
  "Date/Time:",
  "<if present; otherwise leave as Not provided>",
  "",
  "Title:",
  "<short meeting/call title>",
  "",
  "Context:",
  "<account situation, trigger, and business/technical frame>",
  "",
  "Summary:",
  "<brief, plain-language summary with core decisions and constraints>",
  "",
  "Action Items:",
  "1) <item with owner and timing when available>",
  "",
  "Open Questions:",
  "1) <question only if unresolved items exist>",
  "Be concise, remove noise, preserve critical technical and business details, and never invent facts.",
].join("\n");

// Returns the bundled default system prompt for a given note kind.
export function defaultSystemPromptFor(kind: NoteKind): string {
  return kind === "meeting" ? DEFAULT_MEETING_SYSTEM_PROMPT : DEFAULT_SYSTEM_PROMPT;
}

export const SAMPLE_MEETING_NOTES = `random dump from zoom + side chat + my scratchpad:
6/24 maybe 2pm?? no actually 2:30 ET started late
acct = HGTC / maybe prod + dev expansion (confirm)
people: fatima, mark, chris, gary + customer sankar/john/anne/justin/steven/vincent/sai + maybe infra mgr joined 20 min late

agenda was supposed to be move + xray but we also got dragged into vmware renewal + "why now"
they said current vmware true-up pain + renewal timeline 90 days-ish
customer said "if migration risk is low we can move faster" (important)

tech details from call (messy):
- 2 clusters currently, mixed gen nodes, one cluster hot (~75-80% mem at month end)
- no formal DR test in last 14 months
- target apps = student systems + finance + some sql
- they want "non disruptive" migration window mostly nights/weekends
- asked about RPO/RTO, they said RPO maybe 15m for critical, RTO unclear, "few hours maybe"
- concern: networking team understaffed in july
- concern: backup vendor plugin compatibility
- asked if leap is required now or phase 2
- asked if can do pilot with 15-20 VMs first
- confusion from them on what data collector outputs are needed

my follow-ups scattered:
send collector + rvtools checklist
send draft migration wave plan
book deep dive w storage + network teams
need AE to confirm commercial timeline + discount guardrails
need SAM on support SKUs (they asked 24x7 vs business hours)
capture risk register + rollback approach

open loops:
who is final technical approver?
which sql workloads are tier-0?
do they require synchronous replication for any app?
is there a hard blackout window around semester start?
do they need nc2 now or later?

extra noise from my notes:
"john said maybe budget is there but procurement slow"
"anne asked about reference architecture deck"
"steven asked if we can benchmark before/after"
"remember to ask security about encryption at rest requirement"
"ask for current runbook doc if it exists"
"don't forget to follow up thursday"`;

export const SAMPLE_NOTES = `implementation scratchpad, not organized:
goal-ish: build a realistic implementation plan for HGTC moving off vmware pressure + improving resiliency without blowing up ops team

inputs from multiple threads:
email 1 says start pilot in july
email 2 says procurement maybe august
meeting notes say they want low-risk migration and care about rollback story

technical constraints (mixed quality):
- current env not homogeneous hardware
- one cluster running hot on memory at month-end
- unknown real dependency map between app tiers
- network team bandwidth low
- no fresh DR rehearsal
- possible backup integration unknown
- change window mostly nights/weekends

what we probably need:
1) discovery + data hygiene pass
2) classify workloads by criticality + dependency
3) define migration waves + acceptance criteria
4) define DR baseline and target state
5) define validation gates + rollback criteria each wave

to-do fragments from slack:
\"need owner for every action, no owner=no action\"
\"keep first wave boring and reversible\"
\"don't schedule cutover near registration period\"
\"collect perf baseline before moving anything\"
\"security asked about encryption defaults\"

deliverables we should generate:
- migration wave plan
- target architecture summary
- risk/dependency register
- test + rollback runbook
- stakeholder comms cadence

random unresolved bits:
is leap required in phase 1?
are sql systems included in wave 1 or deferred?
what exact success metrics will customer sign off on?
who signs final go/no-go for production cutover?
what's the approved outage tolerance by app tier?

more noise:
customer asks for \"simple plan not giant doc\"
AE wants timeline confidence for forecast call
SAM needs licensing/support posture clarified
we need something executable, concise, and defensible`;
