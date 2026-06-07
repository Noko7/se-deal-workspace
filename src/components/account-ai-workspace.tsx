"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarRange,
  Check,
  ChevronDown,
  ExternalLink,
  Globe,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { AccountChat } from "@/components/account-chat";
import { AccountBrainPanel } from "@/components/account-brain-panel";
import { MeetingCarousel } from "@/components/meeting-carousel";
import { MeetingDetailPanel } from "@/components/meeting-detail-panel";
import { StatusPill } from "@/components/ui";
import { detectTimeZone, type CalendarMeeting } from "@/lib/calendar";
import type { BrainSummary } from "@/lib/account-ai";

export type AccountOption = {
  id: string;
  accountName: string;
  dealName: string;
  stage: string;
  owner: string;
  nextAction: string;
  latestSignal: string | null;
};

type Scope = "all" | string;

function AccountSelector({
  accounts,
  selected,
  onSelect,
}: {
  accounts: AccountOption[];
  selected: Scope;
  onSelect: (scope: Scope) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const label = selected === "all" ? "My Accounts" : accounts.find((a) => a.id === selected)?.accountName ?? "Account";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) => a.accountName.toLowerCase().includes(q) || a.dealName.toLowerCase().includes(q),
    );
  }, [accounts, query]);

  const choose = (scope: Scope) => {
    onSelect(scope);
    setOpen(false);
    setQuery("");
  };

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex max-w-[16rem] items-center gap-1 rounded-md border border-iris-200 bg-white px-2 py-1 text-sm font-semibold text-iris-700 transition hover:bg-iris-50"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent p-0"
          />
          <div className="absolute left-0 z-50 mt-1 w-80 max-w-[80vw] overflow-hidden rounded-lg border border-charcoal-200 bg-white shadow-lg">
            <div className="flex items-center gap-2 border-b border-charcoal-100 px-2.5 py-2">
              <Search className="h-4 w-4 shrink-0 text-charcoal-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search accounts…"
                className="w-full border-0 p-0 text-sm focus:ring-0"
              />
            </div>
            <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
              <li>
                <button
                  type="button"
                  onClick={() => choose("all")}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-iris-50"
                >
                  <span className="font-semibold text-charcoal-900">My Accounts</span>
                  {selected === "all" ? <Check className="h-4 w-4 text-iris-600" /> : null}
                </button>
              </li>
              {filtered.map((account) => (
                <li key={account.id}>
                  <button
                    type="button"
                    onClick={() => choose(account.id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-iris-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-charcoal-900">{account.accountName}</span>
                      <span className="block truncate text-xs text-charcoal-500">
                        {account.dealName} · {account.stage}
                      </span>
                    </span>
                    {selected === account.id ? <Check className="h-4 w-4 shrink-0 text-iris-600" /> : null}
                  </button>
                </li>
              ))}
              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-sm text-charcoal-400">No accounts match “{query}”.</li>
              ) : null}
            </ul>
          </div>
        </>
      ) : null}
    </span>
  );
}

