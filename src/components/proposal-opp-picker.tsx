"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Search, X } from "lucide-react";
import { StageBadge } from "@/components/ui";
import type { ProposalOppOption } from "@/lib/data";

// Searchable account → opportunity picker for the Proposal Builder. Type to
// filter by account, opportunity, or stage, then pick the specific opportunity
// to link (and prefill) the proposal. Fully keyboard operable and theme-aware.
export function ProposalOppPicker({
  opps,
  value,
  onSelect,
  variant = "full",
}: {
  opps: ProposalOppOption[];
  /** Linked dealId, or "" for a standalone proposal. */
  value: string;
  onSelect: (dealId: string) => void;
  variant?: "full" | "compact";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => opps.find((o) => o.dealId === value) ?? null, [opps, value]);

  // Filter, then group by account (accounts A→Z, open opps before closed).
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? opps.filter((o) =>
          [o.accountName, o.dealName, o.stage].join(" ").toLowerCase().includes(q),
        )
      : opps;
    const byAccount = new Map<string, ProposalOppOption[]>();
    for (const o of filtered) {
      const list = byAccount.get(o.accountName) ?? [];
      list.push(o);
      byAccount.set(o.accountName, list);
    }
    for (const list of byAccount.values()) {
      list.sort((a, b) => Number(a.isClosed) - Number(b.isClosed) || a.dealName.localeCompare(b.dealName));
    }
    return [...byAccount.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [opps, query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      window.clearTimeout(t);
    };
  }, [open]);

  const choose = (dealId: string) => {
    onSelect(dealId);
    setOpen(false);
    setQuery("");
  };

  const compact = variant === "compact";
  const triggerLabel = selected
    ? compact
      ? selected.dealName
      : `${selected.accountName} · ${selected.dealName}`
    : compact
      ? "Link opportunity"
      : "Search accounts & link an opportunity";

  return (
    <div ref={wrapRef} className={`relative ${compact ? "" : "w-full"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Link this proposal to an opportunity"
        className={`flex items-center gap-1.5 rounded-md border transition ${
          compact ? "max-w-[240px] px-2 py-1.5 text-xs" : "w-full px-3 py-2 text-sm"
        } ${
          selected
            ? "border-iris-300 bg-iris-50 text-iris-700 hover:bg-iris-100 dark:bg-iris-100"
            : "border-charcoal-300 bg-white text-charcoal-700 hover:border-iris-300"
        }`}
      >
        <Building2 className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} shrink-0 text-iris-500`} />
        <span className="min-w-0 flex-1 truncate text-left font-medium">{triggerLabel}</span>
        {selected ? (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear linked opportunity"
            onClick={(e) => {
              e.stopPropagation();
              choose("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                choose("");
              }
            }}
            className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-iris-500 hover:bg-iris-200/60 hover:text-iris-700"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        ) : (
          <ChevronDown className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} shrink-0 text-charcoal-400`} />
        )}
      </button>

      {open ? (
        <div
          className={`absolute z-50 mt-1.5 overflow-hidden rounded-lg border border-charcoal-200 bg-white shadow-xl ${
            compact ? "right-0 w-80 max-w-[80vw]" : "left-0 w-full"
          }`}
        >
          <div className="flex items-center gap-2 border-b border-charcoal-200 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-charcoal-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search account, opportunity, or stage…"
              className="w-full border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0"
            />
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                onClick={() => choose("")}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-iris-50 ${
                  value === "" ? "text-iris-700" : "text-charcoal-700"
                }`}
              >
                <span className="font-medium">None (standalone proposal)</span>
                {value === "" ? <Check className="h-4 w-4 shrink-0 text-iris-600" /> : null}
              </button>
            </li>

            {groups.map(([account, list]) => (
              <li key={account}>
                <p className="sticky top-0 bg-charcoal-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-charcoal-500">
                  {account}
                </p>
                <ul>
                  {list.map((o) => {
                    const active = o.dealId === value;
                    return (
                      <li key={o.dealId}>
                        <button
                          type="button"
                          onClick={() => choose(o.dealId)}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-iris-50 ${
                            active ? "bg-iris-50/60" : ""
                          }`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-charcoal-900">
                              {o.dealName}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5">
                              <StageBadge stage={o.stage} size="sm" />
                              <span className="truncate text-[11px] text-charcoal-500">{o.owner}</span>
                            </span>
                          </span>
                          {active ? <Check className="h-4 w-4 shrink-0 text-iris-600" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}

            {groups.length === 0 ? (
              <li className="px-3 py-4 text-center text-sm text-charcoal-400">No opportunities match “{query}”.</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
