import { updateQbrChecklistAction, uploadQbrAction } from "@/lib/actions";
import { getDashboardData, getDealWorkspace } from "@/lib/data";
import { Card, StatusPill } from "@/components/ui";

export default async function QbrPage() {
  const { deals } = await getDashboardData();
  const primaryDealId = deals[0]?.id;
  const workspace = primaryDealId ? await getDealWorkspace(primaryDealId) : null;

  return (
    <div className="space-y-6">
      <Card
        title="QBR Deck Builder"
        subtitle="Guide-driven workflow aligned with the Jan 2026 Health Check Guide and manual fallback support."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">1) Retrieve or upload base QBR deck</h3>
            <form action={uploadQbrAction} className="space-y-3 rounded-lg border border-slate-200 p-3">
              <div className="space-y-1">
                <label htmlFor="dealId">Deal</label>
                <select id="dealId" name="dealId">
                  {deals.map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {deal.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="accountName">Account Name</label>
                <input id="accountName" name="accountName" placeholder="Acme Manufacturing" required />
              </div>
              <div className="space-y-1">
                <label htmlFor="source">Source</label>
                <select id="source" name="source">
                  <option value="manual_upload">Manual Upload</option>
                  <option value="cs360_download">Download From Portal</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="fileUri">Deck URI</label>
                <input id="fileUri" name="fileUri" placeholder="file:// or https:// location" required />
              </div>
              <button type="submit">Save QBR Artifact</button>
            </form>
            <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
              <p className="font-semibold">Portal path reference</p>
              <p className="mt-1">Cluster -&gt; Cluster Summary -&gt; Actions -&gt; Download QBR Report</p>
              <p className="mt-2 text-xs text-slate-500">Use manual upload fallback when portal auth/VPN is unavailable.</p>
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">2) Section checklist and prep notes</h3>
            <div className="space-y-3">
              {workspace?.qbrChecklistItems.map((item) => (
                <form
                  key={item.id}
                  action={updateQbrChecklistAction}
                  className="space-y-2 rounded-lg border border-slate-200 p-3"
                >
                  <input type="hidden" name="itemId" value={item.id} />
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{item.title}</p>
                    <StatusPill tone={item.status === "DONE" ? "good" : item.status === "IN_PROGRESS" ? "warning" : "neutral"}>
                      {item.status}
                    </StatusPill>
                  </div>
                  <p className="text-xs text-slate-500">{item.recommendedTalkTrack}</p>
                  <div className="grid gap-2 md:grid-cols-[180px_1fr_auto]">
                    <select name="status" defaultValue={item.status}>
                      <option value="TODO">TODO</option>
                      <option value="IN_PROGRESS">IN_PROGRESS</option>
                      <option value="DONE">DONE</option>
                    </select>
                    <input name="notes" defaultValue={item.notes} placeholder="Prep notes for this section" />
                    <button type="submit">Save</button>
                  </div>
                </form>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