export function AccountAiWorkspace({
  accounts,
  meetings,
  aggregate,
}: {
  accounts: AccountOption[];
  meetings: CalendarMeeting[];
  aggregate: { accountCount: number; meetingCount: number; noteCount: number; assetCount: number };
}) {
  const [selected, setSelected] = useState<Scope>("all");
  const [timeZone, setTimeZone] = useState("UTC");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [brainOpen, setBrainOpen] = useState(false);
  const [brainSummary, setBrainSummary] = useState<BrainSummary | null>(null);
  const [brainLoading, setBrainLoading] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimeZone(detectTimeZone());
  }, []);

  // Lazily load the selected account's brain summary (counts + grouped items).
  useEffect(() => {
    if (selected === "all") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBrainSummary(null);
      return;
    }
    let cancelled = false;
    setBrainSummary(null);
    setBrainLoading(true);
    fetch(`/api/account-brain?dealId=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((d: { ok: boolean; summary?: BrainSummary }) => {
        if (!cancelled && d.ok && d.summary) setBrainSummary(d.summary);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setBrainLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const selectedAccount = useMemo(
    () => (selected === "all" ? null : accounts.find((a) => a.id === selected) ?? null),
    [accounts, selected],
  );

  const filteredMeetings = useMemo(
    () => (selected === "all" ? meetings : meetings.filter((m) => m.deal.id === selected)),
    [meetings, selected],
  );

  const selectedMeeting = useMemo(
    () => meetings.find((m) => m.id === selectedMeetingId) ?? null,
    [meetings, selectedMeetingId],
  );

  const isAll = selected === "all";

  const { description, suggestions, placeholder } = useMemo(() => {
    if (isAll) {
      return {
        description: `Account-AI knows your whole portfolio — ${aggregate.accountCount} accounts, ${aggregate.meetingCount} meetings, ${aggregate.noteCount} notes, and ${aggregate.assetCount} documents. Pick an account above to focus, or ask across all of them.`,
        suggestions: [
          "What is the most important account for me to approach this week?",
          "Which of my deals look at risk, and why?",
          "Summarize what's on my calendar across all accounts this week.",
        ],
        placeholder: "Ask Account-AI about all your accounts…",
      };
    }
    const name = selectedAccount?.accountName ?? "this account";
    const counts = brainSummary
      ? `${brainSummary.meetingCount} meetings, ${brainSummary.noteCount} notes, and ${brainSummary.assetCount} documents`
      : `${filteredMeetings.length} meetings`;
    return {
      description: `Account-AI is trained on ${name}'s knowledge base — ${counts} for this account only.`,
      suggestions: [
        "Summarize where this deal stands and the top technical risks.",
        "Draft discovery questions for our next meeting.",
        "What objections should I prepare for, and how do I counter them?",
      ],
      placeholder: `Ask Account-AI about ${name}…`,
    };
  }, [isAll, aggregate, selectedAccount, brainSummary, filteredMeetings.length]);

  const insightsUrl = selectedAccount
    ? `https://insights.nutanix.com/?account=${encodeURIComponent(selectedAccount.accountName)}`
    : "#";

  const header = (
    <>
      <div className="border-b border-charcoal-200 bg-gradient-to-r from-iris-50 to-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Sparkles className="h-5 w-5 text-iris-600" />
          <span className="font-semibold text-charcoal-900">Ask Account-AI anything about</span>
          <AccountSelector accounts={accounts} selected={selected} onSelect={setSelected} />
        </div>
        {selectedAccount ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-charcoal-600">
            <StatusPill tone="info">{selectedAccount.stage}</StatusPill>
            <span className="text-charcoal-500">{selectedAccount.dealName}</span>
            <span>
              <span className="font-semibold text-charcoal-800">Next:</span> {selectedAccount.nextAction}
            </span>
            {selectedAccount.latestSignal ? (
              <span>
                <span className="font-semibold text-charcoal-800">Signal:</span> {selectedAccount.latestSignal}
              </span>
            ) : null}
            <a
              href={insightsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-charcoal-300 bg-white px-2 py-0.5 font-medium text-charcoal-800 hover:bg-charcoal-50"
            >
              <Globe className="h-3.5 w-3.5" /> Open in Insights <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ) : null}
      </div>

      <div className="border-b border-charcoal-200 px-4 py-3">
        <div className="mb-2.5 flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-iris-600" />
          <h3 className="text-xs font-semibold text-charcoal-900">
            {isAll ? "Upcoming & past meetings" : `Meetings with ${selectedAccount?.accountName ?? "this account"}`}
          </h3>
          <span className="text-[11px] text-charcoal-500">synced from Outlook</span>
        </div>
        <MeetingCarousel meetings={filteredMeetings} timeZone={timeZone} onSelectMeeting={setSelectedMeetingId} />
      </div>
    </>
  );

  return (
    <>
      <div className="h-[calc(100dvh-9rem)] min-h-[34rem]">
        <AccountChat
          scope={selected}
          header={header}
          placeholder={placeholder}
          emptyDescription={description}
          suggestions={suggestions}
          showBrain={!isAll}
          onBrainOpen={() => setBrainOpen(true)}
        />
      </div>

      <MeetingDetailPanel meeting={selectedMeeting} timeZone={timeZone} onClose={() => setSelectedMeetingId(null)} />

      {!isAll && brainSummary ? (
        <AccountBrainPanel
          open={brainOpen}
          onClose={() => setBrainOpen(false)}
          summary={brainSummary}
          dealId={selected}
        />
      ) : null}

      {!isAll && brainOpen && !brainSummary ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal-900/30" onClick={() => setBrainOpen(false)}>
          <div className="flex items-center gap-2 rounded-lg bg-white px-4 py-3 text-sm text-charcoal-600 shadow-xl">
            <Loader2 className="h-4 w-4 animate-spin text-iris-600" />
            {brainLoading ? "Loading knowledge base…" : "No knowledge base available."}
          </div>
        </div>
      ) : null}
    </>
  );
}
