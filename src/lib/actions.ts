"use server";

import { revalidatePath } from "next/cache";
import { updateIntegration, upsertLlmCredential, clearLlmCredentialApiKey } from "./data";
import { integrationAdapters } from "./adapters";
import { invalidateLlmConfigCache } from "./llm";
import { sanitizeField } from "./sanitize";
import type { IntegrationStatus } from "./local-config";

export async function integrationStatusAction(formData: FormData) {
  const integrationKey = String(formData.get("integrationKey"));
  const status = String(formData.get("status")) as IntegrationStatus;

  await updateIntegration({ integrationKey, status });

  revalidatePath("/integrations");
}

export async function integrationTestAction(formData: FormData) {
  const integrationKey = String(formData.get("integrationKey")) as keyof typeof integrationAdapters;
  await integrationAdapters[integrationKey].testConnection();
  revalidatePath("/integrations");
}

export async function saveLlmCredentialsAction(formData: FormData) {
  const baseUrl = sanitizeField(formData.get("baseUrl"), 500).replace(/\/+$/, "");
  const model = sanitizeField(formData.get("model"), 120);
  const timeoutMs = Number(formData.get("timeoutMs") ?? 60000);
  const insecureTls = String(formData.get("insecureTls") ?? "") === "on";
  const apiKeyRaw = String(formData.get("apiKey") ?? "");

  if (!baseUrl || !/^https?:\/\//i.test(baseUrl) || !model) {
    return;
  }

  await upsertLlmCredential({
    baseUrl,
    model,
    timeoutMs: Number.isFinite(timeoutMs) ? Math.min(Math.max(timeoutMs, 1000), 180000) : 60000,
    insecureTls,
    apiKey: apiKeyRaw.trim() ? apiKeyRaw.trim() : undefined,
    updatedBy: "local",
  });

  invalidateLlmConfigCache();
  revalidatePath("/integrations");
}

export async function clearLlmApiKeyAction() {
  await clearLlmCredentialApiKey("local");
  invalidateLlmConfigCache();
  revalidatePath("/integrations");
}
