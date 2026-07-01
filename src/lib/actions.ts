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
import { invalidateLlmConfigCache } from "./llm";
import { upsertZoomConfig } from "./zoom";
import { createSalesforceTask } from "./salesforce";
import { updateOpportunity } from "./opportunity-detail";
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
  revalidatePath("/calendar");
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

// Ingest a single item into an account's "brain": either a typed note or a
// linked asset (URI). Both can optionally be scoped to a specific meeting.
export async function ingestAccountDataAction(formData: FormData) {
  const dealId = String(formData.get("dealId"));
  if (!dealId) return;
  const meetingId = formData.get("meetingId") ? String(formData.get("meetingId")) : undefined;
  const kind = String(formData.get("kind") ?? "note");

  if (kind === "asset") {
    const type = String(formData.get("type") || "TEXT_BRIEF") as
      | "PRESENTATION"
      | "COLLECTOR"
      | "RV_TOOL"
      | "ZIP_BUNDLE"
      | "WHITEBOARD"
      | "TEXT_BRIEF"
      | "QBR_REPORT";
    const title = String(formData.get("title") ?? "").trim();
    const uri = String(formData.get("uri") ?? "").trim();
    if (!title || !uri) return;
    await createArtifact({
      dealId,
      meetingId,
      type,
      sourceTool: String(formData.get("sourceTool") || "Account-AI"),
      title,
      uri,
      uploadedBy: "se.workspace@nutanix.com",
      previewImageUri: formData.get("previewImageUri")
        ? String(formData.get("previewImageUri"))
        : undefined,
    });
  } else {
    const body = String(formData.get("body") ?? "").trim();
    if (!body) return;
    const roleInput = String(formData.get("role") ?? "SE");
    const role = (["SE", "AE", "SAM"].includes(roleInput) ? roleInput : "SE") as NoteRole;
    await createNote({ dealId, meetingId, role, body, author: "se.workspace@nutanix.com" });
  }

  revalidatePath(`/accounts/${dealId}`);
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
  revalidatePath("/calendar");
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

  invalidateLlmConfigCache();
  revalidatePath("/integrations");
}

export async function updateOpportunityAction(formData: FormData) {
  const dealId = String(formData.get("dealId") ?? "");
  if (!dealId) return;

  const num = (name: string) => {
    const value = Number(String(formData.get(name) ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(value) ? value : 0;
  };
  const text = (name: string, max = 4000) => {
    const value = sanitizeField(formData.get(name), max);
    return value ? value : null;
  };
  const checked = (name: string) => String(formData.get(name) ?? "") === "on";

  const techCloseRaw = String(formData.get("technicalCloseDate") ?? "").trim();
  const technicalCloseDate = techCloseRaw ? new Date(`${techCloseRaw}T00:00:00`) : null;

  const tags = sanitizeField(formData.get("tags"), 500)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  await updateOpportunity({
    dealId,
    acvAmount: num("acvAmount"),
    servicesAcv: num("servicesAcv"),
    forecastCategory: text("forecastCategory", 120),
    portfolio: text("portfolio", 120),
    hypervisor: text("hypervisor", 120),
    partners: text("partners", 200),
    products: formData.getAll("products").map((value) => String(value)),
    tags,
    intendToUseForNc2: checked("intendToUseForNc2"),
    bomAttached: checked("bomAttached"),
    xrayUsed: checked("xrayUsed"),
    technicalCloseDate: technicalCloseDate && !Number.isNaN(technicalCloseDate.getTime()) ? technicalCloseDate : null,
    technicalDecisionMaker: text("technicalDecisionMaker", 200),
    outcome: text("outcome"),
    nextStepsToClose: text("nextStepsToClose"),
    whyNow: text("whyNow"),
    whyNutanix: text("whyNutanix"),
    channelNotes: text("channelNotes"),
    keyContacts: text("keyContacts"),
  });

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
}

export async function logSalesforceTaskAction(formData: FormData) {
  const taskName = sanitizeField(formData.get("taskName"), 200);
  if (!taskName) return;

  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = dueDateRaw ? new Date(`${dueDateRaw}T00:00:00`) : null;
  const durationRaw = String(formData.get("durationHrs") ?? "").trim();
  const durationHrs = durationRaw ? Number(durationRaw) : null;

  await createSalesforceTask({
    dealId: formData.get("dealId") ? String(formData.get("dealId")) : undefined,
    meetingId: formData.get("meetingId") ? String(formData.get("meetingId")) : undefined,
    taskName,
    description: sanitizeField(formData.get("description"), 4000),
    assignee: sanitizeField(formData.get("assignee"), 200),
    relatedAccount: sanitizeField(formData.get("relatedAccount"), 200),
    products: formData.getAll("products").map((value) => String(value)),
    type: sanitizeField(formData.get("type"), 60),
    status: sanitizeField(formData.get("status"), 60) || "Not Started",
    dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
    durationHrs: durationHrs !== null && Number.isFinite(durationHrs) ? durationHrs : null,
    contact: sanitizeField(formData.get("contact"), 200),
    priority: sanitizeField(formData.get("priority"), 30) || "Normal",
    remind: String(formData.get("remind") ?? "") === "on",
    createdBy: "se.workspace@nutanix.com",
  });

  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function saveZoomConfigAction(formData: FormData) {
  const checked = (name: string) => String(formData.get(name) ?? "") === "on";
  const webhookSecretRaw = String(formData.get("webhookSecret") ?? "").trim();

  await upsertZoomConfig({
    enabled: checked("enabled"),
    accountId: sanitizeField(formData.get("accountId"), 120),
    autoAttachNotes: checked("autoAttachNotes"),
    autoAttachSummary: checked("autoAttachSummary"),
    autoAttachTranscript: checked("autoAttachTranscript"),
    feedAccountAi: checked("feedAccountAi"),
    feedNoteFormatter: checked("feedNoteFormatter"),
    webhookSecret: webhookSecretRaw ? webhookSecretRaw : undefined,
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
  invalidateLlmConfigCache();
  revalidatePath("/integrations");
}
