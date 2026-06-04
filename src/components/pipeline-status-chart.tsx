"use client";

import { formatCurrencyShort } from "@/lib/format";

export type StatusBar = { key: string; label: string; color: string; value: number };

function shortLabel(label: string): string {
  if (label === "Not Started") return "—";
  if (label === "Closed Won") return "Won";
  return label;
}

/**
 * Compact horizontal bar chart of pipeline amount by Technical Close Status.
 * Bars are scaled to the largest value in the current selection, so the chart
 * always fills the same space whether totals are in the thousands or the tens of
 * millions. Widths animate via CSS transitions as the SE / time filters change.
 */
export function PipelineStatusChart({ bars }: { bars: StatusBar[] }) {
  const max = Math.max(...bars.map((bar) => bar.value), 1);

  return (
    <div className="flex w-full flex-col justify-center gap-1">
      {bars.map((bar) => {
        // Give non-zero bars a small floor so tiny values stay visible.
        const pct = bar.value > 0 ? Math.max((bar.value / max) * 100, 2) : 0;
        const labelInside = pct >= 26;
        const valueText = formatCurrencyShort(bar.value);
        return (
          <div key={bar.key} className="flex items-center gap-2">
            <span className="w-9 shrink-0 text-right text-[10px] font-semibold tabular-nums text-charcoal-500">
              {shortLabel(bar.label)}
            </span>
            <div className="relative h-3 min-w-0 flex-1 rounded-sm bg-charcoal-50">
              <div
                className="absolute inset-y-0 left-0 flex items-center justify-end overflow-hidden rounded-sm transition-[width] duration-500 ease-out"
                style={{ width: `${pct}%`, backgroundColor: bar.color }}
              >
                {labelInside ? (
                  <span className="whitespace-nowrap px-1.5 text-[10px] font-semibold tabular-nums text-white">
                    {valueText}
                  </span>
                ) : null}
              </div>
              {!labelInside && bar.value > 0 ? (
                <span
                  className="pointer-events-none absolute inset-y-0 flex items-center whitespace-nowrap pl-1 text-[10px] font-semibold tabular-nums text-charcoal-600 transition-[left] duration-500 ease-out"
                  style={{ left: `${pct}%` }}
                >
                  {valueText}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
