"use client";

import { useState } from "react";
import { KanbanSquare, List } from "lucide-react";
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

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg border border-charcoal-200 bg-charcoal-50 p-0.5">
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

      {view === "pipeline" ? <PipelineRows deals={pipelineDeals} /> : <AccountsExplorer accounts={accounts} />}
    </div>
  );
}
