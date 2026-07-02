"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, ExternalLink, Globe, Sparkles } from "lucide-react";
import { AccountChat } from "@/components/account-chat";
import { AccountBrainPanel } from "@/components/account-brain-panel";
import { MeetingCarousel } from "@/components/meeting-carousel";
import { MeetingDetailPanel } from "@/components/meeting-detail-panel";
import { detectTimeZone, type CalendarMeeting } from "@/lib/calendar";
import type { BrainSummary } from "@/lib/account-ai";

const ACCOUNT_SUGGESTIONS = [
  "Get me up to speed on any open opportunities on this account and their status.",
  "Summarize where the open deals stand and the top technical risks.",
  "Draft discovery questions for our next meeting.",
  "What objections should I prepare for, and how do I counter them?",
];

export function AccountWorkspaceClient({
  dealId,
  accountName,
  owner,
  opportunityCount,
  meetings,
  summary,
}: {
  dealId: string;
  accountName: string;
  owner: string;
  opportunityCount: number;
  meetings: CalendarMeeting[];
  summary: BrainSummary;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeZone, setTimeZone] = useState("UTC");
  const [brainOpen, setBrainOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimeZone(detectTimeZone());
  }, []);

  const selected = useMemo(
    () => meetings.find((meeting) => meeting.id === selectedId) ?? null,
    [meetings, selectedId],
  );

  const insightsUrl = `https://insights.nutanix.com/?account=${encodeURIComponent(accountName)}`;

  // Condensed account header + meeting carousel — rendered fixed at the top of
  // the chat box so the chatbot remains the primary, full-height surface.
  const header = (
    <>
      <div className="border-b border-charcoal-200 bg-gradient-to-r from-iris-50 to-white px-4 py-3 dark:from-iris-100 dark:to-charcoal-50">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-iris-500 text-white">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-charcoal-900">Account-AI · {accountName}</h2>
              <p className="truncate text-xs text-charcoal-500">
                {opportunityCount} {opportunityCount === 1 ? "opportunity" : "opportunities"} · Owner {owner}
              </p>
            </div>
          </div>
          <a
            href={insightsUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-charcoal-300 bg-white px-3 py-1.5 text-xs font-medium text-charcoal-800 hover:bg-charcoal-50"
          >
            <Globe className="h-3.5 w-3.5" /> Open in Insights <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <div className="border-b border-charcoal-200 px-4 py-3">
        <div className="mb-2.5 flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-iris-600" />
          <h3 className="text-xs font-semibold text-charcoal-900">Meetings with {accountName}</h3>
        </div>
        <MeetingCarousel meetings={meetings} timeZone={timeZone} onSelectMeeting={setSelectedId} />
      </div>
    </>
  );

  return (
    <>
      <div className="h-[calc(100dvh-9rem)] min-h-[34rem]">
        <AccountChat
          scope={dealId}
          header={header}
          placeholder={`Ask Account-AI about ${accountName}…`}
          emptyDescription={`Account-AI is trained on ${accountName}'s knowledge base — ${summary.meetingCount} meetings, ${summary.noteCount} notes, and ${summary.assetCount} documents for this account only.`}
          suggestions={ACCOUNT_SUGGESTIONS}
          showBrain
          allowUploads
          accountLabel={accountName}
          onBrainOpen={() => setBrainOpen(true)}
        />
      </div>

      <MeetingDetailPanel meeting={selected} timeZone={timeZone} onClose={() => setSelectedId(null)} />
      <AccountBrainPanel open={brainOpen} onClose={() => setBrainOpen(false)} summary={summary} dealId={dealId} />
    </>
  );
}
