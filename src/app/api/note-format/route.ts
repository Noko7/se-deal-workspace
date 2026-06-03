import { NextResponse } from "next/server";
import { formatNotesWithLLM, getDefaultSystemPrompt, getLlmStatus, isLlmConfigured } from "@/lib/llm";

export const dynamic = "force-dynamic";

// Connection status for the Note Formatter status badge and the integration
// test. Also returns the active default system prompt so the UI can pre-fill the
// editable field (reflecting any LLM_SYSTEM_PROMPT override).
export async function GET() {
  const status = await getLlmStatus();
  return NextResponse.json({ ...status, defaultSystemPrompt: getDefaultSystemPrompt() });
}

type FormatBody = {
  notes?: string;
  title?: string;
  instructions?: string;
  systemPrompt?: string;
  includeHelpers?: boolean;
  includeQuestions?: boolean;
};

export async function POST(request: Request) {
  if (!isLlmConfigured()) {
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

  const notes = (body.notes ?? "").trim();
  if (!notes) {
    return NextResponse.json({ ok: false, error: "No notes provided." }, { status: 400 });
  }

  try {
    const markdown = await formatNotesWithLLM(notes, {
      title: body.title ?? "",
      instructions: body.instructions ?? "",
      systemPrompt: body.systemPrompt ?? "",
      includeHelpers: body.includeHelpers ?? true,
      includeQuestions: body.includeQuestions ?? true,
    });
    return NextResponse.json({ ok: true, markdown });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 502 });
  }
}
