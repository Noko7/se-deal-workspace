import {
  detectMeetingPlatform,
  parseAttendees,
  type Attendee,
  type MeetingPlatform,
} from "@/lib/meeting";

export type CalendarAsset = {
  id: string;
  type: string;
  title: string;
  sourceTool: string;
  previewImageUri: string | null;
  previewStatus: "READY" | "PENDING" | "FAILED";
};

export type CalendarNote = {
  id: string;
  role: "SE" | "AE" | "SAM";
  author: string;
  body: string;
  createdAt: string;
};

export type CalendarMeeting = {
  id: string;
  subject: string;
  organizer: string;
  /** ISO start/end so the data can cross the server -> client boundary safely. */
  start: string;
  end: string;
  joinUrl: string | null;
  location: string | null;
  platform: MeetingPlatform | null;
  attendees: Attendee[];
  deal: { id: string; name: string; accountName: string; stage: string };
  assets: CalendarAsset[];
  notes: CalendarNote[];
};

/** Loose shape of the Prisma meeting (with relations) we serialize from. */
type MeetingRecord = {
  id: string;
  subject: string;
  organizer: string;
  startTime: Date;
  endTime: Date;
  attendeesJson: string | null;
  joinUrl: string | null;
  location: string | null;
  deal: { id: string; name: string; accountName: string; stage: string };
  assets: {
    id: string;
    type: string;
    title: string;
    sourceTool: string;
    previewImageUri: string | null;
    previewStatus: string;
  }[];
  notes: { id: string; role: string; author: string; body: string; createdAt: Date }[];
};

/**
 * Convert a Prisma meeting (with deal/assets/notes) into a plain, client-safe
 * shape: ISO date strings, pre-parsed attendees, and a detected platform.
 */
export function toCalendarMeeting(meeting: MeetingRecord): CalendarMeeting {
  return {
    id: meeting.id,
    subject: meeting.subject,
    organizer: meeting.organizer,
    start: meeting.startTime.toISOString(),
    end: meeting.endTime.toISOString(),
    joinUrl: meeting.joinUrl,
    location: meeting.location,
    platform: detectMeetingPlatform(meeting.joinUrl),
    attendees: parseAttendees(meeting.attendeesJson),
    deal: meeting.deal,
    assets: meeting.assets.map((asset) => ({
      id: asset.id,
      type: asset.type,
      title: asset.title,
      sourceTool: asset.sourceTool,
      previewImageUri: asset.previewImageUri,
      previewStatus: asset.previewStatus as CalendarAsset["previewStatus"],
    })),
    notes: meeting.notes.map((note) => ({
      id: note.id,
      role: note.role as CalendarNote["role"],
      author: note.author,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
    })),
  };
}

// --- Week / time-grid math -------------------------------------------------

export const HOUR_PX = 56; // pixel height of one hour row
export const DEFAULT_START_HOUR = 7;
export const DEFAULT_END_HOUR = 20;

/** Midnight of the Sunday that starts the week containing `date` (local time). */
export function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - result.getDay());
  result.setHours(0, 0, 0, 0);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** The seven local-midnight Date objects for the week starting at `weekStart`. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Minutes since local midnight for a date. */
export function minutesIntoDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** "May 31 - Jun 6, 2026" style label for the visible week. */
export function weekRangeLabel(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const left = `${month(weekStart)} ${weekStart.getDate()}`;
  const right = sameMonth ? `${weekEnd.getDate()}` : `${month(weekEnd)} ${weekEnd.getDate()}`;
  return `${left} - ${right}, ${weekEnd.getFullYear()}`;
}

/**
 * Compute the hour range to render. Defaults to business hours but expands so no
 * event is ever clipped, regardless of how early/late meetings land.
 */
export function hourRangeForMeetings(
  meetings: { start: string; end: string }[],
): { startHour: number; endHour: number } {
  let startHour = DEFAULT_START_HOUR;
  let endHour = DEFAULT_END_HOUR;
  for (const meeting of meetings) {
    const start = new Date(meeting.start);
    const end = new Date(meeting.end);
    startHour = Math.min(startHour, start.getHours());
    // Round the end hour up so a meeting ending at 8:30 still fits.
    const endMinutes = end.getHours() * 60 + end.getMinutes();
    endHour = Math.max(endHour, Math.ceil(endMinutes / 60));
  }
  return { startHour: Math.max(0, startHour), endHour: Math.min(24, Math.max(endHour, startHour + 1)) };
}

