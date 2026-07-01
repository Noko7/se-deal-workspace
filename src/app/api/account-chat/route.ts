import { NextResponse } from "next/server";
import {
  ACCOUNT_AI_SYSTEM_PROMPT,
  ALL_ACCOUNTS_SYSTEM_PROMPT,
  buildAccountKnowledgeBase,
  buildAllAccountsKnowledgeBase,
} from "@/lib/account-ai";
import { getResolvedLlmConfig, runChat, type ChatMessage } from "@/lib/llm";
import { sanitizeField, sanitizeNotes } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

const MAX_TURNS = 20;

type IncomingMessage = { role?: unknown; content?: unknown };
type ChatBody = {
  scope?: unknown;
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

  // scope is either "all" (portfolio mode) or a specific dealId. Fall back to
  // the legacy `dealId` field for back-compat.
  const scope = sanitizeField(body.scope ?? body.dealId, 64);
  if (!scope) {
    return NextResponse.json({ ok: false, error: "Missing account scope." }, { status: 400 });
  }
  const isAllAccounts = scope === "all";

  const turns = normalizeMessages(body.messages);
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") {
    return NextResponse.json({ ok: false, error: "No user message provided." }, { status: 400 });
  }

  // Resolve the LLM config once and reuse it for the completion below, so a
  // single request never resolves credentials (and hits the DB) twice.
  const llmConfig = await getResolvedLlmConfig();
  if (!llmConfig) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Account-AI is not configured yet. Connect an LLM endpoint on the Integrations page to start chatting with your accounts.",
      },
      { status: 503 },
    );
  }

  let systemPrompt: string;
  let contextLabel: string;
  let contextText: string;

  if (isAllAccounts) {
    const kb = await buildAllAccountsKnowledgeBase();
    systemPrompt = ALL_ACCOUNTS_SYSTEM_PROMPT;
    contextLabel = "PORTFOLIO KNOWLEDGE BASE (all of the SE's accounts)";
    contextText = kb.contextText;
  } else {
    const kb = await buildAccountKnowledgeBase(scope);
    if (!kb) {
      return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
    }
    if (kb.summary.aiOptOut) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This account has opted out of AI usage at Nutanix. Account-AI is disabled for it, so I can't chat about this account.",
        },
        { status: 403 },
      );
    }
    systemPrompt = ACCOUNT_AI_SYSTEM_PROMPT;
    contextLabel = "ACCOUNT KNOWLEDGE BASE (the only data you may rely on)";
    contextText = kb.contextText;
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
    content: [systemPrompt, "", `=== ${contextLabel} ===`, contextText, "=== END KNOWLEDGE BASE ==="].join("\n"),
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
    const reply = await runChat(messages, llmConfig);
    return NextResponse.json({ ok: true, reply });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 502 });
  }
}
