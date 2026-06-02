import Link from "next/link";
import { notFound } from "next/navigation";
import type { MeetingAsset } from "@prisma/client";
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  FolderOpen,
  NotebookPen,
  Sparkles,
  Users,
} from "lucide-react";
import { addNoteAction } from "@/lib/actions";
import { getAccountDetail } from "@/lib/data";
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

const PILLARS: {
  role: NoteRole;
  full: string;
  badge: string;
  bar: string;
  border: string;
}[] = [
  { role: "SE", full: "Systems Engineer", badge: "bg-iris-100 text-iris-700", bar: "bg-iris-500", border: "border-t-iris-400" },
  { role: "AE", full: "Account Executive", badge: "bg-sky-100 text-sky-700", bar: "bg-sky-500", border: "border-t-sky-400" },
  {
    role: "SAM",
    full: "Subscription Account Manager",
    badge: "bg-emerald-100 text-emerald-700",
    bar: "bg-emerald-500",
    border: "border-t-emerald-400",
  },
];

function countAttendees(attendeesJson: string): number {
  try {
    const parsed = JSON.parse(attendeesJson);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function NoteItem({ note, showMeeting }: { note: AccountNote; showMeeting?: boolean }) {
  return (
    <div className="rounded-md border border-charcoal-200 bg-white p-2.5">
      {showMeeting ? (
        <p className="mb-1 text-[11px] font-medium text-charcoal-500">
          {note.meeting ? note.meeting.subject : "Account-level"}
        </p>
      ) : null}
      <p className="text-sm text-charcoal-700">{note.body}</p>
      <p className="mt-1 text-[11px] text-charcoal-400">{shortDate(note.createdAt)}</p>
    </div>
  );
}

function PillarColumn({
  pillar,
  notes,
  showMeeting,
  addForm,
  emptyText,
}: {
  pillar: (typeof PILLARS)[number];
  notes: AccountNote[];
  showMeeting?: boolean;
  addForm?: { dealId: string; meetingId?: string };
  emptyText: string;
}) {
  return (
    <div className={`flex flex-col rounded-lg border border-charcoal-200 border-t-2 ${pillar.border} bg-charcoal-50 p-3`}>
      <div className="mb-2 flex items-center gap-2">
        <span aria-hidden className={`h-3 w-1.5 rounded-full ${pillar.bar}`} />
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pillar.badge}`}>{pillar.role}</span>
        <span className="text-xs text-charcoal-500">{pillar.full}</span>
      </div>
      <div className="flex-1 space-y-2">
        {notes.length === 0 ? (
          <p className="text-xs text-charcoal-400">{emptyText}</p>
        ) : (
          notes.map((note) => <NoteItem key={note.id} note={note} showMeeting={showMeeting} />)
        )}
      </div>
      {addForm ? (
        <form action={addNoteAction} className="mt-2 space-y-2">
          <input type="hidden" name="dealId" value={addForm.dealId} />
          {addForm.meetingId ? <input type="hidden" name="meetingId" value={addForm.meetingId} /> : null}
          <input type="hidden" name="role" value={pillar.role} />
          <textarea
            name="body"
            rows={2}
            placeholder={`Add ${pillar.role} note`}
            required
            className="w-full text-sm"
            aria-label={`Add ${pillar.full} note`}
          />
          <Button type="submit" tone="secondary">
            Add {pillar.role} Note
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await getAccountDetail(id);

  if (!deal) {
    notFound();
  }

  const notes = deal.notes as AccountNote[];
  const presentations = deal.assets.filter((asset) => asset.type === "PRESENTATION");
  const whiteboards = deal.assets.filter((asset) => asset.type === "WHITEBOARD");
  const otherAssets = deal.assets.filter(
    (asset) => asset.type !== "PRESENTATION" && asset.type !== "WHITEBOARD",
  );

  const stat = (label: string, value: number) => (
    <div className="rounded-lg border border-charcoal-200 bg-white px-3 py-2 text-center">
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

      <Card title={deal.accountName} subtitle={deal.name} icon={<Users className="h-5 w-5" />}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone="info">{deal.stage}</StatusPill>
          <StatusPill tone="neutral">Owner: {deal.owner}</StatusPill>
        </div>
        <p className="mt-3 text-sm text-charcoal-700">
          <span className="font-semibold text-charcoal-900">Next action:</span> {deal.nextAction}
        </p>
        {deal.latestSignal ? (
          <p className="mt-1 text-sm text-charcoal-600">
            <span className="font-semibold text-charcoal-900">Latest signal:</span> {deal.latestSignal}
          </p>
        ) : null}
      </Card>

      <Card
        title="Account Summary"
        subtitle="Most recent note from each team member, plus account totals at a glance."
        icon={<Sparkles className="h-5 w-5" />}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stat("Meetings", deal.meetings.length)}
          {stat("Notes", notes.length)}
          {stat("Presentations", presentations.length)}
          {stat("Whiteboards", whiteboards.length)}
        </div>

        <div className="mt-5">
          <SectionHeader title="Most Recent Notes" subtitle="Latest update captured by each pillar." />
          <div className="grid gap-3 md:grid-cols-3">
            {PILLARS.map((pillar) => {
              const latest = notes.find((note) => note.role === pillar.role);
              return (
                <PillarColumn
                  key={pillar.role}
                  pillar={pillar}
                  notes={latest ? [latest] : []}
                  showMeeting
                  emptyText={`No ${pillar.role} notes yet.`}
                />
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          <SectionHeader title="Add Account Note" subtitle="Capture a general note (not tied to a meeting) for any pillar." />
          <form action={addNoteAction} className="space-y-3">
            <input type="hidden" name="dealId" value={deal.id} />
            <div className="space-y-1.5">
              <label htmlFor="account-note-role">Pillar</label>
              <select id="account-note-role" name="role" defaultValue="SE" className="w-full sm:max-w-xs">
                <option value="SE">SE - Systems Engineer</option>
                <option value="AE">AE - Account Executive</option>
                <option value="SAM">SAM - Subscription Account Manager</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="account-note">Note</label>
              <textarea
                id="account-note"
                name="body"
                rows={3}
                className="w-full"
                placeholder="Stakeholders, strategy, reminders, or anything to remember about this account."
                required
              />
            </div>
            <ActionBar>
              <Button type="submit">Save Note</Button>
            </ActionBar>
          </form>
        </div>
      </Card>

      <Card
        title="Asset Library"
        subtitle="Every presentation, whiteboard, and file across all meetings — jump back to anything in one place."
        icon={<FolderOpen className="h-5 w-5" />}
      >
        <div className="space-y-5">
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
      </Card>

      <Card
        title="All Notes"
        subtitle="Every note for this account, split by pillar (SE / AE / SAM), newest first."
        icon={<NotebookPen className="h-5 w-5" />}
      >
        <div className="grid gap-3 md:grid-cols-3">
          {PILLARS.map((pillar) => (
            <PillarColumn
              key={pillar.role}
              pillar={pillar}
              notes={notes.filter((note) => note.role === pillar.role)}
              showMeeting
              emptyText={`No ${pillar.role} notes captured yet.`}
            />
          ))}
        </div>
      </Card>

      <Card
        title="Meeting History"
        subtitle="Each meeting with its assets and the SE / AE / SAM notes side by side."
        icon={<CalendarClock className="h-5 w-5" />}
      >
        {deal.meetings.length === 0 ? (
          <EmptyState title="No meetings yet" description="Meetings linked to this deal will appear here with their assets and notes." />
        ) : (
          <div className="space-y-4">
            {deal.meetings.map((meeting) => {
              const meetingNotes = meeting.notes as AccountNote[];
              return (
                <article
                  key={meeting.id}
                  className="rounded-lg border border-charcoal-200 border-l-4 border-l-iris-400 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="text-base font-semibold text-charcoal-900">{meeting.subject}</h4>
                      <p className="text-sm text-charcoal-500">
                        {shortDateTime(meeting.startTime)} - {shortDateTime(meeting.endTime)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill tone="neutral">
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" /> {countAttendees(meeting.attendeesJson)}
                        </span>
                      </StatusPill>
                      <StatusPill tone="info">{relativeDay(meeting.startTime)}</StatusPill>
                    </div>
                  </div>

                  {meeting.assets.length > 0 ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {meeting.assets.map((asset) => (
                        <AssetTile key={asset.id} asset={asset} />
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {PILLARS.map((pillar) => (
                      <PillarColumn
                        key={pillar.role}
                        pillar={pillar}
                        notes={meetingNotes.filter((note) => note.role === pillar.role)}
                        addForm={{ dealId: deal.id, meetingId: meeting.id }}
                        emptyText={`No ${pillar.role} notes for this meeting.`}
                      />
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </div>
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
