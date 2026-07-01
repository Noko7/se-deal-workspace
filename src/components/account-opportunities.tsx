"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { OpportunityDetail } from "@/components/opportunity-detail";
import { StatusPill } from "@/components/ui";
import type { OpportunityDetailView } from "@/lib/opportunity-detail";

function fmtCloseDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Every opportunity on the account as a collapsible deal workspace: a compact
// Salesforce-style summary row that expands into the full per-opp workspace
// (overview, notes, activity, contacts, attachments) inline — no separate page.
export function AccountOpportunities({
  opps,
  defaultOpenId,
}: {
  opps: OpportunityDetailView[];
  defaultOpenId?: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    defaultOpenId ? { [defaultOpenId]: true } : {},
  );
  const toggle = (id: string) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  // Open opps first (soonest close date first), then closed (most recent first).
  const sorted = [...opps].sort((a, b) => {
    const aClosed = a.stage.startsWith("Closed");
    const bClosed = b.stage.startsWith("Closed");
    if (aClosed !== bClosed) return aClosed ? 1 : -1;
    const at = a.closeDate ? new Date(a.closeDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bt = b.closeDate ? new Date(b.closeDate).getTime() : Number.MAX_SAFE_INTEGER;
    return aClosed ? bt - at : at - bt;
  });

  return (
    <div className="space-y-3">
      {sorted.map((opp) => {
        const isOpen = Boolean(open[opp.id]);
        const closedWon = opp.stage === "Closed Won";
        const closedLost = opp.stage === "Closed Lost";
        return (
          <div
            key={opp.id}
            className={`rounded-xl border bg-white shadow-sm transition ${
              isOpen ? "border-iris-300 ring-1 ring-iris-200" : "border-charcoal-200 hover:border-iris-300"
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(opp.id)}
              aria-expanded={isOpen}
              className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-4 py-3 text-left"
            >
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-charcoal-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-charcoal-900">{opp.dealName}</span>
                <span className="block text-xs text-charcoal-500">
                  {opp.oppId} · {opp.owner}
                </span>
              </span>
              <StatusPill tone={closedWon ? "good" : closedLost ? "neutral" : "info"}>{opp.stage}</StatusPill>
              <span className="text-xs font-medium text-charcoal-600">
                {opp.technicalCloseStatus === "-" ? "Tech close —" : `Tech close ${opp.technicalCloseStatus}%`}
              </span>
              <span className="text-sm font-semibold text-charcoal-900">${opp.amount.toLocaleString()}</span>
              <span className="text-xs text-charcoal-500">{fmtCloseDate(opp.closeDate)}</span>
            </button>
            {isOpen ? (
              <div className="border-t border-charcoal-100 px-4 pb-4 pt-3">
                <OpportunityDetail opp={opp} embedded />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
