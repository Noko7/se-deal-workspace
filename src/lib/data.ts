import { IntegrationStatus, NoteRole, PreviewStatus, RecommendationDecision } from "@prisma/client";
import { prisma } from "./prisma";
import { decryptSecret, encryptSecret } from "./secret-crypto";

type LlmCredentialDelegate = {
  findUnique: (args: { where: { singleton: string } }) => Promise<{
    baseUrl: string;
    model: string;
    apiKeyCiphertext: string | null;
    timeoutMs: number;
    insecureTls: boolean;
    updatedAt: Date;
    updatedBy: string | null;
  } | null>;
  upsert: (args: {
    where: { singleton: string };
    create: {
      singleton: string;
      baseUrl: string;
      model: string;
      timeoutMs: number;
      insecureTls: boolean;
      apiKeyCiphertext: string | null;
      updatedBy: string | null;
    };
    update: {
      baseUrl: string;
      model: string;
      timeoutMs: number;
      insecureTls: boolean;
      apiKeyCiphertext?: string | null;
      updatedBy: string | null;
    };
  }) => Promise<unknown>;
  update: (args: {
    where: { singleton: string };
    data: { apiKeyCiphertext: string | null; updatedBy: string | null };
  }) => Promise<unknown>;
};

function llmCredentialDelegate(): LlmCredentialDelegate | null {
  const delegate = (prisma as unknown as { llmCredential?: LlmCredentialDelegate }).llmCredential;
  return delegate ?? null;
}

// This tool is scoped to a single logged-in systems engineer: they only see
// their own accounts/opportunities. We map the session to a seed "owner". If
// the signed-in name doesn't match a seeded SE (e.g. a fresh demo account), we
// fall back to a stable primary SE so the workspace is never empty.
const PRIMARY_SE = "Lizi Singletary";

export function resolveSeOwner(owners: string[], sessionName: string | null | undefined): string | null {
  if (sessionName && owners.includes(sessionName)) return sessionName;
  if (owners.includes(PRIMARY_SE)) return PRIMARY_SE;
  return owners[0] ?? null;
}

export async function getDashboardData() {
  const [deals, meetings, integrations, unassignedEmails] = await Promise.all([
    prisma.deal.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        meetings: true,
        emails: true,
        recommendations: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.meeting.findMany({
      orderBy: { startTime: "asc" },
      include: {
        deal: { select: { id: true, name: true, accountName: true, stage: true } },
        assets: { orderBy: { createdAt: "asc" } },
        notes: { orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.integrationConnection.findMany({ orderBy: { displayName: "asc" } }),
    prisma.dealEmail.findMany({
      where: { dealId: null },
      orderBy: { receivedAt: "desc" },
    }),
  ]);

  return {
    deals,
    meetings,
    integrations,
    unassignedEmails,
  };
}

export async function getPipelineDeals() {
  const deals = await prisma.deal.findMany({
    orderBy: { amount: "desc" },
    select: {
      id: true,
      name: true,
      accountName: true,
      stage: true,
      owner: true,
      nextAction: true,
      amount: true,
      technicalCloseStatus: true,
      closeDate: true,
      isClosed: true,
      latestSignal: true,
      _count: { select: { meetings: true, emails: true, recommendations: true } },
    },
  });

  return deals.map(({ _count, ...deal }) => ({
    ...deal,
    closeDate: deal.closeDate ? deal.closeDate.toISOString() : null,
    meetingsCount: _count.meetings,
    emailsCount: _count.emails,
    recommendationsCount: _count.recommendations,
  }));
}

export async function getAccountsOverview() {
  const now = new Date();
  const deals = await prisma.deal.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      meetings: { select: { id: true, startTime: true } },
      assets: { select: { id: true, type: true } },
      notes: { select: { id: true, createdAt: true } },
    },
  });

  return deals.map((deal) => {
    const presentationCount = deal.assets.filter((asset) => asset.type === "PRESENTATION").length;
    const whiteboardCount = deal.assets.filter((asset) => asset.type === "WHITEBOARD").length;
    const upcoming = deal.meetings
      .map((meeting) => meeting.startTime)
      .filter((start) => start >= now)
      .sort((a, b) => a.getTime() - b.getTime());
    const activityCandidates = [
      deal.updatedAt,
      ...deal.notes.map((note) => note.createdAt),
      ...deal.meetings.map((meeting) => meeting.startTime).filter((start) => start < now),
    ];
    const lastActivityAt = activityCandidates.reduce(
      (latest, current) => (current > latest ? current : latest),
      deal.updatedAt,
    );

    return {
      id: deal.id,
      name: deal.name,
      accountName: deal.accountName,
      stage: deal.stage,
      owner: deal.owner,
      nextAction: deal.nextAction,
      latestSignal: deal.latestSignal,
      meetingCount: deal.meetings.length,
      upcomingMeetingCount: upcoming.length,
      noteCount: deal.notes.length,
      assetCount: deal.assets.length,
      presentationCount,
      whiteboardCount,
      nextMeetingAt: upcoming[0]?.toISOString() ?? null,
      lastActivityAt: lastActivityAt.toISOString(),
    };
  });
}

export async function getAccountDetail(dealId: string) {
  return prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      meetings: {
        orderBy: { startTime: "desc" },
        include: {
          assets: { orderBy: { createdAt: "desc" } },
          notes: { orderBy: { createdAt: "desc" } },
        },
      },
      assets: { orderBy: { createdAt: "desc" } },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { meeting: { select: { id: true, subject: true } } },
      },
      emails: { orderBy: { receivedAt: "desc" } },
      context: { orderBy: { updatedAt: "desc" } },
      recommendations: { orderBy: { createdAt: "desc" } },
    },
  });
}

