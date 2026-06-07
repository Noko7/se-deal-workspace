import { NextResponse } from "next/server";
import { ACCOUNT_AI_SYSTEM_PROMPT, buildAccountKnowledgeBase } from "@/lib/account-ai";
import { isLlmConfiguredResolved, runChat, type ChatMessage } from "@/lib/llm";
import { sanitizeField, sanitizeNotes } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

const MAX_TURNS = 20;

type IncomingMessage = { role?: unknown; content?: unknown };
type ChatBody = {
  dealId?: unknown;
  messages?: unknown;
  attachments?: unknown;
};

function normalizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const item of raw.slice(-MAX_TURNS) as IncomingMessage[]) {
    const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : null;
    if (!role) continue;
    const content = sanitizeNotes(item?.content, 8000).text.trim();
    if (!content) continue;
    out.push({ role, content });
  }
  return out;
}

export async function POST(request: Request) {
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const dealId = sanitizeField(body.dealId, 64);
  if (!dealId) {
    return NextResponse.json({ ok: false, error: "Missing account id." }, { status: 400 });
  }

  const turns = normalizeMessages(body.messages);
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return NextResponse.json({ ok: false, error: "No user message provided." }, { status: 400 });
  }

  if (!(await isLlmConfiguredResolved())) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Account-AI is not configured yet. Connect an LLM endpoint on the Integrations page to start chatting with this account's knowledge base.",
      },
      { status: 503 },
    );
  }

  const kb = await buildAccountKnowledgeBase(dealId);
  if (!kb) {
    return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
  }

  // Attachments are passed as references (text-only models can't see pixels).
  const attachments = Array.isArray(body.attachments)
    ? (body.attachments as unknown[])
        .map((a) => sanitizeField(a, 300))
        .filter((a) => a.length > 0)
        .slice(0, 8)
    : [];

  const system: ChatMessage = {
    role: "system",
    content: [
      ACCOUNT_AI_SYSTEM_PROMPT,
      "",
      "=== ACCOUNT KNOWLEDGE BASE (the only data you may rely on) ===",
      kb.contextText,
      "=== END KNOWLEDGE BASE ===",
    ].join("\n"),
  };

  const messages: ChatMessage[] = [system, ...turns];
  if (attachments.length > 0) {
    const last = messages[messages.length - 1];
    messages[messages.length - 1] = {
      ...last,
      content: `${last.content}\n\n[Attached images for reference: ${attachments.join(", ")}]`,
    };
  }

  try {
    const reply = await runChat(messages);
    return NextResponse.json({ ok: true, reply });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 502 });
  }
}
