import { PrismaClient, IntegrationStatus, AssetType, PreviewStatus, QBRItemStatus, Prisma, ContactDisposition } from "@prisma/client";
import { addDays } from "date-fns";

const prisma = new PrismaClient();

// Outlook stores the online-meeting join link on the event; we vary the platform
// (Zoom / Teams / Google Meet) so the calendar shows the right icon per call.
const MEETING_PLATFORMS = ["zoom", "teams", "meet"] as const;
function joinUrlFor(index: number): string {
  const platform = MEETING_PLATFORMS[index % MEETING_PLATFORMS.length];
  if (platform === "zoom") return `https://nutanix.zoom.us/j/${85000000000 + index}`;
  if (platform === "teams")
    return `https://teams.microsoft.com/l/meetup-join/19:meeting_${index}abcd@thread.v2/0`;
  return `https://meet.google.com/${["abc", "def", "ghi", "jkl"][index % 4]}-${1000 + index}-xyz`;
}

// Email-only external contacts (no display name on the invite) so the app
// predicts a name from `firstname.lastname@company` and flags it "(maybe)".
const EXTERNAL_CONTACTS = [
  "maria.gonzalez",
  "david.chen",
  "priya.patel",
  "james.okafor",
  "sara.muller",
  "liam.murphy",
  "nina.rossi",
  "omar.haddad",
];
function externalContactEmail(index: number, domain: string): string {
  return `${EXTERNAL_CONTACTS[index % EXTERNAL_CONTACTS.length]}@${domain}`;
}

// Preview thumbnails for non-slide artifacts so nothing shows up as "failed".
const FILE_PREVIEWS: Partial<Record<AssetType, string>> = {
  COLLECTOR: "/previews/collector-export.svg",
  RV_TOOL: "/previews/rv-tools.svg",
  ZIP_BUNDLE: "/previews/zip-bundle.svg",
  TEXT_BRIEF: "/previews/text-brief.svg",
  QBR_REPORT: "/previews/report-qbr.svg",
};

