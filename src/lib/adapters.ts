export type IntegrationAdapterKey =
  | "outlook"
  | "salesforce"
  | "lucidchart"
  | "google_drive"
  | "cs360_qbr";

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
};
