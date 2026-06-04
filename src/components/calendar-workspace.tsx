"use client";

import { useMemo, useState } from "react";
import { CalendarWeekView } from "@/components/calendar-week-view";
import { MeetingDetailPanel } from "@/components/meeting-detail-panel";
import type { CalendarMeeting } from "@/lib/calendar";

export function CalendarWorkspace({ meetings }: { meetings: CalendarMeeting[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => meetings.find((meeting) => meeting.id === selectedId) ?? null,
    [meetings, selectedId],
  );

  return (
    <>
      <CalendarWeekView
        meetings={meetings}
        selectedMeetingId={selectedId}
        onSelectMeeting={setSelectedId}
      />
      <MeetingDetailPanel meeting={selected} onClose={() => setSelectedId(null)} />
    </>
  );
}
