"use client";

import { useState } from "react";
import { KanbanSquare, List, Search } from "lucide-react";
import { AccountsExplorer, type AccountOverview } from "@/components/accounts-explorer";
import { PipelineRows, type PipelineDeal } from "@/components/pipeline-rows";

type View = "pipeline" | "list";

export function AccountsWorkspace({
  pipelineDeals,
  accounts,
}: {
  pipelineDeals: PipelineDeal[];
  accounts: AccountOverview[];
}) {
  const [view, setView] = useState<View>("pipeline");
  const [query, setQuery] = useState("");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex shrink-0 rounded-lg border border-charcoal-200 bg-charcoal-50 p-0.5">
          <button
            type="button"
            onClick={() => setView("pipeline")}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              view === "pipeline" ? "bg-iris-500 text-white shadow-sm" : "bg-transparent text-charcoal-600 hover:bg-iris-50"
            }`}
          >
            <KanbanSquare className="h-4 w-4" /> Pipeline
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              view === "list" ? "bg-iris-500 text-white shadow-sm" : "bg-transparent text-charcoal-600 hover:bg-iris-50"
            }`}
          >
            <List className="h-4 w-4" /> All Accounts (A–Z)
          </button>
        </div>

        <label className="relative block min-w-[200px] flex-1">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-iris-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by account, deal, owner, or signal"
            className="w-full pl-9"
          />
        </label>
      </div>

      {view === "pipeline" ? (
        <PipelineRows deals={pipelineDeals} query={query} />
      ) : (
        <AccountsExplorer accounts={accounts} query={query} />
      )}
    </div>
  );
}
