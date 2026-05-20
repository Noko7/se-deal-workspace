export interface ConnectorResult<T = unknown> {
  ok: boolean;
  mode: "mock" | "live";
  message: string;
  payload?: T;
}

function missingEnv(name: string): string {
  return `${name} not configured. Connector remains in mock mode.`;
}

export async function fetchOutlookMeetings(): Promise<ConnectorResult<{ meetings: unknown[] }>> {
  if (!process.env.OUTLOOK_TENANT_ID || !process.env.OUTLOOK_CLIENT_ID) {
    return { ok: false, mode: "mock", message: missingEnv("OUTLOOK_TENANT_ID / OUTLOOK_CLIENT_ID") };
  }
  return { ok: true, mode: "live", message: "Outlook connector ready for Wave 2 token exchange.", payload: { meetings: [] } };
}

export async function fetchSalesforcePipeline(): Promise<ConnectorResult<{ deals: unknown[] }>> {
  if (!process.env.SALESFORCE_INSTANCE_URL || !process.env.SALESFORCE_CLIENT_ID) {
    return { ok: false, mode: "mock", message: missingEnv("SALESFORCE_INSTANCE_URL / SALESFORCE_CLIENT_ID") };
  }
  return { ok: true, mode: "live", message: "Salesforce connector scaffold is configured.", payload: { deals: [] } };
}

export async function fetchWhiteboardPreview(url: string): Promise<ConnectorResult<{ previewUrl: string }>> {
  if (!url) {
    return { ok: false, mode: "mock", message: "Whiteboard URL missing." };
  }

  if (!process.env.LUCIDCHART_API_KEY) {
    return {
      ok: false,
      mode: "mock",
      message: missingEnv("LUCIDCHART_API_KEY"),
      payload: { previewUrl: "https://placehold.co/640x360?text=Whiteboard+Preview+Fallback" },
    };
  }

  return {
    ok: true,
    mode: "live",
    message: "Whiteboard connector scaffold is configured.",
    payload: { previewUrl: "https://placehold.co/640x360?text=Live+Whiteboard+Preview" },
  };
}
