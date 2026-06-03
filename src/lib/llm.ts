// Thin client for an LLM exposed over the standard OpenAI-compatible API
// (Nutanix Enterprise AI, Ollama, LM Studio, vLLM, llama.cpp server, etc.).
// Everything here runs server-side only — the browser never talks to the model
// directly, and no credentials are shipped to the client.
//
// Uses node:http/https directly (not global fetch) so that, for internal
// endpoints with self-signed certs, TLS verification can be relaxed for THIS
// endpoint only (LLM_INSECURE_TLS=true) instead of disabling it process-wide.

import http from "node:http";
import https from "node:https";
import { DEFAULT_SYSTEM_PROMPT, type FormatOptions } from "@/lib/note-formatter";

export type LlmConfig = {
  baseUrl: string;
  model: string;
  apiKey: string | null;
  timeoutMs: number;
  insecureTls: boolean;
};

export type LlmStatus =
  | { configured: false }
  | { configured: true; reachable: boolean; model: string; baseUrl: string; detail: string };

const DEFAULT_TIMEOUT_MS = 60_000;

export function getLlmConfig(): LlmConfig | null {
  // LLM_* are the current names; LOCAL_LLM_* are still accepted for back-compat.
  const baseUrl = (process.env.LLM_BASE_URL ?? process.env.LOCAL_LLM_BASE_URL)?.trim();
  if (!baseUrl) {
    return null;
  }
  return {
    // Normalize to no trailing slash; callers append the OpenAI-style path.
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model: (process.env.LLM_MODEL ?? process.env.LOCAL_LLM_MODEL)?.trim() || "default",
    apiKey: (process.env.LLM_API_KEY ?? process.env.LOCAL_LLM_API_KEY)?.trim() || null,
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? process.env.LOCAL_LLM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    // Opt-in for internal endpoints with self-signed/internal certs (curl -k).
    insecureTls: /^(1|true|yes)$/i.test((process.env.LLM_INSECURE_TLS ?? "").trim()),
  };
}

// The default system prompt, overridable via env. The UI can still override it
// per request.
export function getDefaultSystemPrompt(): string {
  return process.env.LLM_SYSTEM_PROMPT?.trim() || DEFAULT_SYSTEM_PROMPT;
}

export function isLlmConfigured(): boolean {
  return getLlmConfig() !== null;
}

function authHeaders(config: LlmConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    accept: "application/json",
  };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  return headers;
}

type HttpResult = { status: number; body: string };

// Minimal JSON-over-HTTP(S) request with a hard timeout. Uses node:https so we
// can set rejectUnauthorized:false for internal/self-signed endpoints (the
// equivalent of curl -k) scoped to this endpoint only.
function request(
  config: LlmConfig,
  path: string,
  method: "GET" | "POST",
  payload?: unknown,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(`${config.baseUrl}${path}`);
    } catch (error) {
      reject(error);
      return;
    }
    const isHttps = url.protocol === "https:";
    const lib = isHttps ? https : http;
    const body = payload === undefined ? undefined : JSON.stringify(payload);
    const headers = authHeaders(config);
    if (body) {
      headers["Content-Length"] = Buffer.byteLength(body).toString();
    }

    const req = lib.request(
      url,
      {
        method,
        headers,
        // Only meaningful for https; relaxed when explicitly opted in.
        ...(isHttps ? { rejectUnauthorized: !config.insecureTls } : {}),
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );

    req.on("error", reject);
    req.setTimeout(config.timeoutMs, () => req.destroy(new Error(`timed out after ${config.timeoutMs}ms`)));
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

// Lightweight reachability check used by the integration health test and the
// Note Formatter status badge. Hits the OpenAI-compatible /models endpoint.
export async function getLlmStatus(): Promise<LlmStatus> {
  const config = getLlmConfig();
  if (!config) {
    return { configured: false };
  }
  const probe: LlmConfig = { ...config, timeoutMs: Math.min(config.timeoutMs, 8000) };
  try {
    const result = await request(probe, "/models", "GET");
    const ok = result.status >= 200 && result.status < 300;
    return {
      configured: true,
      reachable: ok,
      model: config.model,
      baseUrl: config.baseUrl,
      detail: ok
        ? `Reachable at ${config.baseUrl} (model: ${config.model}).`
        : `Endpoint responded with HTTP ${result.status}.`,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      model: config.model,
      baseUrl: config.baseUrl,
      detail: `Could not reach ${config.baseUrl}: ${(error as Error).message}`,
    };
  }
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function chatComplete(config: LlmConfig, messages: ChatMessage[]): Promise<string> {
  const result = await request(config, "/chat/completions", "POST", {
    model: config.model,
    messages,
    temperature: 0.2,
    stream: false,
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`LLM returned HTTP ${result.status}${result.body ? `: ${result.body.slice(0, 300)}` : ""}`);
  }

  let data: { choices?: { message?: { content?: string } }[] };
  try {
    data = JSON.parse(result.body);
  } catch {
    throw new Error("LLM returned a non-JSON response.");
  }
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("LLM response did not include any content.");
  }
  return content;
}

type PromptOptions = FormatOptions & { instructions?: string; systemPrompt?: string };

function buildPrompt(notes: string, options: PromptOptions): ChatMessage[] {
  // The user can supply their own system prompt; otherwise use the configured
  // default. Section toggles are conveyed in the user message so they still
  // apply regardless of which system prompt is active.
  const system = options.systemPrompt?.trim() || getDefaultSystemPrompt();

  const userParts = [`Title: ${options.title.trim() || "(derive a concise title)"}`];
  userParts.push(
    "",
    `Include Helper Tasks section: ${options.includeHelpers ? "yes" : "no"}`,
    `Include Open Questions section: ${options.includeQuestions ? "yes" : "no"}`,
  );
  if (options.instructions?.trim()) {
    userParts.push("", "Extra instructions:", options.instructions.trim());
  }
  userParts.push("", "Raw notes:", notes.trim());

  return [
    { role: "system", content: system },
    { role: "user", content: userParts.join("\n") },
  ];
}

// Returns the formatted plan as Markdown produced by the local LLM. Throws if
// the model isn't configured or the call fails (callers can fall back to the
// offline heuristic formatter).
export async function formatNotesWithLLM(notes: string, options: PromptOptions): Promise<string> {
  const config = getLlmConfig();
  if (!config) {
    throw new Error("LLM is not configured. Set LLM_BASE_URL.");
  }
  return chatComplete(config, buildPrompt(notes, options));
}
