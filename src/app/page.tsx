import { CalendarDays } from "lucide-react";
import { getDashboardData } from "@/lib/data";
import { toCalendarMeeting } from "@/lib/calendar";
import { CalendarWorkspace } from "@/components/calendar-workspace";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const { meetings } = await getDashboardData();
  const calendarMeetings = meetings.map(toCalendarMeeting);

  return (
    <div className="space-y-6">
      <Card
        title="Calendar"
        subtitle="Your week at a glance. Click any meeting to open deal context, attendees, assets, and notes."
        icon={<CalendarDays className="h-5 w-5" />}
      >
        <CalendarWorkspace meetings={calendarMeetings} />
      </Card>
    </div>
  );
}
