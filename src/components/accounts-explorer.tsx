"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CalendarClock, FileText, Presentation, Search, StickyNote } from "lucide-react";
import { relativeDay, shortDate } from "@/lib/format";
import { EmptyState, StatusPill } from "@/components/ui";

export type AccountOverview = {
  id: string;
  name: string;
  accountName: string;
  stage: string;
  owner: string;
  nextAction: string;
  latestSignal: string | null;
  meetingCount: number;
  upcomingMeetingCount: number;
  noteCount: number;
  assetCount: number;
  presentationCount: number;
  whiteboardCount: number;
  nextMeetingAt: string | null;
  lastActivityAt: string;
};

type SortKey = "recent" | "name" | "upcoming";

const STAGE_ORDER = ["Discovery", "Design", "Validation"];

export function AccountsExplorer({ accounts }: { accounts: AccountOverview[] }) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const stages = useMemo(() => {
    const found = Array.from(new Set(accounts.map((account) => account.stage)));
    const ordered = STAGE_ORDER.filter((value) => found.includes(value));
    const extra = found.filter((value) => !STAGE_ORDER.includes(value)).sort();
    return [...ordered, ...extra];
  }, [accounts]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = accounts.filter((account) => {
      if (stage !== "all" && account.stage !== stage) return false;
      if (!needle) return true;
      return [account.accountName, account.name, account.owner, account.stage, account.latestSignal ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    const sorted = [...matches].sort((a, b) => {
      if (sort === "name") return a.accountName.localeCompare(b.accountName);
      if (sort === "upcoming") {
        const aTime = a.nextMeetingAt ? new Date(a.nextMeetingAt).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.nextMeetingAt ? new Date(b.nextMeetingAt).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      }
      return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
    });

    return sorted;
  }, [accounts, query, stage, sort]);

  const visibleStages = (stage === "all" ? stages : [stage]).filter((value) =>
    filtered.some((account) => account.stage === value),
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-lg border border-charcoal-200 bg-charcoal-50 p-3 md:grid-cols-[1fr_auto_auto]">
        <label className="relative block">
          <span className="sr-only">Search accounts</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-iris-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by account, deal, owner, or signal"
            className="w-full pl-9"
          />
        </label>
        <div className="flex items-center gap-2">
          <label htmlFor="stage-filter" className="whitespace-nowrap">
            Stage
          </label>
          <select id="stage-filter" value={stage} onChange={(event) => setStage(event.target.value)}>
            <option value="all">All stages</option>
            {stages.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sort-filter" className="whitespace-nowrap">
            Sort
          </label>
          <select id="sort-filter" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
            <option value="recent">Recent activity</option>
            <option value="name">Account name</option>
            <option value="upcoming">Upcoming meeting</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-charcoal-500">
        Showing {filtered.length} of {accounts.length} accounts
      </p>

      {filtered.length === 0 ? (
        <EmptyState title="No matching accounts" description="Adjust the search text or stage filter to see more accounts." />
      ) : (
        <div className="space-y-6">
          {visibleStages.map((stageName) => {
            const stageAccounts = filtered.filter((account) => account.stage === stageName);
            return (
              <section key={stageName} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span aria-hidden className="h-5 w-1.5 rounded-full bg-iris-500" />
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-700">{stageName}</h3>
                  <StatusPill tone="info">{stageAccounts.length}</StatusPill>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {stageAccounts.map((account) => (
                    <Link
                      key={account.id}
                      href={`/accounts/${account.id}`}
                      className="group flex flex-col rounded-lg border border-charcoal-200 border-l-4 border-l-iris-400 bg-white p-4 shadow-sm transition hover:border-l-iris-600 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-charcoal-900">{account.accountName}</p>
                          <p className="truncate text-sm text-charcoal-500">{account.name}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-iris-500 transition group-hover:translate-x-0.5" />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-charcoal-600">
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5 text-iris-500" />
                          {account.meetingCount} mtg
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <StickyNote className="h-3.5 w-3.5 text-iris-500" />
                          {account.noteCount} notes
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Presentation className="h-3.5 w-3.5 text-iris-500" />
                          {account.presentationCount} decks
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5 text-iris-500" />
                          {account.assetCount} assets
                        </span>
                      </div>

                      <p className="mt-3 line-clamp-2 text-sm text-charcoal-600">
                        <span className="font-medium text-charcoal-700">Next:</span> {account.nextAction}
                      </p>

                      <div className="mt-3 flex items-center justify-between border-t border-charcoal-100 pt-2 text-xs text-charcoal-500">
                        <span>Owner: {account.owner}</span>
                        {account.nextMeetingAt ? (
                          <span className="font-medium text-iris-600">{relativeDay(new Date(account.nextMeetingAt))}</span>
                        ) : (
                          <span>Active {shortDate(new Date(account.lastActivityAt))}</span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
