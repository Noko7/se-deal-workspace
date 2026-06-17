import { prisma } from "./prisma";
import { parseAttendees } from "./meeting";
import { quarterOf, stageProbability } from "./opportunity";
import { ZOOM_AUTHOR } from "./zoom";

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
}

export type OppTranscript = {
  id: string;
  meetingId: string;
  meetingSubject: string;
  date: string;
  summary: string | null;
  notes: string | null;
  hasTranscript: boolean;
};

export type OppNote = {
  id: string;
  role: string;
  author: string;
  body: string;
  createdAt: string;
  meetingSubject: string | null;
  fromZoom: boolean;
};

export type OppMeeting = { id: string; subject: string; start: string; attendees: string[] };
export type OppAsset = { id: string; type: string; title: string; sourceTool: string; createdAt: string };
export type OppTask = {
  id: string;
  taskName: string;
  status: string;
  priority: string;
  type: string | null;
  dueDate: string | null;
  products: string[];
  syncStatus: string;
  syncDetail: string | null;
};

export type OpportunityDetailView = {
  id: string;
  oppId: string;
  opportunityName: string;
  accountName: string;
  dealName: string;
  stage: string;
  owner: string;
  probability: number;
  amount: number;
  acvAmount: number;
  servicesAcv: number;
  closeQuarter: string;
  closeDate: string | null;
  technicalCloseStatus: string;
  technicalCloseDate: string | null;
  technicalDecisionMaker: string | null;
  forecastCategory: string | null;
  portfolio: string | null;
  hypervisor: string | null;
  partners: string | null;
  products: string[];
  tags: string[];
  intendToUseForNc2: boolean;
  bomAttached: boolean;
  xrayUsed: boolean;
  outcome: string | null;
  nextStepsToClose: string | null;
  whyNow: string | null;
  whyNutanix: string | null;
  channelNotes: string | null;
  keyContacts: string | null;
  nextAction: string;
  latestSignal: string | null;
  transcripts: OppTranscript[];
  notes: OppNote[];
  meetings: OppMeeting[];
  assets: OppAsset[];
  tasks: OppTask[];
  contacts: string[];
};

