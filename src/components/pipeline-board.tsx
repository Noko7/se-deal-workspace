"use client";

import { useMemo, useState } from "react";
import { formatCurrencyShort, shortDate } from "@/lib/format";

export type PipelineDeal = {
  id: string;
  name: string;
  accountName: string;
  stage: string;
  owner: string;
  nextAction: string;
  amount: number;
  technicalCloseStatus: string;
  closeDate: string | null;
  isClosed: boolean;
};

type Period = "quarter" | "fy" | "all";

const COLUMNS: { key: string; label: string; color: string; tint: string }[] = [
  { key: "-", label: "Not Started", color: "#a6a6a6", tint: "#f3f3f3" },
  { key: "0", label: "0%", color: "#1fd0e3", tint: "#e7fafd" },
  { key: "25", label: "25%", color: "#f59e0b", tint: "#fef3e2" },
  { key: "50", label: "50%", color: "#ac9bfd", tint: "#f3f0ff" },
  { key: "75", label: "75%", color: "#0d9488", tint: "#e6f5f3" },
  { key: "99", label: "99%", color: "#7855fa", tint: "#f3f0ff" },
  { key: "100", label: "100%", color: "#3b82f6", tint: "#e8f1fe" },
  { key: "closed", label: "Closed Won", color: "#5fa800", tint: "#eef8d8" },
];

// Nutanix fiscal year ends July 31 (FY starts August 1).
function fiscalYearBounds(now: Date) {
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return { start: new Date(startYear, 7, 1), end: new Date(startYear + 1, 7, 1) };
}

function fiscalQuarterBounds(now: Date) {
  const { start } = fiscalYearBounds(now);
  const monthsSince = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  const qIndex = Math.floor(monthsSince / 3);
  const qStart = new Date(start.getFullYear(), start.getMonth() + qIndex * 3, 1);
  const qEnd = new Date(start.getFullYear(), start.getMonth() + qIndex * 3 + 3, 1);
  return { start: qStart, end: qEnd, qIndex };
}

function periodLabel(now: Date, period: Period) {
  const { start } = fiscalYearBounds(now);
  const fyLabel = `FY${String((start.getFullYear() + 1) % 100).padStart(2, "0")}`;
  if (period === "all") return "All time";
  if (period === "fy") return fyLabel;
  const { qIndex } = fiscalQuarterBounds(now);
  return `${fyLabel} Q${qIndex + 1}`;
}

function columnKey(deal: PipelineDeal) {
  return deal.isClosed ? "closed" : deal.technicalCloseStatus;
}

export function PipelineBoard({ deals }: { deals: PipelineDeal[] }) {
  const [period, setPeriod] = useState<Period>("quarter");
  const [owner, setOwner] = useState("all");

  const owners = useMemo(
    () => Array.from(new Set(deals.map((deal) => deal.owner))).sort(),
    [deals],
  );

  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    let range: { start: Date; end: Date } | null = null;
    if (period === "quarter") range = fiscalQuarterBounds(now);
    else if (period === "fy") range = fiscalYearBounds(now);

    return deals.filter((deal) => {
      if (owner !== "all" && deal.owner !== owner) return false;
      if (!range) return true;
      if (!deal.closeDate) return false;
      const close = new Date(deal.closeDate);
      return close >= range.start && close < range.end;
    });
  }, [deals, owner, period, now]);

  const totalAmount = filtered.reduce((sum, deal) => sum + deal.amount, 0);
  const closedAmount = filtered
    .filter((deal) => deal.isClosed)
    .reduce((sum, deal) => sum + deal.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-charcoal-200 bg-charcoal-50 p-0.5">
            {(
              [
                { key: "quarter", label: "Quarter" },
                { key: "fy", label: "Fiscal Year" },
                { key: "all", label: "All Time" },
              ] as { key: Period; label: string }[]
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setPeriod(option.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  period === option.key
                    ? "bg-iris-500 text-white shadow-sm"
                    : "bg-transparent text-charcoal-600 hover:bg-iris-50"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="owner-filter" className="whitespace-nowrap">
              SE
            </label>
            <select
              id="owner-filter"
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
              className="sm:max-w-[220px]"
            >
              <option value="all">All SEs</option>
              {owners.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <p className="text-xs uppercase tracking-wide text-charcoal-500">{periodLabel(now, period)} pipeline</p>
            <p className="text-xl font-bold text-iris-600">{formatCurrencyShort(totalAmount)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-charcoal-500">Closed won</p>
            <p className="text-xl font-bold text-[#3f5e0a]">{formatCurrencyShort(closedAmount)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {COLUMNS.map((column) => {
          const columnDeals = filtered.filter((deal) => columnKey(deal) === column.key);
          const columnAmount = columnDeals.reduce((sum, deal) => sum + deal.amount, 0);
          return (
            <div
              key={column.key}
              className="flex min-w-0 flex-col rounded-lg border border-charcoal-200 bg-white"
            >
              <div
                className="rounded-t-lg border-t-4 px-2.5 py-2"
                style={{ borderTopColor: column.color, backgroundColor: column.tint }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="min-w-0 truncate text-xs font-semibold text-charcoal-800">{column.label}</span>
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold text-white"
                    style={{ backgroundColor: column.color }}
                  >
                    {columnDeals.length}
                  </span>
                </div>
                <p className="mt-1 text-base font-bold text-charcoal-900">{formatCurrencyShort(columnAmount)}</p>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {columnDeals.length === 0 ? (
                  <p className="px-1 py-3 text-center text-xs text-charcoal-400">No deals</p>
                ) : (
                  columnDeals.map((deal) => (
                    <div
                      key={deal.id}
                      className="rounded-md border border-charcoal-200 border-l-4 bg-white p-2.5 shadow-sm"
                      style={{ borderLeftColor: column.color }}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <p className="min-w-0 truncate text-sm font-semibold text-charcoal-900">{deal.accountName}</p>
                        <span className="shrink-0 text-xs font-bold text-iris-600">
                          {formatCurrencyShort(deal.amount)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-charcoal-500">{deal.name}</p>
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-charcoal-500">
                        <span className="truncate">{deal.owner}</span>
                        {deal.closeDate ? <span className="shrink-0">{shortDate(new Date(deal.closeDate))}</span> : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
