"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  MapPin,
  NotebookPen,
  Paperclip,
  Plus,
  Users,
  X,
} from "lucide-react";
import { addNoteAction, logSalesforceTaskAction, uploadArtifactAction } from "@/lib/actions";
import { MeetingPlatformIcon } from "@/components/meeting-platform-icon";
import { Button, StatusPill } from "@/components/ui";
import { zonedNaiveISO, type CalendarMeeting } from "@/lib/calendar";
import {
  PRIORITY_OPTIONS,
  PRODUCT_OPTIONS,
  TASK_STATUS_OPTIONS,
  TASK_TYPE_OPTIONS,
} from "@/lib/salesforce-options";

// "YYYY-MM-DD" for the meeting's day in the viewer's zone (for the due-date default).
function meetingDateInput(startIso: string, timeZone: string): string {
  return zonedNaiveISO(startIso, timeZone).slice(0, 10);
}

// Meeting length in hours (1 decimal) for the task duration default.
function meetingDurationHrs(startIso: string, endIso: string): string {
  const hrs = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000;
  if (!Number.isFinite(hrs) || hrs <= 0) return "";
  return (Math.round(hrs * 10) / 10).toString();
}

function formatRange(startIso: string, endIso: string, timeZone: string): string {
  // Re-express the instants in the viewer's chosen zone, then format from the
  // naive wall-clock so the conditional ":00" minute handling stays correct.
  const start = new Date(zonedNaiveISO(startIso, timeZone));
  const end = new Date(zonedNaiveISO(endIso, timeZone));
  const day = start.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const time = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: d.getMinutes() === 0 ? undefined : "2-digit",
    });
  return `${day} · ${time(start)} - ${time(end)}`;
}

const ROLE_TONE: Record<string, "info" | "neutral" | "good"> = {
  SE: "info",
  AE: "neutral",
  SAM: "good",
};

function previewTone(status: string): "good" | "warning" | "bad" {
  if (status === "READY") return "good";
  if (status === "PENDING") return "warning";
  return "bad";
}

