"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, MapPin, Video } from "lucide-react";
import {
  HOUR_PX,
  addDays,
  addMonths,
  hourRangeForMeetings,
  isSameDay,
  layoutDayEvents,
  minutesIntoDay,
  monthMatrix,
  startOfDay,
  viewDays,
  viewRangeLabel,
  viewStepDays,
  VIEW_OPTIONS,
  type CalendarMeeting,
  type CalendarView,
} from "@/lib/calendar";
import { meetingPlatformLabel } from "@/lib/meeting";

function formatHourLabel(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const suffix = normalized < 12 ? "AM" : "PM";
  const display = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${display} ${suffix}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: date.getMinutes() === 0 ? undefined : "2-digit",
  });
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type GridProps = {
  meetings: CalendarMeeting[];
  now: Date;
  selectedMeetingId: string | null;
  onSelectMeeting: (id: string) => void;
};

export function CalendarWeekView({
  meetings,
  selectedMeetingId,
  onSelectMeeting,
}: {
  meetings: CalendarMeeting[];
  selectedMeetingId: string | null;
  onSelectMeeting: (id: string) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const goToday = () => setAnchor(new Date());
  const goPrev = () =>
    setAnchor((prev) => (view === "month" ? addMonths(prev, -1) : addDays(prev, -viewStepDays(view))));
  const goNext = () =>
    setAnchor((prev) => (view === "month" ? addMonths(prev, 1) : addDays(prev, viewStepDays(view))));

  const openDay = (date: Date) => {
    setAnchor(date);
    setView("day");
  };

  const days = useMemo(
    () => (view === "month" ? [] : viewDays(view, anchor)),
    [view, anchor],
  );

  const agendaDays = useMemo(() => {
    if (view === "month") {
      return monthMatrix(anchor).filter((day) => day.getMonth() === anchor.getMonth());
    }
    return days;
  }, [view, anchor, days]);

  return (
    <div className="flex flex-col">
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToday}
            className="bg-white text-charcoal-800 border border-charcoal-300 hover:bg-charcoal-50"
          >
            Today
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrev}
              aria-label="Previous"
              className="rounded-full border border-charcoal-200 bg-white p-1.5 text-charcoal-600 hover:bg-iris-50 hover:text-iris-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              aria-label="Next"
              className="rounded-full border border-charcoal-200 bg-white p-1.5 text-charcoal-600 hover:bg-iris-50 hover:text-iris-700"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <p className="text-base font-semibold text-charcoal-900">{viewRangeLabel(view, anchor)}</p>
        </div>
        <div className="relative inline-flex items-center">
          <CalendarRange className="pointer-events-none absolute left-2.5 h-4 w-4 text-charcoal-500" />
          <select
            aria-label="Calendar view"
            value={view}
            onChange={(event) => setView(event.target.value as CalendarView)}
            className="cursor-pointer pl-8 pr-8 font-medium"
          >
            {VIEW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden lg:block">
        {view === "month" ? (
          <MonthGrid
            anchor={anchor}
            meetings={meetings}
            now={now}
            selectedMeetingId={selectedMeetingId}
            onSelectMeeting={onSelectMeeting}
            onOpenDay={openDay}
          />
        ) : (
          <TimeGrid
            days={days}
            meetings={meetings}
            now={now}
            selectedMeetingId={selectedMeetingId}
            onSelectMeeting={onSelectMeeting}
          />
        )}
      </div>

      {/* Mobile agenda fallback */}
      <Agenda
        days={agendaDays}
        meetings={meetings}
        selectedMeetingId={selectedMeetingId}
        onSelectMeeting={onSelectMeeting}
      />
    </div>
  );
}

