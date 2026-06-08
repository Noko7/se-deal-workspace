"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, ChevronUp, ExternalLink, Globe, Loader2 } from "lucide-react";
import { AccountChat } from "@/components/account-chat";
import { AccountBrainPanel } from "@/components/account-brain-panel";
import { ComposerAccountSelector } from "@/components/composer-account-selector";
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
  const [meetingsCollapsed, setMeetingsCollapsed] = useState(false);

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
        description: `Account-AI knows your whole portfolio — ${aggregate.accountCount} accounts, ${aggregate.meetingCount} meetings, ${aggregate.noteCount} notes, and ${aggregate.assetCount} documents. Pick an account in the prompt box below to focus, or ask across all of them.`,
        suggestions: [
          "What is the most important account for me to approach this week?",
          "Which of my deals look at risk, and why?",
          "Summarize what's on my calendar across all accounts this week.",
        ],
        placeholder: "Ask anything across your accounts…",
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
      placeholder: `Ask anything about ${name}…`,
    };
  }, [isAll, aggregate, selectedAccount, brainSummary, filteredMeetings.length]);

  const insightsUrl = selectedAccount
    ? `https://insights.nutanix.com/?account=${encodeURIComponent(selectedAccount.accountName)}`
    : "#";

  const header = (
    <div>
      {/* Animated collapse: the grid-rows trick gives a smooth height transition. */}
      <div className="border-b border-charcoal-200 px-4">
        <div
          className={`grid overflow-hidden transition-all duration-300 ease-out ${
            meetingsCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="pt-3 pb-2">
              <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-iris-600" />
                  <h3 className="text-xs font-semibold text-charcoal-900">
                    {isAll ? "Upcoming & past meetings" : `Meetings with ${selectedAccount?.accountName ?? "this account"}`}
                  </h3>
                  <span className="text-[11px] text-charcoal-500">synced from Outlook</span>
                </span>
                {selectedAccount ? (
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-charcoal-600">
                    <StatusPill tone="info">{selectedAccount.stage}</StatusPill>
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
                  </span>
                ) : null}
              </div>
              <MeetingCarousel meetings={filteredMeetings} timeZone={timeZone} onSelectMeeting={setSelectedMeetingId} />
            </div>
          </div>
        </div>
      </div>

      {/* Collapse toggle sits just below the divider line, fully visible in both states. */}
      <div className="flex justify-center py-1">
        <button
          type="button"
          onClick={() => setMeetingsCollapsed((v) => !v)}
          aria-expanded={!meetingsCollapsed}
          aria-label={meetingsCollapsed ? "Show meetings" : "Hide meetings"}
          title={meetingsCollapsed ? "Show meetings" : "Hide meetings"}
          className="flex h-6 w-14 items-center justify-center rounded-full border border-charcoal-200 bg-white text-iris-600 shadow-sm transition hover:border-iris-300 hover:bg-iris-50"
        >
          <ChevronUp
            className={`h-4 w-4 transition-transform duration-300 ease-out ${meetingsCollapsed ? "rotate-180" : ""}`}
          />
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="h-[calc(100dvh-7rem)] min-h-[34rem]">
        <AccountChat
          scope={selected}
          header={header}
          placeholder={placeholder}
          emptyDescription={description}
          suggestions={suggestions}
          showBrain={!isAll}
          allowUploads={!isAll}
          accountLabel={selectedAccount?.accountName}
          onScopeRevert={setSelected}
          onBrainOpen={() => setBrainOpen(true)}
          composerPrefix="Ask Account-AI about"
          composerLeading={
            <ComposerAccountSelector accounts={accounts} selected={selected} onSelect={setSelected} />
          }
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
