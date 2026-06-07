"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { AccountChat } from "@/components/account-chat";
import { MeetingCarousel } from "@/components/meeting-carousel";
import { MeetingDetailPanel } from "@/components/meeting-detail-panel";
import { detectTimeZone, type CalendarMeeting } from "@/lib/calendar";
import type { BrainSummary } from "@/lib/account-ai";

export function AccountWorkspaceClient({
  dealId,
  accountName,
  meetings,
  summary,
}: {
  dealId: string;
  accountName: string;
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

  return (
    <>
      <div className="flex min-h-[34rem] flex-col gap-4 lg:h-[calc(100vh-12rem)]">
        {/* Meeting carousel */}
        <section className="shrink-0 overflow-hidden rounded-xl border border-charcoal-200 border-t-4 border-t-iris-500 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-iris-600" />
            <h2 className="text-sm font-semibold text-charcoal-900">Meetings with {accountName}</h2>
            <span className="text-xs text-charcoal-500">synced from Outlook</span>
          </div>
          <MeetingCarousel meetings={meetings} timeZone={timeZone} onSelectMeeting={setSelectedId} />
        </section>

        {/* Account-AI chatbot fills the rest of the screen */}
        <div className="min-h-[28rem] flex-1">
          <AccountChat dealId={dealId} accountName={accountName} summary={summary} />
        </div>
      </div>

      <MeetingDetailPanel meeting={selected} timeZone={timeZone} onClose={() => setSelectedId(null)} />
    </>
  );
}
