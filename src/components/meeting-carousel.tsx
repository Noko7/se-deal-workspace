"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, CalendarX2, ChevronLeft, ChevronRight, MapPin, Users, Video } from "lucide-react";
import { meetingPlatformLabel } from "@/lib/meeting";
import { zonedNaiveISO, type CalendarMeeting } from "@/lib/calendar";

type TimelineItem =
  | { kind: "meeting"; meeting: CalendarMeeting }
  | { kind: "placeholder" };

function formatWhen(iso: string, timeZone: string): { day: string; time: string } {
  const d = new Date(zonedNaiveISO(iso, timeZone));
  return {
    day: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    time: d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: d.getMinutes() === 0 ? undefined : "2-digit",
    }),
  };
}

function relativeFromNow(iso: string): string {
  const diffDays = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 1) return `In ${diffDays} days`;
  return `${Math.abs(diffDays)} days ago`;
}

export function MeetingCarousel({
  meetings,
  timeZone,
  onSelectMeeting,
}: {
  meetings: CalendarMeeting[];
  timeZone: string;
  onSelectMeeting: (id: string) => void;
}) {
  // Pin "now" to mount time so render stays pure across re-renders.
  const [now] = useState(() => Date.now());

  // A single time-ordered timeline (ascending). The left arrow walks into the
  // past, the right arrow into the future.
  const { timeline, defaultStart, lastPast } = useMemo(() => {
    const sorted = [...meetings].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );
    const firstUpcoming = sorted.findIndex((m) => new Date(m.start).getTime() >= now);
    const hasUpcoming = firstUpcoming !== -1;
    const items: TimelineItem[] = sorted.map((meeting) => ({ kind: "meeting", meeting }));
    const past = sorted.filter((m) => new Date(m.start).getTime() < now);
    const lastPastMeeting = past.length ? past[past.length - 1] : null;
    if (!hasUpcoming) {
      // Park a "no meetings on the horizon" tile at the future end.
      items.push({ kind: "placeholder" });
    }
    return {
      timeline: items,
      defaultStart: hasUpcoming ? firstUpcoming : Math.max(0, items.length - 1),
      lastPast: lastPastMeeting,
    };
  }, [meetings, now]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // Default to 4 (the common wide-screen count) so the row doesn't visibly
  // jump from 3 → 4 after the first measurement on load.
  const [perPage, setPerPage] = useState(4);
  const [windowStart, setWindowStart] = useState(defaultStart);

  // Measure available width and fit 1-4 cards so the row always looks full.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      setPerPage(Math.max(1, Math.min(4, Math.round(width / 260))));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxStart = Math.max(0, timeline.length - perPage);
  // Keep the window aligned to a sensible start when perPage or data changes.
  const start = Math.min(windowStart, maxStart);
  const visible = timeline.slice(start, start + perPage);

  const canGoPast = start > 0;
  const canGoFuture = start < maxStart;

  // Replay the slide-in animation imperatively on the (stable) cards node so we
  // never remount it — remounting would reset the ResizeObserver that measures
  // how many cards fit, briefly collapsing the row to a single card.
  const playSlide = (dir: "past" | "future") => {
    const el = containerRef.current;
    if (!el) return;
    el.style.animation = "none";
    void el.offsetWidth; // force reflow so the animation can restart
    el.style.animation = `${dir === "future" ? "carousel-from-right" : "carousel-from-left"} 280ms ease-out`;
  };

  const goPast = () => {
    if (!canGoPast) return;
    setWindowStart(Math.max(0, start - perPage));
    playSlide("past");
  };
  const goFuture = () => {
    if (!canGoFuture) return;
    setWindowStart(Math.min(maxStart, start + perPage));
    playSlide("future");
  };

  return (
    <div className="flex items-stretch gap-3">
      {/* Past (left) control */}
      <div className="flex shrink-0 flex-col items-center justify-center">
        <button
          type="button"
          onClick={goPast}
          disabled={!canGoPast}
          aria-label="Past meetings"
          className="rounded-full border border-charcoal-200 bg-white p-2 text-charcoal-600 transition hover:bg-iris-50 hover:text-iris-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="mt-1 w-16 text-center text-[10px] font-semibold uppercase tracking-wide text-charcoal-500">
          Past meetings
        </span>
      </div>

      {/* Cards */}
      <div
        ref={containerRef}
        className="grid min-w-0 flex-1 gap-3"
        style={{ gridTemplateColumns: `repeat(${perPage}, minmax(0, 1fr))` }}
      >
        {visible.map((item, index) => {
          if (item.kind === "placeholder") {
            return (
              <div
                key="placeholder"
                className="flex flex-col items-center justify-center rounded-xl border border-dashed border-charcoal-300 bg-charcoal-50 p-4 text-center"
              >
                <CalendarX2 className="h-6 w-6 text-charcoal-400" />
                <p className="mt-2 text-sm font-semibold text-charcoal-700">No meetings on the horizon</p>
                {lastPast ? (
                  <p className="mt-1 text-xs text-charcoal-500">
                    Last met {formatWhen(lastPast.start, timeZone).day} ({relativeFromNow(lastPast.start)})
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-charcoal-500">No past meetings on record.</p>
                )}
              </div>
            );
          }

          const { meeting } = item;
          const when = formatWhen(meeting.start, timeZone);
          const isPast = new Date(meeting.end).getTime() < now;
          return (
            <button
              key={meeting.id}
              type="button"
              onClick={() => onSelectMeeting(meeting.id)}
              title={meeting.subject}
              className={`group flex flex-col rounded-xl border border-l-[3px] border-charcoal-200 border-l-iris-500 bg-white p-3 text-left shadow-sm transition hover:border-iris-300 hover:shadow-md ${
                isPast ? "opacity-70 hover:opacity-100" : ""
              }`}
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-iris-600">
                  {relativeFromNow(meeting.start)}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-charcoal-400">
                  <Users className="h-3 w-3" /> {meeting.attendees.length}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm font-semibold leading-tight text-charcoal-900">
                {meeting.subject}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-charcoal-500">
                <CalendarClock className="h-3.5 w-3.5 shrink-0 text-iris-500" />
                {when.day} · {when.time}
              </p>
              <p className="mt-1.5 flex items-center gap-1 truncate text-[11px] text-charcoal-500">
                {meeting.location ? (
                  <>
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-iris-500" />
                    <span className="truncate">In person</span>
                  </>
                ) : meeting.platform ? (
                  <>
                    <Video className="h-3.5 w-3.5 shrink-0 text-iris-500" />
                    <span className="truncate">{meetingPlatformLabel(meeting.platform)}</span>
                  </>
                ) : (
                  <span className="truncate text-charcoal-400">No location</span>
                )}
              </p>
            </button>
          );
        })}
      </div>

      {/* Future (right) control */}
      <div className="flex shrink-0 items-center">
        <button
          type="button"
          onClick={goFuture}
          disabled={!canGoFuture}
          aria-label="More upcoming meetings"
          className="rounded-full border border-charcoal-200 bg-white p-2 text-charcoal-600 transition hover:bg-iris-50 hover:text-iris-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
