import type { ReactNode } from "react";
import { ActionBar, StatusPill } from "@/components/ui";
import type { Opportunity } from "@/lib/opportunity";

// The Salesforce-style opportunity card body, shared between the Current Deals
// page (with action buttons) and the Pipeline hover preview (no actions).
export function OpportunityCard({
  opp,
  actions,
  hideNotePolicy = false,
}: {
  opp: Opportunity;
  actions?: ReactNode;
  hideNotePolicy?: boolean;
}) {
  return (
    <div className="rounded-lg border border-charcoal-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-500">{opp.oppId}</p>
          <h3 className="text-sm font-semibold text-charcoal-900">{opp.opportunityName}</h3>
          <p className="text-xs text-charcoal-500">Account: {opp.accountName}</p>
        </div>
        {hideNotePolicy ? null : (
          <StatusPill tone={opp.notePolicy === "implementation-only" ? "info" : "neutral"}>
            {opp.notePolicy === "implementation-only" ? "Implementation Notes Only" : "Regular Notes"}
          </StatusPill>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-charcoal-600">
        <p>
          Stage: <span className="font-semibold text-charcoal-800">{opp.stage}</span>
        </p>
        <p>
          Probability: <span className="font-semibold text-iris-600">{opp.probability}%</span>
        </p>
        <p>
          Amount: <span className="font-semibold text-charcoal-800">${opp.amount.toLocaleString()}</span>
        </p>
        <p>
          Sim ARR: <span className="font-semibold text-charcoal-800">${opp.arr.toLocaleString()}</span>
        </p>
        <p>
          Close: <span className="font-semibold text-charcoal-800">{opp.closeQuarter}</span>
        </p>
        <p>
          Owner: <span className="font-semibold text-charcoal-800">{opp.owner}</span>
        </p>
        <p>
          Technical Fit: <span className="font-semibold text-charcoal-800">{opp.fit}</span>
        </p>
        <p>
          Tech Close: <span className="font-semibold text-charcoal-800">{opp.technicalCloseStatus}</span>
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        <StatusPill tone="neutral">Meetings: {opp.meetings}</StatusPill>
        <StatusPill tone="neutral">Emails: {opp.emails}</StatusPill>
        <StatusPill tone="neutral">AI Recs: {opp.recommendations}</StatusPill>
      </div>

      <p className="mt-3 text-xs text-charcoal-600">
        Next Action: <span className="font-medium text-charcoal-800">{opp.nextAction}</span>
      </p>
      {opp.latestSignal ? (
        <p className="mt-1 text-xs text-charcoal-500">Latest signal: {opp.latestSignal}</p>
      ) : null}

      {actions ? <ActionBar>{actions}</ActionBar> : null}
    </div>
  );
}
