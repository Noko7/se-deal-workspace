"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, CalendarClock, Check, Loader2, Search, X } from "lucide-react";

type MeetingOption = {
  id: string;
  subject: string;
  startTime: string;
  dealId: string;
  accountName: string;
};

type Role = "SE" | "AE" | "SAM";

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function AttachToMeetingModal({
  open,
  onClose,
  markdown,
  onAttached,
}: {
  open: boolean;
  onClose: () => void;
  markdown: string;
  onAttached?: (info: { accountName: string; subject: string }) => void;
}) {
  // Only mount the dialog body while open so its state resets cleanly each time
  // (no need to imperatively reset state inside an effect).
  if (!open) return null;
  return <AttachDialog onClose={onClose} markdown={markdown} onAttached={onAttached} />;
}

function AttachDialog({
  onClose,
  markdown,
  onAttached,
}: {
  onClose: () => void;
  markdown: string;
  onAttached?: (info: { accountName: string; subject: string }) => void;
}) {
  const [meetings, setMeetings] = useState<MeetingOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("SE");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<{ accountName: string; subject: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Load meetings on mount (async setState in .then is allowed) and focus search.
  useEffect(() => {
    let active = true;
    fetch("/api/meeting-notes")
      .then((res) => res.json())
      .then((data: { meetings?: MeetingOption[] }) => {
        if (active) setMeetings(data.meetings ?? []);
      })
      .catch(() => active && setLoadError("Couldn't load your meetings."));
    const focus = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => {
      active = false;
      window.clearTimeout(focus);
    };
  }, []);

  // Close on Escape.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!meetings) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? meetings.filter((m) => m.subject.toLowerCase().includes(q) || m.accountName.toLowerCase().includes(q))
      : meetings;
    const groups = new Map<string, MeetingOption[]>();
    for (const meeting of list) {
      const bucket = groups.get(meeting.accountName) ?? [];
      bucket.push(meeting);
      groups.set(meeting.accountName, bucket);
    }
    return Array.from(groups.entries());
  }, [meetings, query]);

  const selected = meetings?.find((m) => m.id === selectedId) ?? null;

  const submit = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/meeting-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId: selected.id, body: markdown, role }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Request failed (HTTP ${res.status}).`);
      }
      const info = { accountName: selected.accountName, subject: selected.subject };
      setDone(info);
      onAttached?.(info);
    } catch (error) {
      setSubmitError((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden className="absolute inset-0 bg-charcoal-900/40 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Attach note to a meeting"
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-charcoal-200 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-charcoal-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-iris-50 text-iris-600">
              <CalendarClock className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-charcoal-900">Attach to a meeting</h3>
              <p className="text-xs text-charcoal-500">Saves these notes to the meeting and its account.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="bg-transparent p-1 text-charcoal-500 hover:bg-charcoal-100 hover:text-charcoal-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eef8d8] text-[#3f5e0a]">
              <Check className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-semibold text-charcoal-900">Notes attached</p>
              <p className="mt-1 text-xs text-charcoal-500">
                Saved to <span className="font-medium text-charcoal-700">{done.accountName}</span> · {done.subject}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-iris-500 px-4 py-2 text-sm font-semibold text-white hover:bg-iris-600"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="border-b border-charcoal-200 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search meetings or accounts…"
                  className="w-full pl-8"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-2">
              {loadError ? (
                <p className="p-4 text-center text-sm text-[#9a3b27]">{loadError}</p>
              ) : meetings === null ? (
                <div className="flex items-center justify-center gap-2 p-8 text-sm text-charcoal-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading meetings…
                </div>
              ) : filtered.length === 0 ? (
                <p className="p-8 text-center text-sm text-charcoal-500">No meetings match “{query}”.</p>
              ) : (
                <div className="space-y-3">
                  {filtered.map(([accountName, group]) => (
                    <div key={accountName}>
                      <p className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-charcoal-500">
                        <Building2 className="h-3 w-3" /> {accountName}
                      </p>
                      <div className="space-y-1">
                        {group.map((meeting) => {
                          const active = meeting.id === selectedId;
                          return (
                            <button
                              key={meeting.id}
                              type="button"
                              onClick={() => setSelectedId(meeting.id)}
                              aria-pressed={active}
                              className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition ${
                                active ? "bg-iris-50 ring-1 ring-iris-300" : "bg-transparent hover:bg-charcoal-50"
                              }`}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-charcoal-900">
                                  {meeting.subject}
                                </span>
                                <span className="block text-xs text-charcoal-500">{formatWhen(meeting.startTime)}</span>
                              </span>
                              {active ? <Check className="h-4 w-4 shrink-0 text-iris-600" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-charcoal-200 p-3">
              {submitError ? (
                <p className="rounded-md bg-[#ffe7e0] px-3 py-1.5 text-xs text-[#9a3b27]">{submitError}</p>
              ) : null}
              <div className="flex items-center gap-2">
                <label htmlFor="attach-role" className="sr-only">
                  Note role
                </label>
                <select
                  id="attach-role"
                  value={role}
                  onChange={(event) => setRole(event.target.value as Role)}
                  className="w-24"
                >
                  <option value="SE">SE</option>
                  <option value="AE">AE</option>
                  <option value="SAM">SAM</option>
                </select>
                <button
                  type="button"
                  disabled={!selected || submitting}
                  onClick={submit}
                  className="flex flex-1 items-center justify-center gap-2 rounded-md bg-iris-500 px-3 py-2 text-sm font-semibold text-white hover:bg-iris-600 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {submitting ? "Attaching…" : selected ? `Attach to ${selected.accountName}` : "Select a meeting"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
