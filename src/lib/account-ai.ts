import { getAccountDetail } from "@/lib/data";
import { parseAttendees } from "@/lib/meeting";
import { prisma } from "@/lib/prisma";

// --- Types shared by the brain panel and the chat route --------------------

export type BrainAsset = {
  id: string;
  type: string;
  title: string;
  sourceTool: string;
  previewImageUri: string | null;
  createdAt: string;
};

export type BrainNote = {
  id: string;
  role: string;
  author: string;
  body: string;
  createdAt: string;
};

/** A bucket of ingested data: either a specific meeting or the account itself. */
export type BrainGroup = {
  key: string;
  label: string;
  /** ISO meeting start, or null for the account-level bucket. */
  date: string | null;
  meetingId: string | null;
  notes: BrainNote[];
  assets: BrainAsset[];
};

export type BrainSummary = {
  accountName: string;
  dealName: string;
  meetingCount: number;
  emailCount: number;
  noteCount: number;
  assetCount: number;
  /** Asset counts grouped by type, e.g. { type: "PRESENTATION", count: 4 }. */
  assetTypeCounts: { type: string; count: number }[];
  /** A few derived high-level topics pulled from the notes/meetings. */
  topics: string[];
  /** All ingested items, grouped by meeting (newest first) + an account bucket. */
  groups: BrainGroup[];
};

// The Account-AI persona. It is deliberately scoped to a SINGLE account so the
// knowledge bases never bleed together.
export const ACCOUNT_AI_SYSTEM_PROMPT = [
  "You are Account-AI, a seasoned Nutanix Senior Systems Engineer (SE) assistant dedicated to ONE specific account.",
  "You are deeply technical across Nutanix AOS/AHV, Prism, Nutanix Cloud Clusters (NC2), Files, Objects, Volumes, disaster recovery, sizing, and competitive positioning vs. VMware/Broadcom, Dell, and the hyperscalers.",
  "You assist the SE through the full sales cycle: discovery, technical validation, POC/POV, sizing, objection handling, and QBRs.",
  "Ground every answer in the supplied account knowledge base (meetings, notes, assets, emails). Cite which note or meeting a fact came from when relevant.",
  "Never invent customer specifics that are not supported by the knowledge base. If something is unknown, say so and suggest the discovery question that would close the gap.",
  "This knowledge base belongs to this account only. Do not reference or assume details from any other customer.",
  "Be concise, precise, and practical. Prefer bullet points, concrete next steps, and SE-grade technical depth.",
].join("\n");

// The portfolio-level persona for the "My Accounts" (all-accounts) mode. It can
// compare and prioritize across the SE's whole book of business.
export const ALL_ACCOUNTS_SYSTEM_PROMPT = [
  "You are Account-AI, a seasoned Nutanix Senior Systems Engineer (SE) advising on the SE's ENTIRE portfolio of accounts.",
  "You are deeply technical across Nutanix AOS/AHV, Prism, Nutanix Cloud Clusters (NC2), Files, Objects, Volumes, disaster recovery, sizing, and competitive positioning vs. VMware/Broadcom, Dell, and the hyperscalers.",
  "Use the supplied portfolio summary (every account with its stage, amount, owner, next action, signal, and upcoming/last meeting) to help the SE prioritize their week, spot risk, and plan technical next steps.",
  "When asked what to focus on, reason about deal value, stage, momentum (recent and upcoming meetings), technical close status, and risk signals; recommend a concrete, ranked set of actions and name the specific accounts.",
  "Ground answers in the supplied portfolio data. If a detail isn't present, say so and suggest how to find it. Do not invent customer specifics.",
  "Be concise and practical: lead with a ranked recommendation, then brief rationale per account.",
  "For deep, account-specific work, suggest the SE open that account to access its full knowledge base.",
].join("\n");