function TimeGrid({ days, meetings, now, selectedMeetingId, onSelectMeeting }: GridProps & { days: Date[] }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const rangeStart = days[0];
  const rangeEnd = addDays(days[days.length - 1], 1);

  const visibleMeetings = useMemo(
    () =>
      meetings.filter((meeting) => {
        const start = new Date(meeting.start);
        return start >= rangeStart && start < rangeEnd;
      }),
    [meetings, rangeStart, rangeEnd],
  );

  const { startHour, endHour } = useMemo(
    () => hourRangeForMeetings(visibleMeetings),
    [visibleMeetings],
  );
  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour],
  );
  const bodyHeight = (endHour - startHour) * HOUR_PX;

  const firstKey = rangeStart.toISOString();
  useEffect(() => {
    if (!scrollRef.current) return;
    const focusHour = Math.min(Math.max(now.getHours(), startHour), endHour);
    scrollRef.current.scrollTop = Math.max(0, (focusHour - startHour) * HOUR_PX - 60);
  }, [firstKey, days.length, startHour, endHour, now]);

  const nowTop = ((minutesIntoDay(now) - startHour * 60) / 60) * HOUR_PX;
  const nowInRange = nowTop >= 0 && nowTop <= bodyHeight;
  const gridTemplate = `56px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="overflow-hidden rounded-xl border border-charcoal-200 bg-white">
      {/* Day headers */}
      <div className="grid border-b border-charcoal-200" style={{ gridTemplateColumns: gridTemplate }}>
        <div className="border-r border-charcoal-200" />
        {days.map((day) => {
          const today = isSameDay(day, now);
          return (
            <div key={day.toISOString()} className="border-r border-charcoal-100 px-2 py-2 text-center last:border-r-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal-500">
                {WEEKDAY_LABELS[day.getDay()]}
              </p>
              <p className="mt-0.5 flex justify-center">
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                    today ? "bg-iris-500 text-white" : "text-charcoal-800"
                  }`}
                >
                  {day.getDate()}
                </span>
              </p>
            </div>
          );
        })}
      </div>

      {/* Scrollable time body */}
      <div ref={scrollRef} className="max-h-[640px] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
          {/* Time gutter */}
          <div className="relative border-r border-charcoal-200" style={{ height: bodyHeight }}>
            {hours.map((hour, index) => (
              <div
                key={hour}
                className="absolute right-1.5 -translate-y-1/2 text-[11px] font-medium text-charcoal-400"
                style={{ top: index * HOUR_PX }}
              >
                {index === 0 ? "" : formatHourLabel(hour)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dayMeetings = visibleMeetings.filter((meeting) => isSameDay(new Date(meeting.start), day));
            const positioned = layoutDayEvents(dayMeetings, startHour);
            const today = isSameDay(day, now);
            return (
              <div
                key={day.toISOString()}
                className="relative border-r border-charcoal-100 last:border-r-0"
                style={{ height: bodyHeight }}
              >
                {hours.map((hour, index) => (
                  <div
                    key={hour}
                    className="absolute inset-x-0 border-t border-charcoal-100"
                    style={{ top: index * HOUR_PX }}
                  />
                ))}

                {today && nowInRange ? (
                  <div className="absolute inset-x-0 z-20" style={{ top: nowTop }}>
                    <div className="relative">
                      <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-iris-600" />
                      <div className="border-t-2 border-iris-500" />
                    </div>
                  </div>
                ) : null}

                {positioned.map(({ event, top, height, leftPct, widthPct }) => {
                  const start = new Date(event.start);
                  const end = new Date(event.end);
                  const past = end.getTime() < now.getTime();
                  const selected = event.id === selectedMeetingId;
                  const compact = height < 44;
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onSelectMeeting(event.id)}
                      title={event.subject}
                      className={`absolute z-10 overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left transition ${
                        selected
                          ? "border-l-iris-600 bg-iris-100 ring-2 ring-iris-400"
                          : "border-l-iris-500 bg-iris-50 hover:bg-iris-100"
                      } ${past && !selected ? "opacity-60" : ""}`}
                      style={{
                        top: top + 1,
                        height: Math.max(height - 2, 18),
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                      }}
                    >
                      <p className="truncate text-[12px] font-semibold leading-tight text-iris-900">{event.subject}</p>
                      {!compact ? (
                        <p className="mt-0.5 truncate text-[11px] leading-tight text-iris-700/80">
                          {formatTime(start)} - {formatTime(end)}
                        </p>
                      ) : null}
                      {!compact ? (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] leading-tight text-charcoal-500">
                          {event.location ? (
                            <>
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate">In person</span>
                            </>
                          ) : event.platform ? (
                            <>
                              <Video className="h-3 w-3 shrink-0" />
                              <span className="truncate">{meetingPlatformLabel(event.platform)}</span>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {visibleMeetings.length === 0 ? (
        <div className="border-t border-charcoal-200 px-4 py-6 text-center text-sm text-charcoal-500">
          No meetings scheduled in this range.
        </div>
      ) : null}
    </div>
  );
}

function MonthGrid({
  anchor,
  meetings,
  now,
  selectedMeetingId,
  onSelectMeeting,
  onOpenDay,
}: GridProps & { anchor: Date; onOpenDay: (date: Date) => void }) {
  const cells = useMemo(() => monthMatrix(anchor), [anchor]);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarMeeting[]>();
    for (const meeting of meetings) {
      const key = startOfDay(new Date(meeting.start)).toISOString();
      map.set(key, [...(map.get(key) ?? []), meeting]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    }
    return map;
  }, [meetings]);

  return (
    <div className="overflow-hidden rounded-xl border border-charcoal-200 bg-white">
      <div className="grid grid-cols-7 border-b border-charcoal-200">
        {WEEKDAY_FULL.map((label) => (
          <div
            key={label}
            className="border-r border-charcoal-100 px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-charcoal-500 last:border-r-0"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day) => {
          const inMonth = day.getMonth() === anchor.getMonth();
          const today = isSameDay(day, now);
          const dayMeetings = byDay.get(day.toISOString()) ?? [];
          const shown = dayMeetings.slice(0, 3);
          const extra = dayMeetings.length - shown.length;
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[104px] border-b border-r border-charcoal-100 p-1.5 last:border-r-0 ${
                inMonth ? "bg-white" : "bg-charcoal-50/60"
              }`}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                    today
                      ? "bg-iris-500 text-white"
                      : inMonth
                        ? "text-charcoal-700"
                        : "text-charcoal-400"
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
              <div className="space-y-1">
                {shown.map((meeting) => {
                  const start = new Date(meeting.start);
                  const past = new Date(meeting.end).getTime() < now.getTime();
                  const selected = meeting.id === selectedMeetingId;
                  return (
                    <button
                      key={meeting.id}
                      type="button"
                      onClick={() => onSelectMeeting(meeting.id)}
                      title={meeting.subject}
                      className={`flex w-full items-center gap-1 truncate rounded border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight transition ${
                        selected
                          ? "border-l-iris-600 bg-iris-100 ring-1 ring-iris-400"
                          : "border-l-iris-500 bg-iris-50 hover:bg-iris-100"
                      } ${past && !selected ? "opacity-60" : ""}`}
                    >
                      <span className="shrink-0 font-semibold text-charcoal-500">{formatTime(start)}</span>
                      <span className="truncate font-medium text-iris-900">{meeting.subject}</span>
                    </button>
                  );
                })}
                {extra > 0 ? (
                  <button
                    type="button"
                    onClick={() => onOpenDay(day)}
                    className="w-full rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-charcoal-500 hover:bg-charcoal-50 hover:text-iris-700"
                  >
                    +{extra} more
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Agenda({
  days,
  meetings,
  selectedMeetingId,
  onSelectMeeting,
}: {
  days: Date[];
  meetings: CalendarMeeting[];
  selectedMeetingId: string | null;
  onSelectMeeting: (id: string) => void;
}) {
  const groups = days
    .map((day) => ({
      day,
      items: meetings
        .filter((meeting) => isSameDay(new Date(meeting.start), day))
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="space-y-4 lg:hidden">
      {groups.map(({ day, items }) => (
        <div key={day.toISOString()}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-charcoal-600">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-iris-500" />
            {day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </h3>
          <div className="space-y-2">
            {items.map((meeting) => {
              const start = new Date(meeting.start);
              const end = new Date(meeting.end);
              return (
                <button
                  key={meeting.id}
                  type="button"
                  onClick={() => onSelectMeeting(meeting.id)}
                  className={`flex w-full items-start gap-3 rounded-lg border border-l-4 border-charcoal-200 bg-white p-3 text-left transition hover:bg-iris-50 ${
                    meeting.id === selectedMeetingId ? "border-l-iris-600 ring-2 ring-iris-300" : "border-l-iris-400"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-charcoal-900">{meeting.subject}</p>
                    <p className="text-xs text-charcoal-500">
                      {formatTime(start)} - {formatTime(end)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-charcoal-300 bg-charcoal-50 px-4 py-8 text-center text-sm text-charcoal-500">
          No meetings scheduled in this range.
        </div>
      ) : null}
    </div>
  );
}
