import { Database, Plug } from "lucide-react";
import { clearLlmApiKeyAction, integrationStatusAction, integrationTestAction, saveLlmCredentialsAction } from "@/lib/actions";
import { integrationAdapters } from "@/lib/adapters";
import { getIntegrations, getLlmCredentialSummary } from "@/lib/data";
import { ActionBar, Button, Card, EmptyState, IntegrationStatusPill, SectionHeader, StatusPill } from "@/components/ui";
import { NaiTestPanel } from "@/components/nai-test-panel";
import { SchemaExplorer } from "@/components/schema-explorer";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const integrations = await getIntegrations();
  // Connectors that already have their own dedicated card below (the Salesforce
  // Account Schema explorer and the Nutanix NAI/LLM card) are omitted from the
  // generic Connector Catalog so the page isn't redundant.
  const DEDICATED_KEYS = new Set(["local_llm", "salesforce"]);
  const catalogIntegrations = integrations.filter(
    (integration) => !DEDICATED_KEYS.has(integration.integrationKey),
  );
  const llm = await getLlmCredentialSummary();

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
          action={<StatusPill tone="info">{catalogIntegrations.length} connectors</StatusPill>}
        />
        <div className="space-y-4">
          {catalogIntegrations.length === 0 ? (
            <EmptyState
              title="No integrations configured"
              description="Add connector records to display setup and status actions."
            />
          ) : null}
          {catalogIntegrations.map((integration) => {
            const adapter = integrationAdapters[integration.integrationKey as keyof typeof integrationAdapters];
            return (
              <article key={integration.integrationKey} className="rounded-lg border border-charcoal-200 border-l-4 border-l-iris-400 bg-white p-4 shadow-sm">
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

      <Card
        title="Salesforce Account Schema"
        subtitle="The Account and Opportunity fields this app understands, mapped to Salesforce objects and API names. Diff this against your real SFDC org before wiring a live connection."
        icon={<Database className="h-5 w-5" />}
      >
        <SectionHeader
          title="Schema &amp; Field Mapping"
          subtitle="Standard Salesforce fields use their real API names; custom fields use a best-guess __c name to verify in your org."
        />
        <SchemaExplorer />
      </Card>

      <Card
        title="Nutanix NAI (LLM)"
        subtitle="Configure credentials and run a live, step-by-step NAI test in one place. Secrets are encrypted at rest and never shown in plaintext."
        icon={<Plug className="h-5 w-5" />}
      >
        <SectionHeader
          title="Enterprise AI Configuration + Testing"
          subtitle="Uses saved credentials unless overridden by env vars (LLM_BASE_URL, LLM_MODEL, LLM_API_KEY, LLM_TIMEOUT_MS, LLM_INSECURE_TLS)."
          action={<StatusPill tone={llm.configured ? "good" : "warning"}>{llm.configured ? "Configured" : "Not configured"}</StatusPill>}
        />
        <form action={saveLlmCredentialsAction} className="grid gap-3 rounded-lg border border-charcoal-200 bg-white p-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="llm-base-url">Base URL</label>
            <input
              id="llm-base-url"
              name="baseUrl"
              defaultValue={llm.baseUrl}
              placeholder="https://ai.nutanix.com/enterpriseai/v1"
              required
            />
            <p className="text-xs text-charcoal-500">OpenAI-compatible endpoint root (the app appends /chat/completions).</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="llm-model">Model</label>
            <input id="llm-model" name="model" defaultValue={llm.model} placeholder="aep-demo" required />
            <p className="text-xs text-charcoal-500">Model id used for requests.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="llm-timeout">Timeout (ms)</label>
            <input id="llm-timeout" name="timeoutMs" type="number" min={1000} max={180000} defaultValue={llm.timeoutMs} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="llm-api-key">API Key</label>
            <input id="llm-api-key" name="apiKey" type="password" placeholder={llm.hasApiKey ? "•••••••• (saved)" : "Paste API key"} />
            <p className="text-xs text-charcoal-500">Leave blank to keep existing key unchanged.</p>
          </div>
          <div className="lg:col-span-2 flex items-center gap-2 text-sm text-charcoal-700">
            <input id="llm-insecure" name="insecureTls" type="checkbox" defaultChecked={llm.insecureTls} className="h-4 w-4 accent-iris-600" />
            <label htmlFor="llm-insecure" className="normal-case tracking-normal text-sm font-medium">
              Allow insecure TLS (self-signed internal certs only)
            </label>
          </div>
          <div className="lg:col-span-2">
            <ActionBar>
              <Button type="submit">Save LLM Settings</Button>
            </ActionBar>
          </div>
          <div className="lg:col-span-2 text-xs text-charcoal-500">
            {llm.updatedAt ? `Last updated: ${new Date(llm.updatedAt).toLocaleString()}${llm.updatedBy ? ` by ${llm.updatedBy}` : ""}` : "No saved LLM credentials yet."}
          </div>
        </form>
        <ActionBar>
          <form action={clearLlmApiKeyAction}>
            <Button type="submit" tone="danger">
              Clear Saved API Key
            </Button>
          </form>
        </ActionBar>
        <NaiTestPanel />
      </Card>
    </div>
  );
}
