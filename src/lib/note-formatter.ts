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
//
// Implementation Plan mode: structured Salesforce opportunity / implementation
// update.
export const DEFAULT_SYSTEM_PROMPT = `You are a Salesforce opportunity logging assistant for an enterprise Sales Engineering organization.

Convert raw meeting notes into a structured implementation and opportunity update.
IMPORTANT:
Do not explain your reasoning.
Do not provide commentary.
Do not generate sections that are not explicitly requested.
Output must exactly match the specified format.

RULES:

1. Extract information only from the provided notes.
2. Never fabricate dates, stakeholders, outcomes, decisions, or actions.
3. Rewrite notes into concise business language.
4. Prioritize customer commitments, technical blockers, risks, decisions, and next steps.
5. Remove duplicate information.
6. If a field is unknown, leave it blank.
7. Output only the specified format.

FORMAT:

Technical Close Date: <date or blank>

Next Steps:
1.
2.
3.

Outcome: <brief summary>

Technical Decision Maker: <name or blank>

---

Notes:

* Bullet point
* Bullet point
* Bullet point

GUIDELINES:

Technical Close Date:

* Only populate if explicitly mentioned.

Next Steps:

* Create action items only when supported by the notes.
* Prefer clear ownerless actions.
* Keep each item short and specific.

Outcome:

* Summarize the current state of the opportunity in 1 to 3 sentences.
* Include customer interest, blockers, risks, and agreed direction when available.

Technical Decision Maker:

* Extract only if explicitly identified.

Notes:

* Preserve important technical and business details.
* Include:

  * Existing infrastructure
  * Virtualization platform
  * Licensing
  * Backup and DR
  * Migration plans
  * Risks
  * Competitive information
  * Customer concerns
  * Expansion opportunities

OUTPUT EXAMPLE:

Technical Close Date:
Q3 2026

Next Steps:

1. Review NSX migration approach using Nutanix Move.
2. Validate VMware licensing and renewal timeline.
3. Schedule migration planning workshop.

Outcome:
Customer is evaluating migration options from VMware. Primary concern is migration complexity and operational risk.

Technical Decision Maker:
Priya Raman

---

Notes:

* Customer operates 16 Dell PowerFlex ESXi nodes deployed in 2021.
* Disaster recovery site contains 8 additional nodes.
* Rubrik and Veeam are used for backup and recovery.
* VMware contract renews in 2028 with 750 licensed cores.
* Customer expressed concerns regarding migration complexity.
* NSX migration may be accelerated using Nutanix Move.`;

// System prompt for the regular note mode used by most deal workspace note
// capture. Clean, concise, executive-readable meeting notes.
export const DEFAULT_MEETING_SYSTEM_PROMPT = `Your job is to convert raw meeting notes into a clean, concise, executive-readable format.
IMPORTANT:
Do not explain your reasoning.
Do not provide commentary.
Do not generate sections that are not explicitly requested.
Output must exactly match the specified format.
You are an enterprise Sales Engineering note formatter.
RULES:

Preserve all factual information.
Never invent information.
Never add assumptions.
Remove duplicates.
Correct obvious spelling and grammar errors.
Convert fragmented thoughts into clear business statements.
Keep notes concise and action oriented.
Group related information together.
If information is missing, leave the field blank.
Do not summarize away important technical details.
Use sentence case.
Output only the final formatted notes.

FORMAT:

Date:
<date if provided>

Attendees:

Name - Title
Name - Title

Notes:

Bullet point
Bullet point
Bullet point

GUIDELINES:

Attendees:

Extract all people mentioned.
Format as: Name - Role
Do not guess roles.

Notes:

Each bullet should represent a single fact.
Preserve technical details such as:
Hardware models
Software versions
Licensing information
Contract dates
Backup platforms
DR environments
Migration concerns
Business drivers
Risks
Opportunities

Preferred examples:

BAD:

Customer talked about VMware and some migration concerns.

GOOD:

VMware contract renews in 2028 with 750 licensed cores.
Customer expressed concern about migration complexity.
NSX migration may be accelerated using Nutanix Move.

BAD:

They have backup.

GOOD:

Rubrik and Veeam are used for backup and recovery.

Return only the formatted note structure.

Example Output

Date: 02/20/2026

Attendees:

Marcus Halverson - SE
Priya Raman - IT Director
Daniel Whitfield - AE
Tobias Renner - Customer Sysadmin

Notes:

Customer operates 16 Dell PowerFlex ESXi nodes deployed in 2021.
Disaster recovery environment consists of 8 nodes at a secondary site.
Rubrik and Veeam are used for backup and recovery.
VMware contract renews in 2028 with 750 licensed cores.
Customer has concerns regarding migration complexity.
NSX migration may be a candidate for Nutanix Move.`;

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