export function MeetingDetailPanel({
  meeting,
  timeZone,
  onClose,
}: {
  meeting: CalendarMeeting | null;
  timeZone: string;
  onClose: () => void;
}) {
  // Keep the last meeting around during the close animation so content doesn't
  // vanish before the panel finishes sliding out. We sync from props during
  // render (the React-recommended pattern) rather than in an effect.
  const [cached, setCached] = useState<CalendarMeeting | null>(meeting);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const open = Boolean(meeting);

  if (meeting && meeting !== cached) {
    const idChanged = meeting.id !== cached?.id;
    setCached(meeting);
    if (idChanged) {
      setShowAddAsset(false);
      setShowAddNote(false);
      setNotesOpen(false);
      setAssetsOpen(false);
      setTaskOpen(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const data = cached;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-charcoal-900/30 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={data ? `Meeting details: ${data.subject}` : "Meeting details"}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {data ? (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-charcoal-200 p-5">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-charcoal-900">{data.subject}</h2>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-charcoal-500">
                  <CalendarClock className="h-4 w-4 shrink-0 text-iris-500" />
                  {formatRange(data.start, data.end, timeZone)}
                </p>
                <p className="mt-1 text-sm text-charcoal-600">
                  {data.deal.accountName} · <span className="font-medium">{data.deal.name}</span> ({data.deal.stage})
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full border border-charcoal-200 bg-white p-1.5 text-charcoal-600 hover:bg-charcoal-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              {/* Where — single line: label + clickable target */}
              <section className="flex items-center gap-2.5">
                <p className="flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-charcoal-500">
                  <MapPin className="h-3.5 w-3.5 text-iris-500" />
                  Where
                </p>
                {data.location ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.location)}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Open in Google Maps"
                    className="min-w-0 truncate text-sm font-medium text-iris-700 underline underline-offset-2 transition hover:text-iris-800"
                  >
                    {data.location}
                  </a>
                ) : data.platform ? (
                  <MeetingPlatformIcon joinUrl={data.joinUrl} showAffordance />
                ) : (
                  <p className="text-sm text-charcoal-400">No location provided.</p>
                )}
              </section>

              {/* Attendees */}
              <section>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-charcoal-500">
                  <Users className="h-3.5 w-3.5 text-iris-500" />
                  Attendees
                </p>
                {data.attendees.length === 0 ? (
                  <p className="text-sm text-charcoal-400">Attendee list not available (the meeting may be private).</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.attendees.map((attendee) => (
                      <li
                        key={attendee.email || attendee.name}
                        className="flex items-center gap-2.5 rounded-md border border-charcoal-200 bg-charcoal-50 px-2.5 py-1.5"
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-iris-100 text-xs font-semibold text-iris-700">
                          {attendee.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-charcoal-800">
                            {attendee.name}
                            {attendee.predicted ? (
                              <span className="font-normal italic text-charcoal-400"> (maybe)</span>
                            ) : null}
                          </span>
                          {attendee.email ? (
                            <span className="block truncate text-xs text-charcoal-400">{attendee.email}</span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Meeting notes (collapsible) */}
              <section>
                <button
                  type="button"
                  onClick={() => setNotesOpen((value) => !value)}
                  aria-expanded={notesOpen}
                  className="flex w-full items-center justify-between gap-2 rounded-md bg-iris-500 px-3 py-2 text-left text-white hover:bg-iris-600"
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white">
                    <NotebookPen className="h-3.5 w-3.5 text-white" />
                    Meeting notes
                    <span className="font-normal text-white/75">({data.notes.length})</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-white transition-transform duration-300 ${notesOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${notesOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setShowAddNote((value) => !value)}
                          className="inline-flex items-center gap-1 rounded-md border border-charcoal-200 bg-white px-2 py-1 text-xs font-medium text-iris-700 hover:bg-iris-50"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add note
                        </button>
                      </div>

                      {showAddNote ? (
                        <form
                          action={addNoteAction}
                          className="space-y-2 rounded-lg border border-charcoal-200 bg-charcoal-50 p-3"
                        >
                          <input type="hidden" name="dealId" value={data.deal.id} />
                          <input type="hidden" name="meetingId" value={data.id} />
                          <select name="role" defaultValue="SE" className="w-full text-sm">
                            <option value="SE">SE</option>
                            <option value="AE">AE</option>
                            <option value="SAM">SAM</option>
                          </select>
                          <textarea
                            name="body"
                            required
                            rows={3}
                            placeholder="Add a note for this meeting…"
                            className="w-full text-sm"
                          />
                          <div className="flex justify-end">
                            <Button type="submit" className="px-3 py-1.5 text-xs">
                              Save note
                            </Button>
                          </div>
                        </form>
                      ) : null}

                      {data.notes.length === 0 ? (
                        <p className="text-sm text-charcoal-400">No notes captured for this meeting.</p>
                      ) : (
                        <ul className="space-y-2">
                          {data.notes.map((note) => (
                            <li key={note.id} className="rounded-md border border-charcoal-200 bg-white p-2.5">
                              <div className="mb-1 flex items-center gap-2">
                                <StatusPill tone={ROLE_TONE[note.role] ?? "neutral"}>{note.role}</StatusPill>
                                <span className="truncate text-xs text-charcoal-400">{note.author}</span>
                              </div>
                              <p className="text-sm text-charcoal-700">{note.body}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Linked assets (collapsible) */}
              <section>
                <button
                  type="button"
                  onClick={() => setAssetsOpen((value) => !value)}
                  aria-expanded={assetsOpen}
                  className="flex w-full items-center justify-between gap-2 rounded-md bg-iris-500 px-3 py-2 text-left text-white hover:bg-iris-600"
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white">
                    <Paperclip className="h-3.5 w-3.5 text-white" />
                    Linked assets
                    <span className="font-normal text-white/75">({data.assets.length})</span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-white transition-transform duration-300 ${assetsOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${assetsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setShowAddAsset((value) => !value)}
                          className="inline-flex items-center gap-1 rounded-md border border-charcoal-200 bg-white px-2 py-1 text-xs font-medium text-iris-700 hover:bg-iris-50"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add asset
                        </button>
                      </div>

                      {showAddAsset ? (
                        <form
                          action={uploadArtifactAction}
                          className="space-y-2 rounded-lg border border-charcoal-200 bg-charcoal-50 p-3"
                        >
                          <input type="hidden" name="dealId" value={data.deal.id} />
                          <input type="hidden" name="meetingId" value={data.id} />
                          <select name="type" required defaultValue="PRESENTATION" className="w-full text-sm">
                            <option value="PRESENTATION">Presentation</option>
                            <option value="WHITEBOARD">Whiteboard</option>
                            <option value="COLLECTOR">Collector</option>
                            <option value="RV_TOOL">RV Tool</option>
                            <option value="ZIP_BUNDLE">Zip Bundle</option>
                            <option value="TEXT_BRIEF">Text Brief</option>
                            <option value="QBR_REPORT">QBR Report</option>
                          </select>
                          <input name="title" placeholder="Title (e.g. Acme QBR Deck)" required className="w-full text-sm" />
                          <input name="sourceTool" placeholder="Source tool (e.g. PowerPoint)" required className="w-full text-sm" />
                          <input name="uri" placeholder="https:// or file:// location" required className="w-full text-sm" />
                          <input name="previewImageUri" placeholder="Preview image URL (optional)" className="w-full text-sm" />
                          <div className="flex justify-end">
                            <Button type="submit" className="px-3 py-1.5 text-xs">
                              Save asset
                            </Button>
                          </div>
                        </form>
                      ) : null}

                      {data.assets.length === 0 ? (
                        <p className="text-sm text-charcoal-400">No assets linked yet.</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2.5">
                          {data.assets.map((asset) => (
                            <div key={asset.id} className="rounded-md border border-charcoal-200 p-2">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-iris-600">
                                {asset.type.replaceAll("_", " ")}
                              </p>
                              {asset.previewImageUri ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={asset.previewImageUri}
                                  alt={`${asset.title} preview`}
                                  className="mt-1.5 h-20 w-full rounded border border-charcoal-200 object-cover"
                                />
                              ) : (
                                <div className="mt-1.5 flex h-20 flex-col items-center justify-center gap-1 rounded border border-charcoal-200 bg-gradient-to-br from-iris-50 to-white text-charcoal-500">
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-iris-600">
                                    {asset.type.replaceAll("_", " ")}
                                  </span>
                                  <span className="text-[10px]">Generating preview…</span>
                                </div>
                              )}
                              <p className="mt-1.5 line-clamp-2 text-xs font-semibold text-charcoal-800">{asset.title}</p>
                              <div className="mt-1 flex items-center justify-between gap-1">
                                <span className="truncate text-[10px] text-charcoal-500">{asset.sourceTool}</span>
                                <StatusPill tone={previewTone(asset.previewStatus)}>{asset.previewStatus}</StatusPill>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Log Salesforce task (collapsible) — replaces Helper task entry */}
              <section>
                <button
                  type="button"
                  onClick={() => setTaskOpen((value) => !value)}
                  aria-expanded={taskOpen}
                  className="flex w-full items-center justify-between gap-2 rounded-md bg-iris-500 px-3 py-2 text-left text-white hover:bg-iris-600"
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white">
                    <ClipboardList className="h-3.5 w-3.5 text-white" />
                    Log Salesforce task
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-white transition-transform duration-300 ${taskOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <div
                  className={`grid transition-[grid-template-rows] duration-300 ease-out ${taskOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                >
                  <div className="overflow-hidden">
                    <form
                      action={logSalesforceTaskAction}
                      className="mt-2 space-y-2.5 rounded-lg border border-charcoal-200 bg-charcoal-50 p-3 text-sm"
                    >
                      <input type="hidden" name="dealId" value={data.deal.id} />
                      <input type="hidden" name="meetingId" value={data.id} />

                      <label className="block space-y-1">
                        <span className="text-xs font-semibold text-charcoal-600">Task Name</span>
                        <input name="taskName" required defaultValue={`Follow up: ${data.subject}`} className="w-full text-sm" />
                      </label>

                      <label className="block space-y-1">
                        <span className="text-xs font-semibold text-charcoal-600">Description / Notes</span>
                        <textarea name="description" rows={3} placeholder="What needs to happen next?" className="w-full text-sm" />
                      </label>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block space-y-1">
                          <span className="text-xs font-semibold text-charcoal-600">Assignee</span>
                          <input name="assignee" defaultValue={data.organizer} className="w-full text-sm" />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-xs font-semibold text-charcoal-600">Related Account</span>
                          <input name="relatedAccount" defaultValue={data.deal.accountName} className="w-full text-sm" />
                        </label>
                      </div>

                      <fieldset className="space-y-1.5 rounded-md border border-charcoal-200 bg-white p-2.5">
                        <legend className="px-1 text-xs font-semibold text-charcoal-600">Products</legend>
                        <div className="grid grid-cols-2 gap-1">
                          {PRODUCT_OPTIONS.map((product) => (
                            <label key={product} className="flex items-center gap-1.5 text-xs text-charcoal-700">
                              <input type="checkbox" name="products" value={product} className="h-3.5 w-3.5 accent-iris-600" />
                              {product}
                            </label>
                          ))}
                        </div>
                      </fieldset>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block space-y-1">
                          <span className="text-xs font-semibold text-charcoal-600">Type</span>
                          <select name="type" defaultValue="Meeting" className="w-full text-sm">
                            {TASK_TYPE_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-1">
                          <span className="text-xs font-semibold text-charcoal-600">Status</span>
                          <select name="status" defaultValue="Not Started" className="w-full text-sm">
                            {TASK_STATUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-1">
                          <span className="text-xs font-semibold text-charcoal-600">Due Date</span>
                          <input type="date" name="dueDate" defaultValue={meetingDateInput(data.start, timeZone)} className="w-full text-sm" />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-xs font-semibold text-charcoal-600">Duration (hrs)</span>
                          <input type="number" step="0.25" min="0" name="durationHrs" defaultValue={meetingDurationHrs(data.start, data.end)} className="w-full text-sm" />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-xs font-semibold text-charcoal-600">Contact</span>
                          <select name="contact" defaultValue="" className="w-full text-sm">
                            <option value="">No contact</option>
                            {data.attendees.map((attendee) => (
                              <option key={attendee.email || attendee.name} value={attendee.name}>
                                {attendee.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-1">
                          <span className="text-xs font-semibold text-charcoal-600">Priority</span>
                          <select name="priority" defaultValue="Normal" className="w-full text-sm">
                            {PRIORITY_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <label className="flex items-center gap-2 text-xs text-charcoal-700">
                        <input type="checkbox" name="remind" className="h-3.5 w-3.5 accent-iris-600" />
                        Remind me about this task
                      </label>

                      <div className="flex justify-end">
                        <Button type="submit" className="px-3 py-1.5 text-xs">
                          Log Salesforce Task
                        </Button>
                      </div>
                    </form>
                  </div>
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="border-t border-charcoal-200 p-4">
              <Link
                href={`/accounts/${data.deal.id}`}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-iris-500 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-iris-600"
              >
                View Deal Workspace
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        ) : null}
      </aside>
    </>
  );
}
