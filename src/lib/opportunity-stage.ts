// Canonical opportunity sales-cycle stages.
//
// Opportunities move through a numbered 1–7 pipeline (a real sales cycle). Deal
// records store the stage as a free-text string, so `stageMeta()` normalizes any
// legacy/synonym value onto one of the canonical stages and returns its number,
// label, ordering, and theme-aware color classes for a consistent StageBadge
// everywhere the stage is shown.

export type StageKey =
  | "Discovery"
  | "Design"
  | "Validation"
  | "Proposal"
  | "Negotiation"
  | "Closed Won"
  | "Closed Lost";

export type StageMeta = {
  /** 1–7 position in the sales cycle. */
  num: number;
  /** Canonical display label. */
  label: StageKey;
  /** True for the two terminal outcomes. */
  isClosed: boolean;
  /** True only for a won outcome. */
  isWon: boolean;
  /**
   * Tailwind classes for the pill. Each carries an explicit dark-mode pairing
   * (translucent fill + light text + subtle ring) so the badge stays high
   * contrast and on-brand in either theme.
   */
  pill: string;
  /** Classes for the small leading number chip inside the pill. */
  chip: string;
  /** Solid accent color (hex) for bars/borders that need a raw value. */
  accent: string;
};

// Order defines the 1–7 numbering. Colors run cool → warm across the cycle so a
// glance communicates progress, with green = won and red = lost at the end.
const STAGES: Record<StageKey, Omit<StageMeta, "num">> = {
  Discovery: {
    label: "Discovery",
    isClosed: false,
    isWon: false,
    pill: "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-400/15 dark:text-sky-300 dark:ring-sky-400/25",
    chip: "bg-sky-600/10 text-sky-700 dark:bg-sky-300/15 dark:text-sky-200",
    accent: "#0ea5e9",
  },
  Design: {
    label: "Design",
    isClosed: false,
    isWon: false,
    pill: "bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-400/15 dark:text-violet-300 dark:ring-violet-400/25",
    chip: "bg-violet-600/10 text-violet-700 dark:bg-violet-300/15 dark:text-violet-200",
    accent: "#7c3aed",
  },
  Validation: {
    label: "Validation",
    isClosed: false,
    isWon: false,
    pill: "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-400/15 dark:text-amber-300 dark:ring-amber-400/25",
    chip: "bg-amber-600/10 text-amber-800 dark:bg-amber-300/15 dark:text-amber-200",
    accent: "#d97706",
  },
  Proposal: {
    label: "Proposal",
    isClosed: false,
    isWon: false,
    pill: "bg-cyan-100 text-cyan-800 ring-cyan-200 dark:bg-cyan-400/15 dark:text-cyan-300 dark:ring-cyan-400/25",
    chip: "bg-cyan-600/10 text-cyan-800 dark:bg-cyan-300/15 dark:text-cyan-200",
    accent: "#0891b2",
  },
  Negotiation: {
    label: "Negotiation",
    isClosed: false,
    isWon: false,
    pill: "bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-400/15 dark:text-orange-300 dark:ring-orange-400/25",
    chip: "bg-orange-600/10 text-orange-700 dark:bg-orange-300/15 dark:text-orange-200",
    accent: "#ea580c",
  },
  "Closed Won": {
    label: "Closed Won",
    isClosed: true,
    isWon: true,
    pill: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/15 dark:text-emerald-300 dark:ring-emerald-400/25",
    chip: "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-300/15 dark:text-emerald-200",
    accent: "#059669",
  },
  "Closed Lost": {
    label: "Closed Lost",
    isClosed: true,
    isWon: false,
    pill: "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-400/15 dark:text-rose-300 dark:ring-rose-400/25",
    chip: "bg-rose-600/10 text-rose-700 dark:bg-rose-300/15 dark:text-rose-200",
    accent: "#e11d48",
  },
};

export const STAGE_ORDER: StageKey[] = [
  "Discovery",
  "Design",
  "Validation",
  "Proposal",
  "Negotiation",
  "Closed Won",
  "Closed Lost",
];

/** Canonical labels in cycle order, for pickers/schemas. */
export const STAGE_LABELS: StageKey[] = STAGE_ORDER;

/**
 * Map any raw stage string (legacy names, casing, synonyms) onto a canonical
 * stage key. Falls back to Discovery for anything unrecognized so a badge always
 * renders.
 */
export function normalizeStage(raw: string | null | undefined): StageKey {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "Discovery";
  if (s.includes("won")) return "Closed Won";
  if (s.includes("lost")) return "Closed Lost";
  if (s.includes("closed")) return "Closed Won";
  if (s.includes("negoti")) return "Negotiation";
  if (s.includes("propos")) return "Proposal";
  if (s.includes("valid") || s.includes("poc") || s.includes("proof")) return "Validation";
  if (s.includes("design") || s.includes("solution") || s.includes("develop")) return "Design";
  if (s.includes("discov") || s.includes("qual") || s.includes("prospect")) return "Discovery";
  return "Discovery";
}

/** Full metadata (number + colors) for a raw stage string. */
export function stageMeta(raw: string | null | undefined): StageMeta {
  const key = normalizeStage(raw);
  const num = STAGE_ORDER.indexOf(key) + 1;
  return { num, ...STAGES[key] };
}
