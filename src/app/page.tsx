import { uploadArtifactAction } from "@/lib/actions";
import { getDashboardData } from "@/lib/data";
import { shortDateTime } from "@/lib/format";
import { ActionBar, Button, Card, EmptyState, FormRow, PreviewStatusPill, SectionHeader, StatusPill } from "@/components/ui";

export default async function CalendarPage() {
  const { meetings, deals } = await getDashboardData();
  const grouped = meetings.reduce<Record<string, typeof meetings>>((acc, meeting) => {
    const dateKey = new Date(meeting.startTime).toDateString();
    acc[dateKey] = [...(acc[dateKey] ?? []), meeting];
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <Card title="Calendar" subtitle="Upcoming meetings with direct deal context, artifacts, and quick prep visibility.">
        <SectionHeader
          title="Upcoming Meetings"
          subtitle="Open each meeting to review associated assets, deal status, and preview availability."
        />
        <div className="space-y-6">
          {meetings.length === 0 ? (
            <EmptyState
              title="No upcoming meetings"
              description="Add seeded data or enable an integration to populate the timeline."
            />
          ) : (
            Object.entries(grouped).map(([date, dayMeetings]) => (
              <div key={date} className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-500">{date}</h3>
                <div className="space-y-4">
                  {dayMeetings.map((meeting) => (
                    <article key={meeting.id} className="rounded-lg border border-charcoal-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="text-lg font-semibold">{meeting.subject}</h4>
                          <p className="text-sm text-charcoal-500">
                            {shortDateTime(meeting.startTime)} - {shortDateTime(meeting.endTime)}
                          </p>
                          <p className="mt-1 text-sm text-charcoal-600">
                            Deal: <span className="font-medium">{meeting.deal.name}</span> ({meeting.deal.stage})
                          </p>
                        </div>
                        <StatusPill tone="good">{meeting.assets.length} linked assets</StatusPill>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {meeting.assets.length === 0 ? (
                          <EmptyState
                            title="No assets linked"
                            description="Use the artifact form below to attach presentation or whiteboard files."
                          />
                        ) : (
                          meeting.assets.map((asset) => (
                            <div key={asset.id} className="rounded-md border border-charcoal-200 p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-charcoal-500">
                                {asset.type.replaceAll("_", " ")}
                              </p>
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
                            </div>
                          ))
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card title="Artifact Ingestion" subtitle="Manual upload fallback for Wave 1 with clearer required fields and safe defaults.">
        <SectionHeader
          title="Attach Asset"
          subtitle="Use this when automated connectors are unavailable. Start with deal and asset type."
        />
        <form action={uploadArtifactAction} className="grid gap-3 md:grid-cols-2">
          <FormRow label="Deal" htmlFor="dealId" helper="Choose the deal this asset should appear under.">
            <select id="dealId" name="dealId" required>
              {deals.map((deal) => (
                <option key={deal.id} value={deal.id}>
                  {deal.name}
                </option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Asset Type" htmlFor="type" helper="Determines where this appears in the meeting workspace.">
            <select id="type" name="type" required>
              <option value="PRESENTATION">Presentation</option>
              <option value="WHITEBOARD">Whiteboard</option>
              <option value="COLLECTOR">Collector</option>
              <option value="RV_TOOL">RV Tool</option>
              <option value="ZIP_BUNDLE">Zip Bundle</option>
              <option value="TEXT_BRIEF">Text Brief</option>
              <option value="QBR_REPORT">QBR Report</option>
            </select>
          </FormRow>
          <FormRow label="Title" htmlFor="title" helper="Use a clear, searchable title.">
            <input id="title" name="title" placeholder="Acme QBR Deck Q2" required />
          </FormRow>
          <FormRow label="Source Tool" htmlFor="sourceTool" helper="Where this came from (e.g. PowerPoint, Lucidchart).">
            <input id="sourceTool" name="sourceTool" placeholder="PowerPoint, Lucidchart, Collector" required />
          </FormRow>
          <div className="md:col-span-2">
            <FormRow label="File URL or Location" htmlFor="uri" helper="Use an HTTPS URL or file path from your storage source.">
              <input id="uri" name="uri" placeholder="https:// or file:// path" required />
            </FormRow>
          </div>
          <div className="md:col-span-2">
            <FormRow
              label="Preview Image URL (optional)"
              htmlFor="previewImageUri"
              helper="Add a thumbnail URL to improve in-app preview visibility."
            >
              <input id="previewImageUri" name="previewImageUri" placeholder="https://placehold.co/640x360?text=Preview" />
            </FormRow>
          </div>
          <div className="md:col-span-2">
            <ActionBar>
              <Button type="submit">Save Artifact</Button>
              <StatusPill tone="neutral">Manual mode</StatusPill>
            </ActionBar>
          </div>
        </form>
      </Card>
    </div>
  );
}
