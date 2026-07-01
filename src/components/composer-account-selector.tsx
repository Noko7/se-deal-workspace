"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Lock } from "lucide-react";
import type { AccountOption } from "@/components/account-ai-workspace";

type Scope = "all" | string;
type Row = { value: Scope; label: string; sub: string; optedOut: boolean };

export function ComposerAccountSelector({
  accounts,
  selected,
  onSelect,
}: {
  accounts: AccountOption[];
  selected: Scope;
  onSelect: (scope: Scope) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const label = selected === "all" ? "My Accounts" : accounts.find((a) => a.id === selected)?.accountName ?? "Account";

  const rows = useMemo<Row[]>(() => {
    const all: Row = { value: "all", label: "My Accounts", sub: "all accounts", optedOut: false };
    const mapped: Row[] = accounts.map((a) => ({
      value: a.id,
      label: a.accountName,
      sub: `${a.dealName} · ${a.stage}`,
      optedOut: a.aiOptOut,
    }));
    const q = query.trim().toLowerCase();
    if (!q) return [all, ...mapped];
    const filtered = mapped.filter(
      (r) => r.label.toLowerCase().includes(q) || r.sub.toLowerCase().includes(q),
    );
    // Keep "My Accounts" reachable by typing "all" / "my".
    return "my accounts".includes(q) || "all".includes(q) ? [all, ...filtered] : filtered;
  }, [accounts, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setHighlight(0);
  };

  const choose = (value: Scope) => {
    onSelect(value);
    close();
  };

  return (
    <span className="relative inline-flex">
      {open ? (
        <>
          {/* Click-away layer */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-40 cursor-default bg-transparent p-0"
          />
          {/* Account list, anchored ABOVE the field like a slash-command menu */}
          <div className="absolute bottom-full left-0 z-50 mb-2 w-80 max-w-[78vw] overflow-hidden rounded-lg border border-charcoal-200 bg-white shadow-xl">
            <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
              {rows.map((row, index) => {
                const active = row.value === selected;
                const isHighlighted = index === highlight;
                return (
                  <li key={String(row.value)}>
                    <button
                      type="button"
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => choose(row.value)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left ${
                        isHighlighted ? "bg-iris-50" : "bg-white"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-charcoal-900">{row.label}</span>
                          {row.optedOut ? (
                            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                              <Lock className="h-2.5 w-2.5" /> AI off
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-charcoal-500">{row.sub}</span>
                      </span>
                      {active ? <Check className="h-4 w-4 shrink-0 text-iris-600" /> : null}
                    </button>
                  </li>
                );
              })}
              {rows.length === 0 ? (
                <li className="px-3 py-3 text-sm text-charcoal-400">No accounts match “{query}”.</li>
              ) : null}
            </ul>
          </div>

          {/* Inline search input that visually lives inside the prompt field */}
          <span className="relative z-50 inline-flex items-center rounded-md border border-iris-400 bg-white px-2 py-0.5">
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((h) => Math.min(rows.length - 1, h + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((h) => Math.max(0, h - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  const row = rows[highlight];
                  if (row) choose(row.value);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  close();
                }
              }}
              placeholder={label}
              className="w-36 border-0 bg-transparent p-0 text-sm font-semibold text-iris-700 placeholder:font-semibold placeholder:text-iris-400 focus:outline-none focus:ring-0"
            />
          </span>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="listbox"
          className="inline-flex max-w-[14rem] items-center gap-1 rounded-md border border-iris-300 bg-white px-2 py-0.5 text-sm font-semibold text-iris-700 transition hover:bg-iris-50"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </button>
      )}
    </span>
  );
}