// --- Lightweight topic extraction ------------------------------------------

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "have", "has", "are", "was", "were",
  "will", "from", "they", "their", "them", "our", "out", "about", "into", "over",
  "more", "than", "then", "some", "any", "all", "can", "could", "should", "would",
  "need", "needs", "want", "wants", "also", "just", "like", "make", "made", "get",
  "got", "next", "step", "steps", "note", "notes", "meeting", "call", "sync",
  "team", "teams", "via", "per", "key", "plan", "update", "updates", "discuss",
  "discussed", "follow", "followup", "review", "session", "account", "deal",
]);

function extractTopics(texts: string[], limit = 5): string[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
      if (raw.length < 4 || STOPWORDS.has(raw) || /^\d+$/.test(raw)) continue;
      counts.set(raw, (counts.get(raw) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));
}

// --- Knowledge base assembly -----------------------------------------------

export type AccountKnowledgeBase = {
  contextText: string;
  summary: BrainSummary;
};

/**
 * Assemble an account-isolated knowledge base: a flat context string for the LLM
 * and a structured brain summary for the UI. Returns null if the deal is gone.
 */
export async function buildAccountKnowledgeBase(dealId: string): Promise<AccountKnowledgeBase | null> {
  const deal = await getAccountDetail(dealId);
  if (!deal) return null;

  const toAsset = (asset: {
    id: string;
    type: string;
    title: string;
    sourceTool: string;
    previewImageUri: string | null;
    createdAt: Date;
  }): BrainAsset => ({
    id: asset.id,
    type: asset.type,
    title: asset.title,
    sourceTool: asset.sourceTool,
    previewImageUri: asset.previewImageUri,
    createdAt: asset.createdAt.toISOString(),
  });

  const toNote = (note: {
    id: string;
    role: string;
    author: string;
    body: string;
    createdAt: Date;
  }): BrainNote => ({
    id: note.id,
    role: note.role,
    author: note.author,
    body: note.body,
    createdAt: note.createdAt.toISOString(),
  });

  // One group per meeting (newest first), then an account-level bucket for
  // items that aren't tied to a specific meeting.
  const groups: BrainGroup[] = deal.meetings.map((meeting) => ({
    key: `meeting-${meeting.id}`,
    label: meeting.subject,
    date: meeting.startTime.toISOString(),
    meetingId: meeting.id,
    notes: meeting.notes.map(toNote),
    assets: meeting.assets.map(toAsset),
  }));

  const accountNotes = deal.notes.filter((note) => !note.meetingId).map(toNote);
  const accountAssets = deal.assets.filter((asset) => !asset.meetingId).map(toAsset);
  groups.push({
    key: "account-level",
    label: "Account-level (no meeting)",
    date: null,
    meetingId: null,
    notes: accountNotes,
    assets: accountAssets,
  });

  const assetTypeMap = new Map<string, number>();
  for (const asset of deal.assets) {
    assetTypeMap.set(asset.type, (assetTypeMap.get(asset.type) ?? 0) + 1);
  }
  const assetTypeCounts = [...assetTypeMap.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const topics = extractTopics([
    ...deal.notes.map((note) => note.body),
    ...deal.meetings.map((meeting) => meeting.subject),
    deal.nextAction,
    deal.latestSignal ?? "",
  ]);

  const summary: BrainSummary = {
    accountName: deal.accountName,
    dealName: deal.name,
    meetingCount: deal.meetings.length,
    emailCount: deal.emails.length,
    noteCount: deal.notes.length,
    assetCount: deal.assets.length,
    assetTypeCounts,
    topics,
    groups,
  };

  // Build the LLM context. Keep it bounded so very chatty accounts don't blow
  // past the model's window; the most recent notes/meetings matter most.
  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(d);

  const lines: string[] = [
    `ACCOUNT: ${deal.accountName}`,
    `OPPORTUNITY: ${deal.name} (stage: ${deal.stage}, owner: ${deal.owner})`,
    `AMOUNT: $${deal.amount.toLocaleString()} | TECHNICAL CLOSE STATUS: ${deal.technicalCloseStatus} | CLOSED: ${deal.isClosed ? "yes" : "no"}`,
    `NEXT ACTION: ${deal.nextAction}`,
  ];
  if (deal.latestSignal) lines.push(`LATEST SIGNAL: ${deal.latestSignal}`);

  lines.push("", "MEETINGS:");
  for (const meeting of deal.meetings.slice(0, 25)) {
    const attendees = parseAttendees(meeting.attendeesJson)
      .map((a) => a.name)
      .slice(0, 8)
      .join(", ");
    lines.push(`- ${fmtDate(meeting.startTime)} | ${meeting.subject}${attendees ? ` | attendees: ${attendees}` : ""}`);
  }

  lines.push("", "NOTES (SE / AE / SAM):");
  for (const note of deal.notes.slice(0, 60)) {
    lines.push(`- [${note.role} ${fmtDate(note.createdAt)}] ${note.body}`);
  }

  lines.push("", "ASSETS:");
  for (const asset of deal.assets.slice(0, 60)) {
    lines.push(`- ${asset.type.replaceAll("_", " ")}: ${asset.title} (source: ${asset.sourceTool})`);
  }

  if (deal.emails.length > 0) {
    lines.push("", "EMAILS:");
    for (const email of deal.emails.slice(0, 30)) {
      lines.push(`- ${fmtDate(email.receivedAt)} | from ${email.from} | ${email.subject}`);
    }
  }

  return { contextText: lines.join("\n"), summary };
}

// --- All-accounts (portfolio) knowledge base -------------------------------

export type AllAccountsSummary = {
  accountCount: number;
  meetingCount: number;
  noteCount: number;
  assetCount: number;
  upcomingMeetingCount: number;
};

export type AllAccountsKnowledgeBase = {
  contextText: string;
  summary: AllAccountsSummary;
};

/**
 * Assemble a portfolio-wide knowledge base across every account (the SE's whole
 * book of business). Bounded to per-account rollups rather than full note dumps
 * so prioritization questions stay within the model's context window.
 */
export async function buildAllAccountsKnowledgeBase(): Promise<AllAccountsKnowledgeBase> {
  const now = new Date();
  const deals = await prisma.deal.findMany({
    orderBy: { amount: "desc" },
    include: {
      meetings: { select: { startTime: true } },
      _count: { select: { notes: true, assets: true, emails: true } },
    },
  });

  const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(d);

  let meetingCount = 0;
  let noteCount = 0;
  let assetCount = 0;
  let upcomingMeetingCount = 0;

  const lines: string[] = [`SE PORTFOLIO — ${deals.length} accounts (sorted by amount):`, ""];

  for (const deal of deals) {
    const starts = deal.meetings.map((m) => m.startTime);
    const upcoming = starts.filter((s) => s >= now).sort((a, b) => a.getTime() - b.getTime());
    const past = starts.filter((s) => s < now).sort((a, b) => b.getTime() - a.getTime());

    meetingCount += starts.length;
    noteCount += deal._count.notes;
    assetCount += deal._count.assets;
    upcomingMeetingCount += upcoming.length;

    const parts = [
      `ACCOUNT: ${deal.accountName} (${deal.name})`,
      `stage: ${deal.stage}`,
      `amount: $${deal.amount.toLocaleString()}`,
      `owner: ${deal.owner}`,
      `tech close: ${deal.technicalCloseStatus}`,
      `closed: ${deal.isClosed ? "yes" : "no"}`,
      `next meeting: ${upcoming[0] ? fmtDate(upcoming[0]) : "none scheduled"}`,
      `last meeting: ${past[0] ? fmtDate(past[0]) : "none"}`,
      `next action: ${deal.nextAction}`,
    ];
    if (deal.latestSignal) parts.push(`signal: ${deal.latestSignal}`);
    parts.push(`notes: ${deal._count.notes}, assets: ${deal._count.assets}, emails: ${deal._count.emails}`);
    lines.push(`- ${parts.join(" | ")}`);
  }

  return {
    contextText: lines.join("\n"),
    summary: {
      accountCount: deals.length,
      meetingCount,
      noteCount,
      assetCount,
      upcomingMeetingCount,
    },
  };
}
