import { NextResponse } from "next/server";
import { buildAccountKnowledgeBase } from "@/lib/account-ai";
import { sanitizeField } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

// Returns a single account's structured brain summary, loaded lazily by the
// workspace when a specific account is selected / its brain panel is opened.
export async function GET(request: Request) {
  const dealId = sanitizeField(new URL(request.url).searchParams.get("dealId"), 64);
  if (!dealId) {
    return NextResponse.json({ ok: false, error: "Missing account id." }, { status: 400 });
  }

  const kb = await buildAccountKnowledgeBase(dealId);
  if (!kb) {
    return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, summary: kb.summary });
}
