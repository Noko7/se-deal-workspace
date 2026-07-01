"use client";

import { useEffect, useRef, useState } from "react";
import { cssHex, NUTANIX } from "@/lib/nutanix-brand";
import { drivesPerNode, emptyDriveSlots, hardwareImageFor, hardwareRearImageFor, platformSpecFor } from "@/lib/hardware-images";
import { getProductIcon } from "@/lib/nutanix-icons";
import { EDITION_TAGLINE, type EditionKey } from "@/lib/nci-editions";
import { LICENSE_CATALOG } from "@/lib/license-catalog";
import {
  basePlatformLabel,
  basePlatformLine,
  cpuSummary,
  hardwareRollup,
  memorySummary,
  nodeCores,
  nodeRawStorageTB,
  proposalHelpers,
  storageSummary,
  type ProposalDoc,
} from "@/lib/proposal-doc";

const { fmtInt, tib } = proposalHelpers;
const PURPLE = cssHex(NUTANIX.purple);

const FONT = { fontFamily: "'Montserrat', system-ui, sans-serif" } as const;
// Content insets that clear the letterhead overlay's top tab and bottom rule.
const PAGE_W = 816;
const PAGE_H = 1056;

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1">
      {items.filter(Boolean).map((it, i) => (
        <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-charcoal-700">
          <span style={{ color: PURPLE }}>•</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function ThreeCol({ groups }: { groups: { heading: string; items: string[] }[] }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {groups.map((g) => (
        <div key={g.heading}>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: PURPLE }}>{g.heading}</p>
          <Bullets items={g.items} />
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="h-4 w-1.5 rounded-full" style={{ background: PURPLE }} />
      <h2 className="text-[15px] font-bold text-charcoal-900" style={FONT}>{children}</h2>
    </div>
  );
}

// A single letterhead-styled page: white sheet with the official letterhead
// overlay (angled NUTANIX tab + purple footer rule) and a Nutanix footer line.
// Watches its own content: if edits push text past the printable area, a
// warning badge appears in the preview (hidden on the print surface) instead of
// the overflow silently clipping in the exported PDF.
function Page({ children, pageNo, customer }: { children: React.ReactNode; pageNo: number; customer: string }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflowPx, setOverflowPx] = useState(0);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const check = () => setOverflowPx(Math.max(0, el.scrollHeight - el.clientHeight));
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  });

  return (
    <div className="proposal-page relative bg-white text-charcoal-900" style={{ width: PAGE_W, height: PAGE_H, ...FONT }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/letterhead-overlay.png" alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
      <div ref={contentRef} className="relative flex h-full flex-col overflow-hidden px-16 pb-24 pt-28">{children}</div>
      {overflowPx > 4 ? (
        <div className="proposal-overflow-badge absolute inset-x-16 bottom-16 z-10 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-center text-[11px] font-semibold text-amber-800 shadow-sm">
          Content overflows page {pageNo} by ~{Math.round(overflowPx)}px and will be cut off in the PDF — trim the text above.
        </div>
      ) : null}
      <div className="absolute inset-x-16 bottom-9 flex justify-between text-[8px]" style={{ color: NUTANIX_HEX_SLATE }}>
        <span>Nutanix, Inc.&nbsp;&nbsp;Tel +1-855-688-2549&nbsp;&nbsp;•&nbsp;&nbsp;info@nutanix.com&nbsp;&nbsp;•&nbsp;&nbsp;© {new Date().getFullYear()} Nutanix, Inc. All Rights Reserved</span>
        <span>Confidential · {customer} · Page {pageNo}</span>
      </div>
    </div>
  );
}
const NUTANIX_HEX_SLATE = cssHex(NUTANIX.slate);

/** The 2-page mini-TCO Solution Brief, on the Nutanix corporate letterhead. */
export function ProposalTwoPager({ doc, logo }: { doc: ProposalDoc; logo: string | null }) {
  const t = doc.scenario.totals;
  const rollup = hardwareRollup(doc.scenario);
  const licLines = doc.licensing.lines;
  const base = basePlatformLine(doc);
  const baseLabel = basePlatformLabel(doc);
  const baseIsNci = !base || base.product === "CloudInfrastructure";
  const baseTagline = base && base.product === "EUC"
    ? "Full-stack platform for virtual desktops and apps."
    : `${EDITION_TAGLINE[(base?.tier as EditionKey) ?? doc.meta.edition] ?? ""}.`;
  return (
    <>
      {/* Page 1 */}
      <Page pageNo={1} customer={doc.meta.customer}>
        <div className="mb-4">
          <p className="text-[10px] font-semibold tracking-[0.18em]" style={{ color: PURPLE }}>{doc.options?.externalStorage ? "STORAGE PROPOSAL" : "SOLUTION PROPOSAL"}</p>
          <h1 className="mt-0.5 text-[24px] font-extrabold leading-tight text-charcoal-900">{doc.meta.title}</h1>
          <p className="mt-0.5 text-[11px] text-charcoal-500">
            {[doc.meta.opportunityName, doc.meta.installCountry, doc.meta.dateLabel].filter(Boolean).join("  ·  ")}
            {"  ·  Prepared by "}{doc.meta.preparedBy}
          </p>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="customer" className="mt-2 h-8 w-auto max-w-[160px] object-contain" />
          ) : null}
        </div>

        <section className="mb-4">
          <SectionTitle>Executive Summary</SectionTitle>
          <p className="text-[12px] leading-relaxed text-charcoal-700">{doc.executiveSummary}</p>
        </section>

        <section className="mb-4">
          <SectionTitle>Current Challenges</SectionTitle>
          <p className="mb-2 text-[11px] text-charcoal-600">{doc.challengesIntro}</p>
          <ThreeCol
            groups={[
              { heading: "Technical", items: doc.challenges.technical },
              { heading: "Operational", items: doc.challenges.operational },
              { heading: "Financial", items: doc.challenges.financial },
            ]}
          />
        </section>

        <section>
          <SectionTitle>Nutanix Proposed Benefits</SectionTitle>
          <p className="mb-2 text-[11px] text-charcoal-600">{doc.benefitsIntro}</p>
          <ThreeCol
            groups={[
              { heading: "Technical", items: doc.benefits.technical },
              { heading: "Operational", items: doc.benefits.operational },
              { heading: "Financial", items: doc.benefits.financial },
            ]}
          />
        </section>
      </Page>

      {/* Page 2 */}
      <Page pageNo={2} customer={doc.meta.customer}>
        <section className="mb-4">
          <SectionTitle>Current State vs. Proposed State</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-charcoal-200 bg-charcoal-50 p-3">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-charcoal-500">Current</p>
              <Bullets items={doc.currentState} />
            </div>
            <div className="rounded-lg border p-3" style={{ borderColor: PURPLE, background: cssHex(NUTANIX.cloud) }}>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: PURPLE }}>Proposed</p>
              <Bullets items={doc.proposedState} />
            </div>
          </div>
        </section>

        <section className="mb-4">
          <SectionTitle>About the Process</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {doc.timeline.map((m, i) => (
              <span
                key={i}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium"
                style={m.label.toLowerCase().includes("go live") ? { background: PURPLE, color: "white" } : { background: cssHex(NUTANIX.cloud), color: cssHex(NUTANIX.ink) }}
              >
                <span className="opacity-50">{i + 1}</span>
                {m.label}
              </span>
            ))}
          </div>
        </section>

        <section className="mb-4">
          <SectionTitle>Nutanix Solution Summary</SectionTitle>
          <div className="mb-3 flex items-center gap-3 rounded-lg border border-iris-100 bg-iris-50/50 p-2.5">
            {baseIsNci ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={getProductIcon("CloudInfrastructure", "Color", "text")} alt="NCI" className="h-7 w-auto object-contain" />
            ) : (
              <span className="rounded-md px-2 py-1 text-[12px] font-extrabold text-white" style={{ background: PURPLE }}>EUC</span>
            )}
            <div className="text-[11px] text-charcoal-700">
              <span className="font-bold text-charcoal-900">{baseLabel}</span>: {baseTagline} {doc.meta.supportTerm}.
            </div>
          </div>
          {doc.options?.externalStorage ? (
            <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-charcoal-200 bg-charcoal-50 p-2.5">
              <span className="text-[11px] text-charcoal-600">Primary storage delivered by</span>
              {doc.options.externalStorageVendor === "Pure Storage" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/brand/pure-storage.png" alt="Pure Storage" className="h-4 w-auto object-contain" />
              ) : (
                <span className="text-[11px] font-bold text-charcoal-800">{doc.options.externalStorageVendor}</span>
              )}
              <span className="text-[11px] text-charcoal-500">over NVMe/TCP</span>
            </div>
          ) : null}
          {licLines.length ? (
            <table className="mb-3 w-full border-collapse text-[10px]">
              <thead>
                <tr className="text-charcoal-500">
                  <th className="border-b border-charcoal-200 px-2 py-1 text-left font-semibold">Software</th>
                  <th className="border-b border-charcoal-200 px-2 py-1 text-left font-semibold">Tier / edition</th>
                  <th className="border-b border-charcoal-200 px-2 py-1 text-right font-semibold">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {licLines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-2 py-1 font-semibold text-charcoal-800">{LICENSE_CATALOG[l.product].label}</td>
                    <td className="px-2 py-1 text-charcoal-600">{l.tier}</td>
                    <td className="px-2 py-1 text-right text-charcoal-600">{fmtInt(l.qty)} {l.unit}</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold" style={{ borderColor: PURPLE }}>
                  <td className="px-2 py-1 text-charcoal-700" colSpan={3}>Licensed for a {doc.licensing.termYears}-year subscription term. Pricing provided in a separate quote.</td>
                </tr>
              </tbody>
            </table>
          ) : null}
          {rollup.some((r) => hardwareImageFor(r.sku) || hardwareRearImageFor(r.sku)) ? (
            <div className="mb-3 flex flex-wrap items-end gap-5">
              {rollup.map((r) => {
                const front = hardwareImageFor(r.sku);
                const rear = hardwareRearImageFor(r.sku);
                if (!front && !rear) return null;
                return (
                  <div key={r.sku} className="flex flex-col items-center">
                    <div className="flex flex-col gap-1.5">
                      {front ? (
                        <div className="flex items-center gap-1.5">
                          <span className="w-8 text-right text-[8px] uppercase tracking-wide text-charcoal-400">Front</span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={front} alt={`${r.sku} front`} className="h-9 w-auto max-w-[150px] object-contain" />
                        </div>
                      ) : null}
                      {rear ? (
                        <div className="flex items-center gap-1.5">
                          <span className="w-8 text-right text-[8px] uppercase tracking-wide text-charcoal-400">Rear</span>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={rear} alt={`${r.sku} rear`} className="h-9 w-auto max-w-[150px] object-contain" />
                        </div>
                      ) : null}
                    </div>
                    <span className="mt-1 text-[9px] font-medium text-charcoal-500">{r.nodes}× {r.sku}</span>
                  </div>
                );
              })}
            </div>
          ) : null}
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr style={{ background: PURPLE }} className="text-white">
                <th className="px-2 py-1 text-left">Hardware</th>
                <th className="px-2 py-1 text-right">Nodes</th>
                <th className="px-2 py-1 text-left">CPU</th>
                <th className="px-2 py-1 text-right">Cores</th>
                <th className="px-2 py-1 text-right">RAM (GB)</th>
                <th className="px-2 py-1 text-right">Raw TB</th>
              </tr>
            </thead>
            <tbody>
              {rollup.map((r, i) => (
                <tr key={r.sku} className={i % 2 ? "bg-iris-50/40" : "bg-white"}>
                  <td className="px-2 py-1 font-semibold">{r.sku}</td>
                  <td className="px-2 py-1 text-right">{r.nodes}</td>
                  <td className="px-2 py-1">{r.cpuSummary}</td>
                  <td className="px-2 py-1 text-right">{fmtInt(r.cores)}</td>
                  <td className="px-2 py-1 text-right">{fmtInt(r.ramGiB)}</td>
                  <td className="px-2 py-1 text-right">{r.rawStorageTB.toFixed(1)}</td>
                </tr>
              ))}
              <tr className="border-t-2 font-semibold" style={{ borderColor: PURPLE }}>
                <td className="px-2 py-1">Total</td>
                <td className="px-2 py-1 text-right">{fmtInt(t.nodes)}</td>
                <td className="px-2 py-1" />
                <td className="px-2 py-1 text-right">{fmtInt(t.cores)}</td>
                <td className="px-2 py-1 text-right">{fmtInt(t.ramGiB)}</td>
                <td className="px-2 py-1 text-right">{tib(t.ssdTiB + t.hddTiB)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {doc.quote.text ? (
          <section className="mt-auto rounded-lg border-l-4 px-4 py-3" style={{ borderColor: PURPLE, background: "#FBFAFF" }}>
            <p className="text-[13px] italic text-charcoal-800">“{doc.quote.text}”</p>
            <p className="mt-1 text-[10px] font-semibold text-charcoal-500">{doc.quote.author}</p>
          </section>
        ) : null}
      </Page>
    </>
  );
}

