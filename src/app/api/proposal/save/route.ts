import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { invalidateAccountKb } from "@/lib/account-ai";
import { createArtifact, createNote } from "@/lib/data";
import { sanitizeField } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

// Saves a built proposal against an opportunity: the deck lands in the asset
// library (visible in the Account AI brain) and a readable summary note lets
// the AI reason over the proposed design without parsing a binary file.
export async function POST(request: Request) {
  let payload: { dealId?: string; title?: string; summary?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a JSON body." }, { status: 400 });
  }

  const dealId = sanitizeField(payload.dealId, 64);
  const title = sanitizeField(payload.title, 200) || "Nutanix Solution Proposal";
  const summary = typeof payload.summary === "string" ? payload.summary.trim().slice(0, 12000) : "";
  if (!dealId) {
    return NextResponse.json({ ok: false, error: "Pick an opportunity to save against." }, { status: 400 });
  }

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, accountName: true, aiOptOut: true },
  });
  if (!deal) {
    return NextResponse.json({ ok: false, error: "Opportunity not found." }, { status: 404 });
  }
  if (deal.aiOptOut) {
    return NextResponse.json({ ok: false, error: "This account has opted out of AI usage." }, { status: 403 });
  }

  try {
    await createArtifact({
      dealId,
      type: "PRESENTATION",
      sourceTool: "Proposal Builder",
      title,
      uri: `proposal://${encodeURIComponent(title)}`,
      uploadedBy: "se.workspace@nutanix.com",
    });
    if (summary) {
      await createNote({
        dealId,
        role: "SE",
        author: "se.workspace@nutanix.com",
        body: summary,
      });
    }
    invalidateAccountKb();
    revalidatePath(`/accounts/${dealId}`);
    revalidatePath("/");
    return NextResponse.json({ ok: true, accountName: deal.accountName });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
