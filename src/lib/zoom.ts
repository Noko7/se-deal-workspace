import { NoteRole } from "@prisma/client";
import { prisma } from "./prisma";
import { createArtifact, createNote } from "./data";
import { decryptSecret, encryptSecret } from "./secret-crypto";

// Author stamped on notes/assets the Zoom connector creates automatically, so
// they are visibly machine-ingested in the meeting drawer and Account-AI.
export const ZOOM_AUTHOR = "Zoom (auto-sync)";

export type ZoomConfigSummary = {
  configured: boolean;
  enabled: boolean;
  accountId: string;
  autoAttachNotes: boolean;
  autoAttachSummary: boolean;
  autoAttachTranscript: boolean;
  feedAccountAi: boolean;
  feedNoteFormatter: boolean;
  hasWebhookSecret: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

const DEFAULT_SUMMARY: ZoomConfigSummary = {
  configured: false,
  enabled: false,
  accountId: "",
  autoAttachNotes: true,
  autoAttachSummary: true,
  autoAttachTranscript: true,
  feedAccountAi: true,
  feedNoteFormatter: true,
  hasWebhookSecret: false,
  updatedAt: null,
  updatedBy: null,
};

export async function getZoomConfigSummary(): Promise<ZoomConfigSummary> {
  const record = await prisma.zoomConfig.findUnique({ where: { singleton: "default" } });
  if (!record) return DEFAULT_SUMMARY;
  return {
    configured: true,
    enabled: record.enabled,
    accountId: record.accountId ?? "",
    autoAttachNotes: record.autoAttachNotes,
    autoAttachSummary: record.autoAttachSummary,
    autoAttachTranscript: record.autoAttachTranscript,
    feedAccountAi: record.feedAccountAi,
    feedNoteFormatter: record.feedNoteFormatter,
    hasWebhookSecret: Boolean(record.webhookSecretCiphertext),
    updatedAt: record.updatedAt.toISOString(),
    updatedBy: record.updatedBy ?? null,
  };
}

export async function upsertZoomConfig(input: {
  enabled: boolean;
  accountId?: string | null;
  autoAttachNotes: boolean;
  autoAttachSummary: boolean;
  autoAttachTranscript: boolean;
  feedAccountAi: boolean;
  feedNoteFormatter: boolean;
  webhookSecret?: string | null;
  updatedBy?: string | null;
}) {
  const webhookSecretCiphertext =
    input.webhookSecret === undefined
      ? undefined
      : input.webhookSecret
        ? encryptSecret(input.webhookSecret)
        : null;
  const base = {
    enabled: input.enabled,
    accountId: input.accountId?.trim() || null,
    autoAttachNotes: input.autoAttachNotes,
    autoAttachSummary: input.autoAttachSummary,
    autoAttachTranscript: input.autoAttachTranscript,
    feedAccountAi: input.feedAccountAi,
    feedNoteFormatter: input.feedNoteFormatter,
    updatedBy: input.updatedBy ?? null,
  };
  return prisma.zoomConfig.upsert({
    where: { singleton: "default" },
    create: { singleton: "default", ...base, webhookSecretCiphertext: webhookSecretCiphertext ?? null },
    update: {
      ...base,
      ...(webhookSecretCiphertext !== undefined ? { webhookSecretCiphertext } : {}),
    },
  });
}

export async function getZoomWebhookSecret(): Promise<string | null> {
  const record = await prisma.zoomConfig.findUnique({ where: { singleton: "default" } });
  if (!record?.webhookSecretCiphertext) return null;
  return decryptSecret(record.webhookSecretCiphertext);
}

export type ZoomStatus = { configured: boolean; enabled: boolean; detail: string };

export async function getZoomStatus(): Promise<ZoomStatus> {
  const summary = await getZoomConfigSummary();
  if (!summary.configured) {
    return { configured: false, enabled: false, detail: "Zoom connector is not configured yet." };
  }
  if (!summary.enabled) {
    return { configured: true, enabled: false, detail: "Zoom connector is configured but turned off." };
  }
  const destinations = [
    summary.feedAccountAi ? "Account-AI" : null,
    summary.feedNoteFormatter ? "Note Formatter" : null,
  ].filter(Boolean);
  return {
    configured: true,
    enabled: true,
    detail: `Zoom auto-sync is on. Attaching to meetings and feeding ${destinations.join(" + ") || "no destinations"}.`,
  };
}

export type ZoomIngestInput = {
  meetingId: string;
  summary?: string | null;
  transcript?: string | null;
  notes?: string | null;
};

export type ZoomIngestResult = {
  ok: boolean;
  message: string;
  attached?: { transcript: boolean; summaryNote: boolean; notesNote: boolean; transcriptAsset: boolean };
};

/**
 * Production ingestion seam. A Zoom webhook (recording/summary completed) calls
 * this with the meeting's summary, transcript, and notes. The data is stored on
 * MeetingTranscript and, per the configured toggles, attached to the meeting as
 * notes/assets so Account-AI and the Note Formatter pick it up automatically.
 */
export async function ingestZoomMeeting(input: ZoomIngestInput): Promise<ZoomIngestResult> {
  const config = await prisma.zoomConfig.findUnique({ where: { singleton: "default" } });
  if (!config || !config.enabled) {
    return { ok: false, message: "Zoom connector is not enabled." };
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id: input.meetingId },
    select: { id: true, dealId: true, subject: true },
  });
  if (!meeting) {
    return { ok: false, message: `No meeting found for id ${input.meetingId}.` };
  }

  const summary = input.summary?.trim() || null;
  const transcript = input.transcript?.trim() || null;
  const notes = input.notes?.trim() || null;

  // Single source of truth for the raw Zoom artifacts.
  await prisma.meetingTranscript.upsert({
    where: { meetingId: meeting.id },
    create: { meetingId: meeting.id, dealId: meeting.dealId, source: "zoom", summary, transcript, notes },
    update: { source: "zoom", summary, transcript, notes, autoIngestedAt: new Date() },
  });

  const attached = { transcript: true, summaryNote: false, notesNote: false, transcriptAsset: false };

  // Feed Account-AI by attaching readable notes/assets to the meeting+deal. The
  // knowledge base is assembled from a deal's notes and assets, so this makes the
  // Zoom content visible to the assistant with no extra wiring.
  if (config.feedAccountAi) {
    if (config.autoAttachSummary && summary) {
      await createNote({
        dealId: meeting.dealId,
        meetingId: meeting.id,
        role: NoteRole.SE,
        author: ZOOM_AUTHOR,
        body: `Zoom AI summary:\n${summary}`,
      });
      attached.summaryNote = true;
    }
    if (config.autoAttachNotes && notes) {
      await createNote({
        dealId: meeting.dealId,
        meetingId: meeting.id,
        role: NoteRole.SE,
        author: ZOOM_AUTHOR,
        body: `Zoom meeting notes:\n${notes}`,
      });
      attached.notesNote = true;
    }
    if (config.autoAttachTranscript && transcript) {
      await createArtifact({
        dealId: meeting.dealId,
        meetingId: meeting.id,
        type: "TEXT_BRIEF",
        sourceTool: "Zoom",
        title: `Zoom transcript — ${meeting.subject}`,
        uri: `zoom://transcript/${meeting.id}`,
        uploadedBy: ZOOM_AUTHOR,
      });
      attached.transcriptAsset = true;
    }
  }

  return { ok: true, message: "Zoom meeting ingested.", attached };
}
