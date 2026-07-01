"use client";

import { BrainCircuit } from "lucide-react";

// --- BrainIcon --------------------------------------------------------------
// Nutanix-themed replacement for the old 🧠 emoji. A rounded "iris" badge with
// the circuit-brain glyph, echoing Nutanix's product-icon language. Decorative
// by default; pass a `title` to give it an accessible label.

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
      <BrainCircuit className={GLYPH_SIZES[size]} strokeWidth={2} />
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
  const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const knob = size === "sm" ? "h-3.5 w-3.5" : "h-4.5 w-4.5";
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
      className={`relative inline-flex ${track} shrink-0 items-center rounded-full border transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-iris-400 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "border-iris-600 bg-iris-500" : "border-charcoal-300 bg-charcoal-200"
      }`}
    >
      <span
        className={`ml-0.5 inline-block ${knob} transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? travel : "translate-x-0"
        }`}
      />
    </button>
  );
}

// --- SourceBadge ------------------------------------------------------------
// Small colored chip that shows where an ingested item came from.

const SOURCE_TONES: Record<string, string> = {
  Zoom: "bg-sky-100 text-sky-700",
  Salesforce: "bg-cyan-100 text-cyan-700",
  Email: "bg-amber-100 text-amber-700",
  "SE note": "bg-iris-100 text-iris-700",
  "AE note": "bg-violet-100 text-violet-700",
  "SAM note": "bg-emerald-100 text-emerald-700",
};

export function SourceBadge({ source }: { source: string }) {
  const tone = SOURCE_TONES[source] ?? "bg-charcoal-100 text-charcoal-600";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>
      {source}
    </span>
  );
}