// --- View modes (Day / Three Day / Work Week / Week / Month) ---------------

export type CalendarView = "day" | "three" | "workweek" | "week" | "month";

export const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "three", label: "Three Day" },
  { value: "workweek", label: "Work Week" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

/** Local midnight of `date`. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/** The day columns shown for a time-grid view (everything except month). */
export function viewDays(view: CalendarView, anchor: Date): Date[] {
  const base = startOfDay(anchor);
  switch (view) {
    case "day":
      return [base];
    case "three":
      return [0, 1, 2].map((i) => addDays(base, i));
    case "workweek": {
      const monday = addDays(startOfWeek(base), 1);
      return Array.from({ length: 5 }, (_, i) => addDays(monday, i));
    }
    case "week":
    default:
      return weekDays(startOfWeek(base));
  }
}

/** Number of days to step when navigating prev/next for a view. */
export function viewStepDays(view: CalendarView): number {
  if (view === "day") return 1;
  if (view === "three") return 3;
  return 7; // workweek / week
}

/** The 42 days (6 weeks, Sun-start) covering the month containing `anchor`. */
export function monthMatrix(anchor: Date): Date[] {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

function monthShort(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short" });
}

/** Header label for the current view + anchor. */
export function viewRangeLabel(view: CalendarView, anchor: Date): string {
  if (view === "month") {
    return anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  if (view === "day") {
    return anchor.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  const days = viewDays(view, anchor);
  const first = days[0];
  const last = days[days.length - 1];
  const sameMonth = first.getMonth() === last.getMonth();
  const left = `${monthShort(first)} ${first.getDate()}`;
  const right = sameMonth ? `${last.getDate()}` : `${monthShort(last)} ${last.getDate()}`;
  return `${left} - ${right}, ${last.getFullYear()}`;
}

export type PositionedEvent<T> = {
  event: T;
  /** vertical offset + height in px */
  top: number;
  height: number;
  /** horizontal lane placement, as percentages */
  leftPct: number;
  widthPct: number;
};

/**
 * Lay out a single day's events. Overlapping meetings are split into side-by-side
 * lanes (interval partitioning) so nothing is hidden behind another event.
 */
export function layoutDayEvents<T extends { start: string; end: string }>(
  events: T[],
  startHour: number,
): PositionedEvent<T>[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  // Group into clusters of transitively-overlapping events.
  const clusters: T[][] = [];
  let current: T[] = [];
  let clusterEnd = -Infinity;
  for (const event of sorted) {
    const startMs = new Date(event.start).getTime();
    const endMs = new Date(event.end).getTime();
    if (current.length === 0 || startMs < clusterEnd) {
      current.push(event);
      clusterEnd = Math.max(clusterEnd, endMs);
    } else {
      clusters.push(current);
      current = [event];
      clusterEnd = endMs;
    }
  }
  if (current.length) clusters.push(current);

  const positioned: PositionedEvent<T>[] = [];
  const rangeStartMin = startHour * 60;

  for (const cluster of clusters) {
    // Assign each event to the first lane whose latest event has already ended.
    const laneEnds: number[] = [];
    const laneOf = new Map<T, number>();
    for (const event of cluster) {
      const startMs = new Date(event.start).getTime();
      const endMs = new Date(event.end).getTime();
      let lane = laneEnds.findIndex((end) => end <= startMs);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(endMs);
      } else {
        laneEnds[lane] = endMs;
      }
      laneOf.set(event, lane);
    }
    const laneCount = laneEnds.length;

    for (const event of cluster) {
      const start = new Date(event.start);
      const end = new Date(event.end);
      const startMin = minutesIntoDay(start);
      const endMin = Math.max(minutesIntoDay(end), startMin + 15); // floor height
      const lane = laneOf.get(event) ?? 0;
      const widthPct = 100 / laneCount;
      positioned.push({
        event,
        top: ((startMin - rangeStartMin) / 60) * HOUR_PX,
        height: ((endMin - startMin) / 60) * HOUR_PX,
        leftPct: lane * widthPct,
        widthPct,
      });
    }
  }

  return positioned;
}
