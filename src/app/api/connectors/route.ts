import { NextResponse } from "next/server";
import { fetchOutlookMeetings, fetchSalesforcePipeline, fetchWhiteboardPreview } from "@/lib/connectors";

export async function GET() {
  const [outlook, salesforce, whiteboard] = await Promise.all([
    fetchOutlookMeetings(),
    fetchSalesforcePipeline(),
    fetchWhiteboardPreview("https://example.local/lucid"),
  ]);

  return NextResponse.json({
    connectors: {
      outlook,
      salesforce,
      whiteboard,
    },
  });
}
