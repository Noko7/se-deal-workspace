"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { FormRow, SectionHeader } from "@/components/ui";
import type { AccountMapRecord } from "@/lib/account-map";

const AccountMapView = dynamic(
  () => import("@/components/account-map-view").then((module) => module.AccountMapView),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[600px] w-full items-center justify-center rounded-lg border border-charcoal-200 bg-charcoal-50 text-sm text-charcoal-500">
        Loading map…
      </div>
    ),
  },
);

type Props = {
  records: AccountMapRecord[];
};

const ALL_REGIONS = "All Regions";
const ALL = "All";
const EVERYONE = "Everyone";

// Fixed go-to-market segments for the Vertical filter (not derived from data).
const VERTICALS = [ALL, "SLED", "Federal", "Commercial", "Enterprise", "Inside"];

export function AccountMapExplorer({ records }: Props) {
  const [region, setRegion] = useState(ALL_REGIONS);
  const [vertical, setVertical] = useState(ALL);
  const [state, setState] = useState(ALL);
  const [me, setMe] = useState(EVERYONE);
  const [onlyMine, setOnlyMine] = useState(false);

  const regions = useMemo(() => [ALL_REGIONS, ...new Set(records.map((record) => record.region))], [records]);
  const states = useMemo(() => [ALL, ...new Set(records.map((record) => record.state))], [records]);
  const systemEngineers = useMemo(
    () => [EVERYONE, ...[...new Set(records.map((record) => record.systemEngineer))].sort()],
    [records],
  );

  const meSe = me === EVERYONE ? null : me;

  const filtered = useMemo(
    () =>
      records.filter(
        (record) =>
          (region === ALL_REGIONS || record.region === region) &&
          (vertical === ALL || record.vertical === vertical) &&
          (state === ALL || record.state === state) &&
          (!onlyMine || (meSe !== null && record.systemEngineer === meSe)),
      ),
    [records, region, vertical, state, onlyMine, meSe],
  );

  const totalSales = filtered.reduce((sum, record) => sum + record.lastSales, 0);
  const totalVMs = filtered.reduce((sum, record) => sum + record.vmCount, 0);
  const mineCount = meSe ? filtered.filter((record) => record.systemEngineer === meSe).length : 0;

  const hasActiveFilters =
    region !== ALL_REGIONS || vertical !== ALL || state !== ALL || me !== EVERYONE || onlyMine;
  const resetFilters = () => {
    setRegion(ALL_REGIONS);
    setVertical(ALL);
    setState(ALL);
    setMe(EVERYONE);
    setOnlyMine(false);
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="National Account Coverage"
        subtitle="Filter on the left and click any point for full account details. Choose who you are to highlight your accounts."
      />

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="h-fit space-y-4 rounded-xl border border-charcoal-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-charcoal-900">Filters</p>
            {hasActiveFilters ? (
              <button
                type="button"
                className="bg-transparent p-0 text-xs font-semibold text-iris-600 hover:bg-transparent hover:text-iris-700"
                onClick={resetFilters}
              >
                Reset
              </button>
            ) : null}
          </div>

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
            className={`flex items-center gap-2 text-xs font-medium normal-case tracking-normal ${
              meSe ? "text-charcoal-700" : "text-charcoal-400"
            }`}
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={onlyMine}
              disabled={!meSe}
              onChange={(event) => setOnlyMine(event.target.checked)}
            />
            Show only my accounts
          </label>

          <div className="space-y-1.5">
            <label>Region</label>
            <div className="flex flex-wrap gap-1.5">
              {regions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setRegion(option)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                    region === option
                      ? "bg-iris-500 text-white hover:bg-iris-600"
                      : "border border-charcoal-200 bg-charcoal-50 text-charcoal-700 hover:bg-charcoal-100"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <FormRow label="Vertical" htmlFor="verticalFilter">
            <select id="verticalFilter" value={vertical} onChange={(event) => setVertical(event.target.value)}>
              {VERTICALS.map((option) => (
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

          <div className="grid grid-cols-2 gap-2 border-t border-charcoal-200 pt-3 text-center">
            <div className="rounded-md bg-iris-50 p-2">
              <p className="text-base font-semibold text-iris-700">{filtered.length}</p>
              <p className="text-[10px] uppercase tracking-wide text-charcoal-500">Accounts</p>
            </div>
            <div className="rounded-md bg-charcoal-50 p-2">
              <p className="text-base font-semibold text-charcoal-800">{meSe ? mineCount : "—"}</p>
              <p className="text-[10px] uppercase tracking-wide text-charcoal-500">Mine</p>
            </div>
            <div className="rounded-md bg-charcoal-50 p-2">
              <p className="text-base font-semibold text-charcoal-800">${Math.round(totalSales / 1000)}K</p>
              <p className="text-[10px] uppercase tracking-wide text-charcoal-500">Sales</p>
            </div>
            <div className="rounded-md bg-charcoal-50 p-2">
              <p className="text-base font-semibold text-charcoal-800">{totalVMs.toLocaleString()}</p>
              <p className="text-[10px] uppercase tracking-wide text-charcoal-500">VMs</p>
            </div>
          </div>
        </aside>

        <AccountMapView records={filtered} meSe={meSe} />
      </div>
    </div>
  );
}
