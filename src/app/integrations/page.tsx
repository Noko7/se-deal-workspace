import { Plug } from "lucide-react";
import { clearLlmApiKeyAction, saveLlmCredentialsAction } from "@/lib/actions";
import { getLlmCredentialSummary } from "@/lib/data";
import { ActionBar, Button, Card, SectionHeader, StatusPill } from "@/components/ui";
import { NaiTestPanel } from "@/components/nai-test-panel";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const llm = await getLlmCredentialSummary();

  return (
    <div className="space-y-6">
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
