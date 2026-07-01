"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, ChevronDown, ChevronUp, ExternalLink, Globe, Loader2 } from "lucide-react";
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
  aiOptOut: boolean;
};

type Scope = "all" | string;

export function AccountAiWorkspace({
  accounts,
  meetings,
  aggregate,
  initialSelected,
}: {
  accounts: AccountOption[];
  meetings: CalendarMeeting[];
  aggregate: { accountCount: number; meetingCount: number; noteCount: number; assetCount: number };
  initialSelected?: string;
}) {
  const [selected, setSelected] = useState<Scope>(initialSelected ?? "all");
  const [timeZone, setTimeZone] = useState("UTC");
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [brainOpen, setBrainOpen] = useState(false);
  const [brainSummary, setBrainSummary] = useState<BrainSummary | null>(null);
  const [brainLoading, setBrainLoading] = useState(false);
  const [meetingsCollapsed, setMeetingsCollapsed] = useState(false);
  // Bumped whenever an account is selected; restarts the scroll-down pulse.
  const [pulseToken, setPulseToken] = useState(0);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimeZone(detectTimeZone());
  }, []);

  // Pulse the scroll-down affordance whenever a specific account becomes active
  // (via the dropdown or a deep-link from My Accounts).
  useEffect(() => {
    if (selected === "all") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPulseToken((t) => t + 1);
  }, [selected]);

  const scrollToDetails = () => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

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
  const locked = Boolean(selectedAccount?.aiOptOut);

  const { description, suggestions, placeholder } = useMemo(() => {
    if (isAll) {
      return {
        description: `Account-AI knows your whole portfolio — ${aggregate.accountCount} accounts, ${aggregate.meetingCount} meetings, ${aggregate.noteCount} notes, and ${aggregate.assetCount} documents. Pick an account in the prompt box below to focus, or ask across all of them.`,
        suggestions: [
          "Which 3 accounts should I focus on this week to move deals forward, and why?",
          "Which deals are at risk of slipping, and what is the single next step for each?",
          "Which accounts have an incumbent renewal coming up that I should press on?",
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
        "Get me up to speed on any open opportunities on this account and their status.",
        "What is the fastest path to close the open deals, and what is blocking each today?",
        "Summarize the latest next steps across the account and who owns them.",
        "What objections should I prepare for based on the incumbent and competitor, and how do I counter them?",
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
                </span>
                {selectedAccount ? (
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-charcoal-600">
                    {selectedAccount.aiOptOut ? <StatusPill tone="warning">AI opted out</StatusPill> : null}
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
      {/* Chat fills the viewport but leaves room for the scroll-down pill below it. */}
      <div>
        <div className="h-[calc(100dvh-10.5rem)] min-h-[28rem]">
          <AccountChat
            scope={selected}
            header={header}
            placeholder={placeholder}
            emptyDescription={description}
            suggestions={suggestions}
            showBrain={!isAll}
            allowUploads={!isAll}
            locked={locked}
            accountLabel={selectedAccount?.accountName}
            onScopeRevert={setSelected}
            onBrainOpen={() => setBrainOpen(true)}
            composerPrefix="Ask Account-AI about"
            composerLeading={
              <ComposerAccountSelector accounts={accounts} selected={selected} onSelect={setSelected} />
            }
          />
        </div>

        {/* Scroll-down affordance — same pill design as the meetings collapse toggle. */}
        <div className="flex justify-center pt-2">
          <button
            key={pulseToken}
            type="button"
            onClick={scrollToDetails}
            aria-label="Scroll down for account details"
            title="More below"
            style={pulseToken ? { animation: "pulse-iris 0.6s ease-out 3" } : undefined}
            className="flex h-6 w-14 items-center justify-center rounded-full border border-charcoal-200 bg-white text-iris-600 shadow-sm transition hover:border-iris-300 hover:bg-iris-50"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Below-the-fold account detail (built out next). Sized so the scroll-down
          action fully clears the chat window on any screen. */}
      <section ref={detailRef} id="account-details" className="min-h-[100dvh] scroll-mt-20 pt-6">
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-charcoal-200 text-sm text-charcoal-400">
          {selectedAccount ? `${selectedAccount.accountName} details` : "Account details"} coming soon.
        </div>
      </section>

      <MeetingDetailPanel meeting={selectedMeeting} timeZone={timeZone} onClose={() => setSelectedMeetingId(null)} />

      {!isAll && brainSummary ? (
        <AccountBrainPanel
          key={selected}
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