export async function getOpportunityDetail(dealId: string): Promise<OpportunityDetailView | null> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      meetings: {
        orderBy: { startTime: "desc" },
        include: { transcript: true },
      },
      assets: { orderBy: { createdAt: "desc" }, include: { meeting: { select: { subject: true } } } },
      notes: { orderBy: { createdAt: "desc" }, include: { meeting: { select: { subject: true } } } },
      transcripts: { orderBy: { autoIngestedAt: "desc" }, include: { meeting: { select: { subject: true } } } },
      salesforceTasks: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!deal) return null;

  const meetings: OppMeeting[] = deal.meetings.map((meeting) => ({
    id: meeting.id,
    subject: meeting.subject,
    start: meeting.startTime.toISOString(),
    attendees: parseAttendees(meeting.attendeesJson).map((attendee) => attendee.name),
  }));

  // Unique contact names: explicit key contacts first, then meeting attendees.
  const contactSet = new Set<string>();
  for (const line of (deal.keyContacts ?? "").split(/\n+/)) {
    const trimmed = line.trim();
    if (trimmed) contactSet.add(trimmed);
  }
  for (const meeting of meetings) {
    for (const name of meeting.attendees) contactSet.add(name);
  }

  return {
    id: deal.id,
    oppId: `SF-${deal.id.slice(0, 8).toUpperCase()}`,
    opportunityName: `${deal.accountName} - ${deal.name}`,
    accountName: deal.accountName,
    dealName: deal.name,
    stage: deal.stage,
    owner: deal.owner,
    probability: stageProbability(deal.stage),
    amount: deal.amount,
    acvAmount: deal.acvAmount,
    servicesAcv: deal.servicesAcv,
    closeQuarter: quarterOf(deal.closeDate),
    closeDate: deal.closeDate ? deal.closeDate.toISOString() : null,
    technicalCloseStatus: deal.technicalCloseStatus,
    technicalCloseDate: deal.technicalCloseDate ? deal.technicalCloseDate.toISOString() : null,
    technicalDecisionMaker: deal.technicalDecisionMaker,
    forecastCategory: deal.forecastCategory,
    portfolio: deal.portfolio,
    hypervisor: deal.hypervisor,
    partners: deal.partners,
    products: parseStringArray(deal.products),
    tags: parseStringArray(deal.tags),
    intendToUseForNc2: deal.intendToUseForNc2,
    bomAttached: deal.bomAttached,
    xrayUsed: deal.xrayUsed,
    outcome: deal.outcome,
    nextStepsToClose: deal.nextStepsToClose,
    whyNow: deal.whyNow,
    whyNutanix: deal.whyNutanix,
    channelNotes: deal.channelNotes,
    keyContacts: deal.keyContacts,
    nextAction: deal.nextAction,
    latestSignal: deal.latestSignal,
    transcripts: deal.transcripts.map((transcript) => ({
      id: transcript.id,
      meetingId: transcript.meetingId,
      meetingSubject: transcript.meeting?.subject ?? "Meeting",
      date: transcript.autoIngestedAt.toISOString(),
      summary: transcript.summary,
      notes: transcript.notes,
      hasTranscript: Boolean(transcript.transcript),
    })),
    notes: deal.notes.map((note) => ({
      id: note.id,
      role: note.role,
      author: note.author,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      meetingSubject: note.meeting?.subject ?? null,
      fromZoom: note.author === ZOOM_AUTHOR,
    })),
    meetings,
    assets: deal.assets.map((asset) => ({
      id: asset.id,
      type: asset.type,
      title: asset.title,
      sourceTool: asset.sourceTool,
      createdAt: asset.createdAt.toISOString(),
    })),
    tasks: deal.salesforceTasks.map((task) => ({
      id: task.id,
      taskName: task.taskName,
      status: task.status,
      priority: task.priority,
      type: task.type,
      dueDate: task.dueDate ? task.dueDate.toISOString() : null,
      products: parseStringArray(task.products),
      syncStatus: task.syncStatus,
      syncDetail: task.syncDetail,
    })),
    contacts: [...contactSet],
  };
}

export async function updateOpportunity(input: {
  dealId: string;
  acvAmount: number;
  servicesAcv: number;
  forecastCategory: string | null;
  portfolio: string | null;
  hypervisor: string | null;
  partners: string | null;
  products: string[];
  tags: string[];
  intendToUseForNc2: boolean;
  bomAttached: boolean;
  xrayUsed: boolean;
  technicalCloseDate: Date | null;
  technicalDecisionMaker: string | null;
  outcome: string | null;
  nextStepsToClose: string | null;
  whyNow: string | null;
  whyNutanix: string | null;
  channelNotes: string | null;
  keyContacts: string | null;
}) {
  return prisma.deal.update({
    where: { id: input.dealId },
    data: {
      acvAmount: input.acvAmount,
      servicesAcv: input.servicesAcv,
      forecastCategory: input.forecastCategory,
      portfolio: input.portfolio,
      hypervisor: input.hypervisor,
      partners: input.partners,
      products: JSON.stringify(input.products),
      tags: JSON.stringify(input.tags),
      intendToUseForNc2: input.intendToUseForNc2,
      bomAttached: input.bomAttached,
      xrayUsed: input.xrayUsed,
      technicalCloseDate: input.technicalCloseDate,
      technicalDecisionMaker: input.technicalDecisionMaker,
      outcome: input.outcome,
      nextStepsToClose: input.nextStepsToClose,
      whyNow: input.whyNow,
      whyNutanix: input.whyNutanix,
      channelNotes: input.channelNotes,
      keyContacts: input.keyContacts,
    },
  });
}
