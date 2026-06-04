import { NextResponse } from "next/server";
import { formatNotesWithLLM, getDefaultSystemPrompt, getLlmStatus, isLlmConfiguredResolved } from "@/lib/llm";
import type { NoteKind } from "@/lib/note-formatter";
import {
  MAX_FIELD_LENGTH,
  MAX_NOTES_LENGTH,
  MAX_PROMPT_LENGTH,
  sanitizeField,
  sanitizeNotes,
  sanitizePrompt,
} from "@/lib/sanitize";

export const dynamic = "force-dynamic";

// Connection status for the Note Formatter status badge and the integration
// test. Also returns the active default system prompts (per note kind) so the UI
// can pre-fill the editable field (reflecting any LLM_SYSTEM_PROMPT override).
export async function GET() {
  const status = await getLlmStatus();
  return NextResponse.json({
    ...status,
    defaultSystemPrompt: getDefaultSystemPrompt("plan"),
    defaultMeetingSystemPrompt: getDefaultSystemPrompt("meeting"),
    limits: { notes: MAX_NOTES_LENGTH, field: MAX_FIELD_LENGTH, prompt: MAX_PROMPT_LENGTH },
  });
}

type FormatBody = {
  notes?: unknown;
  title?: unknown;
  instructions?: unknown;
  systemPrompt?: unknown;
  kind?: unknown;
  includeHelpers?: unknown;
  includeQuestions?: unknown;
};

function asKind(value: unknown): NoteKind {
  return value === "meeting" ? "meeting" : "plan";
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export async function POST(request: Request) {
  if (!(await isLlmConfiguredResolved())) {
    return NextResponse.json(
      { ok: false, error: "LLM is not configured. Set LLM_BASE_URL in the environment." },
      { status: 503 },
    );
  }

  let body: FormatBody;
  try {
    body = (await request.json()) as FormatBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  // Sanitize every field before it touches the model: bounded length, no control
  // characters or terminal escape codes.
  const notes = sanitizeNotes(body.notes);
  if (!notes.text.trim()) {
    return NextResponse.json({ ok: false, error: "No notes provided." }, { status: 400 });
  }

  try {
    const formattedText = await formatNotesWithLLM(notes.text, {
      title: sanitizeField(body.title),
      instructions: sanitizeField(body.instructions, 500),
      systemPrompt: sanitizePrompt(body.systemPrompt),
      kind: asKind(body.kind),
      includeHelpers: asBool(body.includeHelpers, true),
      includeQuestions: asBool(body.includeQuestions, true),
    });
    return NextResponse.json({ ok: true, formattedText, truncated: notes.truncated });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 502 });
  }
}
