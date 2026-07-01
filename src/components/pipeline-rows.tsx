"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrencyShort, shortDate } from "@/lib/format";
import { PipelineStatusChart } from "@/components/pipeline-status-chart";
import { buildOpportunity, type Opportunity } from "@/lib/opportunity";

function DetailStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <p className="truncate">
      <span className="text-charcoal-500">{label}: </span>
      <span className={`font-semibold ${accent ? "text-iris-600" : "text-charcoal-800"}`}>{value}</span>
    </p>
  );
}

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
  latestSignal: string | null;
  meetingsCount: number;
  emailsCount: number;
  recommendationsCount: number;
};

function dealOppCode(deal: PipelineDeal): string {
  return `SF-${deal.id.slice(0, 8).toUpperCase()}`;
}

function pipelineDealToOpportunity(deal: PipelineDeal): Opportunity {
  return buildOpportunity({
    id: deal.id,
    name: deal.name,
    accountName: deal.accountName,
    stage: deal.stage,
    amount: deal.amount,
    closeDate: deal.closeDate ? new Date(deal.closeDate) : null,
    owner: deal.owner,
    nextAction: deal.nextAction,
    technicalCloseStatus: deal.technicalCloseStatus,
    latestSignal: deal.latestSignal,
    meetingsCount: deal.meetingsCount,
    emailsCount: deal.emailsCount,
    recommendationsCount: deal.recommendationsCount,
  });
}

type Period = "quarter" | "fy" | "all";

