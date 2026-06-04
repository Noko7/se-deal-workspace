import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { attachSizingToAccount, getAccountOptions } from "@/lib/data";
import { sanitizeNotes } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

const MAX_BODY = 100_000;

function authorFromRequest(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const user = decoded.slice(0, decoded.indexOf(":")).trim();
      if (user) return user;
    } catch {
      // ignore and fall through
    }
  }
  return "se.workspace@nutanix.com";
}

export async function GET() {
  const accounts = await getAccountOptions();
  return NextResponse.json({ accounts });
}

type AttachPayload = {
  dealId?: unknown;
  body?: unknown;
};

export async function POST(request: Request) {
  let payload: AttachPayload;
  try {
    payload = (await request.json()) as AttachPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const dealId = typeof payload.dealId === "string" ? payload.dealId.trim() : "";
  if (!dealId) {
    return NextResponse.json({ ok: false, error: "Select an account to attach sizing." }, { status: 400 });
  }

  const body = sanitizeNotes(payload.body, MAX_BODY).text;
  if (!body.trim()) {
    return NextResponse.json({ ok: false, error: "No sizing content to attach." }, { status: 400 });
  }

  const note = await attachSizingToAccount({
    dealId,
    body,
    author: authorFromRequest(request),
  });
  if (!note) {
    return NextResponse.json({ ok: false, error: "Account/deal no longer exists." }, { status: 404 });
  }

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${note.dealId}`);
  revalidatePath("/simple-sizer");

  return NextResponse.json({ ok: true, noteId: note.id, dealId: note.dealId });
}