export async function createNote(input: {
  dealId: string;
  meetingId?: string;
  role: NoteRole;
  body: string;
  author: string;
}) {
  return prisma.meetingNote.create({
    data: {
      dealId: input.dealId,
      meetingId: input.meetingId || null,
      role: input.role,
      body: input.body,
      author: input.author,
    },
  });
}

export type MeetingOption = {
  id: string;
  subject: string;
  startTime: string;
  dealId: string;
  accountName: string;
};

export type AccountOption = {
  dealId: string;
  accountName: string;
  dealName: string;
  owner: string;
};

// Flat list of meetings (with their account) for the Note Formatter's
// "attach to a meeting" picker. Most recent first.
export async function getMeetingOptions(): Promise<MeetingOption[]> {
  const meetings = await prisma.meeting.findMany({
    orderBy: { startTime: "desc" },
    select: {
      id: true,
      subject: true,
      startTime: true,
      deal: { select: { id: true, accountName: true } },
    },
  });

  return meetings.map((meeting) => ({
    id: meeting.id,
    subject: meeting.subject,
    startTime: meeting.startTime.toISOString(),
    dealId: meeting.deal.id,
    accountName: meeting.deal.accountName,
  }));
}

export async function getAccountOptions(): Promise<AccountOption[]> {
  const deals = await prisma.deal.findMany({
    orderBy: [{ accountName: "asc" }, { name: "asc" }],
    select: { id: true, accountName: true, name: true, owner: true },
  });
  return deals.map((deal) => ({
    dealId: deal.id,
    accountName: deal.accountName,
    dealName: deal.name,
    owner: deal.owner,
  }));
}

// Attach a (formatted) note to a meeting. The note is automatically associated
// with the meeting's account (deal) too. Returns null if the meeting is gone.
export async function attachNoteToMeeting(input: {
  meetingId: string;
  body: string;
  role: NoteRole;
  author: string;
}) {
  const meeting = await prisma.meeting.findUnique({
    where: { id: input.meetingId },
    select: { dealId: true },
  });
  if (!meeting) {
    return null;
  }
  return prisma.meetingNote.create({
    data: {
      dealId: meeting.dealId,
      meetingId: input.meetingId,
      role: input.role,
      body: input.body,
      author: input.author,
    },
  });
}

export async function attachSizingToAccount(input: {
  dealId: string;
  body: string;
  author: string;
}) {
  const deal = await prisma.deal.findUnique({ where: { id: input.dealId }, select: { id: true } });
  if (!deal) return null;
  return prisma.meetingNote.create({
    data: {
      dealId: input.dealId,
      meetingId: null,
      role: NoteRole.SE,
      author: input.author,
      body: input.body,
    },
  });
}