async function main() {
  await prisma.meetingNote.deleteMany();
  await prisma.contextEvidence.deleteMany();
  await prisma.sizingRecommendation.deleteMany();
  await prisma.environmentRequirement.deleteMany();
  await prisma.customerContext.deleteMany();
  await prisma.qBRChecklistItem.deleteMany();
  await prisma.qBRArtifact.deleteMany();
  await prisma.dealEmail.deleteMany();
  await prisma.salesforceTask.deleteMany();
  await prisma.meetingTranscript.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.meetingAsset.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.integrationConnection.deleteMany();
  await prisma.deal.deleteMany();

  const now = new Date();

  // Author the showcase meetings in a real time zone (US Eastern) so the stored
  // instants are genuine 9-to-5 business hours. A viewer in Eastern sees 9-5 out
  // of the box; viewers elsewhere can re-base via the calendar's time-zone picker.
  const DEMO_TZ = "America/New_York";
  const DAY_MS = 86_400_000;

  // Offset (minutes) of DEMO_TZ from UTC at a given instant (DST-aware).
  const tzOffset = (instant: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: DEMO_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(instant);
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
    let hour = g("hour");
    if (hour === 24) hour = 0;
    const asUTC = Date.UTC(g("year"), g("month") - 1, g("day"), hour, g("minute"), g("second"));
    return Math.round((asUTC - instant.getTime()) / 60000);
  };

  // The real instant for a DEMO_TZ wall-clock (y, 0-based month, d, h, mi).
  const zoneWallClock = (y: number, mo: number, d: number, h: number, mi: number) => {
    const guess = Date.UTC(y, mo, d, h, mi);
    const off1 = tzOffset(new Date(guess));
    let instant = guess - off1 * 60000;
    const off2 = tzOffset(new Date(instant));
    if (off2 !== off1) instant = guess - off2 * 60000; // refine across a DST edge
    return new Date(instant);
  };

  // UTC-midnight marker for DEMO_TZ's calendar date of `instant` (safe day math).
  const zoneDateOnly = (instant: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: DEMO_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(instant);
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
    return Date.UTC(g("year"), g("month") - 1, g("day"));
  };

  const todayMarker = zoneDateOnly(now);
  // Sunday that starts DEMO_TZ's current week.
  const weekStartMarker = todayMarker - new Date(todayMarker).getUTCDay() * DAY_MS;

  // dayIndex: 0=Sun ... 6=Sat. Returns the instant for that day/time this week.
  const at = (dayIndex: number, hour: number, minute = 0) => {
    const d = new Date(weekStartMarker + dayIndex * DAY_MS);
    return zoneWallClock(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute);
  };
  // Place a meeting `offsetDays` from today at a real business hour, nudging
  // weekends onto the following Monday.
  const weekdayAt = (offsetDays: number, hour: number, minute = 0) => {
    let d = new Date(todayMarker + offsetDays * DAY_MS);
    const dow = d.getUTCDay();
    if (dow === 0) d = new Date(d.getTime() + DAY_MS);
    else if (dow === 6) d = new Date(d.getTime() + 2 * DAY_MS);
    return zoneWallClock(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute);
  };
  const DURATIONS = [30, 45, 60, 90];
  // End time for a meeting that starts at `start`, clamped so it never runs past
  // 5 PM DEMO_TZ time (and is at least 30 min).
  const endBy5 = (start: Date, desiredMinutes: number) => {
    const wall = new Date(start.getTime() + tzOffset(start) * 60000); // shift so getUTC* = wall clock
    const startMin = wall.getUTCHours() * 60 + wall.getUTCMinutes();
    const minutes = Math.max(30, Math.min(desiredMinutes, 17 * 60 - startMin));
    return new Date(start.getTime() + minutes * 60000);
  };

  const alphaDeal = await prisma.deal.create({
    data: {
      name: "Acme Capacity Refresh",
      accountName: "Acme Manufacturing",
      stage: "Discovery",
      owner: "Lizi Singletary",
      nextAction: "Finalize discovery summary before QBR",
      latestSignal: "Storage utilization sustained above 80%.",
      amount: 420000,
      acvAmount: 140000,
      servicesAcv: 28000,
      technicalCloseStatus: "25",
      closeDate: addDays(now, 18),
      forecastCategory: "Best Case",
      industry: "Manufacturing",
      employees: 4200,
      region: "AMER - Central",
      incumbentVendor: "VMware (Broadcom)",
      primaryCompetitor: "Dell VxRail",
      renewalDate: addDays(now, 150),
      hypervisor: "VMware ESXi",
      portfolio: JSON.stringify(["NCI", "NCM"]),
      products: JSON.stringify(["NCI Pro", "NCM Starter"]),
      tags: JSON.stringify(["consolidation", "DR", "renewal"]),
      partners: "CDW",
      useCase: "Consolidate three aging vSphere clusters and add async DR before the datacenter runs out of space.",
      currentEnvironment: "3-node vSphere 7 cluster, ~180 cores, all-flash, storage sustained above 80 percent. No new rack space this quarter.",
      whyNow: "Storage is nearly full and the VMware support contract renews in about five months.",
      whyNutanix: "Denser nodes reclaim rack space and a single platform simplifies operations versus a like-for-like VMware refresh.",
      technicalDecisionMaker: "Dana Whitfield",
      nextStepsToClose: "1) Complete discovery summary 2) Present sizing at QBR 3) Align on early renewal bundle",
    },
  });

  const bravoDeal = await prisma.deal.create({
    data: {
      name: "Beta Financial DR Modernization",
      accountName: "Beta Financial",
      stage: "Design",
      owner: "Jordan Kim",
      nextAction: "Validate replication target options",
      latestSignal: "Customer evaluating async DR expansion.",
      amount: 1150000,
      acvAmount: 383000,
      servicesAcv: 90000,
      technicalCloseStatus: "50",
      closeDate: addDays(now, 9),
      forecastCategory: "Commit",
      industry: "Financial Services",
      employees: 9800,
      region: "AMER - East",
      incumbentVendor: "VMware (Broadcom)",
      primaryCompetitor: "VMware VCF",
      renewalDate: addDays(now, 60),
      hypervisor: "VMware ESXi",
      portfolio: JSON.stringify(["NCI", "NCM", "NUS (Files/Objects/Volumes)"]),
      products: JSON.stringify(["NCI Ultimate", "NCM Pro"]),
      tags: JSON.stringify(["DR", "replication", "core-banking"]),
      partners: "WWT",
      useCase: "Modernize disaster recovery for the core banking tier with sub-15-minute RPO across two sites.",
      currentEnvironment: "Dual-site vSphere estate, ~640 cores, array-based replication nearing end of support. RPO currently around 30 minutes.",
      whyNow: "DR modernization budget is approved for this fiscal year and the decision committee meets in two weeks.",
      whyNutanix: "Native async DR and a single management plane reduce RPO and remove a separate replication appliance.",
      technicalDecisionMaker: "Robert Langley",
      nextStepsToClose: "1) Validate replication targets 2) Confirm WAN bandwidth 3) Present to decision committee",
    },
  });

  const gammaDeal = await prisma.deal.create({
    data: {
      name: "Gamma Healthcare VDI Expansion",
      accountName: "Gamma Healthcare",
      stage: "Validation",
      owner: "Priya Nadar",
      nextAction: "Confirm POC success criteria sign-off",
      latestSignal: "POC cluster validated; awaiting security review.",
      amount: 780000,
      acvAmount: 260000,
      servicesAcv: 55000,
      technicalCloseStatus: "99",
      closeDate: addDays(now, 5),
      forecastCategory: "Commit",
      industry: "Healthcare",
      employees: 6100,
      region: "AMER - West",
      incumbentVendor: "Citrix on VMware",
      primaryCompetitor: "Nutanix vs. keep Citrix/VMware",
      renewalDate: addDays(now, 90),
      hypervisor: "VMware ESXi",
      portfolio: JSON.stringify(["NCI", "EUC"]),
      products: JSON.stringify(["NCI Pro", "EUC Pro"]),
      tags: JSON.stringify(["VDI", "security", "expansion"]),
      partners: "Presidio",
      useCase: "Expand clinical VDI to 2,000 seats with validated density and pass security segmentation review.",
      currentEnvironment: "POC cluster validated for VDI density with headroom. Production is Citrix on vSphere, ~2,000 desktops planned.",
      whyNow: "Current term ends soon and validation success unlocks a multi-year expansion.",
      whyNutanix: "Validated VDI density with headroom and simpler operations than the incumbent Citrix-on-VMware stack.",
      technicalDecisionMaker: "Carlos Mendoza",
      nextStepsToClose: "1) Security sign-off on segmentation 2) Confirm POC success criteria 3) Finalize expansion order",
      intendToUseForNc2: false,
      bomAttached: true,
      xrayUsed: true,
    },
  });

  // Mon 9:00 - virtual (Zoom). Includes an email-only attendee -> "(maybe)" name.
  const acmeMeeting = await prisma.meeting.create({
    data: {
      source: "internal_seed",
      subject: "QBR Prep - Acme Manufacturing",
      organizer: "lizi.singletary@nutanix.com",
      startTime: at(1, 9, 0),
      endTime: at(1, 10, 0),
      attendeesJson: JSON.stringify([
        { email: "it.ops@acme.example", displayName: "Acme IT Ops" },
        { email: "sam@nutanix.com", displayName: "Sam (AM)" },
        { email: "morgan.reyes@acme.example" },
      ]),
      externalDomains: "acme.example",
      joinUrl: "https://nutanix.zoom.us/j/85012345678",
      dealId: alphaDeal.id,
    },
  });

  // Mon 13:00 - in person (no join URL, has a street address).
  const acmeKickoffMeeting = await prisma.meeting.create({
    data: {
      source: "internal_seed",
      subject: "Discovery Kickoff - Acme Manufacturing",
      organizer: "lizi.singletary@nutanix.com",
      startTime: at(1, 13, 0),
      endTime: at(1, 14, 30),
      attendeesJson: JSON.stringify([
        { email: "it.ops@acme.example", displayName: "Acme IT Ops" },
        { email: "cio@acme.example", displayName: "Acme CIO" },
        { email: "dana.whitfield@acme.example" },
      ]),
      externalDomains: "acme.example",
      joinUrl: null,
      location: "Acme HQ - 500 Industrial Pkwy, Columbus, OH 43215",
      dealId: alphaDeal.id,
    },
  });

  // Tue 11:00 - virtual (Google Meet).
  const betaMeeting = await prisma.meeting.create({
    data: {
      source: "internal_seed",
      subject: "Design Review - Beta Financial",
      organizer: "jordan.kim@nutanix.com",
      startTime: at(2, 11, 0),
      endTime: at(2, 12, 0),
      attendeesJson: JSON.stringify([
        { email: "architecture@betafin.example", displayName: "Beta Architecture" },
        { email: "robert.langley@betafin.example" },
      ]),
      externalDomains: "betafin.example",
      joinUrl: "https://meet.google.com/abc-2048-xyz",
      dealId: bravoDeal.id,
    },
  });

  // Tue 11:30 - overlaps the Design Review (demonstrates side-by-side lanes) and
  // is a *private* meeting with no attendee list.
  await prisma.meeting.create({
    data: {
      source: "internal_seed",
      subject: "Pricing Sync - Beta Financial",
      organizer: "marcus.lee@nutanix.com",
      startTime: at(2, 11, 30),
      endTime: at(2, 12, 15),
      attendeesJson: JSON.stringify([]),
      externalDomains: "betafin.example",
      joinUrl: "https://teams.microsoft.com/l/meetup-join/19:meeting_betapricing@thread.v2/0",
      dealId: bravoDeal.id,
    },
  });

  // Wed 9:30 - in person at the customer data center.
  await prisma.meeting.create({
    data: {
      source: "internal_seed",
      subject: "Security Review - Gamma Healthcare",
      organizer: "priya.nadar@nutanix.com",
      startTime: at(3, 9, 30),
      endTime: at(3, 10, 30),
      attendeesJson: JSON.stringify([
        { email: "security@gammahealth.example", displayName: "Gamma Security" },
        { email: "carlos.mendoza@gammahealth.example" },
      ]),
      externalDomains: "gammahealth.example",
      joinUrl: null,
      location: "Gamma Healthcare Data Center - 1200 Mercy Dr, Austin, TX 78758",
      dealId: gammaDeal.id,
    },
  });

  // Wed 15:00 - virtual (Zoom).
  const gammaPocMeeting = await prisma.meeting.create({
    data: {
      source: "internal_seed",
      subject: "POC Readout - Gamma Healthcare",
      organizer: "priya.nadar@nutanix.com",
      startTime: at(3, 15, 0),
      endTime: at(3, 16, 0),
      attendeesJson: JSON.stringify([
        { email: "infra@gammahealth.example", displayName: "Gamma Infrastructure" },
        { email: "security@gammahealth.example", displayName: "Gamma Security" },
        { email: "elena.popova@gammahealth.example" },
      ]),
      externalDomains: "gammahealth.example",
      joinUrl: "https://nutanix.zoom.us/j/85087654321",
      dealId: gammaDeal.id,
    },
  });

  // Thu 10:00 - virtual (Teams).
  await prisma.meeting.create({
    data: {
      source: "internal_seed",
      subject: "Validation Sign-off - Gamma Healthcare",
      organizer: "priya.nadar@nutanix.com",
      startTime: at(4, 10, 0),
      endTime: at(4, 11, 0),
      attendeesJson: JSON.stringify([
        { email: "infra@gammahealth.example", displayName: "Gamma Infrastructure" },
        { email: "carlos.mendoza@gammahealth.example" },
      ]),
      externalDomains: "gammahealth.example",
      joinUrl: "https://teams.microsoft.com/l/meetup-join/19:meeting_gammasignoff@thread.v2/0",
      dealId: gammaDeal.id,
    },
  });

  // Fri 13:00 - short 30-minute virtual stand-up (compact event block).
  await prisma.meeting.create({
    data: {
      source: "internal_seed",
      subject: "Weekly Account Stand-up - Acme",
      organizer: "lizi.singletary@nutanix.com",
      startTime: at(5, 13, 0),
      endTime: at(5, 13, 30),
      attendeesJson: JSON.stringify([
        { email: "sam@nutanix.com", displayName: "Sam (AM)" },
        { email: "priya.patel@acme.example" },
      ]),
      externalDomains: "acme.example",
      joinUrl: "https://nutanix.zoom.us/j/85011223344",
      dealId: alphaDeal.id,
    },
  });

  // Deterministic afternoon anchors (2-5 PM, Mon-Fri) so the current week is
  // always full through the end of the workday, independent of the loop spread.
  const afternoonAnchors: {
    day: number;
    h: number;
    m: number;
    endH: number;
    endM: number;
    subject: string;
    deal: { id: string; accountName: string };
    organizer: string;
    domain: string;
    joinUrl: string | null;
    location?: string;
    attendees: { email: string; displayName?: string }[];
  }[] = [
    {
      day: 1, h: 15, m: 30, endH: 16, endM: 30,
      subject: "Architecture Workshop - Beta Financial",
      deal: bravoDeal, organizer: "jordan.kim@nutanix.com", domain: "betafin.example",
      joinUrl: "https://teams.microsoft.com/l/meetup-join/19:meeting_betaarch@thread.v2/0",
      attendees: [{ email: "architecture@betafin.example", displayName: "Beta Architecture" }, { email: "robert.langley@betafin.example" }],
    },
    {
      day: 2, h: 14, m: 0, endH: 15, endM: 0,
      subject: "Capacity Review - Acme Manufacturing",
      deal: alphaDeal, organizer: "lizi.singletary@nutanix.com", domain: "acme.example",
      joinUrl: "https://nutanix.zoom.us/j/85044556677",
      attendees: [{ email: "it.ops@acme.example", displayName: "Acme IT Ops" }, { email: "morgan.reyes@acme.example" }],
    },
    {
      day: 2, h: 16, m: 0, endH: 16, endM: 45,
      subject: "Stakeholder Update - Beta Financial",
      deal: bravoDeal, organizer: "marcus.lee@nutanix.com", domain: "betafin.example",
      joinUrl: "https://meet.google.com/xyz-7788-abc",
      attendees: [{ email: "exec.sponsor@betafin.example", displayName: "Beta Exec Sponsor" }, { email: "diana.flores@betafin.example" }],
    },
    {
      day: 3, h: 13, m: 30, endH: 15, endM: 0,
      subject: "Sizing Walkthrough - Gamma Healthcare",
      deal: gammaDeal, organizer: "priya.nadar@nutanix.com", domain: "gammahealth.example",
      joinUrl: "https://nutanix.zoom.us/j/85099887766",
      attendees: [{ email: "infra@gammahealth.example", displayName: "Gamma Infrastructure" }, { email: "elena.popova@gammahealth.example" }],
    },
    {
      day: 3, h: 16, m: 0, endH: 17, endM: 0,
      subject: "Partner Sync - Gamma Healthcare",
      deal: gammaDeal, organizer: "priya.nadar@nutanix.com", domain: "gammahealth.example",
      joinUrl: "https://teams.microsoft.com/l/meetup-join/19:meeting_gammapartner@thread.v2/0",
      attendees: [{ email: "alliances@gammahealth.example", displayName: "Gamma Alliances" }],
    },
    {
      day: 4, h: 13, m: 0, endH: 14, endM: 0,
      subject: "Onsite Briefing - Acme Manufacturing",
      deal: alphaDeal, organizer: "lizi.singletary@nutanix.com", domain: "acme.example",
      joinUrl: null, location: "Acme HQ - 500 Industrial Pkwy, Columbus, OH 43215",
      attendees: [{ email: "cio@acme.example", displayName: "Acme CIO" }, { email: "it.ops@acme.example", displayName: "Acme IT Ops" }],
    },
    {
      day: 4, h: 15, m: 0, endH: 16, endM: 0,
      subject: "Risk Review - Acme Manufacturing",
      deal: alphaDeal, organizer: "lizi.singletary@nutanix.com", domain: "acme.example",
      joinUrl: "https://nutanix.zoom.us/j/85033442211",
      attendees: [{ email: "security@acme.example", displayName: "Acme Security" }, { email: "dana.whitfield@acme.example" }],
    },
    {
      day: 5, h: 15, m: 30, endH: 16, endM: 30,
      subject: "Roadmap Review - Gamma Healthcare",
      deal: gammaDeal, organizer: "priya.nadar@nutanix.com", domain: "gammahealth.example",
      joinUrl: "https://meet.google.com/roa-2244-map",
      attendees: [{ email: "infra@gammahealth.example", displayName: "Gamma Infrastructure" }, { email: "carlos.mendoza@gammahealth.example" }],
    },
  ];
  for (const a of afternoonAnchors) {
    await prisma.meeting.create({
      data: {
        source: "internal_seed",
        subject: a.subject,
        organizer: a.organizer,
        startTime: at(a.day, a.h, a.m),
        endTime: at(a.day, a.endH, a.endM),
        attendeesJson: JSON.stringify(a.attendees),
        externalDomains: a.domain,
        joinUrl: a.joinUrl,
        location: a.location ?? null,
        dealId: a.deal.id,
      },
    });
  }

  await prisma.integrationConnection.createMany({
    data: [
      {
        integrationKey: "outlook",
        displayName: "Outlook",
        status: IntegrationStatus.NOT_CONNECTED,
        setupNotes: "Connect Microsoft Graph in Wave 2.",
      },
      {
        integrationKey: "salesforce",
        displayName: "Salesforce",
        status: IntegrationStatus.NEEDS_ATTENTION,
        setupNotes:
          "Review the Salesforce Account Schema card below to confirm our field mapping matches your SFDC org, then wire live credentials. Pipeline and opportunity sync feeds Account-AI.",
      },
      {
        integrationKey: "lucidchart",
        displayName: "Lucidchart",
        status: IntegrationStatus.NOT_CONNECTED,
        setupNotes: "Whiteboard preview metadata available after connector setup.",
      },
      {
        integrationKey: "google_drive",
        displayName: "Google Drive",
        status: IntegrationStatus.NOT_CONNECTED,
        setupNotes: "Optional source for presentations.",
      },
      {
        integrationKey: "cs360_qbr",
        displayName: "CS360 QBR Report",
        status: IntegrationStatus.NEEDS_ATTENTION,
        setupNotes: "Use manual upload fallback until auth automation is available.",
      },
      {
        integrationKey: "zoom",
        displayName: "Zoom",
        status: IntegrationStatus.NOT_CONNECTED,
        setupNotes:
          "Configure in the Zoom section below: enable auto-sync, set the webhook secret, and point Zoom's recording/summary webhook at /api/integrations/zoom/webhook. Auto-attaches notes, AI summary, and transcript to feed Account-AI and the Note Formatter.",
      },
      {
        integrationKey: "local_llm",
        displayName: "Enterprise AI (LLM)",
        status: IntegrationStatus.NOT_CONNECTED,
        setupNotes:
          "Set LLM_BASE_URL to your OpenAI-compatible endpoint (e.g. https://ai.nutanix.com/enterpriseai/v1), plus LLM_API_KEY and LLM_MODEL, then run Test Adapter. Powers the Note Formatter.",
      },
    ],
  });

  await prisma.meetingAsset.createMany({
    data: [
      {
        meetingId: acmeMeeting.id,
        dealId: alphaDeal.id,
        type: AssetType.PRESENTATION,
        source: "internal_seed",
        sourceTool: "PowerPoint",
        title: "Acme_QBR_Deck_Q1",
        uri: "https://example.local/acme-qbr-q1",
        uploadedBy: "lizi.singletary@nutanix.com",
        previewImageUri: "/previews/deck-qbr.svg",
        previewStatus: PreviewStatus.READY,
        previewLastUpdatedAt: now,
      },
      {
        meetingId: acmeMeeting.id,
        dealId: alphaDeal.id,
        type: AssetType.WHITEBOARD,
        source: "internal_seed",
        sourceTool: "Lucidchart",
        title: "Acme Platform Topology",
        uri: "https://example.local/lucid-acme",
        uploadedBy: "lizi.singletary@nutanix.com",
        previewImageUri: "/previews/whiteboard-architecture.svg",
        previewStatus: PreviewStatus.READY,
        previewLastUpdatedAt: now,
      },
      {
        meetingId: betaMeeting.id,
        dealId: bravoDeal.id,
        type: AssetType.ZIP_BUNDLE,
        source: "internal_seed",
        sourceTool: "Collector",
        title: "Beta_Collector_Export.zip",
        uri: "file://internal/beta-collector-export.zip",
        uploadedBy: "jordan.kim@nutanix.com",
        previewImageUri: FILE_PREVIEWS.ZIP_BUNDLE,
        previewStatus: PreviewStatus.READY,
        previewLastUpdatedAt: now,
      },
      {
        meetingId: acmeKickoffMeeting.id,
        dealId: alphaDeal.id,
        type: AssetType.PRESENTATION,
        source: "internal_seed",
        sourceTool: "PowerPoint",
        title: "Acme_Discovery_Findings",
        uri: "https://example.local/acme-discovery",
        uploadedBy: "lizi.singletary@nutanix.com",
        previewImageUri: "/previews/deck-discovery.svg",
        previewStatus: PreviewStatus.READY,
        previewLastUpdatedAt: now,
      },
      {
        meetingId: gammaPocMeeting.id,
        dealId: gammaDeal.id,
        type: AssetType.PRESENTATION,
        source: "internal_seed",
        sourceTool: "PowerPoint",
        title: "Gamma_POC_Results",
        uri: "https://example.local/gamma-poc-results",
        uploadedBy: "priya.nadar@nutanix.com",
        previewImageUri: "/previews/deck-validation.svg",
        previewStatus: PreviewStatus.READY,
        previewLastUpdatedAt: now,
      },
      {
        meetingId: gammaPocMeeting.id,
        dealId: gammaDeal.id,
        type: AssetType.WHITEBOARD,
        source: "internal_seed",
        sourceTool: "Lucidchart",
        title: "Gamma VDI Reference Architecture",
        uri: "https://example.local/lucid-gamma-vdi",
        uploadedBy: "priya.nadar@nutanix.com",
        previewImageUri: "/previews/whiteboard-vdi.svg",
        previewStatus: PreviewStatus.READY,
        previewLastUpdatedAt: now,
      },
    ],
  });

  await prisma.meetingNote.createMany({
    data: [
      {
        dealId: alphaDeal.id,
        meetingId: acmeKickoffMeeting.id,
        role: "SE",
        author: "lizi.singletary@nutanix.com",
        body:
          "Kickoff covered current 3-node cluster running hot on storage. CIO wants a refresh plan before budget close. Flagged no new rack space this quarter.",
      },
      {
        dealId: alphaDeal.id,
        meetingId: acmeKickoffMeeting.id,
        role: "AE",
        author: "sam.carter@nutanix.com",
        body:
          "CIO is the economic buyer and budget closes end of quarter. Competitive pressure from incumbent - need to move fast on the proposal.",
      },
      {
        dealId: alphaDeal.id,
        meetingId: acmeKickoffMeeting.id,
        role: "SAM",
        author: "dana.whitfield@nutanix.com",
        body:
          "Existing subscription renews in 5 months. Good opportunity to bundle the refresh with an early renewal.",
      },
      {
        dealId: alphaDeal.id,
        meetingId: acmeMeeting.id,
        role: "SE",
        author: "lizi.singletary@nutanix.com",
        body:
          "QBR prep: confirmed DR is the top priority. Walked through Acme_QBR_Deck_Q1 slide 6 on async DR. Action: pull updated sizing before the readout.",
      },
      {
        dealId: alphaDeal.id,
        meetingId: null,
        role: "SE",
        author: "lizi.singletary@nutanix.com",
        body:
          "Account-level note: champion is the IT Ops lead. Sensitive to datacenter footprint - lead with node density story.",
      },
      {
        dealId: bravoDeal.id,
        meetingId: betaMeeting.id,
        role: "SE",
        author: "jordan.kim@nutanix.com",
        body:
          "Design review: customer comparing sync vs async replication. They want RPO under 15 minutes for the core banking tier. Need WAN bandwidth numbers.",
      },
      {
        dealId: bravoDeal.id,
        meetingId: betaMeeting.id,
        role: "AE",
        author: "marcus.lee@nutanix.com",
        body:
          "Budget is approved for DR modernization this fiscal year. Decision committee meets in two weeks - aiming for a proposal before then.",
      },
      {
        dealId: gammaDeal.id,
        meetingId: gammaPocMeeting.id,
        role: "SE",
        author: "priya.nadar@nutanix.com",
        body:
          "POC readout went well - VDI density hit target with headroom. Security team raised questions about segmentation; see Gamma VDI Reference Architecture.",
      },
      {
        dealId: gammaDeal.id,
        meetingId: gammaPocMeeting.id,
        role: "SAM",
        author: "sofia.reyes@nutanix.com",
        body:
          "Customer's current term ends soon. Validation success sets up a multi-year subscription expansion.",
      },
      {
        dealId: gammaDeal.id,
        meetingId: null,
        role: "AE",
        author: "marcus.lee@nutanix.com",
        body:
          "Account-level note: deal is in final validation. Remaining blocker is security sign-off. Procurement is ready once that clears.",
      },
    ],
  });

  // Showcase buying committees.
  await prisma.contact.createMany({
    data: [
      { dealId: alphaDeal.id, name: "Dana Whitfield", title: "VP of Infrastructure", email: "dana.whitfield@acme.example", role: "Economic Buyer", disposition: "SUPPORTER", notes: "Owns the budget; wants a refresh plan before budget close." },
      { dealId: alphaDeal.id, name: "Morgan Reyes", title: "IT Operations Lead", email: "morgan.reyes@acme.example", role: "Champion", disposition: "CHAMPION", notes: "Day-to-day champion; sensitive to datacenter footprint." },
      { dealId: alphaDeal.id, name: "Acme CIO", title: "CIO", email: "cio@acme.example", role: "Executive Sponsor", disposition: "NEUTRAL", notes: "Economic buyer at exec level; competitive pressure from incumbent." },
      { dealId: bravoDeal.id, name: "Robert Langley", title: "Director of Platform Engineering", email: "robert.langley@betafin.example", role: "Technical Evaluator", disposition: "SUPPORTER", notes: "Comparing sync vs async replication; wants RPO under 15 minutes." },
      { dealId: bravoDeal.id, name: "Diana Flores", title: "VP Infrastructure", email: "diana.flores@betafin.example", role: "Economic Buyer", disposition: "CHAMPION", notes: "Sponsor for DR modernization; budget approved this FY." },
      { dealId: bravoDeal.id, name: "Beta Procurement", title: "Procurement Manager", email: "procurement@betafin.example", role: "Procurement", disposition: "NEUTRAL", notes: "Engages after technical validation." },
      { dealId: gammaDeal.id, name: "Carlos Mendoza", title: "Director of Infrastructure", email: "carlos.mendoza@gammahealth.example", role: "Technical Evaluator", disposition: "SUPPORTER", notes: "Owns technical decision; pleased with POC density." },
      { dealId: gammaDeal.id, name: "Elena Popova", title: "Security Architect", email: "elena.popova@gammahealth.example", role: "Technical Evaluator", disposition: "SKEPTIC", notes: "Raised network segmentation questions; must sign off before procurement." },
      { dealId: gammaDeal.id, name: "Gamma CISO", title: "CISO", email: "security@gammahealth.example", role: "Executive Sponsor", disposition: "NEUTRAL", notes: "Security sign-off is the remaining blocker." },
    ],
  });

  await prisma.meetingTranscript.createMany({
    data: [
      {
        meetingId: acmeMeeting.id,
        dealId: alphaDeal.id,
        source: "zoom",
        summary: "The team reviewed QBR prep for Acme. DR is confirmed as the top priority. Walked through the async DR slide and agreed to pull updated sizing before the readout.",
        notes: "Action: Lizi to refresh sizing. Dana wants the refresh plan before budget close.",
        transcript: "[00:02] Lizi: Let's confirm priorities for the QBR. [00:15] Morgan: DR is the top one, storage is nearly full. [00:41] Dana: I need the refresh plan before budget close. [01:10] Lizi: I'll pull updated sizing before the readout.",
      },
      {
        meetingId: betaMeeting.id,
        dealId: bravoDeal.id,
        source: "zoom",
        summary: "Design review for Beta Financial DR. Customer is comparing sync vs async replication and wants RPO under 15 minutes for the core banking tier. Need WAN bandwidth numbers to finalize.",
        notes: "Action: gather WAN bandwidth. Decision committee meets in two weeks.",
        transcript: "[00:03] Robert: We need RPO under 15 minutes for core banking. [00:22] Jordan: Async gets you there if WAN bandwidth supports it. [00:48] Robert: Let's get the bandwidth numbers before the committee.",
      },
      {
        meetingId: gammaPocMeeting.id,
        dealId: gammaDeal.id,
        source: "zoom",
        summary: "POC readout for Gamma VDI. Density hit target with headroom. Security team raised segmentation questions that must be resolved before procurement can proceed.",
        notes: "Action: send segmentation design to Elena. Procurement ready once security clears.",
        transcript: "[00:05] Priya: Density hit target with headroom. [00:30] Carlos: Great, that unblocks the expansion. [00:52] Elena: I still need to review network segmentation before I can sign off.",
      },
    ],
  });

  await prisma.salesforceTask.createMany({
    data: [
      { dealId: alphaDeal.id, taskName: "Refresh async DR sizing before QBR readout", status: "In Progress", priority: "High", type: "Sizing", dueDate: addDays(now, 3), assignee: "lizi.singletary@nutanix.com", relatedAccount: "Acme Manufacturing", products: JSON.stringify(["NCI Pro"]) },
      { dealId: bravoDeal.id, taskName: "Collect WAN bandwidth numbers for DR replication", status: "Not Started", priority: "High", type: "Discovery", dueDate: addDays(now, 4), assignee: "jordan.kim@nutanix.com", relatedAccount: "Beta Financial" },
      { dealId: gammaDeal.id, taskName: "Send network segmentation design to security team", status: "Not Started", priority: "High", type: "Technical", dueDate: addDays(now, 2), assignee: "priya.nadar@nutanix.com", relatedAccount: "Gamma Healthcare" },
    ],
  });

  // --- Generated demo accounts so the calendar, pipeline, and accounts views feel populated ---
  const fakeCompanies = [
    "Northwind Logistics",
    "Contoso Retail",
    "Globex Energy",
    "Initech Software",
    "Umbrella Biotech",
    "Wayne Industries",
    "Stark Manufacturing",
    "Wonka Foods",
    "Hooli Cloud",
    "Pied Piper Data",
    "Vandelay Imports",
    "Cyberdyne Systems",
    "Tyrell Robotics",
    "Aperture Labs",
    "Massive Dynamic",
    "Oscorp Materials",
    "Gringotts Bank",
    "Aperion Health",
    "Black Mesa Research",
    "Soylent Foods",
    "Meridian Freight",
    "Cascade Utilities",
    "Summit Healthcare",
    "Ironclad Insurance",
    "Bluewave Telecom",
    "Redstone Mining",
    "Cornerstone Credit Union",
    "Evergreen Public Schools",
    "Harbor Point Media",
    "Sterling Aerospace",
    "Lakeside Regional Hospital",
    "Pinnacle Payments",
    "Granite State University",
    "Coastal Power & Light",
    "Vertex Pharmaceuticals Co",
    "Frontier Retail Group",
    "Atlas Manufacturing",
    "Beacon Financial Group",
    "Copperline Energy",
    "Delta Ridge Logistics",
    "Nimbus Software",
    "Orchard Foods",
    "Sentinel Defense Systems",
    "Trailhead Outdoors",
    "Union Metro Transit",
    "Willowbrook Health System",
    "Zenith Broadcasting",
  ];
  const fakeOwners = [
    "Lizi Singletary",
    "Jordan Kim",
    "Priya Nadar",
    "Marcus Lee",
    "Dana Whitfield",
    "Sofia Reyes",
    "Tom Becker",
  ];
  const stageCycle = ["Discovery", "Design", "Validation"];
  const dealSuffix: Record<string, string[]> = {
    Discovery: ["Infra Discovery", "Datacenter Assessment", "Cloud Readiness"],
    Design: ["Architecture Design", "DR Modernization", "Platform Refresh"],
    Validation: ["POC Validation", "Pilot Expansion", "Production Rollout"],
  };
  const nextActionsByStage: Record<string, string[]> = {
    Discovery: [
      "Schedule technical discovery workshop",
      "Collect current-state inventory",
      "Review utilization with stakeholders",
    ],
    Design: [
      "Finalize reference architecture",
      "Validate replication targets",
      "Present sizing options to the team",
    ],
    Validation: [
      "Confirm POC success criteria sign-off",
      "Coordinate security review",
      "Plan production cutover window",
    ],
  };
  const signals = [
    "Storage utilization trending above 80%.",
    "Evaluating DR expansion for critical workloads.",
    "Hypervisor renewal driving a platform review.",
    "VDI growth requiring additional capacity.",
    "Consolidating multiple legacy clusters.",
    "Exploring hybrid cloud bursting options.",
  ];
  const seNoteBodies = [
    "Technical team is comparing us against the incumbent vendor.",
    "Champion wants a reference architecture before the next review.",
    "Security team flagged network segmentation requirements.",
    "Customer is interested in mixed-workload consolidation.",
    "Validated node density assumptions against current inventory.",
    "Need to confirm WAN bandwidth before finalizing the DR design.",
  ];
  const aeNoteBodies = [
    "Budget is approved for this fiscal year - aiming to close this quarter.",
    "Economic buyer is the VP of Infrastructure; champion is the lead architect.",
    "Competitive pressure from the incumbent - need a strong business case.",
    "Decision committee meets in two weeks; proposal is in progress.",
    "Pricing discussion scheduled after the technical validation.",
    "Executive sponsor is engaged and supportive of the direction.",
  ];
  const samNoteBodies = [
    "Current subscription renews in a few months - good expansion timing.",
    "Opportunity to bundle the refresh with an early renewal.",
    "Customer health is strong; low churn risk this cycle.",
    "Adoption of core features is high - room to grow into add-ons.",
    "Renewal sets up a multi-year subscription expansion.",
    "Tracking utilization to right-size the next subscription term.",
  ];

  // Coherent deal archetypes so each generated account reads like a real,
  // internally-consistent opportunity (industry, incumbent, use case, products,
  // and narrative all line up). Fabricated, but shaped for a useful demo.
  type Archetype = {
    industry: string;
    incumbentVendor: string;
    primaryCompetitor: string;
    hypervisor: string;
    portfolio: string[];
    products: string[];
    tags: string[];
    useCase: string;
    currentEnvironment: string;
    whyNow: string;
    whyNutanix: string;
    signal: string;
    se: string;
    ae: string;
    sam: string;
    transcriptSummary: string;
    transcriptNotes: string;
    transcript: string;
    task: string;
  };
  const archetypes: Archetype[] = [
    {
      industry: "Manufacturing",
      incumbentVendor: "VMware (Broadcom)",
      primaryCompetitor: "Dell VxRail",
      hypervisor: "VMware ESXi",
      portfolio: ["NCI", "NCM"],
      products: ["NCI Pro", "NCM Starter"],
      tags: ["consolidation", "renewal", "VMware-exit"],
      useCase: "Consolidate aging vSphere clusters onto a denser platform ahead of a datacenter space constraint.",
      currentEnvironment: "Three vSphere 7 clusters, roughly 220 cores, all-flash, storage sustained above 80 percent.",
      whyNow: "The VMware support renewal quote arrived with a large price increase.",
      whyNutanix: "Denser nodes reclaim rack space and one platform simplifies operations versus a like-for-like refresh.",
      signal: "Renewal quote from incumbent came in higher than expected.",
      se: "Technical team is comparing us against the incumbent on core density and operational simplicity.",
      ae: "Compelling event is the VMware renewal; economic buyer wants a business case before the renewal date.",
      sam: "Renewal timing lines up well with a platform refresh and early subscription.",
      transcriptSummary: "Reviewed current-state inventory and the renewal timeline. Agreed the main driver is the VMware price increase and rack space limits.",
      transcriptNotes: "Action: build a side-by-side TCO versus the renewal quote.",
      transcript: "[00:04] SE: Walk me through the current clusters. [00:20] Customer: Three vSphere clusters, storage is nearly full. [00:45] Customer: The renewal quote jumped a lot this year. [01:02] SE: Let's build a TCO against that quote.",
      task: "Build TCO comparison versus the VMware renewal quote",
    },
    {
      industry: "Healthcare",
      incumbentVendor: "Citrix on VMware",
      primaryCompetitor: "Keep Citrix/VMware",
      hypervisor: "VMware ESXi",
      portfolio: ["NCI", "EUC"],
      products: ["NCI Pro", "EUC Pro"],
      tags: ["VDI", "security", "expansion"],
      useCase: "Expand clinical virtual desktops with validated density and a clean security segmentation story.",
      currentEnvironment: "Citrix on vSphere serving about 1,500 clinical desktops, planning growth to 2,500 seats.",
      whyNow: "Desktop growth is outpacing the current environment and the Citrix term is ending.",
      whyNutanix: "Validated VDI density with headroom and simpler operations than the incumbent Citrix on VMware stack.",
      signal: "Clinical VDI growth requiring additional capacity.",
      se: "Security team flagged network segmentation requirements for the clinical VLANs.",
      ae: "Champion is the end-user computing lead; security sign-off is the gating item.",
      sam: "Strong adoption signals; expansion sets up a multi-year term.",
      transcriptSummary: "POC readout showed VDI density hitting target with headroom. Security asked for a segmentation design before approving.",
      transcriptNotes: "Action: deliver segmentation design to the security architect.",
      transcript: "[00:03] SE: Density hit target with headroom. [00:19] Customer: That unblocks the expansion. [00:40] Security: I need the segmentation design before I sign off.",
      task: "Deliver network segmentation design to security",
    },
    {
      industry: "Financial Services",
      incumbentVendor: "VMware (Broadcom)",
      primaryCompetitor: "VMware VCF",
      hypervisor: "VMware ESXi",
      portfolio: ["NCI", "NCM", "NUS (Files/Objects/Volumes)"],
      products: ["NCI Ultimate", "NCM Pro"],
      tags: ["DR", "replication", "compliance"],
      useCase: "Modernize disaster recovery for regulated workloads with a tighter RPO across two sites.",
      currentEnvironment: "Dual-site vSphere estate, about 640 cores, array-based replication near end of support.",
      whyNow: "DR modernization budget is approved this fiscal year and a committee decision is near.",
      whyNutanix: "Native async DR and one management plane reduce RPO and remove a separate replication appliance.",
      signal: "Evaluating DR expansion for critical workloads.",
      se: "Need to confirm WAN bandwidth before finalizing the async DR design.",
      ae: "Budget approved; decision committee meets soon, so timing is tight.",
      sam: "Healthy account; DR modernization opens a larger footprint conversation.",
      transcriptSummary: "Design review compared sync versus async replication. Customer wants RPO under 15 minutes for the core tier.",
      transcriptNotes: "Action: gather WAN bandwidth numbers before the committee.",
      transcript: "[00:05] Customer: We need RPO under 15 minutes. [00:22] SE: Async gets you there if bandwidth supports it. [00:41] Customer: Let's confirm the bandwidth.",
      task: "Confirm WAN bandwidth for DR replication",
    },
    {
      industry: "Public Sector",
      incumbentVendor: "Microsoft Hyper-V",
      primaryCompetitor: "Azure Stack HCI",
      hypervisor: "Hyper-V",
      portfolio: ["NCI"],
      products: ["NCI Pro"],
      tags: ["hypervisor-migration", "budget-cycle"],
      useCase: "Standardize on a single platform and reduce hypervisor licensing across agencies.",
      currentEnvironment: "Mixed Hyper-V and legacy vSphere, about 300 cores, split across two datacenters.",
      whyNow: "Annual budget cycle is the window to fund a platform change.",
      whyNutanix: "AHV removes hypervisor licensing cost and simplifies operations for a small ops team.",
      signal: "Hypervisor renewal driving a platform review.",
      se: "Customer is interested in mixed-workload consolidation and AHV migration via Move.",
      ae: "Funding must be committed within this budget cycle.",
      sam: "Low churn risk; standardization improves long-term health.",
      transcriptSummary: "Discovery workshop mapped the Hyper-V estate and migration candidates. AHV licensing savings resonated.",
      transcriptNotes: "Action: scope a Move migration for the first workload group.",
      transcript: "[00:06] SE: Which workloads move first? [00:24] Customer: The general-purpose VMs. [00:39] SE: Move can handle those with minimal downtime.",
      task: "Scope Nutanix Move migration for first workload group",
    },
    {
      industry: "Retail",
      incumbentVendor: "Dell + VMware",
      primaryCompetitor: "Dell VxRail",
      hypervisor: "VMware ESXi",
      portfolio: ["NCI", "NDB"],
      products: ["NCI Pro", "NDB"],
      tags: ["database", "consolidation"],
      useCase: "Consolidate database sprawl and simplify database lifecycle management.",
      currentEnvironment: "About 60 database VMs on vSphere with manual provisioning and inconsistent backups.",
      whyNow: "A hardware refresh is due and DBA team is overloaded with manual work.",
      whyNutanix: "NDB automates database provisioning, patching, and copy data management on one platform.",
      signal: "Consolidating multiple legacy clusters.",
      se: "Validated node density assumptions against current database inventory.",
      ae: "DBA productivity is the business case; refresh budget is in play.",
      sam: "Room to grow into NDB add-ons after the core refresh.",
      transcriptSummary: "Walked through database estate and the manual provisioning pain. NDB automation was the clear hook.",
      transcriptNotes: "Action: run an NDB demo against a representative database.",
      transcript: "[00:04] Customer: Provisioning a new database takes days. [00:21] SE: NDB brings that to minutes. [00:35] Customer: Show me with our workload.",
      task: "Schedule NDB automation demo with the DBA team",
    },
    {
      industry: "Media & Telecom",
      incumbentVendor: "Legacy NAS + VMware",
      primaryCompetitor: "Dell PowerScale",
      hypervisor: "VMware ESXi",
      portfolio: ["NCI", "NUS (Files/Objects/Volumes)"],
      products: ["NCI Pro", "Files", "Objects"],
      tags: ["unstructured-data", "files", "growth"],
      useCase: "Consolidate fast-growing unstructured media data onto a scalable files and objects platform.",
      currentEnvironment: "Aging NAS at roughly 1.2 PB and growing, plus a separate vSphere compute tier.",
      whyNow: "NAS is out of capacity and support is ending this year.",
      whyNutanix: "Unified files and objects on the same platform as compute simplifies growth and management.",
      signal: "Unstructured data growth outpacing current NAS.",
      se: "Champion wants a reference architecture for files and objects before the next review.",
      ae: "Capacity wall creates urgency; competitive with a standalone storage vendor.",
      sam: "Data growth trend supports a multi-year capacity plan.",
      transcriptSummary: "Reviewed unstructured data growth and the NAS end-of-support date. Unified files and objects landed well.",
      transcriptNotes: "Action: size Files and Objects for the projected 24-month growth.",
      transcript: "[00:05] Customer: The NAS is full and support ends this year. [00:23] SE: Files and Objects scale on the same platform. [00:40] Customer: Size it for our growth.",
      task: "Size Files and Objects for 24-month data growth",
    },
    {
      industry: "Energy & Utilities",
      incumbentVendor: "VMware (Broadcom)",
      primaryCompetitor: "Azure",
      hypervisor: "VMware ESXi",
      portfolio: ["NCI", "NC2"],
      products: ["NCI Pro", "NC2"],
      tags: ["edge", "ROBO", "hybrid-cloud"],
      useCase: "Standardize edge and remote sites and add cloud bursting for seasonal demand.",
      currentEnvironment: "A dozen remote sites on small vSphere clusters with limited on-site IT.",
      whyNow: "Edge hardware is aging and cloud strategy is being defined this year.",
      whyNutanix: "Consistent platform from edge to cloud with NC2 for burst and DR into the hyperscaler.",
      signal: "Exploring hybrid cloud bursting options.",
      se: "Customer is interested in a consistent edge-to-cloud operating model.",
      ae: "Cloud strategy decision opens a multi-site standardization play.",
      sam: "Edge standardization improves supportability and reduces churn risk.",
      transcriptSummary: "Discussed edge site standardization and NC2 for cloud burst and DR. Operational consistency was the key theme.",
      transcriptNotes: "Action: design a reference edge site plus NC2 DR target.",
      transcript: "[00:04] Customer: Every site is a little different today. [00:20] SE: One platform edge to cloud fixes that. [00:38] Customer: Design a reference site.",
      task: "Design reference edge site and NC2 DR target",
    },
    {
      industry: "Technology",
      incumbentVendor: "Bare-metal GPU servers",
      primaryCompetitor: "Public cloud GPU",
      hypervisor: "KVM",
      portfolio: ["NCI", "NAI", "NKP"],
      products: ["NCI Ultimate", "NAI", "NKP"],
      tags: ["AI", "GPU", "kubernetes"],
      useCase: "Stand up a private GPU platform for model inference with Kubernetes and enterprise AI services.",
      currentEnvironment: "Ad-hoc bare-metal GPU servers, no shared scheduling, growing cloud GPU spend.",
      whyNow: "Cloud GPU costs are rising and data governance requires on-prem inference.",
      whyNutanix: "NAI plus NKP deliver a governed private AI platform with GPU-aware Kubernetes on one stack.",
      signal: "Rising cloud GPU spend prompting a private AI platform review.",
      se: "Champion wants a reference architecture for GPU scheduling and NKP before the next review.",
      ae: "Cost and data governance drive the business case for private AI.",
      sam: "New workload footprint; strong expansion potential into NAI.",
      transcriptSummary: "Reviewed AI inference goals and data governance. NAI and NKP on one platform addressed both cost and control.",
      transcriptNotes: "Action: architect GPU node pool and NKP cluster for inference.",
      transcript: "[00:05] Customer: Cloud GPU spend is out of control. [00:22] SE: A governed private platform with NAI and NKP fixes cost and control. [00:41] Customer: Let's architect it.",
      task: "Architect GPU node pool and NKP cluster for inference",
    },
    {
      industry: "Life Sciences",
      incumbentVendor: "VMware (Broadcom)",
      primaryCompetitor: "HPE SimpliVity",
      hypervisor: "VMware ESXi",
      portfolio: ["NCI", "NCM"],
      products: ["NCI Pro", "NCM Pro"],
      tags: ["consolidation", "compliance", "renewal"],
      useCase: "Consolidate research and GxP workloads with stronger governance and simpler operations.",
      currentEnvironment: "Two vSphere clusters, about 260 cores, mixed research and validated GxP workloads.",
      whyNow: "VMware renewal and an audit finding on inconsistent management practices.",
      whyNutanix: "NCM centralizes governance and automation while consolidating both workload types on one platform.",
      signal: "Audit finding driving a management and governance review.",
      se: "Security and compliance flagged governance gaps we can close with NCM.",
      ae: "Renewal plus audit finding create a clear compelling event.",
      sam: "Governance improvements strengthen a long-term relationship.",
      transcriptSummary: "Reviewed the audit finding and renewal timing. NCM governance and automation directly addressed the gap.",
      transcriptNotes: "Action: map NCM policies to the audit findings.",
      transcript: "[00:04] Customer: The audit flagged inconsistent management. [00:21] SE: NCM centralizes policy and automation. [00:37] Customer: Map that to our findings.",
      task: "Map NCM policies to audit findings",
    },
    {
      industry: "Education",
      incumbentVendor: "VMware Horizon",
      primaryCompetitor: "Omnissa Horizon",
      hypervisor: "VMware ESXi",
      portfolio: ["NCI", "EUC"],
      products: ["NCI Pro", "EUC Pro"],
      tags: ["VDI", "budget-cycle", "EUC"],
      useCase: "Deliver student and lab virtual desktops at lower cost after Horizon licensing changes.",
      currentEnvironment: "Horizon on vSphere serving lab and student desktops, about 1,200 seats.",
      whyNow: "Horizon licensing changes and the annual budget window.",
      whyNutanix: "EUC on AHV delivers desktops without separate hypervisor and broker licensing overhead.",
      signal: "VDI licensing changes prompting an alternative review.",
      se: "Customer wants a density and cost comparison versus the current Horizon stack.",
      ae: "Budget cycle timing plus licensing changes drive urgency.",
      sam: "Cost story supports a durable multi-year commitment.",
      transcriptSummary: "Discussed Horizon licensing changes and lab desktop needs. EUC on AHV addressed both cost and simplicity.",
      transcriptNotes: "Action: build density and cost comparison versus Horizon.",
      transcript: "[00:05] Customer: Horizon licensing changed on us. [00:20] SE: EUC on AHV removes broker and hypervisor overhead. [00:38] Customer: Show the cost comparison.",
      task: "Build EUC vs Horizon density and cost comparison",
    },
  ];

  // Deterministic pools for fabricating buying-committee contacts.
  const contactFirst = [
    "Michael", "Jennifer", "David", "Sarah", "James", "Linda", "Robert", "Patricia", "John", "Elizabeth",
    "Daniel", "Karen", "Paul", "Nancy", "Mark", "Lisa", "Steven", "Sandra", "Kevin", "Ashley",
    "Brian", "Emily", "George", "Rachel", "Edward", "Megan", "Anthony", "Olivia", "Jason", "Grace",
  ];
  const contactLast = [
    "Anderson", "Bennett", "Carter", "Diaz", "Edwards", "Foster", "Griffin", "Hughes", "Ingram", "Jensen",
    "Knight", "Lambert", "Morrison", "Nguyen", "Ortiz", "Patel", "Quinn", "Reed", "Sullivan", "Turner",
    "Underwood", "Vargas", "Weaver", "Xiong", "Young", "Zimmerman", "Brooks", "Campbell", "Delgado", "Erickson",
  ];
  // role, title, disposition for each committee slot (taken in order).
  const committee: { role: string; title: string; disposition: ContactDisposition }[] = [
    { role: "Economic Buyer", title: "VP of Infrastructure", disposition: "SUPPORTER" },
    { role: "Champion", title: "Infrastructure Architect", disposition: "CHAMPION" },
    { role: "Technical Evaluator", title: "Lead Systems Engineer", disposition: "SUPPORTER" },
    { role: "Executive Sponsor", title: "CIO", disposition: "NEUTRAL" },
    { role: "Procurement", title: "Procurement Manager", disposition: "NEUTRAL" },
  ];

  for (let i = 0; i < fakeCompanies.length; i++) {
    const company = fakeCompanies[i];
    const stage = stageCycle[i % stageCycle.length];
    const owner = fakeOwners[i % fakeOwners.length];
    const firstWord = company.split(" ")[0];
    const domain = `${company.toLowerCase().replace(/[^a-z]+/g, "")}.example`;
    const ownerEmail = `${owner.toLowerCase().replace(/[^a-z]+/g, ".")}@nutanix.com`;
    const suffixOptions = dealSuffix[stage];
    const dealName = `${firstWord} ${suffixOptions[i % suffixOptions.length]}`;

    const techStatuses = ["-", "0", "25", "50", "75", "99", "100"];
    const technicalCloseStatus = techStatuses[i % techStatuses.length];
    const amount = 60000 + ((i * 7) % 26) * 70000;

    // Spread close dates across the current fiscal quarter, earlier in this FY, and prior FY (for All Time).
    const bucket = i % 3;
    let closeDate: Date;
    let isClosed = false;
    if (bucket === 0) {
      closeDate = addDays(now, ((i * 3) % 40) - 18);
    } else if (bucket === 1) {
      closeDate = addDays(now, -(130 + i * 4));
      isClosed = technicalCloseStatus === "100";
    } else {
      closeDate = addDays(now, -(400 + i * 6));
      isClosed = i % 2 === 0;
    }

    const arch = archetypes[i % archetypes.length];
    const regions = ["AMER - East", "AMER - West", "AMER - Central", "EMEA", "APJ"];
    const forecastCategory =
      isClosed && technicalCloseStatus === "100"
        ? "Closed"
        : stage === "Validation"
          ? "Commit"
          : stage === "Design"
            ? "Best Case"
            : "Pipeline";

    const deal = await prisma.deal.create({
      data: {
        name: dealName,
        accountName: company,
        stage,
        owner,
        nextAction: nextActionsByStage[stage][i % 3],
        latestSignal: arch.signal,
        amount,
        acvAmount: Math.round(amount / 3 / 1000) * 1000,
        servicesAcv: Math.round((amount * 0.08) / 1000) * 1000,
        technicalCloseStatus,
        closeDate,
        isClosed,
        forecastCategory,
        industry: arch.industry,
        employees: 500 + ((i * 137) % 9500),
        region: regions[i % regions.length],
        incumbentVendor: arch.incumbentVendor,
        primaryCompetitor: arch.primaryCompetitor,
        renewalDate: addDays(now, 30 + ((i * 11) % 330)),
        hypervisor: arch.hypervisor,
        portfolio: JSON.stringify(arch.portfolio),
        products: JSON.stringify(arch.products),
        tags: JSON.stringify(arch.tags),
        partners: ["CDW", "WWT", "Presidio", "Insight", "SHI", "-"][i % 6],
        useCase: arch.useCase,
        currentEnvironment: arch.currentEnvironment,
        whyNow: arch.whyNow,
        whyNutanix: arch.whyNutanix,
        outcome: `${stage} stage: ${arch.se}`,
        nextStepsToClose: `1) ${nextActionsByStage[stage][i % 3]} 2) ${nextActionsByStage[stage][(i + 1) % 3]} 3) Align account team on close plan`,
        technicalDecisionMaker: `${contactFirst[(i + 1) % contactFirst.length]} ${contactLast[(i + 2) % contactLast.length]}`,
        intendToUseForNc2: arch.portfolio.includes("NC2"),
        bomAttached: technicalCloseStatus === "99" || technicalCloseStatus === "100",
        xrayUsed: stage === "Validation",
      },
    });

    // Spread three meetings per account across business hours and weekdays over
    // the surrounding weeks so the calendar is densely (but realistically) full.
    // Each account gets four meetings in deliberately different time bands -- a
    // morning, an early-afternoon, a late-afternoon, and a past one -- spread
    // across the surrounding weeks so every week looks full from 9 to 5.
    const min = i % 2 === 0 ? 0 : 30;

    const upcomingStart = weekdayAt(1 + ((i * 2) % 26), 9 + (i % 3), min); // 9-11 AM
    const upcomingMeeting = await prisma.meeting.create({
      data: {
        source: "internal_seed",
        subject: `${stage} Sync - ${company}`,
        organizer: ownerEmail,
        startTime: upcomingStart,
        endTime: endBy5(upcomingStart, DURATIONS[i % DURATIONS.length]),
        attendeesJson: JSON.stringify([
          { email: `it@${domain}`, displayName: `${company} IT` },
          { email: ownerEmail, displayName: owner },
          { email: externalContactEmail(i, domain) },
        ]),
        externalDomains: domain,
        joinUrl: joinUrlFor(i),
        dealId: deal.id,
      },
    });

    const workingStart = weekdayAt(2 + ((i * 3) % 27), 13 + (i % 3), min); // 1-3 PM
    await prisma.meeting.create({
      data: {
        source: "internal_seed",
        subject: `Working Session - ${company}`,
        organizer: ownerEmail,
        startTime: workingStart,
        endTime: endBy5(workingStart, DURATIONS[(i + 1) % DURATIONS.length]),
        attendeesJson: JSON.stringify([
          { email: `it@${domain}`, displayName: `${company} IT` },
          { email: externalContactEmail(i + 5, domain) },
        ]),
        externalDomains: domain,
        joinUrl: joinUrlFor(i + 2),
        dealId: deal.id,
      },
    });

    const followupStart = weekdayAt(4 + ((i * 5) % 25), 14 + (i % 3), min); // 2-4 PM
    await prisma.meeting.create({
      data: {
        source: "internal_seed",
        subject: `Follow-up - ${company}`,
        organizer: ownerEmail,
        startTime: followupStart,
        endTime: endBy5(followupStart, DURATIONS[(i + 2) % DURATIONS.length]),
        attendeesJson: JSON.stringify([
          { email: `it@${domain}`, displayName: `${company} IT` },
          { email: ownerEmail, displayName: owner },
          { email: externalContactEmail(i + 7, domain) },
        ]),
        externalDomains: domain,
        joinUrl: joinUrlFor(i + 3),
        dealId: deal.id,
      },
    });

    const pastStart = weekdayAt(-(2 + ((i * 2) % 18)), 9 + ((i * 3) % 7), min); // 9 AM - 3 PM
    const pastMeeting = await prisma.meeting.create({
      data: {
        source: "internal_seed",
        subject: `Intro Call - ${company}`,
        organizer: ownerEmail,
        startTime: pastStart,
        endTime: endBy5(pastStart, 60),
        attendeesJson: JSON.stringify([
          { email: `infra@${domain}`, displayName: `${company} Infrastructure` },
          { email: externalContactEmail(i + 3, domain) },
        ]),
        externalDomains: domain,
        joinUrl: joinUrlFor(i + 1),
        dealId: deal.id,
      },
    });

    const assetData: Prisma.MeetingAssetCreateManyInput[] = [
      {
        meetingId: upcomingMeeting.id,
        dealId: deal.id,
        type: AssetType.PRESENTATION,
        source: "internal_seed",
        sourceTool: "PowerPoint",
        title: `${firstWord}_${stage}_Deck`,
        uri: `https://example.local/${domain}/deck`,
        uploadedBy: ownerEmail,
        previewImageUri: `/previews/deck-${stage.toLowerCase()}.svg`,
        previewStatus: PreviewStatus.READY,
        previewLastUpdatedAt: now,
      },
    ];
    if (i % 2 === 0) {
      assetData.push({
        meetingId: upcomingMeeting.id,
        dealId: deal.id,
        type: AssetType.WHITEBOARD,
        source: "internal_seed",
        sourceTool: "Lucidchart",
        title: `${firstWord} Reference Architecture`,
        uri: `https://example.local/${domain}/whiteboard`,
        uploadedBy: ownerEmail,
        previewImageUri: `/previews/${["whiteboard-architecture", "whiteboard-network", "whiteboard-vdi"][(i / 2) % 3 | 0]}.svg`,
        previewStatus: PreviewStatus.READY,
        previewLastUpdatedAt: now,
      });
    }
    await prisma.meetingAsset.createMany({ data: assetData });

    await prisma.meetingNote.createMany({
      data: [
        {
          dealId: deal.id,
          meetingId: pastMeeting.id,
          role: "SE",
          author: ownerEmail,
          body: arch.se,
        },
        {
          dealId: deal.id,
          meetingId: pastMeeting.id,
          role: "AE",
          author: `${fakeOwners[(i + 3) % fakeOwners.length].toLowerCase().replace(/[^a-z]+/g, ".")}@nutanix.com`,
          body: arch.ae,
        },
        {
          dealId: deal.id,
          meetingId: upcomingMeeting.id,
          role: "SE",
          author: ownerEmail,
          body: `Prep for ${stage} sync: ${arch.useCase}`,
        },
        {
          dealId: deal.id,
          meetingId: null,
          role: "SAM",
          author: `${fakeOwners[(i + 5) % fakeOwners.length].toLowerCase().replace(/[^a-z]+/g, ".")}@nutanix.com`,
          body: arch.sam,
        },
      ],
    });

    // Buying committee: 3 to 5 contacts, deterministic and archetype-consistent.
    const committeeSize = 3 + (i % 3);
    const contactData = committee.slice(0, committeeSize).map((slot, slotIdx) => {
      const first = contactFirst[(i * 3 + slotIdx * 7) % contactFirst.length];
      const last = contactLast[(i * 5 + slotIdx * 3) % contactLast.length];
      // Vary technical-evaluator disposition so not every committee is uniform.
      const disposition: ContactDisposition =
        slot.role === "Technical Evaluator" && i % 4 === 0 ? ContactDisposition.SKEPTIC : slot.disposition;
      return {
        dealId: deal.id,
        name: `${first} ${last}`,
        title: slot.title,
        email: `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`,
        role: slot.role,
        disposition,
        notes:
          slot.role === "Champion"
            ? "Primary internal advocate for the project."
            : slot.role === "Economic Buyer"
              ? "Controls the budget for this initiative."
              : slot.role === "Technical Evaluator"
                ? `Evaluating the technical fit for ${arch.useCase.toLowerCase()}`
                : slot.role === "Executive Sponsor"
                  ? "Executive sponsor; cares about business outcomes and risk."
                  : "Engages once technical validation is complete.",
      };
    });
    await prisma.contact.createMany({ data: contactData });

    // Zoom transcript on the past (intro) call, archetype-flavored.
    await prisma.meetingTranscript.create({
      data: {
        meetingId: pastMeeting.id,
        dealId: deal.id,
        source: "zoom",
        summary: arch.transcriptSummary,
        notes: arch.transcriptNotes,
        transcript: arch.transcript,
      },
    });

    // Two follow-up tasks: one archetype-specific, one stage-generic.
    const taskStatus = stage === "Validation" ? "In Progress" : "Not Started";
    await prisma.salesforceTask.createMany({
      data: [
        {
          dealId: deal.id,
          taskName: arch.task,
          status: taskStatus,
          priority: technicalCloseStatus === "99" ? "High" : "Normal",
          type: "Technical",
          dueDate: addDays(now, 5 + (i % 20)),
          assignee: ownerEmail,
          relatedAccount: company,
          products: JSON.stringify(arch.products),
        },
        {
          dealId: deal.id,
          taskName: nextActionsByStage[stage][i % 3],
          status: "Not Started",
          priority: "Normal",
          type: "Sales",
          dueDate: addDays(now, 10 + (i % 15)),
          assignee: ownerEmail,
          relatedAccount: company,
        },
      ],
    });

    // One assigned email so the account brain has an email thread too.
    await prisma.dealEmail.create({
      data: {
        dealId: deal.id,
        threadId: `t-${domain}-001`,
        messageId: `m-${domain}-001`,
        subject: `${firstWord}: ${arch.useCase.slice(0, 60)}`,
        from: `it@${domain}`,
        body: `${arch.currentEnvironment} ${arch.whyNow}`,
        receivedAt: addDays(now, -(3 + (i % 12))),
        assignedBy: ownerEmail,
        assignedAt: addDays(now, -(2 + (i % 10))),
        summary: arch.signal,
      },
    });
  }

  // Attach a rich, varied set of assets to every meeting so the calendar is fully populated.
  const deckSvgs = [
    "/previews/deck-discovery.svg",
    "/previews/deck-design.svg",
    "/previews/deck-validation.svg",
    "/previews/deck-qbr.svg",
  ];
  const whiteboardSvgs = [
    "/previews/whiteboard-architecture.svg",
    "/previews/whiteboard-network.svg",
    "/previews/whiteboard-vdi.svg",
  ];
  const allMeetings = await prisma.meeting.findMany({
    select: { id: true, dealId: true, externalDomains: true, deal: { select: { accountName: true } } },
  });

  let deckCounter = 0;
  let whiteboardCounter = 0;
  const meetingAssetBundle: Prisma.MeetingAssetCreateManyInput[] = [];

  allMeetings.forEach((meeting, index) => {
    const firstWord = meeting.deal.accountName.split(" ")[0];
    const domain = meeting.externalDomains || "example.local";
    const variant = index % 5;

    const deck = (label: string) => {
      const preview = deckSvgs[deckCounter % deckSvgs.length];
      deckCounter += 1;
      return {
        meetingId: meeting.id,
        dealId: meeting.dealId,
        type: AssetType.PRESENTATION,
        source: "internal_seed",
        sourceTool: deckCounter % 2 === 0 ? "Google Slides" : "PowerPoint",
        title: `${firstWord}_${label}`,
        uri: `https://example.local/${domain}/${label.toLowerCase()}`,
        uploadedBy: "se.workspace@nutanix.com",
        previewImageUri: preview,
        previewStatus: PreviewStatus.READY,
        previewLastUpdatedAt: now,
      } satisfies Prisma.MeetingAssetCreateManyInput;
    };
    const board = (label: string) => {
      const preview = whiteboardSvgs[whiteboardCounter % whiteboardSvgs.length];
      whiteboardCounter += 1;
      return {
        meetingId: meeting.id,
        dealId: meeting.dealId,
        type: AssetType.WHITEBOARD,
        source: "internal_seed",
        sourceTool: whiteboardCounter % 2 === 0 ? "Miro" : "Lucidchart",
        title: `${firstWord} ${label}`,
        uri: `https://example.local/${domain}/${label.replace(/\s+/g, "-").toLowerCase()}`,
        uploadedBy: "se.workspace@nutanix.com",
        previewImageUri: preview,
        previewStatus: PreviewStatus.READY,
        previewLastUpdatedAt: now,
      } satisfies Prisma.MeetingAssetCreateManyInput;
    };
    const file = (type: AssetType, sourceTool: string, title: string) =>
      ({
        meetingId: meeting.id,
        dealId: meeting.dealId,
        type,
        source: "internal_seed",
        sourceTool,
        title,
        uri: `file://internal/${domain}/${title.replace(/\s+/g, "_").toLowerCase()}`,
        uploadedBy: "se.workspace@nutanix.com",
        previewImageUri: FILE_PREVIEWS[type] ?? null,
        previewStatus: PreviewStatus.READY,
        previewLastUpdatedAt: now,
      }) satisfies Prisma.MeetingAssetCreateManyInput;

    const collector = () => file(AssetType.COLLECTOR, "Collector", `${firstWord}_Collector_Export.zip`);
    const rvTool = () => file(AssetType.RV_TOOL, "RVTools", `${firstWord}_RVTools.xlsx`);
    const zip = () => file(AssetType.ZIP_BUNDLE, "Collector", `${firstWord}_Discovery_Bundle.zip`);
    const build = () => file(AssetType.TEXT_BRIEF, "Nutanix Sizer", `${firstWord} Suggested Build v${variant + 1}`);
    const qbr = () => file(AssetType.QBR_REPORT, "CS360", `${firstWord}_QBR_Report.pdf`);

    if (variant === 0) {
      meetingAssetBundle.push(deck("Overview"), deck("Technical_Deep_Dive"), board("Network Topology"), board("Target Architecture"), collector());
    } else if (variant === 1) {
      meetingAssetBundle.push(deck("Exec_Briefing"), deck("Solution_Overview"), deck("Roadmap"), rvTool(), build());
    } else if (variant === 2) {
      meetingAssetBundle.push(deck("Discovery_Readout"), board("Current State"), board("Future State"), collector(), rvTool(), zip());
    } else if (variant === 3) {
      meetingAssetBundle.push(deck("QBR_Deck"), deck("Adoption_Review"), qbr(), build(), collector());
    } else {
      meetingAssetBundle.push(deck("Kickoff"), deck("Sizing_Walkthrough"), board("Reference Architecture"), rvTool(), build());
    }
  });

  await prisma.meetingAsset.createMany({ data: meetingAssetBundle });

  await prisma.dealEmail.createMany({
    data: [
      {
        dealId: alphaDeal.id,
        threadId: "t-acme-001",
        messageId: "m-acme-001",
        subject: "Acme QBR prep details",
        from: "it.ops@acme.example",
        body: "Current storage runs above 80 percent and DR needs are growing. Restriction: no new rack space this quarter.",
        receivedAt: addDays(now, -2),
        assignedBy: "lizi.singletary@nutanix.com",
        assignedAt: addDays(now, -1),
        summary: "Storage pressure and DR expansion request.",
        extractedJson: JSON.stringify(["storage_pressure", "dr_interest", "facility_restriction"]),
      },
      {
        threadId: "t-unassigned-001",
        messageId: "m-unassigned-001",
        subject: "Question about licensing alignment",
        from: "platform.owner@betafin.example",
        body: "Can we review license alignment against current deployed cores?",
        receivedAt: addDays(now, -1),
      },
    ],
  });

  await prisma.customerContext.create({
    data: {
      meetingId: acmeMeeting.id,
      dealId: alphaDeal.id,
      customerCandidates: JSON.stringify(["Acme Manufacturing"]),
      notes: "Support case review required before QBR.",
      openDeals: JSON.stringify(["Capacity refresh", "DR scoping"]),
      sizerRuns: JSON.stringify(["run_2026_01_acme"]),
      confidenceScore: 0.88,
    },
  });

  const requirement = await prisma.environmentRequirement.create({
    data: {
      dealId: alphaDeal.id,
      rawText:
        "Customer has no rack expansion this quarter, storage utilization is high, and requests DR for critical workloads.",
      extractedConstraints: JSON.stringify([
        "no_new_rack_space",
        "high_storage_utilization",
        "dr_required_for_critical_workloads",
      ]),
      prerequisites: JSON.stringify(["Validate node density options", "Confirm DR target site"]),
      restrictions: JSON.stringify(["Limited datacenter space"]),
      workloadHints: JSON.stringify(["Mixed VM workloads", "Critical database tier"]),
    },
  });

  await prisma.sizingRecommendation.create({
    data: {
      dealId: alphaDeal.id,
      inputRequirementIds: JSON.stringify([requirement.id]),
      suggestedConfig: JSON.stringify({
        nodeCount: 6,
        storageTier: "All-flash",
        drMode: "Async DR",
        notes: "Recommend denser nodes due to rack limitation.",
      }),
      ruleMatches: JSON.stringify([
        "Storage utilization above 75% suggests expansion planning",
        "DR requirement favors dual-site design",
      ]),
      riskFlags: JSON.stringify(["Confirm WAN bandwidth for DR replication"]),
      confidenceScore: 0.82,
    },
  });

  await prisma.qBRArtifact.create({
    data: {
      dealId: alphaDeal.id,
      accountName: alphaDeal.accountName,
      source: "manual_upload",
      fileUri: "file://internal/acme_qbr_q1.pptx",
      generatedAt: now,
      uploadedBy: "lizi.singletary@nutanix.com",
      guideChecklistVersion: "jan_2026_health_check_guide",
    },
  });

  await prisma.qBRChecklistItem.createMany({
    data: [
      {
        dealId: alphaDeal.id,
        sectionKey: "summary",
        title: "Review active clusters, VM count, open cases, and uptime.",
        status: QBRItemStatus.IN_PROGRESS,
        notes: "Need final support-case status from AM.",
        recommendedTalkTrack: "Highlight strong uptime, then transition to utilization concerns.",
      },
      {
        dealId: alphaDeal.id,
        sectionKey: "feature_adoption",
        title: "Confirm adoption for compression, dedupe, EC, and DR.",
        status: QBRItemStatus.TODO,
        notes: "",
        recommendedTalkTrack: "Connect feature gaps to customer outcomes and workshop offer.",
      },
      {
        dealId: alphaDeal.id,
        sectionKey: "versions_support",
        title: "Validate AOS/Hypervisor version versus EOM/EOS dates.",
        status: QBRItemStatus.TODO,
        notes: "",
        recommendedTalkTrack: "Frame upgrade as risk reduction and feature enablement.",
      },
    ],
  });

  await prisma.contextEvidence.createMany({
    data: [
      {
        sourceSystem: "internal_seed",
        sourceId: "seed-context-alpha",
        lastSyncedAt: now,
        confidenceReason: "Seeded from baseline fixture for foundation workflow.",
      },
      {
        sourceSystem: "internal_seed",
        sourceId: "seed-qbr-guide",
        lastSyncedAt: now,
        confidenceReason: "Checklist generated from Health Check Guide sections.",
      },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
