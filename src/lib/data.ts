import { decryptSecret, encryptSecret } from "./secret-crypto";
import {
  getIntegrations as readIntegrations,
  getLlmCredential,
  updateIntegrationStatus,
  upsertLlmCredential as writeLlmCredential,
  type IntegrationStatus,
} from "./local-config";

export async function getIntegrations() {
  return readIntegrations();
}

export async function updateIntegration(input: { integrationKey: string; status: IntegrationStatus }) {
  return updateIntegrationStatus(input.integrationKey, input.status);
}

export type LlmCredentialSummary = {
  configured: boolean;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  insecureTls: boolean;
  hasApiKey: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

const EMPTY_LLM_SUMMARY: LlmCredentialSummary = {
  configured: false,
  baseUrl: "",
  model: "",
  timeoutMs: 60000,
  insecureTls: false,
  hasApiKey: false,
  updatedAt: null,
  updatedBy: null,
};

export async function getLlmCredentialSummary(): Promise<LlmCredentialSummary> {
  const record = getLlmCredential();
  if (!record) return EMPTY_LLM_SUMMARY;
  return {
    configured: true,
    baseUrl: record.baseUrl,
    model: record.model,
    timeoutMs: record.timeoutMs,
    insecureTls: record.insecureTls,
    hasApiKey: Boolean(record.apiKeyCiphertext),
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
  };
}

export type LlmCredentialResolved = {
  baseUrl: string;
  model: string;
  apiKey: string | null;
  timeoutMs: number;
  insecureTls: boolean;
};

export async function getLlmCredentialResolved(): Promise<LlmCredentialResolved | null> {
  const record = getLlmCredential();
  if (!record) return null;
  return {
    baseUrl: record.baseUrl,
    model: record.model,
    apiKey: record.apiKeyCiphertext ? decryptSecret(record.apiKeyCiphertext) : null,
    timeoutMs: record.timeoutMs,
    insecureTls: record.insecureTls,
  };
}

export async function upsertLlmCredential(input: {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  insecureTls: boolean;
  apiKey?: string | null;
  updatedBy?: string | null;
}) {
  const existing = getLlmCredential();
  const apiKeyCiphertext =
    input.apiKey === undefined
      ? (existing?.apiKeyCiphertext ?? null)
      : input.apiKey
        ? encryptSecret(input.apiKey)
        : null;
  writeLlmCredential({
    baseUrl: input.baseUrl,
    model: input.model,
    timeoutMs: input.timeoutMs,
    insecureTls: input.insecureTls,
    apiKeyCiphertext,
    updatedBy: input.updatedBy ?? null,
    updatedAt: new Date().toISOString(),
  });
}

export async function clearLlmCredentialApiKey(updatedBy?: string | null) {
  const existing = getLlmCredential();
  if (!existing) return;
  writeLlmCredential({
    ...existing,
    apiKeyCiphertext: null,
    updatedBy: updatedBy ?? null,
    updatedAt: new Date().toISOString(),
  });
}