export async function getDealWorkspace(dealId: string) {
  return prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      meetings: {
        orderBy: { startTime: "asc" },
        include: { assets: true },
      },
      assets: { orderBy: { createdAt: "desc" } },
      emails: { orderBy: { receivedAt: "desc" } },
      requirements: { orderBy: { createdAt: "desc" } },
      recommendations: { orderBy: { createdAt: "desc" } },
      qbrArtifacts: { orderBy: { generatedAt: "desc" } },
      qbrChecklistItems: { orderBy: { lastUpdatedAt: "desc" } },
      context: { orderBy: { updatedAt: "desc" } },
    },
  });
}

export async function createArtifact(input: {
  dealId: string;
  meetingId?: string;
  type:
    | "PRESENTATION"
    | "COLLECTOR"
    | "RV_TOOL"
    | "ZIP_BUNDLE"
    | "WHITEBOARD"
    | "TEXT_BRIEF"
    | "QBR_REPORT";
  sourceTool: string;
  title: string;
  uri: string;
  uploadedBy: string;
  previewImageUri?: string;
}) {
  return prisma.meetingAsset.create({
    data: {
      dealId: input.dealId,
      meetingId: input.meetingId,
      type: input.type,
      source: "manual",
      sourceTool: input.sourceTool,
      title: input.title,
      uri: input.uri,
      uploadedBy: input.uploadedBy,
      previewImageUri: input.previewImageUri,
      previewStatus: input.previewImageUri ? PreviewStatus.READY : PreviewStatus.FAILED,
      previewLastUpdatedAt: new Date(),
    },
  });
}

export async function assignEmailToDeal(input: { emailId: string; dealId: string; assignedBy: string }) {
  const existingEmail = await prisma.dealEmail.findUnique({
    where: { id: input.emailId },
    select: { body: true, subject: true },
  });
  const extractedSignals = extractSignalsFromText(existingEmail?.body ?? "");

  const email = await prisma.dealEmail.update({
    where: { id: input.emailId },
    data: {
      dealId: input.dealId,
      assignedBy: input.assignedBy,
      assignedAt: new Date(),
      summary: "Email assigned to deal memory and parsed for constraints.",
      extractedJson: JSON.stringify(extractedSignals),
    },
  });

  await prisma.deal.update({
    where: { id: input.dealId },
    data: {
      latestSignal: `Email assigned: ${email.subject}`,
    },
  });
}

function extractSignalsFromText(text: string) {
  const signals = [];
  if (/dr|disaster recovery|replication/i.test(text)) signals.push("dr_signal");
  if (/storage|capacity|utilization/i.test(text)) signals.push("capacity_signal");
  if (/restriction|prerequisite|must/i.test(text)) signals.push("constraint_signal");
  return signals;
}

export async function createRequirement(input: { dealId: string; rawText: string }) {
  const { parseRequirementText } = await import("./sizing");
  const parsed = parseRequirementText(input.rawText);

  return prisma.environmentRequirement.create({
    data: {
      dealId: input.dealId,
      rawText: input.rawText,
      extractedConstraints: JSON.stringify(parsed.constraints),
      prerequisites: JSON.stringify(parsed.prerequisites),
      restrictions: JSON.stringify(parsed.restrictions),
      workloadHints: JSON.stringify(parsed.workloadHints),
    },
  });
}