const ROWS: { key: string; label: string; color: string; tint: string }[] = [
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

function rowKey(deal: PipelineDeal) {
  return deal.isClosed ? "closed" : deal.technicalCloseStatus;
}

function PipelineRow({
  row,
  deals,
}: {
  row: (typeof ROWS)[number];
  deals: PipelineDeal[];
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  // Hovering a card opens a detail panel BESIDE the row (never on top of it),
  // so the other cards stay scrollable and clickable while the detail shows.
  const [active, setActive] = useState<{ deal: PipelineDeal; opp: Opportunity } | null>(null);

  const update = () => {
    const el = scroller.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [deals.length]);

  const scrollBy = (direction: number) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: direction * (el.clientWidth - 60), behavior: "smooth" });
  };

  const total = deals.reduce((sum, deal) => sum + deal.amount, 0);

  return (
    <div className="overflow-hidden rounded-lg border border-charcoal-200 bg-white">
      {/* Clearing the panel happens when the pointer leaves the whole row, so
          moving from a card into the side panel keeps it open. */}
      <div className="flex items-stretch" onMouseLeave={() => setActive(null)}>
        <div
          className="flex w-32 shrink-0 flex-col justify-center border-l-4 px-3 py-3"
          style={{ borderLeftColor: row.color, backgroundColor: row.tint }}
        >
          <span className="text-sm font-semibold text-charcoal-800">{row.label}</span>
          <span className="text-base font-bold text-charcoal-900">{formatCurrencyShort(total)}</span>
          <span className="text-xs text-charcoal-500">{deals.length} deals</span>
        </div>

        <div className="relative min-w-0 flex-1">
          {canLeft ? (
            <button
              type="button"
              aria-label="Scroll left"
              onClick={() => scrollBy(-1)}
              className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-iris-500 bg-iris-500 p-1 text-white shadow hover:bg-iris-600"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : null}
          {canRight ? (
            <button
              type="button"
              aria-label="Scroll right"
              onClick={() => scrollBy(1)}
              className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full border border-iris-500 bg-iris-500 p-1 text-white shadow hover:bg-iris-600"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : null}

          <div
            ref={scroller}
            onScroll={update}
            className="flex gap-2 overflow-x-auto scroll-smooth p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {deals.length === 0 ? (
              <p className="px-2 py-4 text-xs text-charcoal-400">No deals in this stage</p>
            ) : (
              deals.map((deal) => (
                <Link
                  key={deal.id}
                  href={`/accounts/${deal.id}`}
                  onMouseEnter={() => setActive({ deal, opp: pipelineDealToOpportunity(deal) })}
                  className={`flex w-[200px] shrink-0 flex-col rounded-md border border-l-4 bg-white p-2.5 shadow-sm transition hover:shadow-md ${
                    active?.deal.id === deal.id ? "border-iris-300 ring-1 ring-iris-200" : "border-charcoal-200"
                  }`}
                  style={{ borderLeftColor: row.color }}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <p className="min-w-0 truncate text-sm font-semibold text-charcoal-900">{deal.name}</p>
                    <span className="shrink-0 text-xs font-bold text-iris-600">{formatCurrencyShort(deal.amount)}</span>
                  </div>
                  <p className="truncate text-xs text-charcoal-500">{deal.accountName}</p>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-charcoal-500">
                    <span className="truncate font-medium tracking-wide text-charcoal-500">{dealOppCode(deal)}</span>
                    {deal.closeDate ? <span className="shrink-0">{shortDate(new Date(deal.closeDate))}</span> : null}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Side detail panel: sits to the right of the row instead of covering
            the cards, so scrolling and clicking other deals keeps working. */}
        {active ? (
          <Link
            href={`/accounts/${active.opp.id}`}
            className="hidden w-[340px] shrink-0 flex-col justify-center gap-2 border-l-2 bg-charcoal-50/60 px-4 py-2.5 lg:flex"
            style={{ borderLeftColor: row.color, animation: "carousel-from-right 180ms ease-out" }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-semibold text-charcoal-900">{active.deal.name}</p>
              <span className="shrink-0 text-xs font-bold text-iris-600">{formatCurrencyShort(active.deal.amount)}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs">
              <DetailStat label="Stage" value={active.opp.stage} />
              <DetailStat label="Probability" value={`${active.opp.probability}%`} accent />
              <DetailStat label="Close" value={active.opp.closeQuarter} />
              <DetailStat label="Tech Close" value={active.opp.technicalCloseStatus} />
              <DetailStat label="Sim ARR" value={formatCurrencyShort(active.opp.arr)} />
              <DetailStat label="Fit" value={active.opp.fit} />
              <DetailStat label="Meetings" value={String(active.opp.meetings)} />
              <DetailStat label="Emails" value={String(active.opp.emails)} />
            </div>
            <p className="min-w-0 truncate border-t border-charcoal-200 pt-1.5 text-xs">
              <span className="text-charcoal-500">Next: </span>
              <span className="font-semibold text-charcoal-800">{active.opp.nextAction}</span>
            </p>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function PipelineRows({ deals, query = "" }: { deals: PipelineDeal[]; query?: string }) {
  const [period, setPeriod] = useState<Period>("quarter");

  const now = useMemo(() => new Date(), []);

  const filtered = useMemo(() => {
    let range: { start: Date; end: Date } | null = null;
    if (period === "quarter") range = fiscalQuarterBounds(now);
    else if (period === "fy") range = fiscalYearBounds(now);

    const needle = query.trim().toLowerCase();

    return deals.filter((deal) => {
      if (needle) {
        const haystack = [deal.accountName, deal.name, dealOppCode(deal), deal.stage, deal.latestSignal ?? ""]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (!range) return true;
      if (!deal.closeDate) return false;
      const close = new Date(deal.closeDate);
      return close >= range.start && close < range.end;
    });
  }, [deals, period, now, query]);

  const totalAmount = filtered.reduce((sum, deal) => sum + deal.amount, 0);
  const closedAmount = filtered.filter((deal) => deal.isClosed).reduce((sum, deal) => sum + deal.amount, 0);

  const statusBars = useMemo(
    () =>
      ROWS.map((row) => ({
        key: row.key,
        label: row.label,
        color: row.color,
        value: filtered.filter((deal) => rowKey(deal) === row.key).reduce((sum, deal) => sum + deal.amount, 0),
      })),
    [filtered],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex shrink-0 rounded-lg border border-charcoal-200 bg-charcoal-50 p-0.5">
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
                period === option.key ? "bg-iris-500 text-white shadow-sm" : "bg-transparent text-charcoal-600 hover:bg-iris-50"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="order-last w-full min-w-[280px] flex-1 lg:order-none lg:w-auto">
          <PipelineStatusChart bars={statusBars} />
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

      <div className="space-y-2">
        {ROWS.map((row) => (
          <PipelineRow key={row.key} row={row} deals={filtered.filter((deal) => rowKey(deal) === row.key)} />
        ))}
      </div>
    </div>
  );
}
