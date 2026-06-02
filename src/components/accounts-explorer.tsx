"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, CalendarClock, FileText, Presentation, Search, StickyNote } from "lucide-react";
import { relativeDay, shortDate } from "@/lib/format";
import { EmptyState } from "@/components/ui";

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

export function AccountsExplorer({ accounts }: { accounts: AccountOverview[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = accounts.filter((account) => {
      if (!needle) return true;
      return [account.accountName, account.name, account.owner, account.stage, account.latestSignal ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    return [...matches].sort((a, b) => a.accountName.localeCompare(b.accountName));
  }, [accounts, query]);

  return (
    <div className="space-y-4">
      <label className="relative block max-w-md">
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

      <p className="text-xs text-charcoal-500">
        Showing {filtered.length} of {accounts.length} accounts (A–Z)
      </p>

      {filtered.length === 0 ? (
        <EmptyState title="No matching accounts" description="Adjust the search text to see more accounts." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((account) => (
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
      )}
    </div>
  );
}
