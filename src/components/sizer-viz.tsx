"use client";

// Data marks for the Simple Sizer.
//
// Everything here draws *data*, so it uses the validated viz tokens
// (--color-viz-*), never the bright brand secondaries and never a status colour.
// App chrome (StatusPill and friends) is a separate system and stays as it is.
//
// Mark specs: thin marks, 4px rounded data-ends anchored to the baseline, a 2px
// surface gap between adjacent fills, and identity never carried by colour alone —
// every series is labelled.

import type { ReactNode } from "react";

export type VizSeries = "compute" | "memory" | "storage" | "muted";

export const VIZ_FILL: Record<VizSeries, string> = {
  compute: "bg-viz-compute",
  memory: "bg-viz-memory",
  storage: "bg-viz-storage",
  muted: "bg-viz-muted",
};

const VIZ_TEXT: Record<VizSeries, string> = {
  compute: "text-viz-compute",
  memory: "text-viz-memory",
  storage: "text-viz-storage",
  muted: "text-viz-muted",
};

/** A colour swatch that always sits beside a text label — never colour alone. */
export function VizKey({ series, label }: { series: VizSeries; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-charcoal-600">
      <span aria-hidden className={`h-2 w-2 rounded-[2px] ${VIZ_FILL[series]}`} />
      {label}
    </span>
  );
}

/**
 * A single measured quantity against a capacity. Bar with a 4px rounded end,
 * recessive track, and the value stated in text so the bar is never the only
 * carrier of meaning.
 */
export function Meter({
  label,
  value,
  max,
  series,
  caption,
  index = 0,
}: {
  label: string;
  value: number;
  max: number;
  series: VizSeries;
  caption?: string;
  index?: number;
}) {
  if (!(max > 0)) return null;
  const raw = (value / max) * 100;
  const over = raw > 100;
  const pct = Math.max(0, Math.min(100, raw));
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[11px] font-medium text-charcoal-600">{label}</span>
        {caption ? (
          <span className={`shrink-0 text-[11px] tabular-nums ${over ? "font-semibold text-rose-600" : "text-charcoal-500"}`}>
            {caption}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-viz-track">
        <div
          className={`sizer-fill h-full rounded-full ${over ? "bg-rose-500" : VIZ_FILL[series]}`}
          style={{ width: `${pct}%`, ["--index" as string]: index }}
        />
      </div>
    </div>
  );
}

/**
 * Two-part composition (powered on vs off). Segments are separated by a 2px
 * surface gap so adjacent fills never touch, and both parts are named in the
 * legend above.
 */
export function SplitMeter({
  label,
  segments,
  index = 0,
}: {
  label: string;
  segments: { key: string; label: string; value: number; series: VizSeries }[];
  index?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (!(total > 0)) return null;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[11px] font-medium text-charcoal-600">{label}</span>
        <span className="flex flex-wrap items-center gap-x-3">
          {segments.map((s) => (
            <VizKey key={s.key} series={s.series} label={s.label} />
          ))}
        </span>
      </div>
      <div className="mt-1.5 flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full bg-viz-track">
        {segments.map((s, i) => (
          <div
            key={s.key}
            className={`sizer-fill h-full rounded-full ${VIZ_FILL[s.series]}`}
            style={{ width: `${(s.value / total) * 100}%`, ["--index" as string]: index + i }}
          />
        ))}
      </div>
    </div>
  );
}

/** Compact three-up utilization strip used on target-cluster tiles. */
export function MicroMeters({
  items,
}: {
  items: { key: string; series: VizSeries; pct: number; label: string }[];
}) {
  return (
    <div className="flex gap-1">
      {items.map((item, i) => (
        <div
          key={item.key}
          className="h-1 flex-1 overflow-hidden rounded-full bg-viz-track"
          title={item.label}
        >
          <div
            className={`sizer-fill h-full rounded-full ${VIZ_FILL[item.series]}`}
            style={{ width: `${Math.max(0, Math.min(100, item.pct))}%`, ["--index" as string]: i }}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Ranked magnitude by category (guest OS mix). One hue, because this encodes
 * magnitude within a single measure — not identity across series.
 */
export function RankedBars({
  rows,
  total,
}: {
  rows: { name: string; count: number }[];
  total: number;
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={`${i}-${row.name}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span className="truncate text-xs text-charcoal-700" title={row.name}>
            {row.name}
          </span>
          <span className="text-right text-xs tabular-nums text-charcoal-500">
            <span className="font-semibold text-charcoal-900">{row.count.toLocaleString()}</span>
            {total > 0 ? ` · ${Math.round((row.count / total) * 100)}%` : ""}
          </span>
          <div className="col-span-2 h-1 overflow-hidden rounded-full bg-viz-track">
            <div
              className="sizer-fill h-full rounded-full bg-viz-compute"
              style={{ width: `${(row.count / max) * 100}%`, ["--index" as string]: i }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The headline figure. A hero number is a legitimate "form" — no plot, no
 * decoration, hierarchy carried by weight and a single accent.
 */
export function HeroNumber({
  value,
  unit,
  hint,
}: {
  value: string;
  unit: string;
  hint?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-baseline gap-2 leading-none">
        <span className="text-5xl font-semibold tracking-tighter tabular-nums text-charcoal-900 md:text-6xl">{value}</span>
        <span className="text-sm font-medium text-charcoal-600">{unit}</span>
      </p>
      {hint ? <p className="mt-2 text-xs text-charcoal-600">{hint}</p> : null}
    </div>
  );
}

/** Label-above-value stat. Fixed-height label row keeps a grid of these aligned. */
export function Stat({
  label,
  value,
  sub,
  series,
  emphasis = false,
  index = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  series?: VizSeries;
  emphasis?: boolean;
  index?: number;
}) {
  return (
    <div className="sizer-rise min-w-0" style={{ ["--index" as string]: index }}>
      <div className="flex items-center gap-1.5">
        {series ? <span aria-hidden className={`h-2 w-2 shrink-0 rounded-[2px] ${VIZ_FILL[series]}`} /> : null}
        <p className="truncate text-[11px] font-medium text-charcoal-500" title={label}>
          {label}
        </p>
      </div>
      <p
        className={`mt-1 truncate tabular-nums tracking-tight text-charcoal-900 ${
          emphasis ? "text-2xl font-semibold" : "text-xl font-medium"
        }`}
        title={value}
      >
        {value}
      </p>
      <p className="h-4 truncate text-[11px] text-charcoal-500">{sub ?? ""}</p>
    </div>
  );
}

export { VIZ_TEXT };
