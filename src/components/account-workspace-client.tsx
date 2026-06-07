"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, ExternalLink, Globe, Sparkles } from "lucide-react";
import { AccountChat } from "@/components/account-chat";
import { MeetingCarousel } from "@/components/meeting-carousel";
import { MeetingDetailPanel } from "@/components/meeting-detail-panel";
import { StatusPill } from "@/components/ui";
import { detectTimeZone, type CalendarMeeting } from "@/lib/calendar";
import type { BrainSummary } from "@/lib/account-ai";

export function AccountWorkspaceClient({
  dealId,
  accountName,
  dealName,
  stage,
  owner,
  nextAction,
  latestSignal,
  meetings,
  summary,
}: {
  dealId: string;
  accountName: string;
  dealName: string;
  stage: string;
  owner: string;
  nextAction: string;
  latestSignal: string | null;
  meetings: CalendarMeeting[];
  summary: BrainSummary;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeZone, setTimeZone] = useState("UTC");

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
      <div className="border-b border-charcoal-200 bg-gradient-to-r from-iris-50 to-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-iris-500 text-white">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-charcoal-900">Account-AI · {accountName}</h2>
                <StatusPill tone="info">{stage}</StatusPill>
              </div>
              <p className="truncate text-xs text-charcoal-500">
                {dealName} · Owner {owner}
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
        <p className="mt-2 line-clamp-1 text-xs text-charcoal-600">
          <span className="font-semibold text-charcoal-800">Next:</span> {nextAction}
          {latestSignal ? (
            <span className="text-charcoal-500">
              {"  ·  "}
              <span className="font-semibold text-charcoal-800">Signal:</span> {latestSignal}
            </span>
          ) : null}
        </p>
      </div>

      <div className="border-b border-charcoal-200 px-4 py-3">
        <div className="mb-2.5 flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-iris-600" />
          <h3 className="text-xs font-semibold text-charcoal-900">Meetings with {accountName}</h3>
          <span className="text-[11px] text-charcoal-500">synced from Outlook</span>
        </div>
        <MeetingCarousel meetings={meetings} timeZone={timeZone} onSelectMeeting={setSelectedId} />
      </div>
    </>
  );

  return (
    <>
      <div className="h-[calc(100dvh-9rem)] min-h-[34rem]">
        <AccountChat dealId={dealId} accountName={accountName} summary={summary} header={header} />
      </div>

      <MeetingDetailPanel meeting={selected} timeZone={timeZone} onClose={() => setSelectedId(null)} />
    </>
  );
}
