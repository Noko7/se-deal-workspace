import { Presentation } from "lucide-react";
import { updateQbrChecklistAction, uploadQbrAction } from "@/lib/actions";
import { getDashboardData, getDealWorkspace } from "@/lib/data";
import { ActionBar, Button, Card, EmptyState, FormRow, SectionHeader, StatusPill } from "@/components/ui";

export default async function QbrPage() {
  const { deals } = await getDashboardData();
  const primaryDealId = deals[0]?.id;
  const workspace = primaryDealId ? await getDealWorkspace(primaryDealId) : null;

  return (
    <div className="space-y-6">
      <Card
        title="QBR Deck Builder"
        subtitle="Guide-driven workflow aligned with the Jan 2026 Health Check Guide and manual fallback support."
        icon={<Presentation className="h-5 w-5" />}
      >
        <SectionHeader
          title="QBR Workflow"
          subtitle="Follow a two-step flow: attach a deck artifact, then complete prep checklist items."
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-lg border border-charcoal-200 bg-charcoal-50 p-4">
            <SectionHeader title="Step 1: Attach Base QBR Deck" subtitle="Use portal download or manual upload fallback." />
            <form action={uploadQbrAction} className="space-y-3 rounded-lg border border-charcoal-200 bg-white p-3">
              <FormRow label="Deal" htmlFor="dealId" helper="The deck artifact is tied to this deal.">
                <select id="dealId" name="dealId">
                  {deals.map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {deal.name}
                    </option>
                  ))}
                </select>
              </FormRow>
              <FormRow label="Account Name" htmlFor="accountName" helper="Used for artifact labeling and searchability.">
                <input id="accountName" name="accountName" placeholder="Acme Manufacturing" required />
              </FormRow>
              <FormRow label="Source" htmlFor="source" helper="Portal mode is preferred when available.">
                <select id="source" name="source">
                  <option value="manual_upload">Manual Upload</option>
                  <option value="cs360_download">Download From Portal</option>
                </select>
              </FormRow>
              <FormRow label="Deck URI" htmlFor="fileUri" helper="Link or file location where this deck is stored.">
                <input id="fileUri" name="fileUri" placeholder="file:// or https:// location" required />
              </FormRow>
              <ActionBar>
                <Button type="submit">Save QBR Artifact</Button>
              </ActionBar>
            </form>
            <div className="rounded-lg border border-charcoal-200 p-3 text-sm text-charcoal-700">
              <p className="font-semibold">Portal path reference</p>
              <p className="mt-1">Cluster -&gt; Cluster Summary -&gt; Actions -&gt; Download QBR Report</p>
              <p className="mt-2 text-xs text-charcoal-500">Use manual upload fallback when portal auth/VPN is unavailable.</p>
            </div>
          </div>
          <div className="space-y-4">
            <SectionHeader
              title="Step 2: Complete Checklist"
              subtitle="Capture prep notes and mark each section complete before the customer session."
            />
            <div className="space-y-3">
              {workspace?.qbrChecklistItems.length ? (
                workspace.qbrChecklistItems.map((item) => (
                  <form
                    key={item.id}
                    action={updateQbrChecklistAction}
                    className="space-y-2 rounded-lg border border-charcoal-200 border-l-4 border-l-iris-400 bg-white p-3 shadow-sm"
                  >
                    <input type="hidden" name="itemId" value={item.id} />
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{item.title}</p>
                      <StatusPill tone={item.status === "DONE" ? "good" : item.status === "IN_PROGRESS" ? "warning" : "neutral"}>
                        {item.status}
                      </StatusPill>
                    </div>
                    <p className="text-xs text-charcoal-500">{item.recommendedTalkTrack}</p>
                    <div className="grid gap-2 md:grid-cols-[220px_1fr]">
                      <FormRow label="Status" htmlFor={`status-${item.id}`}>
                        <select id={`status-${item.id}`} name="status" defaultValue={item.status}>
                          <option value="TODO">TODO</option>
                          <option value="IN_PROGRESS">IN_PROGRESS</option>
                          <option value="DONE">DONE</option>
                        </select>
                      </FormRow>
                      <FormRow label="Prep Notes" htmlFor={`notes-${item.id}`}>
                        <input id={`notes-${item.id}`} name="notes" defaultValue={item.notes} placeholder="Prep notes for this section" />
                      </FormRow>
                    </div>
                    <ActionBar>
                      <Button type="submit">Save Checklist Item</Button>
                    </ActionBar>
                  </form>
                ))
              ) : (
                <EmptyState title="No checklist items yet" description="Add or seed checklist entries to start QBR prep tracking." />
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
