import assert from "node:assert/strict";
import http from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import { formatNotesWithLLM, getLlmConfig, getLlmStatus, isLlmConfigured } from "@/lib/llm";

// A tiny OpenAI-compatible mock so we can exercise the real node:http request
// path (status probe, chat completion, error handling) without a live endpoint.

type MockBehavior = {
  modelsStatus: number;
  chatStatus: number;
  chatBody: string;
};

const behavior: MockBehavior = {
  modelsStatus: 200,
  chatStatus: 200,
  chatBody: JSON.stringify({ choices: [{ message: { content: "# Generated\n\n## Overview\n- ok" } }] }),
};

let lastChatPayload: { model?: string; messages?: { role: string; content: string }[] } | null = null;
let server: http.Server;
let baseUrl = "";

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url?.endsWith("/models") && req.method === "GET") {
      res.writeHead(behavior.modelsStatus, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "mock-model" }] }));
      return;
    }
    if (req.url?.endsWith("/chat/completions") && req.method === "POST") {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        try {
          lastChatPayload = JSON.parse(raw);
        } catch {
          lastChatPayload = null;
        }
        res.writeHead(behavior.chatStatus, { "Content-Type": "application/json" });
        res.end(behavior.chatBody);
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address && typeof address === "object") {
    baseUrl = `http://127.0.0.1:${address.port}`;
  }
});

after(() => {
  server.close();
});

beforeEach(() => {
  behavior.modelsStatus = 200;
  behavior.chatStatus = 200;
  behavior.chatBody = JSON.stringify({ choices: [{ message: { content: "# Generated\n\n## Overview\n- ok" } }] });
  lastChatPayload = null;
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("LLM_") || key.startsWith("LOCAL_LLM_")) {
      delete process.env[key];
    }
  }
  process.env.LLM_BASE_URL = baseUrl;
  process.env.LLM_MODEL = "mock-model";
  process.env.LLM_API_KEY = "test-key";
});

describe("getLlmConfig", () => {
  it("returns null when no base URL is set", () => {
    delete process.env.LLM_BASE_URL;
    assert.equal(getLlmConfig(), null);
    assert.equal(isLlmConfigured(), false);
  });

  it("normalizes a trailing slash on the base URL", () => {
    process.env.LLM_BASE_URL = "http://example.com/v1/";
    assert.equal(getLlmConfig()?.baseUrl, "http://example.com/v1");
  });

  it("parses LLM_INSECURE_TLS truthy values", () => {
    process.env.LLM_INSECURE_TLS = "true";
    assert.equal(getLlmConfig()?.insecureTls, true);
    process.env.LLM_INSECURE_TLS = "0";
    assert.equal(getLlmConfig()?.insecureTls, false);
  });

  it("accepts LOCAL_LLM_* back-compat names", () => {
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
    process.env.LOCAL_LLM_BASE_URL = "http://legacy.local/v1";
    process.env.LOCAL_LLM_MODEL = "legacy";
    const config = getLlmConfig();
    assert.equal(config?.baseUrl, "http://legacy.local/v1");
    assert.equal(config?.model, "legacy");
  });
});

describe("getLlmStatus", () => {
  it("reports reachable when /models returns 200", async () => {
    const status = await getLlmStatus();
    assert.equal(status.configured, true);
    if (status.configured) {
      assert.equal(status.reachable, true);
      assert.equal(status.model, "mock-model");
    }
  });

  it("reports unreachable when /models errors", async () => {
    behavior.modelsStatus = 500;
    const status = await getLlmStatus();
    assert.equal(status.configured, true);
    if (status.configured) {
      assert.equal(status.reachable, false);
    }
  });

  it("reports not configured when no base URL", async () => {
    delete process.env.LLM_BASE_URL;
    const status = await getLlmStatus();
    assert.equal(status.configured, false);
  });
});

describe("formatNotesWithLLM", () => {
  it("returns the model's markdown content", async () => {
    const md = await formatNotesWithLLM("build a cluster", {
      title: "Test",
      includeHelpers: true,
      includeQuestions: true,
      kind: "plan",
    });
    assert.match(md, /# Generated/);
  });

  it("wraps notes in the RAW_NOTES delimiter and labels the note type", async () => {
    await formatNotesWithLLM("secret meeting content", {
      title: "",
      includeHelpers: true,
      includeQuestions: true,
      kind: "meeting",
    });
    const userMsg = lastChatPayload?.messages?.find((m) => m.role === "user")?.content ?? "";
    assert.match(userMsg, /RAW_NOTES/);
    assert.match(userMsg, /secret meeting content/);
    assert.match(userMsg, /Note type: meeting summary/);
  });

  it("sends the configured model name", async () => {
    await formatNotesWithLLM("x", { title: "", includeHelpers: true, includeQuestions: true, kind: "plan" });
    assert.equal(lastChatPayload?.model, "mock-model");
  });

  it("throws on a non-2xx response", async () => {
    behavior.chatStatus = 500;
    behavior.chatBody = "boom";
    await assert.rejects(
      () => formatNotesWithLLM("x", { title: "", includeHelpers: true, includeQuestions: true }),
      /HTTP 500/,
    );
  });

  it("throws on a non-JSON response", async () => {
    behavior.chatBody = "not json";
    await assert.rejects(
      () => formatNotesWithLLM("x", { title: "", includeHelpers: true, includeQuestions: true }),
      /non-JSON/,
    );
  });

  it("throws when the response has no content", async () => {
    behavior.chatBody = JSON.stringify({ choices: [{ message: { content: "" } }] });
    await assert.rejects(
      () => formatNotesWithLLM("x", { title: "", includeHelpers: true, includeQuestions: true }),
      /did not include any content/,
    );
  });

  it("throws when the LLM is not configured", async () => {
    delete process.env.LLM_BASE_URL;
    await assert.rejects(
      () => formatNotesWithLLM("x", { title: "", includeHelpers: true, includeQuestions: true }),
      /not configured/,
    );
  });
});
