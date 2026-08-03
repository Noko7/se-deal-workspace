import { getLlmStatus } from "@/lib/llm";

export type IntegrationAdapterKey =
  | "outlook"
  | "salesforce"
  | "lucidchart"
  | "google_drive"
  | "cs360_qbr"
  | "local_llm";

export type AdapterHealth = "ok" | "warning" | "offline";

export interface IntegrationAdapter {
  key: IntegrationAdapterKey;
  label: string;
  description: string;
  mode: "mock" | "live";
  health: AdapterHealth;
  capabilities: string[];
  testConnection: () => Promise<{ success: boolean; details: string }>;
}

function makeMockAdapter(
  key: IntegrationAdapterKey,
  label: string,
  description: string,
  capabilities: string[],
): IntegrationAdapter {
  return {
    key,
    label,
    description,
    mode: "mock",
    health: "warning",
    capabilities,
    async testConnection() {
      return {
        success: true,
        details: `${label} adapter is running in mock mode. Ready for Wave 2 live credentials.`,
      };
    },
  };
}

export const integrationAdapters: Record<IntegrationAdapterKey, IntegrationAdapter> = {
  outlook: makeMockAdapter(
    "outlook",
    "Outlook",
    "Calendar + inbox events for meetings and email memory.",
    ["meeting_sync", "email_sync", "attendee_domain_parse"],
  ),
  salesforce: makeMockAdapter(
    "salesforce",
    "Salesforce",
    "Current deals pipeline and account context.",
    ["pipeline_sync", "account_lookup", "opportunity_notes"],
  ),
  lucidchart: makeMockAdapter(
    "lucidchart",
    "Lucidchart",
    "Whiteboard link metadata and preview payloads.",
    ["whiteboard_preview", "board_metadata"],
  ),
  google_drive: makeMockAdapter(
    "google_drive",
    "Google Drive",
    "Presentation source, folder browsing, and file metadata.",
    ["file_lookup", "presentation_preview"],
  ),
  cs360_qbr: makeMockAdapter(
    "cs360_qbr",
    "CS360 QBR",
    "QBR report retrieval workflow with manual fallback.",
    ["qbr_report_import", "account_report_linking"],
  ),
  // Real, live adapter: the Note Formatter sends notes to a local LLM over the
  // standard OpenAI-compatible API. Configure with LOCAL_LLM_BASE_URL / _MODEL.
  local_llm: {
    key: "local_llm",
    label: "Enterprise AI (LLM)",
    description: "OpenAI-compatible chat model powering the Note Formatter.",
    mode: "live",
    health: "warning",
    capabilities: ["note_formatting", "implementation_plan_generation", "helper_task_extraction"],
    async testConnection() {
      const status = await getLlmStatus();
      if (status.configured && status.reachable) {
        return { success: true, details: status.detail };
      }
      return {
        success: false,
        details: status.configured ? status.detail : "Local LLM is not configured.",
      };
    },
  },
};
