// Client side of the global Simple Sizer totals (/api/sizer-stats). Only the
// three counts are sent: never file names, customers or VM data.

import type { SizerStats } from "@/lib/sizer-stats-store";

export type { SizerStats };

const listeners = new Set<() => void>();
let current: SizerStats | null = null;

function publish(next: SizerStats) {
  current = next;
  for (const l of listeners) l();
}

/** Seed from the server-rendered totals (first render only). */
export function seedSizerStats(initial: SizerStats | null): void {
  if (current == null && initial) current = initial;
}

/** Add to the global totals; the board shows the server's new figures. Failures are silent. */
export function addSizerStats(delta: Partial<SizerStats>): void {
  void fetch("/api/sizer-stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(delta),
  })
    .then((r) => (r.ok ? (r.json() as Promise<SizerStats>) : null))
    .then((s) => {
      if (s) publish(s);
    })
    .catch(() => undefined);
}

/** Pull the latest totals (other SEs' use) when the tab regains focus. */
function refresh() {
  void fetch("/api/sizer-stats", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<SizerStats>) : null))
    .then((s) => {
      if (s) publish(s);
    })
    .catch(() => undefined);
}

export function subscribeSizerStats(listener: () => void): () => void {
  listeners.add(listener);
  const onFocus = () => refresh();
  window.addEventListener("focus", onFocus);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("focus", onFocus);
  };
}

export function getSizerStats(): SizerStats | null {
  return current;
}
