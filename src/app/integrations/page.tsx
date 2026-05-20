import { integrationStatusAction, integrationTestAction } from "@/lib/actions";
import { integrationAdapters } from "@/lib/adapters";
import { getDashboardData } from "@/lib/data";
import { Card, IntegrationStatusPill } from "@/components/ui";

export default async function IntegrationsPage() {
  const { integrations } = await getDashboardData();

  return (
    <div className="space-y-6">
      <Card
        title="Integrations Setup"
        subtitle="Wave 1 uses mock adapters and setup guidance; switch to live credentials in Wave 2."
      >
        <div className="space-y-4">
          {integrations.map((integration) => {
            const adapter = integrationAdapters[integration.integrationKey as keyof typeof integrationAdapters];
            return (
              <article key={integration.id} className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{integration.displayName}</h3>
                    <p className="text-sm text-slate-500">{adapter?.description ?? "Connector adapter pending."}</p>
                  </div>
                  <IntegrationStatusPill status={integration.status} />
                </div>
                <p className="mt-3 text-sm text-slate-700">{integration.setupNotes}</p>
                {adapter ? (
                  <ul className="mt-3 list-disc pl-5 text-xs text-slate-600">
                    {adapter.capabilities.map((capability) => (
                      <li key={capability}>{capability.replaceAll("_", " ")}</li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <form action={integrationTestAction}>
                    <input type="hidden" name="integrationKey" value={integration.integrationKey} />
                    <button type="submit">Test Adapter</button>
                  </form>
                  <form action={integrationStatusAction}>
                    <input type="hidden" name="integrationKey" value={integration.integrationKey} />
                    <input type="hidden" name="status" value="CONNECTED" />
                    <button type="submit">Mark Connected</button>
                  </form>
                  <form action={integrationStatusAction}>
                    <input type="hidden" name="integrationKey" value={integration.integrationKey} />
                    <input type="hidden" name="status" value="NEEDS_ATTENTION" />
                    <button type="submit" className="bg-amber-700 hover:bg-amber-600">
                      Mark Needs Attention
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
