import { NextResponse } from "next/server";
import { NoteRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { attachNoteToMeeting, getMeetingOptions } from "@/lib/data";
import { sanitizeNotes } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

// Notes can be long (a full formatted plan), so allow more than the freeform
// input cap but still keep it bounded.
const MAX_NOTE_BODY = 50_000;

// The author is the authenticated Basic-auth user (proxy.ts guarantees one).
function authorFromRequest(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
      const user = decoded.slice(0, decoded.indexOf(":")).trim();
      if (user) {
        return user;
      }
    } catch {
      // fall through to default
    }
  }
  return "se.workspace@nutanix.com";
}

function asRole(value: unknown): NoteRole {
  return value === "AE" || value === "SAM" ? (value as NoteRole) : NoteRole.SE;
}

// List meetings (with their account) so the modal can offer a searchable picker.
export async function GET() {
  const meetings = await getMeetingOptions();
  return NextResponse.json({ meetings });
}

type AttachBody = { meetingId?: unknown; body?: unknown; role?: unknown };

// Attach a formatted note to a meeting (and, transitively, its account).
export async function POST(request: Request) {
  let payload: AttachBody;
  try {
    payload = (await request.json()) as AttachBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const meetingId = typeof payload.meetingId === "string" ? payload.meetingId.trim() : "";
  if (!meetingId) {
    return NextResponse.json({ ok: false, error: "Select a meeting to attach the note to." }, { status: 400 });
  }

  const body = sanitizeNotes(payload.body, MAX_NOTE_BODY).text;
  if (!body.trim()) {
    return NextResponse.json({ ok: false, error: "There's nothing to attach yet — format some notes first." }, { status: 400 });
  }

  const note = await attachNoteToMeeting({
    meetingId,
    body,
    role: asRole(payload.role),
    author: authorFromRequest(request),
  });

  if (!note) {
    return NextResponse.json({ ok: false, error: "That meeting no longer exists." }, { status: 404 });
  }

  // Reflect the new note across the account views.
  revalidatePath("/accounts");
  revalidatePath(`/accounts/${note.dealId}`);

  return NextResponse.json({ ok: true, noteId: note.id, dealId: note.dealId });
}
