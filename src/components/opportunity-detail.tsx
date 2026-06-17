"use client";

import { useState } from "react";
import {
  CalendarClock,
  ClipboardList,
  FileText,
  NotebookPen,
  Paperclip,
  Sparkles,
  Users,
} from "lucide-react";
import { updateOpportunityAction } from "@/lib/actions";
import { PRODUCT_OPTIONS } from "@/lib/salesforce-options";
import { Button, Card, EmptyState, StatusPill } from "@/components/ui";
import type { OpportunityDetailView } from "@/lib/opportunity-detail";

const TABS = ["Overview", "Notes", "Activity", "Contacts", "Attachments"] as const;
type Tab = (typeof TABS)[number];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function money(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-charcoal-200 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-charcoal-500">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-charcoal-800">{value || "—"}</p>
    </div>
  );
}

function Narrative({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg border border-charcoal-200 bg-white p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-iris-600">{label}</p>
      {value ? (
        <p className="whitespace-pre-wrap text-sm text-charcoal-700">{value}</p>
      ) : (
        <p className="text-sm text-charcoal-400">Not set.</p>
      )}
    </div>
  );
}

export function OpportunityDetail({ opp }: { opp: OpportunityDetailView }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card title={opp.opportunityName} subtitle={`${opp.oppId} · ${opp.accountName}`}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="info">{opp.stage}</StatusPill>
          <StatusPill tone="neutral">Tech close: {opp.technicalCloseStatus}</StatusPill>
          <StatusPill tone="neutral">Owner: {opp.owner}</StatusPill>
          {opp.partners ? <StatusPill tone="neutral">{opp.partners}</StatusPill> : null}
          {opp.tags.map((tag) => (
            <StatusPill key={tag} tone="warning">
              {tag}
            </StatusPill>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Fact label="ACV Amount" value={money(opp.acvAmount)} />
          <Fact label="Services ACV" value={money(opp.servicesAcv)} />
          <Fact label="Amount" value={money(opp.amount)} />
          <Fact label="Probability" value={`${opp.probability}%`} />
          <Fact label="Close" value={`${opp.closeQuarter}${opp.closeDate ? ` · ${fmtDate(opp.closeDate)}` : ""}`} />
          <Fact label="Forecast" value={opp.forecastCategory} />
          <Fact label="Portfolio" value={opp.portfolio} />
          <Fact label="Tech Close Date" value={fmtDate(opp.technicalCloseDate)} />
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-charcoal-200">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            aria-current={tab === name ? "page" : undefined}
            className={`-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === name
                ? "border-iris-500 text-iris-700"
                : "border-transparent text-charcoal-500 hover:text-charcoal-800"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <div className="space-y-4">
          <Card title="Deal Meta" subtitle="Products, environment, and qualification flags.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Fact label="Hypervisor" value={opp.hypervisor} />
              <Fact label="Intend to use for NC2" value={opp.intendToUseForNc2 ? "Yes" : "No"} />
              <Fact label="BOM Attached" value={opp.bomAttached ? "Yes" : "No"} />
              <Fact label="X-Ray Used" value={opp.xrayUsed ? "Yes" : "No"} />
              <Fact label="Technical Decision Maker" value={opp.technicalDecisionMaker} />
              <Fact label="Next Action" value={opp.nextAction} />
            </div>
            <div className="mt-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-charcoal-500">Products in deal</p>
              {opp.products.length === 0 ? (
                <p className="text-sm text-charcoal-400">No products set.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {opp.products.map((product) => (
                    <StatusPill key={product} tone="info">
                      {product}
                    </StatusPill>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <div className="grid gap-3 lg:grid-cols-2">
            <Narrative label="Outcome" value={opp.outcome} />
            <Narrative label="Next Steps to Close" value={opp.nextStepsToClose} />
            <Narrative label="Why Now?" value={opp.whyNow} />
            <Narrative label="Why Nutanix?" value={opp.whyNutanix} />
            <Narrative label="Channel Notes" value={opp.channelNotes} />
            <Narrative label="Key Contacts" value={opp.keyContacts} />
          </div>

          <Card title="Edit Opportunity" subtitle="Update the Salesforce-mapped opportunity fields.">
            <button
              type="button"
              onClick={() => setEditing((value) => !value)}
              className="mb-3 rounded-md border border-charcoal-300 bg-white px-3 py-1.5 text-sm font-medium text-charcoal-800 hover:bg-charcoal-50"
            >
              {editing ? "Hide editor" : "Edit fields"}
            </button>
            {editing ? <EditForm opp={opp} /> : null}
          </Card>
        </div>
      ) : null}

      {tab === "Notes" ? (
        <div className="space-y-4">
          <Card
            title="Auto-pulled from Zoom"
            subtitle="AI summaries and transcripts ingested from meetings (configure in Integrations → Zoom)."
            icon={<Sparkles className="h-5 w-5" />}
          >
            {opp.transcripts.length === 0 ? (
              <EmptyState
                title="No Zoom content yet"
                description="When Zoom auto-sync is enabled, meeting summaries and transcripts appear here automatically."
              />
            ) : (
              <ul className="space-y-2">
                {opp.transcripts.map((transcript) => (
                  <li key={transcript.id} className="rounded-md border border-charcoal-200 bg-white p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-charcoal-800">{transcript.meetingSubject}</span>
                      <span className="text-xs text-charcoal-400">{fmtDate(transcript.date)}</span>
                      {transcript.hasTranscript ? <StatusPill tone="good">Transcript</StatusPill> : null}
                    </div>
                    {transcript.summary ? (
                      <p className="whitespace-pre-wrap text-sm text-charcoal-700">{transcript.summary}</p>
                    ) : (
                      <p className="text-sm text-charcoal-400">No summary captured.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="All Notes" subtitle="Meeting and account notes, newest first." icon={<NotebookPen className="h-5 w-5" />}>
            {opp.notes.length === 0 ? (
              <EmptyState title="No notes yet" description="Notes added to meetings or this account will appear here." />
            ) : (
              <ul className="space-y-2">
                {opp.notes.map((note) => (
                  <li key={note.id} className="rounded-md border border-charcoal-200 bg-white p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <StatusPill tone={note.fromZoom ? "good" : "info"}>{note.fromZoom ? "Zoom" : note.role}</StatusPill>
                      <span className="text-xs text-charcoal-500">{note.author}</span>
                      {note.meetingSubject ? (
                        <span className="text-xs text-charcoal-400">· {note.meetingSubject}</span>
                      ) : null}
                      <span className="ml-auto text-xs text-charcoal-400">{fmtDate(note.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-charcoal-700">{note.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "Activity" ? (
        <div className="space-y-4">
          <Card title="Meetings" subtitle="Synced meetings for this opportunity." icon={<CalendarClock className="h-5 w-5" />}>
            {opp.meetings.length === 0 ? (
              <EmptyState title="No meetings" description="Synced meetings will appear here." />
            ) : (
              <ul className="space-y-2">
                {opp.meetings.map((meeting) => (
                  <li
                    key={meeting.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-charcoal-200 bg-white p-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-charcoal-800">{meeting.subject}</p>
                      <p className="text-xs text-charcoal-400">{fmtDate(meeting.start)}</p>
                    </div>
                    <StatusPill tone="neutral">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" /> {meeting.attendees.length}
                      </span>
                    </StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Salesforce Tasks" subtitle="Tasks logged from the calendar." icon={<ClipboardList className="h-5 w-5" />}>
            {opp.tasks.length === 0 ? (
              <EmptyState
                title="No tasks logged"
                description="Log a Salesforce task from a meeting in the Calendar to see it here."
              />
            ) : (
              <ul className="space-y-2">
                {opp.tasks.map((task) => (
                  <li key={task.id} className="rounded-md border border-charcoal-200 bg-white p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-charcoal-800">{task.taskName}</span>
                      <StatusPill tone={task.syncStatus === "SENT" ? "good" : "warning"}>{task.syncStatus}</StatusPill>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-charcoal-500">
                      <span>Status: {task.status}</span>
                      <span>· Priority: {task.priority}</span>
                      {task.type ? <span>· {task.type}</span> : null}
                      <span>· Due: {fmtDate(task.dueDate)}</span>
                    </div>
                    {task.products.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {task.products.map((product) => (
                          <StatusPill key={product} tone="info">
                            {product}
                          </StatusPill>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "Contacts" ? (
        <Card title="Contacts" subtitle="Key contacts and meeting attendees." icon={<Users className="h-5 w-5" />}>
          {opp.keyContacts ? (
            <div className="mb-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-iris-600">Key contacts</p>
              <p className="whitespace-pre-wrap text-sm text-charcoal-700">{opp.keyContacts}</p>
            </div>
          ) : null}
          {opp.contacts.length === 0 ? (
            <EmptyState title="No contacts" description="Add key contacts in the Overview editor, or sync meetings with attendees." />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {opp.contacts.map((contact) => (
                <StatusPill key={contact} tone="neutral">
                  {contact}
                </StatusPill>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {tab === "Attachments" ? (
        <Card title="Attachments" subtitle="Assets linked to this opportunity." icon={<Paperclip className="h-5 w-5" />}>
          {opp.assets.length === 0 ? (
            <EmptyState title="No attachments" description="Assets attached to meetings or the account appear here." />
          ) : (
            <ul className="space-y-2">
              {opp.assets.map((asset) => (
                <li key={asset.id} className="flex items-center gap-2 rounded-md border border-charcoal-200 bg-white p-3">
                  <FileText className="h-4 w-4 shrink-0 text-iris-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-charcoal-800">{asset.title}</p>
                    <p className="text-xs text-charcoal-400">
                      {asset.type.replaceAll("_", " ")} · {asset.sourceTool} · {fmtDate(asset.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}

function EditForm({ opp }: { opp: OpportunityDetailView }) {
  return (
    <form action={updateOpportunityAction} className="space-y-3 text-sm">
      <input type="hidden" name="dealId" value={opp.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-charcoal-600">ACV Amount ($)</span>
          <input type="number" step="0.01" name="acvAmount" defaultValue={opp.acvAmount} className="w-full" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-charcoal-600">Services ACV ($)</span>
          <input type="number" step="0.01" name="servicesAcv" defaultValue={opp.servicesAcv} className="w-full" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-charcoal-600">Forecast Category</span>
          <input name="forecastCategory" defaultValue={opp.forecastCategory ?? ""} className="w-full" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-charcoal-600">Portfolio</span>
          <input name="portfolio" defaultValue={opp.portfolio ?? ""} className="w-full" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-charcoal-600">Hypervisor</span>
          <input name="hypervisor" defaultValue={opp.hypervisor ?? ""} className="w-full" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-charcoal-600">Partners</span>
          <input name="partners" defaultValue={opp.partners ?? ""} className="w-full" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-charcoal-600">Technical Close Date</span>
          <input type="date" name="technicalCloseDate" defaultValue={opp.technicalCloseDate ? opp.technicalCloseDate.slice(0, 10) : ""} className="w-full" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-charcoal-600">Technical Decision Maker</span>
          <input name="technicalDecisionMaker" defaultValue={opp.technicalDecisionMaker ?? ""} className="w-full" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-charcoal-600">Tags (comma-separated)</span>
          <input name="tags" defaultValue={opp.tags.join(", ")} className="w-full" />
        </label>
      </div>

      <fieldset className="space-y-1.5 rounded-md border border-charcoal-200 bg-white p-2.5">
        <legend className="px-1 text-xs font-semibold text-charcoal-600">Products in deal</legend>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {PRODUCT_OPTIONS.map((product) => (
            <label key={product} className="flex items-center gap-1.5 text-xs text-charcoal-700">
              <input
                type="checkbox"
                name="products"
                value={product}
                defaultChecked={opp.products.includes(product)}
                className="h-3.5 w-3.5 accent-iris-600"
              />
              {product}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs text-charcoal-700">
          <input type="checkbox" name="intendToUseForNc2" defaultChecked={opp.intendToUseForNc2} className="h-3.5 w-3.5 accent-iris-600" />
          Intend to use for NC2
        </label>
        <label className="flex items-center gap-2 text-xs text-charcoal-700">
          <input type="checkbox" name="bomAttached" defaultChecked={opp.bomAttached} className="h-3.5 w-3.5 accent-iris-600" />
          BOM Attached
        </label>
        <label className="flex items-center gap-2 text-xs text-charcoal-700">
          <input type="checkbox" name="xrayUsed" defaultChecked={opp.xrayUsed} className="h-3.5 w-3.5 accent-iris-600" />
          X-Ray Used
        </label>
      </div>

      {(
        [
          ["outcome", "Outcome"],
          ["nextStepsToClose", "Next Steps to Close"],
          ["whyNow", "Why Now?"],
          ["whyNutanix", "Why Nutanix?"],
          ["channelNotes", "Channel Notes"],
          ["keyContacts", "Key Contacts (one per line)"],
        ] as const
      ).map(([name, label]) => (
        <label key={name} className="block space-y-1">
          <span className="text-xs font-semibold text-charcoal-600">{label}</span>
          <textarea name={name} rows={3} defaultValue={(opp[name] as string | null) ?? ""} className="w-full" />
        </label>
      ))}

      <div className="flex justify-end">
        <Button type="submit">Save Opportunity</Button>
      </div>
    </form>
  );
}
