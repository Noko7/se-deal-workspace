import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAccountDetail } from "@/lib/data";
import { parseAttendees } from "@/lib/meeting";

export const dynamic = "force-dynamic";

// Shape a JSON array field (stored as a JSON string) into a real array.
function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const dateOnly = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

// GET/POST both return a live sample Account + Opportunity (with related
// records) shaped to the SFDC schema we document on the Integrations page. This
// lets an SE/AE diff the exact payload shape against their real org before we
// wire a live Salesforce connection. Optionally pass ?dealId= to pick a deal.
export async function handle(dealId: string | null) {
  // Prefer a richly-populated demo account (has contacts) so the sample shows
  // every object; fall back to any deal.
  const target =
    (dealId
      ? await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true } })
      : null) ??
    (await prisma.deal.findFirst({
      where: { contacts: { some: {} } },
      orderBy: { amount: "desc" },
      select: { id: true },
    })) ??
    (await prisma.deal.findFirst({ orderBy: { amount: "desc" }, select: { id: true } }));

  if (!target) {
    return NextResponse.json({ ok: false, error: "No accounts found. Seed the database first." }, { status: 404 });
  }

  const deal = await getAccountDetail(target.id);
  if (!deal) {
    return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
  }

  const portfolioList = parseList(deal.portfolio);
  const payload = {
    Account: {
      Name: deal.accountName,
      Industry: deal.industry,
      NumberOfEmployees: deal.employees,
      Region__c: deal.region,
      Owner: { Name: deal.owner },
      Incumbent_Vendor__c: deal.incumbentVendor,
      Primary_Competitor__c: deal.primaryCompetitor,
      Renewal_Date__c: dateOnly(deal.renewalDate),
    },
    Opportunity: {
      Name: deal.name,
      StageName: deal.stage,
      Amount: deal.amount,
      ACV__c: deal.acvAmount,
      Services_ACV__c: deal.servicesAcv,
      CloseDate: dateOnly(deal.closeDate),
      ForecastCategoryName: deal.forecastCategory,
      Owner: { Name: deal.owner },
      NextStep: deal.nextAction,
      Steps_To_Close__c: deal.nextStepsToClose,
      Technical_Close_Status__c: deal.technicalCloseStatus,
      Technical_Close_Date__c: dateOnly(deal.technicalCloseDate),
      Technical_Decision_Maker__c: deal.technicalDecisionMaker,
      Portfolio__c: portfolioList.length ? portfolioList : deal.portfolio ? [deal.portfolio] : [],
      Current_Hypervisor__c: deal.hypervisor,
      Partners__c: deal.partners,
      Products__c: parseList(deal.products),
      Tags__c: parseList(deal.tags),
      Use_Case__c: deal.useCase,
      Current_Environment__c: deal.currentEnvironment,
      Intend_To_Use_For_NC2__c: deal.intendToUseForNc2,
      BOM_Attached__c: deal.bomAttached,
      XRay_Used__c: deal.xrayUsed,
      Why_Now__c: deal.whyNow,
      Why_Nutanix__c: deal.whyNutanix,
      Outcome__c: deal.outcome,
      Channel_Notes__c: deal.channelNotes,
      Latest_Signal__c: deal.latestSignal,
    },
    Contacts: deal.contacts.map((c) => ({
      Name: c.name,
      Title: c.title,
      Email: c.email,
      Phone: c.phone,
      Role: c.role,
      Disposition__c: c.disposition,
      Description: c.notes,
    })),
    Activities: [
      ...deal.meetings.slice(0, 10).map((m) => ({
        _type: "Event",
        Subject: m.subject,
        StartDateTime: iso(m.startTime),
        Attendees: parseAttendees(m.attendeesJson).map((a) => a.name),
      })),
      ...deal.salesforceTasks.slice(0, 10).map((t) => ({
        _type: "Task",
        Subject: t.taskName,
        Status: t.status,
        Priority: t.priority,
        ActivityDate: dateOnly(t.dueDate),
      })),
    ],
    Notes: deal.notes.slice(0, 15).map((n) => ({
      Author_Role__c: n.role,
      CreatedBy: { Name: n.author },
      Content: n.body,
      CreatedDate: iso(n.createdAt),
    })),
    ZoomTranscripts: deal.transcripts.slice(0, 8).map((t) => ({
      Event__c: t.meeting?.subject ?? null,
      Summary__c: t.summary,
      Notes__c: t.notes,
      Transcript__c: t.transcript ? `${t.transcript.slice(0, 400)}${t.transcript.length > 400 ? "…" : ""}` : null,
    })),
  };

  return NextResponse.json({
    ok: true,
    sampledFrom: { dealId: deal.id, account: deal.accountName, opportunity: deal.name },
    counts: {
      contacts: deal.contacts.length,
      activities: deal.meetings.length + deal.salesforceTasks.length,
      notes: deal.notes.length,
      transcripts: deal.transcripts.length,
    },
    record: payload,
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  return handle(url.searchParams.get("dealId"));
}

export async function POST(request: Request) {
  let dealId: string | null = null;
  try {
    const body = (await request.json()) as { dealId?: unknown };
    if (typeof body?.dealId === "string") dealId = body.dealId;
  } catch {
    // no body is fine
  }
  return handle(dealId);
}
