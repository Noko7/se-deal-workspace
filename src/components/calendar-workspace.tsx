"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarWeekView } from "@/components/calendar-week-view";
import { MeetingDetailPanel } from "@/components/meeting-detail-panel";
import { detectTimeZone, type CalendarMeeting } from "@/lib/calendar";

export function CalendarWorkspace({ meetings }: { meetings: CalendarMeeting[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Start at UTC for a stable SSR/first-paint, then snap to the viewer's zone
  // once we're on the client (avoids a hydration mismatch on the <select>).
  const [timeZone, setTimeZone] = useState<string>("UTC");

  useEffect(() => {
    // The viewer's IANA zone is only knowable on the client; detecting it in an
    // initializer would desync SSR/hydration, so we snap to it right after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimeZone(detectTimeZone());
  }, []);

  const selected = useMemo(
    () => meetings.find((meeting) => meeting.id === selectedId) ?? null,
    [meetings, selectedId],
  );

  return (
    <>
      <CalendarWeekView
        meetings={meetings}
        timeZone={timeZone}
        onTimeZoneChange={setTimeZone}
        selectedMeetingId={selectedId}
        onSelectMeeting={setSelectedId}
      />
      <MeetingDetailPanel meeting={selected} timeZone={timeZone} onClose={() => setSelectedId(null)} />
    </>
  );
}
