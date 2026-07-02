"use client";

import { Brain } from "lucide-react";

// --- BrainIcon --------------------------------------------------------------
// Nutanix-themed replacement for the old 🧠 emoji. A rounded "iris" badge with
// an anatomical brain glyph (Apple/SF-Symbols style), rendered in Nutanix Iris
// Purple. Decorative by default; pass a `title` to give it an accessible label.

type BrainIconSize = "sm" | "md" | "lg";

const BADGE_SIZES: Record<BrainIconSize, string> = {
  sm: "h-7 w-7 rounded-lg",
  md: "h-9 w-9 rounded-xl",
  lg: "h-11 w-11 rounded-2xl",
};

const GLYPH_SIZES: Record<BrainIconSize, string> = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
};

export function BrainIcon({
  size = "md",
  title,
  className = "",
}: {
  size?: BrainIconSize;
  title?: string;
  className?: string;
}) {
  return (
    <span
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={`inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-iris-500 to-iris-700 text-white shadow-sm ${BADGE_SIZES[size]} ${className}`}
    >
      <Brain className={GLYPH_SIZES[size]} strokeWidth={2} />
    </span>
  );
}

// --- ContextSwitch ----------------------------------------------------------
// Accessible on/off toggle (WAI-ARIA switch pattern) used to include or exclude
// an item from the Account-AI context. Fully keyboard operable and labelled.

export function ContextSwitch({
  checked,
  onChange,
  label,
  disabled = false,
  busy = false,
  size = "md",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible label describing what is being toggled. */
  label: string;
  disabled?: boolean;
  busy?: boolean;
  size?: "sm" | "md";
}) {
  // Concrete pixel sizes (no fractional spacing) so the knob always renders and
  // travels the full width of the track for an unmistakable on/off state.
  const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const knob = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const travel = size === "sm" ? "translate-x-4" : "translate-x-5";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex ${track} shrink-0 cursor-pointer items-center rounded-full border p-0 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-iris-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? "border-iris-600 bg-iris-500 hover:bg-iris-600"
          : "border-charcoal-300 bg-charcoal-300 hover:bg-charcoal-400 dark:border-charcoal-400 dark:bg-charcoal-300"
      }`}
    >
      <span
        className={`pointer-events-none inline-block ${knob} translate-x-0.5 transform rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform duration-200 ${
          checked ? travel : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// --- SourceBadge ------------------------------------------------------------
// Small colored chip that shows where an ingested item came from. Each tone
// carries an explicit dark-mode pairing (translucent fill + light text) so the
// chip stays legible and on-brand in either theme instead of rendering as a
// bright light patch when the app is in dark mode.

const SOURCE_TONES: Record<string, string> = {
  Zoom: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  Salesforce: "bg-cyan-100 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300",
  Email: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  // iris tokens already flip under `.dark`, so this pairing is theme-safe as-is.
  "SE note": "bg-iris-100 text-iris-700",
  "AE note": "bg-violet-100 text-violet-700 dark:bg-violet-400/20 dark:text-violet-300",
  "SAM note": "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
};

const FALLBACK_TONE = "bg-charcoal-100 text-charcoal-600";

export function SourceBadge({ source }: { source: string }) {
  const tone = SOURCE_TONES[source] ?? FALLBACK_TONE;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
      {source}
    </span>
  );
}
