import { Plug } from "lucide-react";
import { integrationStatusAction, integrationTestAction } from "@/lib/actions";
import { integrationAdapters } from "@/lib/adapters";
import { getDashboardData } from "@/lib/data";
import { ActionBar, Button, Card, EmptyState, IntegrationStatusPill, SectionHeader, StatusPill } from "@/components/ui";

export default async function IntegrationsPage() {
  const { integrations } = await getDashboardData();

  return (
    <div className="space-y-6">
      <Card
        title="Integrations Setup"
        subtitle="Wave 1 uses mock adapters and setup guidance; switch to live credentials in Wave 2."
        icon={<Plug className="h-5 w-5" />}
      >
        <SectionHeader
          title="Connector Catalog"
          subtitle="Track connector health and run setup checks before enabling live credentials."
          action={<StatusPill tone="info">{integrations.length} connectors</StatusPill>}
        />
        <div className="space-y-4">
          {integrations.length === 0 ? (
            <EmptyState
              title="No integrations configured"
              description="Add connector records to display setup and status actions."
            />
          ) : null}
          {integrations.map((integration) => {
            const adapter = integrationAdapters[integration.integrationKey as keyof typeof integrationAdapters];
            return (
              <article key={integration.id} className="rounded-lg border border-charcoal-200 border-l-4 border-l-iris-400 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{integration.displayName}</h3>
                    <p className="text-sm text-charcoal-500">{adapter?.description ?? "Connector adapter pending."}</p>
                  </div>
                  <IntegrationStatusPill status={integration.status} />
                </div>
                <p className="mt-3 text-sm text-charcoal-700">{integration.setupNotes}</p>
                {adapter ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-charcoal-600">
                    {adapter.capabilities.map((capability) => (
                      <li key={capability}>{capability.replaceAll("_", " ")}</li>
                    ))}
                  </ul>
                ) : null}
                <ActionBar>
                  <form action={integrationTestAction}>
                    <input type="hidden" name="integrationKey" value={integration.integrationKey} />
                    <Button type="submit" tone="secondary">
                      Test Adapter
                    </Button>
                  </form>
                  <form action={integrationStatusAction}>
                    <input type="hidden" name="integrationKey" value={integration.integrationKey} />
                    <input type="hidden" name="status" value="CONNECTED" />
                    <Button type="submit">Mark Connected</Button>
                  </form>
                  <form action={integrationStatusAction}>
                    <input type="hidden" name="integrationKey" value={integration.integrationKey} />
                    <input type="hidden" name="status" value="NEEDS_ATTENTION" />
                    <Button type="submit" tone="danger">
                      Mark Needs Attention
                    </Button>
                  </form>
                </ActionBar>
              </article>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
