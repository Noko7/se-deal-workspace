import { Database, Plug, Video } from "lucide-react";
import { clearLlmApiKeyAction, integrationStatusAction, integrationTestAction, saveLlmCredentialsAction, saveZoomConfigAction } from "@/lib/actions";
import { integrationAdapters } from "@/lib/adapters";
import { getDashboardData, getLlmCredentialSummary } from "@/lib/data";
import { getZoomConfigSummary } from "@/lib/zoom";
import { ActionBar, Button, Card, EmptyState, IntegrationStatusPill, SectionHeader, StatusPill } from "@/components/ui";
import { NaiTestPanel } from "@/components/nai-test-panel";
import { SchemaExplorer } from "@/components/schema-explorer";

export const dynamic = "force-dynamic";

const ZOOM_WEBHOOK_PATH = "/api/integrations/zoom/webhook";

export default async function IntegrationsPage() {
  const { integrations } = await getDashboardData();
  const nonNaiIntegrations = integrations.filter((integration) => integration.integrationKey !== "local_llm");
  const llm = await getLlmCredentialSummary();
  const zoom = await getZoomConfigSummary();

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
          action={<StatusPill tone="info">{nonNaiIntegrations.length} connectors</StatusPill>}
        />
        <div className="space-y-4">
          {nonNaiIntegrations.length === 0 ? (
            <EmptyState
              title="No integrations configured"
              description="Add connector records to display setup and status actions."
            />
          ) : null}
          {nonNaiIntegrations.map((integration) => {
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

      <Card
        title="Salesforce Account Schema"
        subtitle="The Account and Opportunity fields we track, mapped to Salesforce objects and API names. Diff this against your real SFDC org before wiring the live connection. This is the same data Account-AI reasons over."
        icon={<Database className="h-5 w-5" />}
      >
        <SectionHeader
          title="Schema &amp; Field Mapping"
          subtitle="Standard Salesforce fields use their real API names; custom fields use a best-guess __c name to verify in your org. Run a test request to see a live sample record in this shape."
        />
        <SchemaExplorer />
      </Card>

      <Card
        title="Zoom"
        subtitle="Auto-send Zoom meeting notes, the AI summary, and the full transcript to the matching meeting — feeding the Account-AI and Note Formatter tools."
        icon={<Video className="h-5 w-5" />}
      >
        <SectionHeader
          title="Auto-Sync Configuration"
          subtitle="When enabled, ingested Zoom content is attached to the meeting and flows into Account-AI and the Note Formatter automatically."
          action={
            <StatusPill tone={zoom.enabled ? "good" : zoom.configured ? "warning" : "info"}>
              {zoom.enabled ? "Auto-sync on" : zoom.configured ? "Configured (off)" : "Not configured"}
            </StatusPill>
          }
        />
        <form action={saveZoomConfigAction} className="space-y-4 rounded-lg border border-charcoal-200 bg-white p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-charcoal-800">
            <input type="checkbox" name="enabled" defaultChecked={zoom.enabled} className="h-4 w-4 accent-iris-600" />
            Enable Zoom auto-sync
          </label>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="zoom-account-id">Zoom Account ID</label>
              <input id="zoom-account-id" name="accountId" defaultValue={zoom.accountId} placeholder="Zoom account / app id (optional)" />
              <p className="text-xs text-charcoal-500">Used to scope incoming webhooks to your Zoom account.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="zoom-webhook-secret">Webhook Secret Token</label>
              <input
                id="zoom-webhook-secret"
                name="webhookSecret"
                type="password"
                placeholder={zoom.hasWebhookSecret ? "•••••••• (saved)" : "Paste Zoom webhook secret token"}
              />
              <p className="text-xs text-charcoal-500">Leave blank to keep the existing secret. Stored encrypted at rest.</p>
            </div>
          </div>

          <fieldset className="space-y-2 rounded-md border border-charcoal-200 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-iris-600">Attach from each meeting</legend>
            <label className="flex items-center gap-2 text-sm text-charcoal-700">
              <input type="checkbox" name="autoAttachNotes" defaultChecked={zoom.autoAttachNotes} className="h-4 w-4 accent-iris-600" />
              Meeting notes
            </label>
            <label className="flex items-center gap-2 text-sm text-charcoal-700">
              <input type="checkbox" name="autoAttachSummary" defaultChecked={zoom.autoAttachSummary} className="h-4 w-4 accent-iris-600" />
              AI summary
            </label>
            <label className="flex items-center gap-2 text-sm text-charcoal-700">
              <input type="checkbox" name="autoAttachTranscript" defaultChecked={zoom.autoAttachTranscript} className="h-4 w-4 accent-iris-600" />
              Full transcript
            </label>
          </fieldset>

          <fieldset className="space-y-2 rounded-md border border-charcoal-200 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-iris-600">Feed these tools</legend>
            <label className="flex items-center gap-2 text-sm text-charcoal-700">
              <input type="checkbox" name="feedAccountAi" defaultChecked={zoom.feedAccountAi} className="h-4 w-4 accent-iris-600" />
              Account-AI (attaches notes &amp; transcript to the account knowledge base)
            </label>
            <label className="flex items-center gap-2 text-sm text-charcoal-700">
              <input type="checkbox" name="feedNoteFormatter" defaultChecked={zoom.feedNoteFormatter} className="h-4 w-4 accent-iris-600" />
              Note Formatter (makes the transcript available as a note source)
            </label>
          </fieldset>

          <div className="rounded-md border border-charcoal-200 bg-charcoal-50 p-3 text-xs text-charcoal-600">
            <p className="font-semibold text-charcoal-700">Zoom webhook endpoint</p>
            <code className="mt-1 block break-all text-charcoal-800">{ZOOM_WEBHOOK_PATH}</code>
            <p className="mt-1">Point your Zoom app&apos;s recording/summary completed webhook here. It must include a meeting reference and the notes, summary, and/or transcript payload.</p>
          </div>

          <ActionBar>
            <Button type="submit">Save Zoom Settings</Button>
          </ActionBar>
          <div className="text-xs text-charcoal-500">
            {zoom.updatedAt ? `Last updated: ${new Date(zoom.updatedAt).toLocaleString()}${zoom.updatedBy ? ` by ${zoom.updatedBy}` : ""}` : "No saved Zoom settings yet."}
          </div>
        </form>
        <ActionBar>
          <form action={integrationTestAction}>
            <input type="hidden" name="integrationKey" value="zoom" />
            <Button type="submit" tone="secondary">
              Test Zoom Connection
            </Button>
          </form>
        </ActionBar>
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
