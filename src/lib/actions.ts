"use server";

import { IntegrationStatus, NoteRole, RecommendationDecision } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  assignEmailToDeal,
  createArtifact,
  createNote,
  createRecommendation,
  createRequirement,
  updateIntegration,
  updateQbrChecklistItem,
  updateRecommendationDecision,
  upsertQbrArtifact,
  upsertLlmCredential,
  clearLlmCredentialApiKey,
} from "./data";
import { integrationAdapters } from "./adapters";
import { sanitizeField } from "./sanitize";

export async function uploadArtifactAction(formData: FormData) {
  const dealId = String(formData.get("dealId"));
  const meetingId = formData.get("meetingId") ? String(formData.get("meetingId")) : undefined;
  const type = String(formData.get("type")) as
    | "PRESENTATION"
    | "COLLECTOR"
    | "RV_TOOL"
    | "ZIP_BUNDLE"
    | "WHITEBOARD"
    | "TEXT_BRIEF"
    | "QBR_REPORT";

  await createArtifact({
    dealId,
    meetingId,
    type,
    sourceTool: String(formData.get("sourceTool")),
    title: String(formData.get("title")),
    uri: String(formData.get("uri")),
    uploadedBy: "se.workspace@nutanix.com",
    previewImageUri: formData.get("previewImageUri")
      ? String(formData.get("previewImageUri"))
      : undefined,
  });

  revalidatePath("/");
}

export async function assignEmailAction(formData: FormData) {
  await assignEmailToDeal({
    emailId: String(formData.get("emailId")),
    dealId: String(formData.get("dealId")),
    assignedBy: "se.workspace@nutanix.com",
  });

  revalidatePath("/");
}

export async function addRequirementAction(formData: FormData) {
  await createRequirement({
    dealId: String(formData.get("dealId")),
    rawText: String(formData.get("rawText")),
  });

  revalidatePath("/");
}

export async function generateRecommendationAction(formData: FormData) {
  await createRecommendation(String(formData.get("dealId")));
  revalidatePath("/");
}

export async function decideRecommendationAction(formData: FormData) {
  await updateRecommendationDecision({
    recommendationId: String(formData.get("recommendationId")),
    decision: String(formData.get("decision")) as RecommendationDecision,
    notes: String(formData.get("notes") ?? ""),
    approver: "se.workspace@nutanix.com",
  });

  revalidatePath("/");
}

export async function integrationStatusAction(formData: FormData) {
  const integrationKey = String(formData.get("integrationKey"));
  const status = String(formData.get("status")) as IntegrationStatus;

  await updateIntegration({ integrationKey, status });

  revalidatePath("/");
}

export async function integrationTestAction(formData: FormData) {
  const integrationKey = String(formData.get("integrationKey")) as keyof typeof integrationAdapters;
  await integrationAdapters[integrationKey].testConnection();
  revalidatePath("/");
}

export async function uploadQbrAction(formData: FormData) {
  await upsertQbrArtifact({
    dealId: String(formData.get("dealId")),
    accountName: String(formData.get("accountName")),
    source: String(formData.get("source")) as "cs360_download" | "manual_upload",
    fileUri: String(formData.get("fileUri")),
    uploadedBy: "se.workspace@nutanix.com",
  });

  revalidatePath("/");
}

export async function addNoteAction(formData: FormData) {
  const dealId = String(formData.get("dealId"));
  const body = String(formData.get("body") ?? "").trim();
  if (!dealId || !body) return;

  const roleInput = String(formData.get("role") ?? "SE");
  const role = (["SE", "AE", "SAM"].includes(roleInput) ? roleInput : "SE") as NoteRole;

  await createNote({
    dealId,
    meetingId: formData.get("meetingId") ? String(formData.get("meetingId")) : undefined,
    role,
    body,
    author: "se.workspace@nutanix.com",
  });

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${dealId}`);
}

export async function updateQbrChecklistAction(formData: FormData) {
  await updateQbrChecklistItem({
    itemId: String(formData.get("itemId")),
    status: String(formData.get("status")) as "TODO" | "IN_PROGRESS" | "DONE",
    notes: String(formData.get("notes")),
  });
  revalidatePath("/");
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
    updatedBy: "se.workspace@nutanix.com",
  });

  revalidatePath("/integrations");
}

export async function clearLlmApiKeyAction() {
  try {
    await clearLlmCredentialApiKey("se.workspace@nutanix.com");
  } catch {
    // Ignore if credentials row has not been created yet.
  }
  revalidatePath("/integrations");
}
