import Link from "next/link";
import { notFound } from "next/navigation";
import type { MeetingAsset } from "@prisma/client";
import { ArrowLeft, BookOpenText, Briefcase, ExternalLink, FolderOpen, History, Users } from "lucide-react";
import { addNoteAction } from "@/lib/actions";
import { getAccountDetail } from "@/lib/data";
import { buildAccountKnowledgeBase } from "@/lib/account-ai";
import { toCalendarMeeting } from "@/lib/calendar";
import { AccountWorkspaceClient } from "@/components/account-workspace-client";
import { relativeDay, shortDate, shortDateTime } from "@/lib/format";
import { ActionBar, Button, Card, EmptyState, PreviewStatusPill, SectionHeader, StatusPill } from "@/components/ui";

export const dynamic = "force-dynamic";

type NoteRole = "SE" | "AE" | "SAM";

type AccountNote = {
  id: string;
  role: NoteRole;
  author: string;
  body: string;
  createdAt: Date;
  meeting?: { id: string; subject: string } | null;
};

function countAttendees(attendeesJson: string): number {
  try {
    const parsed = JSON.parse(attendeesJson);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function roleTone(role: NoteRole): string {
  if (role === "AE") return "bg-sky-100 text-sky-700";
  if (role === "SAM") return "bg-emerald-100 text-emerald-700";
  return "bg-iris-100 text-iris-700";
}

function stageProbability(stage: string): number {
  const s = stage.toLowerCase();
  if (s.includes("closed won")) return 100;
  if (s.includes("proposal")) return 70;
  if (s.includes("technical")) return 65;
  if (s.includes("qualification")) return 30;
  if (s.includes("discovery")) return 20;
  return 50;
}

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await getAccountDetail(id);

  if (!deal) {
    notFound();
  }

  // Serialize the account's meetings for the carousel + reused detail panel, and
  // assemble the per-account knowledge base summary for the Account-AI brain.
  const calendarMeetings = deal.meetings.map((meeting) =>
    toCalendarMeeting({
      ...meeting,
      deal: { id: deal.id, name: deal.name, accountName: deal.accountName, stage: deal.stage },
    }),
  );
  const knowledgeBase = await buildAccountKnowledgeBase(id);

  const notes = deal.notes as AccountNote[];
  const allAssets = deal.assets;
  const presentations = allAssets.filter((asset) => asset.type === "PRESENTATION");
  const whiteboards = allAssets.filter((asset) => asset.type === "WHITEBOARD");
  const otherAssets = allAssets.filter((asset) => asset.type !== "PRESENTATION" && asset.type !== "WHITEBOARD");

  const timeline = [
    ...deal.meetings.map((meeting) => ({
      kind: "meeting" as const,
      id: meeting.id,
      at: meeting.startTime,
      meeting,
      notes: notes.filter((note) => note.meeting?.id === meeting.id),
    })),
    ...notes
      .filter((note) => !note.meeting?.id)
      .map((note) => ({
        kind: "note" as const,
        id: note.id,
        at: note.createdAt,
        note,
      })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const stat = (label: string, value: number) => (
    <div className="rounded-lg border border-charcoal-200 bg-white px-3 py-2 text-center shadow-sm">
      <p className="text-lg font-semibold text-iris-600">{value}</p>
      <p className="text-xs uppercase tracking-wide text-charcoal-500">{label}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <Link
        href="/accounts"
        className="inline-flex items-center gap-1 text-sm font-medium text-iris-600 hover:text-iris-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to accounts
      </Link>

      {/* Full-height Account-AI chatbot — the condensed account header + meeting
          carousel are contained inside the chat box at the top. */}
      {knowledgeBase ? (
        <AccountWorkspaceClient
          dealId={deal.id}
          accountName={deal.accountName}
          dealName={deal.name}
          stage={deal.stage}
          owner={deal.owner}
          nextAction={deal.nextAction}
          latestSignal={deal.latestSignal}
          meetings={calendarMeetings}
          summary={knowledgeBase.summary}
        />
      ) : null}

      <Card
        title="Account Workspace Summary"
        subtitle="Clean central view of account health, activity, and collateral."
        icon={<BookOpenText className="h-5 w-5" />}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {stat("Meetings", deal.meetings.length)}
          {stat("Notes", notes.length)}
          {stat("Assets", allAssets.length)}
          {stat("Presentations", presentations.length)}
          {stat("Whiteboards", whiteboards.length)}
        </div>
      </Card>

      <Card
        title="Opportunities (Salesforce-Ready)"
        subtitle="Central opportunity section with mapped fields, ready for Salesforce API integration."
        icon={<Briefcase className="h-5 w-5" />}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-charcoal-200 bg-charcoal-50 text-charcoal-700">
                <th className="px-3 py-2 font-semibold">Field</th>
                <th className="px-3 py-2 font-semibold">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal-100">
              <SfFieldRow label="Opportunity Name" value={deal.name} />
              <SfFieldRow label="Account Name" value={deal.accountName} />
              <SfFieldRow label="Opportunity Owner" value={deal.owner} />
              <SfFieldRow label="Stage" value={deal.stage} />
              <SfFieldRow label="Forecast Category" value={deal.isClosed ? "Closed" : "Pipeline"} />
              <SfFieldRow label="Probability (%)" value={String(stageProbability(deal.stage))} />
              <SfFieldRow label="Amount" value={`$${deal.amount.toLocaleString()}`} />
              <SfFieldRow label="Close Date" value={deal.closeDate ? shortDate(deal.closeDate) : "-"} />
              <SfFieldRow label="Is Closed" value={deal.isClosed ? "Yes" : "No"} />
              <SfFieldRow label="Technical Close Status" value={deal.technicalCloseStatus} />
              <SfFieldRow label="Next Step" value={deal.nextAction} />
              <SfFieldRow label="Latest Signal" value={deal.latestSignal || "-"} />
              <SfFieldRow label="Salesforce Opportunity ID (placeholder)" value={`SF-${deal.id.slice(0, 8).toUpperCase()}`} />
              <SfFieldRow
                label="Insights Customer Link"
                value={`https://insights.nutanix.com/?account=${encodeURIComponent(deal.accountName)}`}
                mono
              />
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Asset Library"
        subtitle="Collapsed by default to keep the page compact. Expand only when you need artifacts."
        icon={<FolderOpen className="h-5 w-5" />}
      >
        <details className="group rounded-lg border border-charcoal-200 bg-charcoal-50 p-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-charcoal-800">
            <span className="inline-flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Expand Asset Library ({allAssets.length} total)
            </span>
          </summary>
          <div className="mt-4 space-y-5">
            <div>
              <SectionHeader title="Presentations" />
              {presentations.length === 0 ? (
                <EmptyState title="No presentations yet" description="Attach decks from the Calendar page to see them here." />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {presentations.map((asset) => (
                    <AssetTile key={asset.id} asset={asset} />
                  ))}
                </div>
              )}
            </div>
            <div>
              <SectionHeader title="Whiteboards" />
              {whiteboards.length === 0 ? (
                <EmptyState title="No whiteboards yet" description="Attach whiteboard links to see previews here." />
              ) : (
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {whiteboards.map((asset) => (
                    <AssetTile key={asset.id} asset={asset} />
                  ))}
                </div>
              )}
            </div>
            {otherAssets.length > 0 ? (
              <div>
                <SectionHeader title="Other Files" />
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {otherAssets.map((asset) => (
                    <AssetTile key={asset.id} asset={asset} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </details>
      </Card>

      <Card
        title="Unified Activity (Meetings + Notes)"
        subtitle="One cohesive timeline with synced meeting history and all related notes in context."
        icon={<History className="h-5 w-5" />}
      >
        <SectionHeader title="Add Note" subtitle="Capture one note stream for the account. Link to meeting when applicable." />
        <form action={addNoteAction} className="mb-5 space-y-3 rounded-lg border border-charcoal-200 bg-charcoal-50 p-3">
          <input type="hidden" name="dealId" value={deal.id} />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="note-role">Role</label>
              <select id="note-role" name="role" defaultValue="SE" className="w-full">
                <option value="SE">SE - Systems Engineer</option>
                <option value="AE">AE - Account Executive</option>
                <option value="SAM">SAM - Subscription Account Manager</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="note-meeting">Meeting (optional)</label>
              <select id="note-meeting" name="meetingId" defaultValue="" className="w-full">
                <option value="">Account-level note</option>
                {deal.meetings.map((meeting) => (
                  <option key={meeting.id} value={meeting.id}>
                    {shortDateTime(meeting.startTime)} - {meeting.subject}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="note-body">Note</label>
            <textarea
              id="note-body"
              name="body"
              rows={3}
              className="w-full"
              placeholder="Capture key updates, blockers, actions, and customer context."
              required
            />
          </div>
          <ActionBar>
            <Button type="submit">Save Note</Button>
          </ActionBar>
        </form>

        {timeline.length === 0 ? (
          <EmptyState
            title="No meetings or notes yet"
            description="As meetings sync and notes are captured, the full account timeline will appear here."
          />
        ) : (
          <div className="space-y-3">
            {timeline.map((entry) =>
              entry.kind === "meeting" ? (
                <article
                  key={`meeting-${entry.id}`}
                  className="rounded-lg border border-charcoal-200 border-l-4 border-l-iris-500 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="text-base font-semibold text-charcoal-900">{entry.meeting.subject}</h4>
                      <p className="text-sm text-charcoal-500">
                        {shortDateTime(entry.meeting.startTime)} - {shortDateTime(entry.meeting.endTime)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill tone="neutral">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" /> {countAttendees(entry.meeting.attendeesJson)}
                        </span>
                      </StatusPill>
                      <StatusPill tone="info">{relativeDay(entry.meeting.startTime)}</StatusPill>
                    </div>
                  </div>

                  {entry.meeting.assets.length > 0 ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {entry.meeting.assets.map((asset) => (
                        <AssetTile key={asset.id} asset={asset} />
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-3 space-y-2">
                    {entry.notes.length === 0 ? (
                      <p className="text-xs text-charcoal-500">No notes captured for this meeting yet.</p>
                    ) : (
                      entry.notes.map((note) => (
                        <div key={note.id} className="rounded-md border border-charcoal-200 bg-charcoal-50 p-2.5">
                          <div className="mb-1 flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${roleTone(note.role)}`}>
                              {note.role}
                            </span>
                            <span className="text-xs text-charcoal-500">{note.author}</span>
                            <span className="ml-auto text-xs text-charcoal-400">{shortDate(note.createdAt)}</span>
                          </div>
                          <p className="text-sm text-charcoal-700">{note.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                </article>
              ) : (
                <article
                  key={`note-${entry.id}`}
                  className="rounded-lg border border-charcoal-200 border-l-4 border-l-charcoal-500 bg-white p-4"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${roleTone(entry.note.role)}`}>
                      {entry.note.role}
                    </span>
                    <span className="text-xs text-charcoal-500">{entry.note.author}</span>
                    <span className="ml-auto text-xs text-charcoal-400">{shortDate(entry.note.createdAt)}</span>
                  </div>
                  <p className="text-sm text-charcoal-700">{entry.note.body}</p>
                </article>
              ),
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function SfFieldRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <tr>
      <td className="px-3 py-2 font-medium text-charcoal-700">{label}</td>
      <td className={`px-3 py-2 text-charcoal-900 ${mono ? "font-mono text-xs" : ""}`}>{value}</td>
    </tr>
  );
}

function AssetTile({ asset }: { asset: MeetingAsset }) {
  return (
    <div className="rounded-md border border-charcoal-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-iris-600">{asset.type.replaceAll("_", " ")}</p>
      {asset.previewImageUri ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.previewImageUri}
          alt={`${asset.title} preview`}
          className="mt-2 h-28 w-full rounded border border-charcoal-200 object-cover"
        />
      ) : (
        <div className="mt-2 flex h-28 items-center justify-center rounded border border-dashed border-charcoal-300 bg-charcoal-50 text-xs text-charcoal-500">
          Preview unavailable
        </div>
      )}
      <p className="mt-2 line-clamp-2 text-sm font-semibold">{asset.title}</p>
      <div className="mt-1 flex items-center justify-between">
        <p className="text-xs text-charcoal-500">{asset.sourceTool}</p>
        <PreviewStatusPill status={asset.previewStatus} />
      </div>
      <a
        href={asset.uri}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-iris-600 hover:text-iris-700"
      >
        Open <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
