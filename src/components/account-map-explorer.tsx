"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { FormRow, SectionHeader } from "@/components/ui";
import { MapLoading } from "@/components/map-loading";
import type { AccountMapRecord } from "@/lib/account-map";

const AccountMapView = dynamic(
  () => import("@/components/account-map-view").then((module) => module.AccountMapView),
  {
    ssr: false,
    loading: () => <MapLoading variant="block" />,
  },
);

type Props = {
  records: AccountMapRecord[];
};

const ALL = "All";
const EVERYONE = "Everyone";

// Dots next to the Account Type toggles mirror the plot colors on the map.
const TYPE_DOT: Record<string, string> = {
  Customer: "#7855fa",
  Prospect: "#22c55e",
  "Prospect - Lead": "#22c55e",
  "Ex - Customer": "#ef4444",
};

// Account types selected by default. Existing customers and active leads/prospects
// are shown; former ("Ex - Customer") accounts start hidden until enabled.
const DEFAULT_ON_TYPES = new Set(["Customer", "Prospect", "Prospect - Lead"]);
// Preferred display order for the Account Type toggles; anything else is appended.
const TYPE_ORDER = ["Customer", "Prospect", "Prospect - Lead", "Ex - Customer"];

const presentTypes = (records: { accountType: string }[]): string[] => {
  const set = new Set(records.map((record) => record.accountType).filter(Boolean));
  const known = TYPE_ORDER.filter((type) => set.has(type));
  const rest = [...set].filter((type) => !TYPE_ORDER.includes(type)).sort();
  return [...known, ...rest];
};

const defaultTypeState = (records: { accountType: string }[]): Record<string, boolean> =>
  Object.fromEntries(presentTypes(records).map((type) => [type, DEFAULT_ON_TYPES.has(type)]));

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-iris-600">{label}</p>
      {children}
    </section>
  );
}

function Stat({ value, label, accent }: { value: ReactNode; label: string; accent?: boolean }) {
  return (
    <div className={`px-2 py-3 ${accent ? "bg-iris-50" : "bg-white"}`}>
      <p className={`text-lg font-semibold leading-none ${accent ? "text-iris-700" : "text-charcoal-800"}`}>{value}</p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-charcoal-500">{label}</p>
    </div>
  );
}