/** Per-cluster + node spec preview that mirrors the BOM deck content. */
export function ProposalBomPreview({ doc }: { doc: ProposalDoc }) {
  const seen = new Set<string>();
  const uniqueModels = doc.scenario.clusters.flatMap((c) => c.models).filter((m) => (seen.has(m.sku) ? false : (seen.add(m.sku), true)));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {doc.scenario.clusters.map((c) => (
          <div key={c.name} className="rounded-xl border border-charcoal-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-charcoal-900">{c.name}</h4>
              <span className="rounded-full bg-iris-50 px-2 py-0.5 text-[11px] font-medium text-iris-700">{c.nodes} nodes</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                { l: "Cores", v: fmtInt(c.capacity.cores), u: c.utilization.cpu },
                { l: "RAM", v: `${fmtInt(c.capacity.ramGiB)}G`, u: c.utilization.ram },
                { l: "Storage", v: tib(c.capacity.ssdTiB + c.capacity.hddTiB), u: c.utilization.storage },
              ].map((m) => (
                <div key={m.l} className="rounded-lg bg-charcoal-50 px-1.5 py-2">
                  <p className="text-[13px] font-bold text-charcoal-900">{m.v}</p>
                  <p className="text-[10px] text-charcoal-500">{m.l}</p>
                  {m.u != null ? <p className="text-[10px] font-medium text-iris-600">{m.u}%</p> : null}
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1.5">
              {c.models.map((m, i) => (
                <div key={i} className="rounded-lg border border-charcoal-100 bg-charcoal-50/60 px-2.5 py-1.5">
                  <p className="text-[12px] font-semibold text-charcoal-900">{m.nodes}× {m.sku}</p>
                  <p className="text-[10px] text-charcoal-500">{cpuSummary(m)}</p>
                  <p className="text-[10px] text-charcoal-500">{memorySummary(m)} · {storageSummary(m)}</p>
                </div>
              ))}
            </div>
            {c.license ? (
              <p className="mt-2 text-[11px] text-charcoal-500">
                License: <span className="font-medium text-charcoal-700">NCI {c.license.edition}</span>
                {c.license.cores ? ` · ${fmtInt(c.license.cores)} cores` : ""}
                {c.license.termMonths ? ` · ${c.license.termMonths} mo` : ""}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div>
        <h4 className="mb-2 text-sm font-bold text-charcoal-900">Node Spec Sheets</h4>
        <div className="grid gap-3 md:grid-cols-2">
          {uniqueModels.map((m) => {
            const front = hardwareImageFor(m.sku);
            const rear = hardwareRearImageFor(m.sku);
            const plat = platformSpecFor(m.sku);
            const used = drivesPerNode(m.drives);
            const empty = emptyDriveSlots(m.sku, m.drives);
            const bays = plat?.maxDriveBays ?? null;
            return (
              <div key={m.sku} className="rounded-xl border border-charcoal-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-charcoal-900">{m.sku}</p>
                    {plat ? <p className="text-[10px] font-medium text-iris-600">{plat.family} · {plat.generation} · {plat.formFactor}</p> : null}
                  </div>
                  {plat && plat.status !== "current" ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
                      {plat.status === "endOfSale" ? "End of sale" : "Out of support"}
                    </span>
                  ) : null}
                </div>
                {front || rear ? (
                  <div className="mt-2 space-y-1.5 rounded-lg bg-charcoal-50 p-2">
                    {front ? (
                      <div className="flex items-center gap-2">
                        <span className="w-8 shrink-0 text-[8px] uppercase tracking-wide text-charcoal-400">Front</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={front} alt={`${m.sku} front`} className="max-h-12 w-full object-contain" />
                      </div>
                    ) : null}
                    {rear ? (
                      <div className="flex items-center gap-2">
                        <span className="w-8 shrink-0 text-[8px] uppercase tracking-wide text-charcoal-400">Rear</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={rear} alt={`${m.sku} rear`} className="max-h-12 w-full object-contain" />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-3 flex gap-3">
                  <dl className="min-w-0 flex-1 space-y-1 text-[11px]">
                    {[
                      ["CPU", cpuSummary(m)],
                      ["Memory", memorySummary(m)],
                      ["Storage", storageSummary(m)],
                      ["Network", m.nic ?? "N/A"],
                      ["Cores/node", String(nodeCores(m) || "N/A")],
                      ["Raw/node", `${nodeRawStorageTB(m).toFixed(2)} TB`],
                      ...(bays != null ? [["Drive bays", `${used} of ${bays} populated${empty != null ? ` · ${empty} empty` : ""}`] as [string, string]] : []),
                    ].map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="w-20 shrink-0 font-semibold text-charcoal-500">{k}</dt>
                        <dd className="text-charcoal-700">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                {plat ? (
                  <div className="mt-3 rounded-lg border border-iris-100 bg-iris-50/50 p-2.5 text-[11px]">
                    <p className="mb-1 text-[9px] font-bold uppercase tracking-wide text-iris-600">Platform reference</p>
                    <dl className="space-y-0.5">
                      {[
                        ["Form factor", plat.formFactor],
                        ["CPU", plat.cpu],
                        ["Cores/CPU", plat.coreRange],
                        ["Memory", plat.memoryRange],
                        ["Storage", plat.storage],
                        ...(plat.gpu ? [["GPU", plat.gpu] as [string, string]] : []),
                        ...(bays != null ? [["Drive bays", `${bays} (${empty ?? 0} unused)`] as [string, string]] : []),
                        ["Best for", plat.useCases],
                      ].map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="w-20 shrink-0 font-semibold text-charcoal-500">{k}</dt>
                          <dd className="text-charcoal-700">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