export async function createRecommendation(dealId: string) {
  const { buildSizingRecommendation } = await import("./sizing");

  const requirements = await prisma.environmentRequirement.findMany({
    where: { dealId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const recommendation = buildSizingRecommendation(requirements.map((item) => item.rawText));

  return prisma.sizingRecommendation.create({
    data: {
      dealId,
      inputRequirementIds: JSON.stringify(requirements.map((item) => item.id)),
      suggestedConfig: JSON.stringify(recommendation.suggestedConfig),
      ruleMatches: JSON.stringify(recommendation.ruleMatches),
      riskFlags: JSON.stringify(recommendation.riskFlags),
      confidenceScore: recommendation.confidenceScore,
    },
  });
}

export async function updateRecommendationDecision(input: {
  recommendationId: string;
  decision: RecommendationDecision;
  notes?: string;
  approver: string;
}) {
  return prisma.sizingRecommendation.update({
    where: { id: input.recommendationId },
    data: {
      decision: input.decision,
      decisionNotes: input.notes,
      approvedBy: input.approver,
      approvedAt: new Date(),
    },
  });
}

export async function updateIntegration(input: { integrationKey: string; status: IntegrationStatus }) {
  return prisma.integrationConnection.update({
    where: { integrationKey: input.integrationKey },
    data: {
      status: input.status,
      lastHealthCheckAt: new Date(),
      connectedAt: input.status === IntegrationStatus.CONNECTED ? new Date() : null,
      connectedBy: input.status === IntegrationStatus.CONNECTED ? "se.workspace@nutanix.com" : null,
    },
  });
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

export async function getLlmCredentialSummary(): Promise<LlmCredentialSummary> {
  const delegate = llmCredentialDelegate();
  if (!delegate) {
    return {
      configured: false,
      baseUrl: "",
      model: "",
      timeoutMs: 60000,
      insecureTls: false,
      hasApiKey: false,
      updatedAt: null,
      updatedBy: null,
    };
  }
  const record = await delegate.findUnique({ where: { singleton: "default" } });
  if (!record) {
    return {
      configured: false,
      baseUrl: "",
      model: "",
      timeoutMs: 60000,
      insecureTls: false,
      hasApiKey: false,
      updatedAt: null,
      updatedBy: null,
    };
  }
  return {
    configured: true,
    baseUrl: record.baseUrl,
    model: record.model,
    timeoutMs: record.timeoutMs,
    insecureTls: record.insecureTls,
    hasApiKey: Boolean(record.apiKeyCiphertext),
    updatedAt: record.updatedAt.toISOString(),
    updatedBy: record.updatedBy ?? null,
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
  const delegate = llmCredentialDelegate();
  if (!delegate) return null;
  const record = await delegate.findUnique({ where: { singleton: "default" } });
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
  const delegate = llmCredentialDelegate();
  if (!delegate) {
    throw new Error(
      "LLM credential storage is unavailable because Prisma client is out of date. Run `npm run db:generate` and restart.",
    );
  }
  const apiKeyCiphertext =
    input.apiKey === undefined ? undefined : input.apiKey ? encryptSecret(input.apiKey) : null;
  return delegate.upsert({
    where: { singleton: "default" },
    create: {
      singleton: "default",
      baseUrl: input.baseUrl,
      model: input.model,
      timeoutMs: input.timeoutMs,
      insecureTls: input.insecureTls,
      apiKeyCiphertext: apiKeyCiphertext ?? null,
      updatedBy: input.updatedBy ?? null,
    },
    update: {
      baseUrl: input.baseUrl,
      model: input.model,
      timeoutMs: input.timeoutMs,
      insecureTls: input.insecureTls,
      ...(apiKeyCiphertext !== undefined ? { apiKeyCiphertext } : {}),
      updatedBy: input.updatedBy ?? null,
    },
  });
}

export async function clearLlmCredentialApiKey(updatedBy?: string | null) {
  const delegate = llmCredentialDelegate();
  if (!delegate) {
    throw new Error(
      "LLM credential storage is unavailable because Prisma client is out of date. Run `npm run db:generate` and restart.",
    );
  }
  return delegate.update({
    where: { singleton: "default" },
    data: { apiKeyCiphertext: null, updatedBy: updatedBy ?? null },
  });
}

export async function upsertQbrArtifact(input: {
  dealId: string;
  accountName: string;
  source: "cs360_download" | "manual_upload";
  fileUri: string;
  uploadedBy: string;
}) {
  return prisma.qBRArtifact.create({
    data: {
      dealId: input.dealId,
      accountName: input.accountName,
      source: input.source,
      fileUri: input.fileUri,
      generatedAt: new Date(),
      uploadedBy: input.uploadedBy,
      guideChecklistVersion: "jan_2026_health_check_guide",
    },
  });
}

export async function updateQbrChecklistItem(input: {
  itemId: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  notes: string;
}) {
  return prisma.qBRChecklistItem.update({
    where: { id: input.itemId },
    data: {
      status: input.status,
      notes: input.notes,
      lastUpdatedAt: new Date(),
    },
  });
}
