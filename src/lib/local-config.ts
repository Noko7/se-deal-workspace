import fs from "node:fs";
import path from "node:path";

// Local, file-backed replacement for the old Prisma-stored admin config
// (connector status + LLM credentials). No customer/user data lives here —
// just this app instance's own connector setup, kept on disk next to it.

export type IntegrationStatus = "NOT_CONNECTED" | "NEEDS_ATTENTION" | "CONNECTED";

export type IntegrationRecord = {
  integrationKey: string;
  displayName: string;
  status: IntegrationStatus;
  setupNotes: string;
  connectedBy: string | null;
  connectedAt: string | null;
  lastHealthCheckAt: string | null;
};

export type LlmCredentialRecord = {
  baseUrl: string;
  model: string;
  apiKeyCiphertext: string | null;
  timeoutMs: number;
  insecureTls: boolean;
  updatedBy: string | null;
  updatedAt: string;
};

type LocalConfig = {
  integrations: IntegrationRecord[];
  llmCredential: LlmCredentialRecord | null;
};

const CONFIG_PATH = path.join(process.cwd(), "data", "local-config.json");

const DEFAULT_INTEGRATIONS: IntegrationRecord[] = [
  {
    integrationKey: "outlook",
    displayName: "Outlook",
    status: "NOT_CONNECTED",
    setupNotes: "Connect Microsoft Graph in Wave 2.",
    connectedBy: null,
    connectedAt: null,
    lastHealthCheckAt: null,
  },
  {
    integrationKey: "salesforce",
    displayName: "Salesforce",
    status: "NEEDS_ATTENTION",
    setupNotes:
      "Review the Salesforce Account Schema card below to confirm our field mapping matches your SFDC org, then wire live credentials.",
    connectedBy: null,
    connectedAt: null,
    lastHealthCheckAt: null,
  },
  {
    integrationKey: "lucidchart",
    displayName: "Lucidchart",
    status: "NOT_CONNECTED",
    setupNotes: "Whiteboard preview metadata available after connector setup.",
    connectedBy: null,
    connectedAt: null,
    lastHealthCheckAt: null,
  },
  {
    integrationKey: "google_drive",
    displayName: "Google Drive",
    status: "NOT_CONNECTED",
    setupNotes: "Optional source for presentations.",
    connectedBy: null,
    connectedAt: null,
    lastHealthCheckAt: null,
  },
  {
    integrationKey: "cs360_qbr",
    displayName: "CS360 QBR Report",
    status: "NEEDS_ATTENTION",
    setupNotes: "Use manual upload fallback until auth automation is available.",
    connectedBy: null,
    connectedAt: null,
    lastHealthCheckAt: null,
  },
  {
    integrationKey: "local_llm",
    displayName: "Enterprise AI (LLM)",
    status: "NOT_CONNECTED",
    setupNotes:
      "Set LLM_BASE_URL to your OpenAI-compatible endpoint (e.g. https://ai.nutanix.com/enterpriseai/v1), plus LLM_API_KEY and LLM_MODEL, then run Test Adapter. Powers the Note Formatter.",
    connectedBy: null,
    connectedAt: null,
    lastHealthCheckAt: null,
  },
];

function readConfig(): LocalConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalConfig>;
    return {
      integrations: parsed.integrations ?? DEFAULT_INTEGRATIONS,
      llmCredential: parsed.llmCredential ?? null,
    };
  } catch {
    return { integrations: DEFAULT_INTEGRATIONS, llmCredential: null };
  }
}

function writeConfig(config: LocalConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function getIntegrations(): IntegrationRecord[] {
  return [...readConfig().integrations].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function updateIntegrationStatus(integrationKey: string, status: IntegrationStatus): IntegrationRecord | null {
  const config = readConfig();
  const record = config.integrations.find((i) => i.integrationKey === integrationKey);
  if (!record) return null;
  record.status = status;
  record.lastHealthCheckAt = new Date().toISOString();
  record.connectedAt = status === "CONNECTED" ? new Date().toISOString() : null;
  record.connectedBy = status === "CONNECTED" ? "local" : null;
  writeConfig(config);
  return record;
}

export function getLlmCredential(): LlmCredentialRecord | null {
  return readConfig().llmCredential;
}

export function upsertLlmCredential(record: LlmCredentialRecord): void {
  const config = readConfig();
  config.llmCredential = record;
  writeConfig(config);
}
