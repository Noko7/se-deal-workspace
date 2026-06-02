import { IntegrationStatus, PreviewStatus, RecommendationDecision } from "@prisma/client";
import { prisma } from "./prisma";

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
        deal: true,
        assets: true,
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

function buildAccountSummary(deal: {
  accountName: string;
  name: string;
  stage: string;
  owner: string;
  nextAction: string;
  latestSignal: string | null;
  meetings: { id: string }[];
  notes: { body: string }[];
  assets: { type: string }[];
}): string {
  const meetingCount = deal.meetings.length;
  const noteCount = deal.notes.length;
  const presentations = deal.assets.filter((asset) => asset.type === "PRESENTATION").length;
  const whiteboards = deal.assets.filter((asset) => asset.type === "WHITEBOARD").length;
  const latestNote = deal.notes[0];

  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const parts = [
    `${deal.accountName} is in the ${deal.stage} stage on "${deal.name}", owned by ${deal.owner}.`,
    `${plural(meetingCount, "meeting")} tracked with ${plural(noteCount, "note")} captured, plus ${plural(
      presentations,
      "presentation",
    )} and ${plural(whiteboards, "whiteboard")} on file.`,
  ];
  if (deal.latestSignal) parts.push(`Latest signal: ${deal.latestSignal}`);
  if (latestNote) {
    const snippet = latestNote.body.length > 160 ? `${latestNote.body.slice(0, 160).trimEnd()}…` : latestNote.body;
    parts.push(`Most recent note: "${snippet}"`);
  }
  parts.push(`Next action: ${deal.nextAction}.`);
  return parts.join(" ");
}

export async function getAccountDetail(dealId: string) {
  const deal = await prisma.deal.findUnique({
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

  if (!deal) return null;

  return { deal, summary: buildAccountSummary(deal) };
}

export async function createNote(input: {
  dealId: string;
  meetingId?: string;
  body: string;
  author: string;
}) {
  return prisma.meetingNote.create({
    data: {
      dealId: input.dealId,
      meetingId: input.meetingId || null,
      body: input.body,
      author: input.author,
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