export function AccountMapExplorer({ records }: Props) {
  // The whole explorer (filters + map) is the fullscreen target so filters stay
  // usable in fullscreen, instead of only the map element going fullscreen.
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const [theater, setTheater] = useState(ALL);
  const [subRegion, setSubRegion] = useState(ALL);
  const [vertical, setVertical] = useState(ALL);
  const [state, setState] = useState(ALL);
  const [me, setMe] = useState(EVERYONE);
  const [onlyMine, setOnlyMine] = useState(false);
  const [types, setTypes] = useState<Record<string, boolean>>(() => defaultTypeState(records));

  const accountTypes = useMemo(() => presentTypes(records), [records]);
  // Unknown types default to their preset (on for Customer/Prospect, off otherwise).
  const toggleType = (value: string) =>
    setTypes((prev) => ({ ...prev, [value]: !(prev[value] ?? DEFAULT_ON_TYPES.has(value)) }));

  const theaters = useMemo(
    () => [ALL, ...[...new Set(records.map((record) => record.theater).filter(Boolean))].sort()],
    [records],
  );
  // Sub-Region options cascade from the selected Theater so the list stays short.
  const subRegions = useMemo(
    () => [
      ALL,
      ...[
        ...new Set(
          records
            .filter((record) => theater === ALL || record.theater === theater)
            .map((record) => record.subRegion)
            .filter(Boolean),
        ),
      ].sort(),
    ],
    [records, theater],
  );
  const verticals = useMemo(
    () => [ALL, ...[...new Set(records.map((record) => record.vertical).filter(Boolean))].sort()],
    [records],
  );
  const states = useMemo(
    () => [ALL, ...[...new Set(records.map((record) => record.state).filter(Boolean))].sort()],
    [records],
  );
  const systemEngineers = useMemo(
    () => [EVERYONE, ...[...new Set(records.map((record) => record.systemEngineer).filter(Boolean))].sort()],
    [records],
  );

  const meSe = me === EVERYONE ? null : me;

  const filtered = useMemo(
    () =>
      records.filter(
        (record) =>
          (theater === ALL || record.theater === theater) &&
          (subRegion === ALL || record.subRegion === subRegion) &&
          (vertical === ALL || record.vertical === vertical) &&
          (state === ALL || record.state === state) &&
          (types[record.accountType] ?? DEFAULT_ON_TYPES.has(record.accountType)) &&
          (!onlyMine || (meSe !== null && record.systemEngineer === meSe)),
      ),
    [records, theater, subRegion, vertical, state, types, onlyMine, meSe],
  );

  const totalSales = filtered.reduce((sum, record) => sum + record.lastSales, 0);
  const totalVMs = filtered.reduce((sum, record) => sum + record.vmCount, 0);
  const mineCount = meSe ? filtered.filter((record) => record.systemEngineer === meSe).length : 0;

  const typesAtDefault = accountTypes.every(
    (t) => (types[t] ?? DEFAULT_ON_TYPES.has(t)) === DEFAULT_ON_TYPES.has(t),
  );
  const hasActiveFilters =
    theater !== ALL ||
    subRegion !== ALL ||
    vertical !== ALL ||
    state !== ALL ||
    me !== EVERYONE ||
    onlyMine ||
    !typesAtDefault;
  const resetFilters = () => {
    setTheater(ALL);
    setSubRegion(ALL);
    setVertical(ALL);
    setState(ALL);
    setMe(EVERYONE);
    setOnlyMine(false);
    setTypes(defaultTypeState(records));
  };

  const handleTheaterChange = (next: string) => {
    setTheater(next);
    setSubRegion(ALL);
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Account Coverage Map"
        subtitle="Filter accounts on the left, then click any point for full details."
      />

      <div ref={fullscreenRef} className="account-map-fs grid gap-4 lg:grid-cols-[264px_1fr]">
        <aside className="relative z-10 h-fit overflow-hidden rounded-xl border border-charcoal-200 border-t-2 border-t-iris-500 bg-white shadow-sm lg:sticky lg:top-[84px]">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-charcoal-900">
              <SlidersHorizontal className="h-4 w-4 text-iris-500" aria-hidden />
              Filters
            </span>
            <button
              type="button"
              disabled={!hasActiveFilters}
              className="rounded-full px-2 py-0.5 text-xs font-semibold text-iris-600 transition hover:bg-iris-50 disabled:text-charcoal-300 disabled:hover:bg-transparent"
              onClick={resetFilters}
            >
              Reset
            </button>
          </div>

          <div className="space-y-5 px-4 pb-4">
            <FilterGroup label="Coverage">
              <FormRow label="Theater" htmlFor="theaterFilter">
                <select id="theaterFilter" value={theater} onChange={(event) => handleTheaterChange(event.target.value)}>
                  {theaters.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FormRow>

              <FormRow label="Sub-Region" htmlFor="subRegionFilter">
                <select id="subRegionFilter" value={subRegion} onChange={(event) => setSubRegion(event.target.value)}>
                  {subRegions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FormRow>

              <FormRow label="State" htmlFor="stateFilter">
                <select id="stateFilter" value={state} onChange={(event) => setState(event.target.value)}>
                  {states.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FormRow>
            </FilterGroup>

            <FilterGroup label="Segment">
              <FormRow label="Vertical" htmlFor="verticalFilter">
                <select id="verticalFilter" value={vertical} onChange={(event) => setVertical(event.target.value)}>
                  {verticals.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FormRow>

              {accountTypes.length > 0 ? (
                <div className="space-y-2">
                  <label>Account Type</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {accountTypes.map((option) => {
                      const checked = types[option] ?? DEFAULT_ON_TYPES.has(option);
                      return (
                        <label
                          key={option}
                          className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium normal-case tracking-normal transition ${
                            checked
                              ? "border-iris-200 bg-iris-50/60 text-charcoal-800"
                              : "border-charcoal-200 bg-white text-charcoal-500"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-iris-600"
                            checked={checked}
                            onChange={() => toggleType(option)}
                          />
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: TYPE_DOT[option] ?? "#94a3b8" }}
                          />
                          {option}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </FilterGroup>

            <FilterGroup label="Highlight">
              <FormRow label="Viewing as (SE)" htmlFor="meFilter" helper="Your accounts get a highlighted ring on the map.">
                <select id="meFilter" value={me} onChange={(event) => setMe(event.target.value)}>
                  {systemEngineers.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FormRow>

              <label
                className={`flex cursor-pointer items-center gap-2 rounded-md bg-charcoal-50 px-2.5 py-2 text-xs font-medium normal-case tracking-normal ${
                  meSe ? "text-charcoal-700" : "cursor-not-allowed text-charcoal-400"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-iris-600"
                  checked={onlyMine}
                  disabled={!meSe}
                  onChange={(event) => setOnlyMine(event.target.checked)}
                />
                Show only my accounts
              </label>
            </FilterGroup>
          </div>

          <div className="grid grid-cols-2 gap-px border-t border-charcoal-100 bg-charcoal-100 text-center">
            <Stat value={filtered.length.toLocaleString()} label="Accounts" accent />
            <Stat value={meSe ? mineCount.toLocaleString() : "—"} label="Mine" />
            <Stat value={`$${Math.round(totalSales / 1000).toLocaleString()}K`} label="Sales" />
            <Stat value={totalVMs.toLocaleString()} label="VMs" />
          </div>
        </aside>

        <AccountMapView records={filtered} meSe={meSe} fullscreenContainer={fullscreenRef} />
      </div>
    </div>
  );
}
