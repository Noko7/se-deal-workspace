import { uploadArtifactAction } from "@/lib/actions";
import { getDashboardData } from "@/lib/data";
import { shortDateTime } from "@/lib/format";
import { Card, PreviewStatusPill, StatusPill } from "@/components/ui";

export default async function CalendarPage() {
  const { meetings, deals } = await getDashboardData();
  const grouped = meetings.reduce<Record<string, typeof meetings>>((acc, meeting) => {
    const dateKey = new Date(meeting.startTime).toDateString();
    acc[dateKey] = [...(acc[dateKey] ?? []), meeting];
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <Card
        title="Calendar"
        subtitle="Upcoming meetings with direct deal context, artifacts, previews, and AI build workspace entry points."
      >
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, dayMeetings]) => (
            <div key={date} className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{date}</h3>
              <div className="space-y-4">
                {dayMeetings.map((meeting) => (
                  <article key={meeting.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="text-lg font-semibold">{meeting.subject}</h4>
                        <p className="text-sm text-slate-500">
                          {shortDateTime(meeting.startTime)} - {shortDateTime(meeting.endTime)}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          Deal: <span className="font-medium">{meeting.deal.name}</span> ({meeting.deal.stage})
                        </p>
                      </div>
                      <StatusPill tone="good">Preview Ready</StatusPill>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {meeting.assets.map((asset) => (
                        <div key={asset.id} className="rounded-md border border-slate-200 p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {asset.type.replaceAll("_", " ")}
                          </p>
                          {asset.previewImageUri ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={asset.previewImageUri}
                              alt={`${asset.title} preview`}
                              className="mt-2 h-28 w-full rounded border border-slate-200 object-cover"
                            />
                          ) : (
                            <div className="mt-2 flex h-28 items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">
                              Preview unavailable
                            </div>
                          )}
                          <p className="mt-2 text-sm font-semibold">{asset.title}</p>
                          <div className="mt-1 flex items-center justify-between">
                            <p className="text-xs text-slate-500">{asset.sourceTool}</p>
                            <PreviewStatusPill status={asset.previewStatus} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Artifact Ingestion" subtitle="Manual fallback path for Wave 1. Upload metadata and associate with deal/meeting.">
        <form action={uploadArtifactAction} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="dealId">Deal</label>
            <select id="dealId" name="dealId" required>
              {deals.map((deal) => (
                <option key={deal.id} value={deal.id}>
                  {deal.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="type">Asset Type</label>
            <select id="type" name="type" required>
              <option value="PRESENTATION">Presentation</option>
              <option value="WHITEBOARD">Whiteboard</option>
              <option value="COLLECTOR">Collector</option>
              <option value="RV_TOOL">RV Tool</option>
              <option value="ZIP_BUNDLE">Zip Bundle</option>
              <option value="TEXT_BRIEF">Text Brief</option>
              <option value="QBR_REPORT">QBR Report</option>
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="title">Title</label>
            <input id="title" name="title" placeholder="Acme_QBR_Deck_Q2" required />
          </div>
          <div className="space-y-1">
            <label htmlFor="sourceTool">Source Tool</label>
            <input id="sourceTool" name="sourceTool" placeholder="Lucidchart / PowerPoint / Collector" required />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label htmlFor="uri">File URL or Location</label>
            <input id="uri" name="uri" placeholder="https:// or file:// path" required />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label htmlFor="previewImageUri">Preview Image URL (optional)</label>
            <input id="previewImageUri" name="previewImageUri" placeholder="https://placehold.co/640x360?text=Preview" />
          </div>
          <button type="submit" className="md:col-span-2">
            Save Artifact
          </button>
        </form>
      </Card>
    </div>
  );
}
