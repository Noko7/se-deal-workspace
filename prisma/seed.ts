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
      whyNow:
        "Three aging vSphere 7 clusters (~180 cores, all-flash) are sustained above 80% storage utilization with no new rack space approved this quarter. The Broadcom/VMware support contract renews in roughly five months and the renewal quote is expected to jump sharply under the new per-core subscription model. Acme wants to consolidate onto a denser platform and add async DR before the primary datacenter runs out of space. Planning a phased approach: refresh the Chicago datacenter first with a 3-node cluster, add a 2-node cluster at the Dallas DR site, then fold in the remaining workloads once phase 1 is validated. Capital for phase 1 is likely this quarter; the broader refresh depends on next FY budget.",
      whyNutanix:
        "Denser nodes reclaim rack space and a single platform (compute + storage + native async DR) removes the separate replication appliance and simplifies operations versus a like-for-like VMware refresh. Dana Whitfield, Director of Infrastructure, is the technical decision maker and is motivated by getting ahead of the growing VMware renewal cost and reducing the operational load on a small ops team. Values Prism Central as one management plane across both sites.",
      technicalDecisionMaker: "Dana Whitfield (Director of Infrastructure)",
      nextStepsToClose:
        [
          "Next Steps to Close",
          "Jun 24, 2026 11:15 AM LS: Discovery kickoff onsite in Chicago. Confirmed the three vSphere clusters and the 80%+ storage wall. Dana wants consolidation plus async DR on one platform. Requested a Nutanix Collector run and RVTools export to build an initial sizing profile. Scheduled the QBR to present findings.",
          "",
          "Jun 10, 2026 2:00 PM LS: Intro call following a CDW referral. Acme is facing a large VMware renewal in ~5 months and is out of rack space. Agreed to run a discovery workshop before the QBR.",
          "",
          "Next Steps Last Updated",
          "6/24/2026 11:15 AM",
          "",
          "Open next steps:",
          "- Complete the Collector/RVTools analysis and right-size the consolidation",
          "- Present sizing and a phased async-DR plan at the QBR",
          "- Align with CDW on an early-renewal bundle to counter the Broadcom increase",
        ].join("\n"),
      outcome:
        [
          "Outcome: Consolidate three aging vSphere clusters onto a denser Nutanix platform and add native async DR before running out of datacenter space; retire the like-for-like VMware refresh path.",
          "",
          "Notes:",
          "Jun 24, 2026 LS - Currently running a 3-node vSphere 7 cluster (~180 cores, all-flash) at Chicago HQ with no automated DR to the Dallas site today. Failover is manual and has not been tested this year.",
          "",
          "Jun 18, 2026 MW - Storage alerts firing weekly above 80%. No budget approved for additional SAN shelves; leadership prefers a platform change over buying more storage.",
          "",
          "Done:",
          "- Kick off discovery and confirm current-state inventory",
        ].join("\n"),
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
      whyNow:
        "Dual-site vSphere estate (~640 cores) relies on array-based replication that is nearing end of support, and current RPO for the core banking tier sits around 30 minutes. Leadership has approved DR-modernization budget for this fiscal year and the decision committee meets in two weeks, so timing is tight. Beta wants sub-15-minute RPO and tested, one-click failover for tier-1 systems across both sites. Planning a 4-node production cluster at the primary datacenter and a 3-node cluster at the DR site sized for the protected set, with the option to expand into files/objects later. Budget is committed for this FY.",
      whyNutanix:
        "Native async DR and NearSync deliver the sub-15-minute RPO without a separate replication appliance, and a single management plane reduces operational overhead. Immutable snapshots address the security team's ransomware concern. Robert Langley, VP of Infrastructure, is the technical decision maker; he wants to retire the aging array-based replication and prove tested failover to satisfy auditors. Prefers native Recovery Plans over the incumbent VCF path.",
      technicalDecisionMaker: "Robert Langley (VP of Infrastructure)",
      technicalCloseDate: addDays(now, 9),
      nextStepsToClose:
        [
          "Next Steps to Close",
          "Jun 20, 2026 4:30 PM JK: Sync'd with WWT. Sent the updated DR reference architecture and BOM for the 4-node/3-node design. Security asked for the immutable-snapshot enforcement write-up before endorsing. Committee readout scheduled.",
          "",
          "May 28, 2026 1:15 PM JK: Design review comparing sync vs. async and NearSync for the sub-15-minute tier. Confirmed the tier-1 app list with the backup lead; the remaining dependency is WAN bandwidth between sites.",
          "",
          "Apr 30, 2026 10:30 AM JK: Delivered the async DR design and walked the team through native Protection Policies and one-click test failover. 6 attendees from infrastructure, security, and DBA. Tasked to confirm the WAN pipe and gather tier-1 backup windows.",
          "",
          "Mar 12, 2026 9:00 AM JK: Discovery on the dual-site estate and the end-of-support array replication. RPO target set at under 15 minutes for core banking. Requested a Collector run and the current replication topology.",
          "",
          "Next Steps Last Updated",
          "6/20/2026 4:30 PM",
          "",
          "Open next steps:",
          "- Confirm WAN bandwidth to finalize NearSync feasibility for the sub-15-minute tier",
          "- Deliver the immutable-snapshot / ransomware write-up to the security team",
          "- Present the DR modernization plan to the decision committee",
        ].join("\n"),
      outcome:
        [
          "Outcome: Modernize disaster recovery for the core banking tier to sub-15-minute RPO with tested one-click failover, retiring the end-of-support array-based replication.",
          "",
          "Notes:",
          "Jun 20, 2026 JK - Dual-site vSphere (~640 cores). Array-based replication is out of support next year; RPO today is ~30 minutes and failover has never been fully tested end to end.",
          "",
          "May 15, 2026 MW - Security's top concern is an immutable / air-gapped recovery copy; nightly Veeam to a dedup appliance is not sufficient. Snapshot immutability is the gate for their sign-off.",
          "",
          "Done:",
          "- Run Nutanix Collector & analyze the replication topology",
          "- Deliver the DR architecture deep dive and native failover demo",
        ].join("\n"),
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
      whyNow:
        "Clinical VDI demand is outpacing the current Citrix-on-vSphere environment and the Citrix term ends soon; the plan is to grow to roughly 2,000 clinical desktops. Recent licensing changes make the incumbent stack materially more expensive. The POC cluster has validated VDI density with headroom, and validation success unlocks a multi-year expansion. Phase 1 lands the initial clinical pool on EUC on AHV; the remaining seats follow in waves once the security segmentation review passes. Order is expected this quarter contingent on security sign-off.",
      whyNutanix:
        "EUC on AHV delivers validated VDI density with headroom and removes the separate hypervisor and broker licensing overhead of the Citrix-on-VMware stack, with simpler day-2 operations. Carlos Mendoza, Director of End-User Computing, is the technical decision maker and is focused on predictable login-storm performance and a clean network-segmentation story for the clinical VLANs. Security sign-off on Flow segmentation is the gating item.",
      technicalDecisionMaker: "Carlos Mendoza (Director of End-User Computing)",
      technicalCloseDate: addDays(now, 5),
      nextStepsToClose:
        [
          "Next Steps to Close",
          "Jun 26, 2026 11:15 AM PN: Sync'd with Presidio. POC success criteria met; BOM attached and X-Ray results shared. Waiting on the security team's segmentation sign-off, which is the only remaining gate before the expansion order. Finalizing the multi-year quote.",
          "",
          "Jun 05, 2026 3:45 PM PN: Delivered the Flow Network Security segmentation design for the clinical VLANs to the security architect. Ran X-Ray to validate density and login-storm behavior at target seat counts.",
          "",
          "May 08, 2026 1:15 PM PN: POC readout - VDI density hit target with headroom on the validation cluster. Sized the initial clinical pool and the golden-image approach. 7 attendees across EUC, security, and clinical ops.",
          "",
          "Apr 02, 2026 10:30 AM PN: Stood up the POC cluster and imported representative desktop pools. Confirmed FSLogix profiles carry over. Tasked to produce the segmentation design before security will engage.",
          "",
          "Feb 20, 2026 9:00 AM PN: Discovery on the Citrix-on-vSphere estate (~2,000 desktops planned) and the licensing changes. Agreed to a POC focused on clinical VDI density and login-storm handling.",
          "",
          "Next Steps Last Updated",
          "6/26/2026 11:15 AM",
          "",
          "Open next steps:",
          "- Obtain security sign-off on the Flow segmentation design (final gate)",
          "- Confirm POC success-criteria acceptance in writing",
          "- Finalize the multi-year expansion order with Presidio",
        ].join("\n"),
      outcome:
        [
          "Outcome: Expand clinical VDI to ~2,000 seats on Nutanix EUC (AHV), displacing the Citrix-on-VMware stack, once the security segmentation review passes.",
          "",
          "Notes:",
          "Jun 05, 2026 PN - POC validated density with headroom; login-storm behavior held at target under X-Ray. Persistent-desktop migration would follow the initial clinical pool in waves.",
          "",
          "Mar 18, 2026 MW - Security flagged network segmentation for the clinical VLANs as the primary gate. FSLogix profile management stays as-is to reduce migration risk.",
          "",
          "Done:",
          "- Run Nutanix Collector & analyze RVTools",
          "- Deliver architectural deep dive and EUC/AHV demo",
          "- Stand up the POC cluster and validate density with X-Ray",
          "- Generate the initial BOM and budgetary quote",
        ].join("\n"),
      intendToUseForNc2: false,
      bomAttached: true,
      xrayUsed: true,
    },
  });

  // Additional opportunities for the three featured accounts so each shows a
  // multi-opp history (old closed-won + current expansion) in the Account-AI
  // brain. Meetings/notes stay on the primary opps above.
  const featuredSiblings = [
    {
      accountName: "Acme Manufacturing",
      owner: "Lizi Singletary",
      opps: [
        {
          name: "Acme Initial NCI Footprint",
          stage: "Closed Won",
          amount: 180000,
          technicalCloseStatus: "100",
          closeDate: new Date(2021, 4, 18),
          isClosed: true,
          forecastCategory: "Closed",
          nextAction: "Closed - in production",
          whyNow: "First Nutanix purchase that replaced a single aging vSphere cluster at Chicago HQ; in production since 2021.",
          outcome: "Outcome: Won. Deployed a 4-node NCI Pro cluster in 2021; this is the reference footprint the current consolidation builds on.",
        },
        {
          name: "Acme Files & Objects Expansion FY26",
          stage: "Discovery",
          amount: 240000,
          technicalCloseStatus: "25",
          closeDate: new Date(2026, 9, 30),
          isClosed: false,
          forecastCategory: "Pipeline",
          nextAction: "Scope unstructured-data growth for Files/Objects",
          whyNow: "Manufacturing plant data and CAD shares are outgrowing the legacy NAS. Evaluating Nutanix Files/Objects on the existing cluster after the core consolidation lands.",
          outcome: "Outcome: Consolidate unstructured data onto Nutanix Unified Storage alongside the consolidated compute.\n\nNext steps:\n- Size Files/Objects for 24-month growth\n- Confirm SMB/NFS and quota requirements with the storage team",
        },
      ],
    },
    {
      accountName: "Beta Financial",
      owner: "Jordan Kim",
      opps: [
        {
          name: "Beta Initial Core Banking Cluster",
          stage: "Closed Won",
          amount: 520000,
          technicalCloseStatus: "100",
          closeDate: new Date(2020, 10, 3),
          isClosed: true,
          forecastCategory: "Closed",
          nextAction: "Closed - in production",
          whyNow: "Original core-banking virtualization purchase; live across both datacenters since 2020.",
          outcome: "Outcome: Won. Deployed dual-site NCI Ultimate clusters in 2020; the DR modernization opp extends this footprint.",
        },
        {
          name: "Beta NDB Consolidation FY26",
          stage: "Design",
          amount: 310000,
          technicalCloseStatus: "50",
          closeDate: new Date(2026, 7, 14),
          isClosed: false,
          forecastCategory: "Best Case",
          nextAction: "Run NDB demo against a representative SQL workload",
          whyNow: "Database sprawl across the core-banking estate is straining the DBA team. Evaluating NDB to automate provisioning and patching on the existing Nutanix platform.",
          outcome: "Outcome: Consolidate database provisioning onto NDB.\n\nNext steps:\n- Deliver NDB demo to the DBA team\n- Confirm Oracle licensing placement",
        },
      ],
    },
    {
      accountName: "Gamma Healthcare",
      owner: "Priya Nadar",
      opps: [
        {
          name: "Gamma Initial VDI Pilot",
          stage: "Closed Won",
          amount: 150000,
          technicalCloseStatus: "100",
          closeDate: new Date(2022, 2, 22),
          isClosed: true,
          forecastCategory: "Closed",
          nextAction: "Closed - in production",
          whyNow: "First EUC pilot that proved clinical VDI on Nutanix; live since 2022 and the basis for the current 2,000-seat expansion.",
          outcome: "Outcome: Won. Deployed the initial 3-node EUC pilot in 2022; validated the density story the expansion relies on.",
        },
        {
          name: "Gamma Clinical Files Expansion FY26",
          stage: "Discovery",
          amount: 130000,
          technicalCloseStatus: "-",
          closeDate: new Date(2026, 11, 15),
          isClosed: false,
          forecastCategory: "Pipeline",
          nextAction: "Discovery on clinical imaging storage growth",
          whyNow: "Clinical imaging archives are growing quickly. Early discovery on Nutanix Files for the imaging shares once the VDI expansion closes.",
          outcome: null,
        },
      ],
    },
  ];
  for (const account of featuredSiblings) {
    for (const opp of account.opps) {
      const created = await prisma.deal.create({
        data: {
          name: opp.name,
          accountName: account.accountName,
          stage: opp.stage,
          owner: account.owner,
          nextAction: opp.nextAction,
          latestSignal: null,
          amount: opp.amount,
          acvAmount: Math.round(opp.amount / 3 / 1000) * 1000,
          servicesAcv: Math.round((opp.amount * 0.08) / 1000) * 1000,
          technicalCloseStatus: opp.technicalCloseStatus,
          closeDate: opp.closeDate,
          isClosed: opp.isClosed,
          forecastCategory: opp.forecastCategory,
          whyNow: opp.whyNow,
          outcome: opp.outcome,
        },
      });

      // Every featured sibling opp gets its own activity trail so its deal
      // workspace never opens empty.
      const ownerEmail = `${account.owner.toLowerCase().replace(/[^a-z]+/g, ".")}@nutanix.com`;
      const domain = `${account.accountName.toLowerCase().replace(/[^a-z]+/g, "")}.example`;
      const meetingStart = opp.isClosed
        ? new Date(opp.closeDate.getFullYear(), opp.closeDate.getMonth(), Math.max(1, opp.closeDate.getDate() - 21), 10, 0, 0)
        : addDays(now, 4 + (opp.name.length % 8));
      const meeting = await prisma.meeting.create({
        data: {
          source: "internal_seed",
          subject: opp.isClosed ? `Deployment Wrap-Up - ${opp.name}` : `${opp.stage} Sync - ${opp.name}`,
          organizer: ownerEmail,
          startTime: meetingStart,
          endTime: new Date(meetingStart.getTime() + 60 * 60 * 1000),
          attendeesJson: JSON.stringify([
            { email: `it@${domain}`, displayName: `${account.accountName} IT` },
            { email: ownerEmail, displayName: account.owner },
          ]),
          externalDomains: domain,
          dealId: created.id,
        },
      });
      await prisma.meetingNote.create({
        data: {
          dealId: created.id,
          meetingId: meeting.id,
          role: "SE",
          author: ownerEmail,
          body: opp.isClosed
            ? `Deployment wrap-up for ${opp.name}: cluster live, handover complete, customer sign-off received. Reference footprint for the account's current opportunities.`
            : `Working notes for ${opp.name}: ${opp.nextAction}. ${opp.whyNow ?? ""}`.trim(),
        },
      });
    }
  }

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

  // Accounts that have opted out of AI usage at Nutanix. They stay visible in
  // the tool but Account-AI is locked for them: no chat, no ingestion into the
  // model, and they are excluded from the portfolio knowledge base.
  const aiOptedOutCompanies = new Set<string>([
    "Gringotts Bank",
    "Ironclad Insurance",
    "Sentinel Defense Systems",
  ]);

  // --- Deliberately messy, ~1-hour Zoom transcripts + clean AI summaries -----
  // A handful of accounts get a full "deep dive" recording so the Account-AI
  // brain has substantial, realistic source material. The transcripts mimic real
  // recorded discovery calls: filler words, cross-talk, self-corrections, and
  // tangents. Each is paired with the polished Zoom AI summary + notes that Zoom
  // would auto-generate. All fabricated.
  type DeepDive = { subject: string; summary: string; notes: string; transcript: string };
  const deepDives: DeepDive[] = [
    {
      subject: "Technical Deep Dive - VMware Exit & AHV Migration",
      summary:
        "Nutanix (Marcus, SE; Lizi, AE) ran a ~60 minute technical deep dive with the infrastructure team (Ted, Dir. Infrastructure; Sandra, Virtualization Ops; Raj, Networking) on migrating off VMware/vSphere onto Nutanix AOS/AHV.\n\nKey points:\n- Current state is three vSphere 7 clusters, roughly 42 hosts and about 900 VMs, on aging Dell rackmount plus an all-flash SAN that is ~85% full.\n- The Broadcom renewal quote came in roughly 3x prior spend and moved to a per-core subscription; this is the primary event driving the review.\n- Main technical concerns are the migration cutover risk for a handful of latency-sensitive SQL and MES workloads, and re-platforming their NSX micro-segmentation.\n- Team was comfortable that Nutanix Move handles the bulk of general-purpose VMs with minimal downtime; the SQL Always-On group needs a phased plan.\n- Flow Network Security was discussed as the segmentation replacement; Raj wants a mapping of existing NSX rules before committing.\n\nAction items:\n- Nutanix to build a side-by-side 3-year TCO against the Broadcom renewal quote.\n- Sandra to export the vSphere inventory (RVTools) for right-sizing.\n- Raj to share the current NSX rule set for a Flow mapping exercise.\n- Schedule a follow-on Move migration planning workshop.",
      notes:
        "Drivers: Broadcom renewal ~3x, SAN ~85% full, hardware aging. Move covers general-purpose VMs. Watch: SQL Always-On group + NSX micro-seg re-platform. Next: TCO vs renewal, RVTools export, NSX rule export, Move workshop.",
      transcript:
        "[00:00] Marcus (Nutanix): Alright, I think we've got everyone. Ted, Sandra, Raj, thanks for the hour. Can everybody hear me okay?\n[00:07] Ted: Yep, loud and clear.\n[00:09] Sandra: Yeah we're good.\n[00:12] Marcus: Cool. So, um, the goal today, we just want to actually get into the weeds a bit on the environment and where the pain is, and then talk through what a move to AHV actually looks like. Lizi's on too for the commercial side.\n[00:26] Lizi (Nutanix): Hey everyone, yeah I'll mostly listen.\n[00:31] Ted: Sounds good. So, uh, where do you want to start.\n[00:35] Marcus: Let's just start with current state. What are we running today.\n[00:41] Sandra: So we've got three vSphere clusters, all 7.0, uh, U3 I think. One's the general prod cluster, one is kind of DB and, um, MES, manufacturing stuff, and then there's a smaller one for like edge and test.\n[01:04] Marcus: Okay and how many hosts total roughly.\n[01:08] Sandra: Uh... forty two? Ted does that sound right.\n[01:12] Ted: Forty-ish, yeah. Some of those Dells are, honestly, they're end of life this year.\n[01:19] Marcus: Got it. And storage, that's a SAN?\n[01:23] Sandra: All-flash SAN, yeah. It's, um, it's getting full. Like we're at eighty five percent and I keep getting the alerts, it's annoying.\n[01:33] Ted: That's actually part of why we're even talking. We either buy more shelves or we do something different.\n[01:41] Marcus: Right. And the big one, the renewal. What did that come back at.\n[01:47] Ted: Ugh. So, okay, the Broadcom thing. Our renewal, uh, it basically tripled. And it's per core now, so with these newer high-core CPUs it just, it explodes.\n[02:02] Lizi: Do you have the actual quote number, or a range is fine.\n[02:06] Ted: I can send it. It's, uh, it's a big number. Let's say three x what we paid.\n[02:13] Marcus: Yeah that lines up with what we're hearing everywhere honestly. Okay so let me, let me ask about the VMs. About how many, and what's the mix.\n[02:24] Sandra: Around nine hundred VMs. Mostly Windows, a bunch of general app servers, um, some Linux, and then the important stuff is the SQL cluster and the MES.\n[02:37] Marcus: When you say SQL cluster, is that Always-On availability groups?\n[02:41] Sandra: Yeah, Always-On, two node, and it's latency sensitive, the plant floor screams if that hiccups.\n[02:49] Raj (Networking): And it's segmented. That whole zone is locked down in NSX.\n[02:54] Marcus: Okay that's, that's the thing I wanted to get to, the NSX piece. Raj how heavily are you using it.\n[03:01] Raj: Pretty heavily. Micro-seg, um, a few hundred rules, distributed firewall. It took us like a year to get it right so I'm not thrilled about redoing it.\n[03:13] Marcus: Totally fair. So on our side that maps to Flow Network Security. It's built into AHV, there's no separate NSX-style license or edge appliances. But I'm not going to sit here and pretend the rules just magically port. What we'd do is take an export of your current rule set and map it.\n[03:33] Raj: Can you actually import them or is it manual.\n[03:37] Marcus: It's, honestly it's mostly a mapping exercise. Some of it we can script from the export, some of the more custom stuff is manual. I'd rather be straight with you on that.\n[03:48] Raj: Okay. I appreciate that actually.\n[03:51] Ted: So the migration itself. That's the scary part for me. Nine hundred VMs.\n[03:57] Marcus: Yeah so this is where Move comes in. It's our free migration tool. It does the replication in the background while the VM is still running on vSphere, then you do a cutover window and it's usually minutes of downtime per VM, sometimes seconds.\n[04:14] Sandra: Wait, so it's agentless? We don't touch every guest?\n[04:18] Marcus: For most of them, agentless, yeah. Windows and the common Linux distros. Uh, it injects the drivers on cutover.\n[04:27] Sandra: That's, okay that's better than I thought.\n[04:30] Ted: But not the SQL cluster.\n[04:33] Marcus: The SQL Always-On, I'd treat that differently. You don't really \"migrate\" an availability group with a lift and shift, you'd stand up new nodes on AHV, join them to the AG, let it sync, and then fail over. So it's more of an application-level move. Zero downtime basically if you do it right.\n[04:53] Ted: Huh. Okay that's smarter, yeah.\n[04:57] Marcus: The MES, who owns that app, is that a vendor thing.\n[05:02] Sandra: It's a vendor app, we'd have to loop them in, they're kind of, um, particular about \"supported\" configs.\n[05:10] Marcus: Right, we run into that. Usually it's fine because to the guest OS it just looks like a VM, but yeah we should get their sign off early so it doesn't stall you at the end.\n[05:22] Ted: Noted. Sandra can you own that.\n[05:25] Sandra: Yeah I'll reach out to them.\n[05:28] Lizi: Can I jump in on timeline real quick. Ted when does the renewal actually have to be decided.\n[05:35] Ted: We've got, uh, about five months before it lapses. But procurement wants a recommendation way before that.\n[05:43] Lizi: Okay. That's, that's tight but very doable. We can have a TCO and a migration plan to you in a couple weeks.\n[05:51] Ted: The TCO is going to matter a lot to my CFO. He only cares about the number.\n[05:57] Marcus: Understood. We'll do a real three year, hardware plus software plus support, against your Broadcom renewal, not a hand-wavy one.\n[06:07] Ted: Good.\n[08:12] Marcus: Okay let me share my screen for a sec and show you what a cluster would actually look like sized for this... can you see the Prism thing?\n[08:20] Sandra: Yeah.\n[08:22] Marcus: So this is Prism Central, one pane for everything, and, um... [inaudible] ...you'd be looking at probably, ballpark, a cluster that consolidates those forty hosts down to, I'd guess low twenties on newer nodes, but I want your RVTools before I commit to a number.\n[08:41] Sandra: I can pull RVTools, that's easy.\n[12:30] Raj: Question, does Flow do the logging, like can I see hits per rule, because that's how I audit today.\n[12:38] Marcus: Yeah there's visualization and you can see flows between VMs, and it logs. I'll show you in the follow up, I don't want to fumble it live.\n[12:47] Raj: Fair.\n[18:05] Ted: What about, um, our backup. We use Veeam.\n[18:09] Marcus: Veeam fully supports AHV, so you keep Veeam, that doesn't change. Some folks also use our native snapshots plus a target, but you don't have to rip out Veeam.\n[18:21] Ted: Oh good, because we just renewed that.\n[24:40] Sandra: What about GPU, we have a couple boxes doing some vision inspection on the line.\n[24:47] Marcus: AHV does vGPU, yeah. How many and what cards.\n[24:52] Sandra: Just two hosts, uh, I'd have to check the card model.\n[24:57] Marcus: Send it over, we'll make sure it's on the supported list, most of the common NVIDIA ones are.\n[31:15] Ted: Okay I'm going to be honest about the elephant in the room. My team knows vSphere. Retraining.\n[31:23] Marcus: Yeah. So, most vSphere admins are productive on Prism in like a day, it's genuinely simpler, fewer moving parts, no separate vCenter, SAN, fabric to babysit. We also do enablement as part of onboarding. I won't pretend there's zero learning but it's not a six month thing.\n[31:44] Sandra: Honestly the SAN is half my week so if that goes away I'm fine.\n[31:50] Ted: [laughs] noted.\n[41:20] Lizi: So next steps, let me make sure I've got them. We do the TCO versus the Broadcom quote. Ted you're sending the quote. Sandra RVTools export and you loop in the MES vendor. Raj you send the NSX rule set for the Flow mapping. And then we book a Move planning workshop.\n[41:42] Ted: That's right.\n[41:45] Raj: I'll get the rules to you, might be end of week.\n[41:49] Sandra: RVTools I can do tomorrow.\n[47:55] Ted: How long, start to finish, realistically, for the whole migration.\n[48:02] Marcus: For nine hundred VMs, phased, I'd say a few months of actual migration work once we start, but a lot of it is background replication so it's not nine hundred outage windows. The SQL and MES we schedule carefully. I'll put a real phased timeline in the plan.\n[48:20] Ted: Okay. That works.\n[56:30] Marcus: Anything else on your minds before we drop.\n[56:34] Sandra: No I think that covered a lot honestly.\n[56:38] Raj: I'm good.\n[56:40] Ted: Yeah thanks, this was useful. Send the stuff over and we'll, uh, we'll get you what you need.\n[56:47] Lizi: Perfect, thanks everyone, we'll follow up today with a recap.\n[56:52] Marcus: Thanks all, talk soon.",
    },
    {
      subject: "Technical Deep Dive - DR & Ransomware Resilience",
      summary:
        "Nutanix (Priya, SE; Jordan, AE) met with the customer team (Dana, VP Infrastructure; Kevin, Backup/DR Lead; Nia, Security) for ~1 hour on disaster recovery and ransomware resilience after a recent scare at a peer organization.\n\nKey points:\n- Two sites: primary datacenter and a colo ~120 miles away used mostly for backup, not true DR.\n- RPO/RTO today is loosely defined; leadership now wants RPO under 15 minutes and RTO under 2 hours for tier-1 clinical/finance systems.\n- Current backup is Veeam to a dedup appliance; there is no immutable/air-gapped copy, which Security flagged as the top risk.\n- Discussed Nutanix native DR (Protection Policies, async + NearSync) to the colo, plus immutable snapshots and Ransomware detection in Data Lens / Files.\n- Nia (Security) is the key skeptic and gate: wants proof of immutability and a documented recovery runbook before endorsing.\n\nAction items:\n- Nutanix to gather WAN bandwidth between sites to confirm NearSync feasibility for the sub-15-minute RPO tier.\n- Kevin to list tier-1 apps and current backup windows.\n- Provide Nia an immutability + ransomware detection overview and a sample recovery runbook.\n- Scope a small DR pilot to the colo.",
      notes:
        "Goal: RPO <15m, RTO <2h for tier-1. Gap: no immutable/air-gapped copy (Security's #1 concern). Native DR async+NearSync to colo + immutable snapshots + Data Lens ransomware detection. Blocker: Security (Nia) sign-off. Next: WAN bandwidth, tier-1 app list, immutability overview + runbook, DR pilot.",
      transcript:
        "[00:00] Priya (Nutanix): Hi everyone, thanks for making time. I know calendars are brutal. Can you all hear me.\n[00:08] Dana: Yes we can.\n[00:10] Kevin: Yep.\n[00:12] Priya: Great. So, um, Jordan and I wanted to really focus this on DR and honestly the ransomware angle, because I know that's, that's kind of front of mind right now.\n[00:24] Dana: It really is. So you probably heard, one of our, uh, a peer health system basically got hit a few weeks ago and it was ugly, they were down for like eleven days.\n[00:36] Nia (Security): Ten or eleven, yeah. And what got them wasn't just the encryption, it's that the backups got hit too. That's the part that keeps me up.\n[00:46] Priya: Yeah. That's, unfortunately that's the pattern now, they go for the backups first. Okay so let me understand what you have today. Two sites right?\n[00:57] Dana: Two. Primary here, and we have a colo about, what is it, a hundred and twenty miles out.\n[01:05] Kevin: Hundred twenty, yeah. But I'll be honest the colo is really just where backups land. It's not, we couldn't run production there today. Not really.\n[01:16] Priya: Okay, so it's a backup target, not a DR site. That's super common. What's the backup stack.\n[01:24] Kevin: Veeam, to a dedup appliance at the colo. Runs nightly, some of the important stuff every few hours.\n[01:33] Nia: And that's the problem, right? It's a network share basically. If something gets domain admin, that appliance is reachable. There's no, there's nothing air gapped.\n[01:44] Priya: Right. So no immutable copy today.\n[01:48] Nia: No. And that's my number one thing. I don't, frankly I don't care about anything else on this call as much as I care about that.\n[01:57] Priya: That's fair, and I want to come back to that specifically because we have a real answer for it. Um, first though, Dana, from the leadership side, what are the actual targets now. Like has someone put a number on RPO, RTO.\n[02:13] Dana: So before this, honestly, it was fuzzy. Now? Leadership is saying tier one, the clinical systems and the finance stuff, they want, um, fifteen minutes RPO and back up within two hours.\n[02:28] Priya: Fifteen minute RPO for tier one. Okay. And RTO two hours. That's aggressive but it's doable, it just depends on a couple things.\n[02:38] Kevin: Nightly Veeam obviously doesn't get us there.\n[02:41] Priya: No, nightly is a twenty four hour RPO in the worst case, yeah. So the way we'd think about it, on Nutanix there's native DR built in, it's not a bolt-on product. You set Protection Policies, and for that fifteen minute tier you'd use what we call NearSync, which does like a one to fifteen minute RPO using lightweight snapshots.\n[03:04] Kevin: And that replicates to the colo.\n[03:07] Priya: To the colo, yeah, if there's Nutanix on both ends. For the less critical stuff you'd just do async, hourly or whatever makes sense, saves bandwidth.\n[03:18] Kevin: Speaking of, bandwidth might be my issue. I don't actually know what the pipe between sites is off the top of my head.\n[03:26] Priya: That's, yeah, that's the big dependency for NearSync. We should get that number. If the fifteen minute tier is a reasonable subset of data, the bandwidth is usually fine, but we should confirm not guess.\n[03:39] Kevin: I'll pull it. I think it's a ten gig wave but I'm not certain, could be less committed.\n[03:46] Priya: Perfect, that's an action. Okay Nia, the immutability, let me actually address you directly.\n[03:53] Nia: Please.\n[03:55] Priya: So our snapshots can be made immutable, meaning even an admin, even someone with full cluster admin, cannot delete or modify them before the retention expires. It's not a setting you can just toggle off in the moment. That's the whole point.\n[04:12] Nia: Okay but walk me through, if an attacker has domain admin and cluster admin, they can't touch it. How. Because everybody says that.\n[04:22] Priya: Right, I know, everyone says it. So the retention lock is enforced at the storage layer, not by AD, not by the hypervisor. So compromising Windows domain doesn't get you there. And we'd set it so there's a minimum locked retention. I'll get you the actual technical write up on the enforcement, because you should verify it, not take my word.\n[04:44] Nia: Yeah I will. But that's, if that holds up that's a big deal for me.\n[04:49] Priya: There's also, on the Files side, if you're using our file storage, there's Data Lens which does ransomware detection, it watches for the, you know, mass-encryption behavior patterns and can block the offending client and alert. So it's detection plus the immutable recovery point.\n[05:08] Nia: Detection is nice but recovery is what matters. If I have a clean immutable copy from twelve minutes ago I don't care that much about detection.\n[05:17] Priya: Honestly, agreed, the immutable copy is the thing.\n[09:30] Dana: Priya can we talk about the recovery side, the actual failover. Because two hours RTO, how does that work operationally, is it a button.\n[09:40] Priya: So you build a Recovery Plan, which is basically the runbook, the boot order, network mapping, and you can do a one click failover, and importantly you can test failover without impacting production. That test piece is, for an auditor, that's gold.\n[09:58] Nia: We get audited on DR testing and we always scramble for evidence.\n[10:03] Priya: Yeah, the test failover generates a report. Auditors love it.\n[15:45] Kevin: What about the existing Veeam, are you saying rip it out.\n[15:50] Priya: No, not necessarily. A lot of folks keep Veeam for long term retention and use native DR for the fast RPO tier. They solve different problems. I wouldn't tell you to throw away something that works.\n[16:02] Kevin: Okay good, because we just, we have years on that appliance.\n[22:10] Dana: What does a pilot look like. I don't want to boil the ocean.\n[22:16] Priya: I'd pick a small but real tier one app, protect it with NearSync to the colo, turn on immutability, and do a test failover with Nia watching. Small scope, proves the whole chain.\n[22:30] Nia: I'd want to be in that.\n[22:32] Priya: I'd insist on it honestly.\n[33:05] Dana: The colo hardware, we'd need Nutanix there too you said.\n[33:11] Priya: For NearSync replication yeah you'd want a cluster at the colo. It doesn't have to be identical to prod, it can be sized for the protected set, we can right-size it.\n[33:22] Kevin: So it's not a full second copy of everything.\n[33:26] Priya: Only what you choose to protect there. You tier it.\n[44:15] Jordan (Nutanix): Just on timing, is there a board or budget cycle we're working against.\n[44:22] Dana: After that peer incident, leadership wants a plan this quarter. Money is, uh, money is less of a fight than it was three months ago, frankly.\n[44:33] Jordan: Understood, we'll move quick then.\n[52:00] Priya: Let me recap the actions. Kevin gets me the WAN bandwidth between sites and the tier one app list with current backup windows. I get Nia the immutability enforcement write up and a sample recovery runbook, and the Data Lens overview. And we scope a small DR pilot to the colo with Nia involved. Did I miss anything.\n[52:24] Nia: That's the list. And, uh, I'll say, if the immutability holds up under my review I'm on board.\n[52:32] Dana: That's big coming from Nia [laughs].\n[52:36] Nia: [laughs] I'm the mean one, I know.\n[52:40] Priya: We appreciate the skepticism honestly, it makes the design better. Okay, thank you all, we'll get the recap out today.\n[52:48] Kevin: Thanks Priya.\n[52:50] Dana: Thank you.",
    },
    {
      subject: "Technical Deep Dive - VDI / EUC Expansion",
      summary:
        "Nutanix (Sofia, SE; Tom, AE) held a ~60 minute session with the end-user computing team (Elena, EUC Manager; Marcus, Desktop Engineering; Priya, Contact Center Ops) about expanding virtual desktops after Horizon licensing changes.\n\nKey points:\n- ~2,400 existing Horizon desktops, mostly persistent, plus a growing contact center that needs ~800 more non-persistent seats.\n- Horizon licensing/renewal changes and Broadcom uncertainty are pushing them to evaluate alternatives.\n- Interested in Nutanix EUC (on AHV) to remove the separate hypervisor + broker licensing overhead; discussed image management and login storm handling.\n- Contact center is the near-term driver: seasonal ramp, needs fast provisioning and predictable login performance.\n- GPU needed for a subset of knowledge-worker desktops (design/GIS).\n\nAction items:\n- Nutanix to build a density + 3-year cost comparison vs the Horizon renewal.\n- Elena to share current desktop pool definitions and profile management approach.\n- Scope a POC for the 800 non-persistent contact-center seats.\n- Confirm GPU card models for the knowledge-worker pool.",
      notes:
        "~2,400 Horizon desktops today + need ~800 non-persistent for contact center. Driver: Horizon licensing changes. Nutanix EUC on AHV removes hypervisor+broker overhead. Watch: login storms, profile mgmt, GPU pool. Next: density+cost vs Horizon renewal, pool export, POC for 800 seats, GPU card confirm.",
      transcript:
        "[00:00] Sofia (Nutanix): Hey everybody, thanks for the time. Give me a thumbs up if you can hear me okay.\n[00:07] Elena: We hear you.\n[00:09] Marcus: Yep good.\n[00:11] Sofia: Awesome. So, um, Tom and I wanted to dig into the desktop stuff today, the VDI, because I know the Horizon licensing thing kind of lit a fire.\n[00:22] Elena: [laughs] that's putting it mildly. Yeah so, the renewal came in and the model changed and it's, it's just a lot more, and nobody can tell us what it's going to look like in two years with all the, you know, the Broadcom stuff.\n[00:37] Sofia: Right. The uncertainty is almost worse than the number sometimes.\n[00:42] Elena: Exactly.\n[00:44] Sofia: Okay so tell me the current footprint. How many desktops.\n[00:49] Marcus: Right now about twenty four hundred. Most of them persistent, which, I know, I know, we've wanted to move off persistent for years but never had a reason to redo it.\n[01:01] Sofia: That's, honestly that's most shops. And what's driving the expansion, is there a new need.\n[01:08] Priya (Contact Center): That's me. So the contact center is growing and we do these big seasonal ramps, and provisioning new agents is painful right now, it takes, uh, it takes way too long. I need something like eight hundred more seats and they can be non-persistent, agents don't keep anything.\n[01:29] Sofia: Okay eight hundred non-persistent for the contact center, that's actually a really clean use case for this. And seasonal, so you want to spin up and spin down.\n[01:39] Priya: Yes, exactly, I don't want to pay for eight hundred all year if I need them four months.\n[01:45] Sofia: Right. So on Nutanix EUC, the way it works, the desktops run on AHV, our hypervisor, which is included, so you're not paying a separate hypervisor license and a separate broker stack the way you might be layering today.\n[02:01] Elena: That's the part that got my attention, because right now I'm paying for the hypervisor and Horizon on top.\n[02:08] Sofia: Yeah, it collapses that. Um, for non-persistent you'd use an instant-clone style model, so provisioning eight hundred is fast, and you manage one gold image.\n[02:20] Marcus: How does it handle, like, the morning login storm. Because that's our killer. Eight AM everybody logs in and storage just, it dies.\n[02:30] Sofia: Yeah the boot and login storm, that's the classic VDI killer. So because it's hyperconverged, the storage is local flash on every node, and it scales linearly as you add nodes, so you don't have that one SAN controller everybody's hammering. Instant clones also help because they share the base image.\n[02:51] Marcus: So more nodes literally means more storage performance.\n[02:55] Sofia: Correct, it scales with the cluster, that's kind of the whole point of HCI for VDI.\n[03:02] Marcus: Okay that's, yeah that's been our pain for years.\n[03:06] Elena: What about profiles. We use, uh, we do FSLogix today.\n[03:11] Sofia: FSLogix works fine, you can keep it. The containers can live on our Files, which is nice because it's on the same platform, but you don't have to change your profile approach to start.\n[03:23] Elena: Good, because redoing profiles on top of everything else would be a nightmare.\n[10:15] Priya: How fast can I actually get agents a desktop. Give me a real number.\n[10:21] Sofia: For non-persistent instant clones, once the image and pool are set, spinning up additional seats is minutes, not days. The gold image work is the up front part.\n[10:32] Priya: Minutes. Okay if that's real that changes my whole ramp process.\n[10:37] Sofia: We'll prove it in the POC, I don't want you to take my word for it.\n[18:40] Marcus: We've got a chunk of knowledge workers, the design team and GIS folks, they need GPU. Can EUC do vGPU.\n[18:48] Sofia: Yep, vGPU on AHV, profiles carved up per user. What cards are you on.\n[18:55] Marcus: Uh, I think they're older, I'd have to check, some NVIDIA, I'll get the model.\n[19:01] Sofia: Get me the model, I'll confirm supported and the right profile sizing. GPU nodes we'd size separately from the contact center pool since it's a different profile.\n[27:30] Elena: What about the persistent desktops, the twenty four hundred. Are you saying move all of them.\n[27:37] Sofia: Not day one. I'd start with Priya's eight hundred contact center seats because it's greenfield and non-persistent, prove it, then migrate the persistent estate in waves. You could even use it as the chance to finally go non-persistent where it makes sense.\n[27:54] Elena: Music to my ears honestly.\n[35:20] Tom (Nutanix): On the commercial side, Elena, when does the Horizon renewal hit.\n[35:27] Elena: We've got about, uh, four months? And I need to give a recommendation before that.\n[35:33] Tom: Okay so we'll get you the density and cost comparison quickly so you have ammo for that recommendation.\n[35:40] Elena: The cost comparison is what my director will look at first, just being honest.\n[35:45] Sofia: We'll do a real three year, including the hardware, against the Horizon renewal path. Not a toy spreadsheet.\n[46:50] Marcus: Manageability, is it a separate console from the server virtualization.\n[46:56] Sofia: Same Prism, so if you consolidate other workloads onto Nutanix later it's one management plane. But for now you can absolutely just run the EUC piece.\n[54:10] Sofia: Alright let me make sure I have the actions. I build the density plus three year cost comparison versus the Horizon renewal. Elena you send me the current pool definitions and the FSLogix setup. Marcus you get me the GPU card models. And we scope a POC on the eight hundred contact center seats. Sound right.\n[54:33] Elena: That's right.\n[54:35] Priya: I'm very interested in that POC.\n[54:39] Sofia: You'll be the star of it [laughs]. Okay, thank you all, recap coming today.\n[54:45] Marcus: Thanks Sofia.",
    },
    {
      subject: "Technical Deep Dive - Database Consolidation & Cloud Repatriation",
      summary:
        "Nutanix (Daniel, SE; Rachel, AE) ran a ~1 hour working session with the platform and data teams (Omar, Director of Platform; Grace, DBA Lead; Sam, Cloud/FinOps) on consolidating a sprawling database estate and repatriating some workloads from public cloud due to cost.\n\nKey points:\n- ~140 databases across SQL Server, PostgreSQL, and some Oracle, spread over aging physical servers and some AWS RDS instances.\n- Public cloud spend has grown faster than expected; FinOps flagged RDS and egress as major line items driving a repatriation review.\n- Biggest operational pain is manual, slow database provisioning (days to weeks) and inconsistent patching/backups.\n- Discussed Nutanix NDB (Database Service) for automated provisioning, patching, and copy data management, running on-prem on AHV.\n- Oracle licensing on the cluster is a known sensitivity; agreed to design around it carefully.\n\nAction items:\n- Nutanix to run an NDB demo against a representative Postgres and SQL workload.\n- Sam to export 3 months of cloud cost detail (RDS + egress) for a repatriation TCO.\n- Grace to list the databases, versions, and current provisioning SLAs.\n- Design a landing cluster and address Oracle licensing placement.",
      notes:
        "~140 DBs (SQL Server, Postgres, some Oracle) on aging physical + AWS RDS. Cloud cost (RDS + egress) driving repatriation review. Pain: manual provisioning (days-weeks), inconsistent patch/backup. NDB automates provisioning/patching/copy data mgmt on AHV. Sensitivity: Oracle licensing placement. Next: NDB demo, cloud cost export, DB inventory + SLAs, landing cluster design.",
      transcript:
        "[00:00] Daniel (Nutanix): Okay, hi all, thanks for the hour. Omar, Grace, Sam, can everyone hear me.\n[00:08] Omar: Yes.\n[00:09] Grace: Yep.\n[00:11] Daniel: Great. So the theme today is databases and, um, honestly also the cloud cost conversation, because I think they're related for you.\n[00:21] Omar: They're very related. So, short version, our database sprawl is out of control and our AWS bill is also out of control, and leadership asked us to look at both.\n[00:33] Sam (FinOps): The bill is the reason I'm on this call. RDS specifically, and egress, those two lines just keep climbing. We moved stuff to cloud a few years ago for agility and now it's, uh, it's not cheap agility.\n[00:48] Daniel: Yeah, we hear repatriation a lot lately, especially databases because RDS gets pricey at scale and the egress just, it nickels and dimes you. Grace, how many databases are we talking, and what engines.\n[01:03] Grace: So all in, about a hundred and forty. Mostly SQL Server, a good chunk of Postgres that's been growing, and, um, some Oracle that we would love to shrink but can't fully kill.\n[01:17] Daniel: And where do they live.\n[01:19] Grace: Everywhere [laughs]. Some on old physical boxes that scare me, some virtualized, and then a set in RDS, the Postgres and some SQL.\n[01:30] Daniel: Okay. And the pain, if you had to name the number one thing.\n[01:35] Grace: Provisioning. A dev asks for a database and it's, best case days, worst case weeks, because it's all manual, tickets, me or my team hand building, and then patching is inconsistent because we're all underwater.\n[01:52] Daniel: Right, so that's exactly what NDB is for. It's our database service, it automates provisioning, so a database that takes you days becomes like a self-service request that's done in minutes, with your standards baked in. Patching, you schedule it fleet-wide. And there's copy data management, so instead of full-size clones for every dev you get space-efficient clones.\n[02:18] Grace: Wait, minutes for a provision. With our config standards.\n[02:23] Daniel: With your gold config, yeah. You define the blueprint once. And it does SQL Server, Postgres, Oracle, a few others.\n[02:32] Grace: The clones thing is interesting because dev keeps asking for copies of prod and they're huge and we say no constantly.\n[02:41] Daniel: Yeah the space-efficient clones are a big deal for exactly that, dev gets a near-instant copy that only stores the changes, not a full duplicate.\n[02:51] Grace: Okay that's, that alone would save me so many arguments.\n[09:20] Sam: So on the repatriation, if we pull the RDS stuff back, it runs on this NDB thing on-prem?\n[09:28] Daniel: On-prem on AHV, yeah, NDB manages it. So you get the RDS-like self-service experience but you own the hardware and there's no egress tax and no per-hour RDS premium. For steady-state databases the economics usually favor on-prem hard, it's the spiky stuff where cloud wins.\n[09:50] Sam: Ours are steady state. They run twenty four seven, they're not bursty.\n[09:55] Daniel: Then yeah, that's, that's the classic repatriation win. But I want to prove it with your actual numbers, not a generic slide. If you export three months of cost, the RDS line items and the egress, we'll build a real TCO.\n[10:10] Sam: I can pull that from Cost Explorer, three months, sure.\n[10:15] Daniel: Perfect.\n[17:45] Omar: Let's talk about the scary one. Oracle.\n[17:50] Daniel: Yeah, let's. So the sensitivity is licensing, right, Oracle's rules about what cores you have to license on a cluster.\n[17:59] Omar: Correct. We've been burned by that conversation before.\n[18:04] Daniel: So the way we handle it, you can design placement so the Oracle VMs are constrained to specific hosts, and license just those, rather than the whole cluster. We do this a lot and I'd want to be careful and deliberate in the design, and honestly you should have your licensing person review it. I'm not going to give you Oracle legal advice.\n[18:27] Omar: No, understood, but if we can pin them and license a subset that's the goal.\n[18:33] Daniel: Yeah, dedicated host placement, we'll design around it. And frankly a chunk of your Oracle might be candidates to migrate to Postgres over time and NDB manages Postgres too, but that's a longer conversation.\n[18:47] Grace: We have a couple Oracle databases that honestly could be Postgres, we've said it for years.\n[18:53] Daniel: NDB makes running the Postgres side easy enough that it lowers the barrier, but no pressure, one thing at a time.\n[28:30] Omar: What about high availability, these are, some of these are critical.\n[28:36] Daniel: So the platform itself handles node failure, VMs restart, and for the databases NDB supports the native HA like SQL Always-On and Postgres streaming replication, it'll set it up as part of the blueprint. And backups are automated with point-in-time recovery.\n[28:56] Grace: Point in time is table stakes for me and right now it's, uh, it's inconsistent per database, some have it, some don't, depends who built it.\n[29:06] Daniel: Yeah, NDB standardizes that, every database gets the same backup policy from the blueprint, no more snowflakes.\n[38:15] Sam: How do we not just recreate the sprawl on-prem though. Like what stops it.\n[38:22] Daniel: Good question honestly. The self-service catalog with guardrails is what stops it, because everything goes through the blueprint, so you get standardization by default instead of everyone hand-rolling. The sprawl usually comes from manual processes, ironically.\n[38:40] Omar: That's a fair point.\n[48:05] Rachel (Nutanix): On timeline, Omar, is there a trigger, like a hardware refresh or a cloud commit renewal.\n[48:13] Omar: Our AWS commit, the savings plan or whatever, comes up in about, uh, seven months, so we want to decide before we re-commit for another term.\n[48:24] Rachel: Okay so we've got runway but a real deadline, good.\n[48:29] Sam: I don't want to re-up that commit if we're pulling workloads back, so the timing matters.\n[48:35] Daniel: Understood, we'll get you the TCO well before that so it's an informed decision.\n[55:40] Daniel: Let me recap actions. I set up an NDB demo against a representative Postgres and a SQL Server so Grace can see the provisioning and cloning live. Sam sends three months of cloud cost detail, RDS and egress, for the repatriation TCO. Grace gets me the database inventory, engines, versions, and current provisioning SLAs. And we start a landing cluster design, being careful with Oracle placement. Miss anything.\n[56:08] Omar: No that's comprehensive.\n[56:11] Grace: I'm excited about the demo, that's the one I want to see.\n[56:16] Daniel: We'll make it your databases essentially, representative ones. Okay, thank you all, recap and demo scheduling coming today.\n[56:24] Sam: Thanks Daniel.\n[56:26] Omar: Thank you, this was good.",
    },
  ];
  // Which generated accounts get a full deep-dive recording (index into deepDives).
  const deepDiveByCompany: Record<string, number> = {
    "Northwind Logistics": 3,
    "Stark Manufacturing": 0,
    "Summit Healthcare": 1,
    "Bluewave Telecom": 2,
    "Frontier Retail Group": 3,
    "Atlas Manufacturing": 0,
    "Pinnacle Payments": 2,
    "Willowbrook Health System": 1,
  };

  // --- Realistic Salesforce-style opportunity notes ------------------------
  // Fills the existing narrative fields (whyNow / whyNutanix / nextStepsToClose
  // / outcome / technicalDecisionMaker / technicalCloseDate) with rich, dated
  // SE/AE notes shaped like real Salesforce opp notes, so Account-AI can answer
  // "get me up to speed on this opportunity" from ingested text alone. No new
  // fields are introduced. Deterministic per index so the demo is stable. Some
  // opps are intentionally sparse or completely blank -- real reps don't always
  // fill these in, and the AI must handle that without inventing content.
  const stampMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const stampTimes = ["9:00 AM", "11:15 AM", "1:15 PM", "4:30 PM", "3:45 PM", "10:30 AM", "2:00 PM"];
  const fmtStamp = (d: Date, time: string) =>
    `${stampMonths[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}, ${d.getFullYear()}${time ? ` ${time}` : ""}`;
  const fmtStampShort = (d: Date, time: string) =>
    `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${time}`;
  const hqDrCities: [string, string][] = [
    ["Chicago", "Dallas"], ["Atlanta", "Denver"], ["Columbus", "Phoenix"],
    ["Charlotte", "Salt Lake City"], ["Minneapolis", "Portland"], ["Newark", "Kansas City"],
    ["Tampa", "Reno"], ["Boston", "Austin"], ["Seattle", "Nashville"], ["Detroit", "Raleigh"],
  ];
  const tdmTitles = [
    "VP of Infrastructure", "Director of IT Infrastructure", "Head of Platform Engineering",
    "Senior Director, Datacenter Operations", "VP of Technology", "Director of Cloud & Infrastructure",
  ];
  const nodePlans = [
    "a 3-node cluster at the primary datacenter and a 2-node cluster at DR",
    "a 4-node production cluster at HQ with a 3-node DR cluster at the co-location site",
    "a single 3-node pilot cluster before expanding to two additional sites",
    "a 6-node core cluster and a 3-node cluster at the DR colo",
  ];
  const nodeShorts = ["3-node/2-node", "4-node/3-node", "3-node pilot", "6-node/3-node"];
  const phase2Plans = [
    "then scale to 4 regional distribution hubs as capital frees up",
    "then extend to the branch and edge sites in a second wave",
    "then fold in the remaining production estate once phase 1 is validated",
    "then add a third site for full active/active DR",
  ];
  const budgetTiming = [
    "Depending on final discounting, some spend may land in the current quarter, but the bulk likely pushes into the new fiscal year.",
    "Phase 1 is funded from remaining capital this quarter; phase 2 is tied to next FY budget approval.",
    "Capital is approved for phase 1; the expansion is contingent on the FY planning cycle that starts next quarter.",
    "Finance has earmarked the initial spend; the larger rollout depends on the annual budget cycle.",
  ];
  const secondaryInitials = ["MW", "JS", "RK", "AL", "DP", "SG"];
  const noteInitials = (name: string) =>
    name.split(/\s+/).map((p) => p[0]?.toUpperCase() ?? "").join("").slice(0, 2) || "TR";

  type OppNotes = {
    whyNow: string | null;
    whyNutanix: string | null;
    nextStepsToClose: string | null;
    outcome: string | null;
    technicalDecisionMaker: string | null;
    technicalCloseDate: Date | null;
  };

  const buildOppNotes = (
    i: number,
    arch: Archetype,
    stage: string,
    closeDate: Date,
    owner: string,
    partnerName: string,
  ): OppNotes => {
    const tdmName = `${contactFirst[(i + 1) % contactFirst.length]} ${contactLast[(i + 2) % contactLast.length]}`;
    const tdmTitle = tdmTitles[i % tdmTitles.length];
    const tdm = `${tdmName} (${tdmTitle})`;
    const tdmFirst = tdmName.split(" ")[0];

    // ~9% of opps are completely blank (rep never filled them in).
    if (i % 11 === 4) {
      return { whyNow: null, whyNutanix: null, nextStepsToClose: null, outcome: null, technicalDecisionMaker: null, technicalCloseDate: null };
    }

    const incumbent = arch.incumbentVendor;
    const isEUC = arch.products.some((p) => /EUC/i.test(p)) || /Horizon|Citrix/i.test(incumbent);
    const isNAS = /NAS/i.test(incumbent);
    const isGPU = /GPU/i.test(incumbent);
    const isHyperV = /Hyper-V/i.test(incumbent);
    const isDR = arch.tags.some((t) => /DR|replication/i.test(t));
    const isDatabase = arch.tags.some((t) => /database/i.test(t));
    const vmwareExit = /VMware|Broadcom|Dell \+ VMware/i.test(incumbent) && !isEUC;

    const demoName = isEUC ? "EUC on AHV" : isNAS ? "Files/Objects" : isGPU ? "NAI/NKP" : "Prism/AHV";
    const targetPhrase = isEUC
      ? "migrate desktops to Nutanix EUC on AHV"
      : isNAS
        ? "consolidate unstructured data onto Nutanix Unified Storage"
        : isGPU
          ? "stand up a private AI platform on Nutanix (NAI + NKP)"
          : isHyperV
            ? "standardize off Hyper-V onto Nutanix AHV"
            : "migrate from VMware to Nutanix AHV";

    const cities = hqDrCities[i % hqDrCities.length];
    const vmTotal = 250 + ((i * 37) % 700);
    const vmCore = 80 + ((i * 13) % 150);
    const attendees = 5 + (i % 6);
    const trainingSeats = 2 + (i % 4);
    const concessionPct = 3 + (i % 4);
    const renMonth = ["September", "October", "December", "March", "June"][i % 5];
    const seInit = noteInitials(owner);
    const partner = partnerName && partnerName !== "-" ? partnerName : "the partner";

    // ---- Why Now? -----------------------------------------------------------
    const compellingEvent = isNAS
      ? "Primary NAS is nearly out of capacity and reaches end-of-support this year, forcing a storage platform decision."
      : isGPU
        ? "Cloud GPU spend is climbing month over month and new data-governance requirements are pushing model inference on-prem."
        : isHyperV
          ? "Hyper-V and legacy vSphere licensing is up for review in the current budget cycle, and the ops team wants to standardize on one platform."
          : isEUC
            ? `Recent ${/Horizon/i.test(incumbent) ? "Horizon" : "Citrix"} licensing changes have made the current VDI stack materially more expensive just as seat counts are growing.`
            : `Facing a steep increase on the VMware renewal under Broadcom's per-core subscription model, with the contract up in ${renMonth}. Aging hardware in the ${cities[0]} datacenter is also reaching end-of-support.`;
    const whyNow = [
      compellingEvent,
      arch.useCase,
      `Planning a phased rollout, starting with ${nodePlans[i % nodePlans.length]}, ${phase2Plans[i % phase2Plans.length]}.`,
      budgetTiming[i % budgetTiming.length],
    ].join(" ");

    // ---- Why Nutanix? -------------------------------------------------------
    const motivation = vmwareExit
      ? 'has prior hands-on experience with Nutanix AHV and is a vocal advocate for eliminating the "VMware tax"'
      : isEUC
        ? "wants to collapse the separate hypervisor and broker licensing and simplify desktop operations"
        : isGPU
          ? "wants governed, on-prem GPU capacity without the unpredictable cloud bill"
          : isNAS
            ? "wants unified files and objects on the same platform as compute rather than a standalone storage silo"
            : "is prioritizing operational simplicity and a single management plane for a lean infrastructure team";
    const whyNutanix = `${arch.whyNutanix} ${tdmName}, ${tdmTitle}, ${motivation}. They value Prism Central as one pane of glass across sites.`;

    // ---- dated Next Steps to Close log (reverse chronological) --------------
    const base = closeDate.getTime() < now.getTime() ? closeDate : now;
    const dateBack = (days: number) => addDays(base, -days);
    const workload = isEUC
      ? "VDI seats and golden images"
      : isNAS
        ? "unstructured-data shares"
        : isGPU
          ? "inference workloads"
          : isDatabase
            ? "tier-1 SQL databases and ERP"
            : "core production VMs";
    const phase2Scope = isEUC ? "the persistent desktop estate" : isNAS ? "the archive tier" : "the legacy file servers and dev/test";
    const deepDiveTask = isEUC
      ? "network segmentation for the VDI VLANs"
      : isGPU
        ? "the GPU node-pool and NKP cluster design"
        : isNAS
          ? "Files/Objects sizing for projected 24-month growth"
          : isDR
            ? "the async replication targets and WAN bandwidth"
            : "out-of-band management and microsegmentation requirements";

    const milestones: { days: number; time: string; body: string }[] = [
      {
        days: 195,
        time: stampTimes[i % stampTimes.length],
        body: `${seInit}: Initial discovery call with ${tdmName}. They want to move away from traditional 3-tier architecture; their storage admin is retiring and nobody wants to own the ${isNAS ? "legacy NAS" : "SAN"}. Requested a Nutanix Collector run to build an initial sizing profile and scheduled a broader engineering overview.`,
      },
      {
        days: 141,
        time: stampTimes[(i + 2) % stampTimes.length],
        body: `${seInit}: Customer ran Nutanix Collector; total footprint is roughly ${vmTotal} VMs, but ${tdmFirst} asked us to focus on the core ${vmCore} production VMs for the initial push. ${attendees} members of the infrastructure, security, and database teams attended the architectural deep dive and ${demoName} demo. Tasked to map ${deepDiveTask}.`,
      },
      {
        days: 92,
        time: stampTimes[(i + 4) % stampTimes.length],
        body: `${seInit}: Sent sizing bill of materials (BOM) and budgetary quote to ${partner}. Sized strictly for the tier-1 ${workload}, leaving ${phase2Scope} for Phase 2 to stay within the immediate budget cap. Included ${trainingSeats} seats of Nutanix University training and standard deployment services.`,
      },
      {
        days: 48,
        time: stampTimes[(i + 1) % stampTimes.length],
        body: `${seInit}: Revised the quote and BOM per the customer's request; adjusted node count and reviewed the ${arch.products[0]} edition with the AE. Walked ${tdmFirst}'s team through the migration approach using Nutanix Move.`,
      },
      {
        days: 8,
        time: stampTimes[(i + 3) % stampTimes.length],
        body: `${seInit}: Sync'd with ${partner}. The customer's legal team is reviewing our EULA and finance greenlit the budget allocation, but the partner requested an additional ${concessionPct}% concession on professional services to close before their internal deadline. Will sync with the Account Executive today.`,
      },
    ];
    const count = stage === "Discovery" ? 2 : stage === "Design" ? 4 : 5;
    const dated = milestones.slice(0, count).map((m) => ({ ...m, d: dateBack(m.days) }));
    const log = dated
      .slice()
      .reverse()
      .map((m) => `${fmtStamp(m.d, m.time)} ${m.body}`)
      .join("\n\n");
    const lastUpdated = dated[dated.length - 1];
    const openSteps =
      stage === "Validation"
        ? ["Finalize the Professional Services SOW", "Finalize pricing concessions with the Regional Director", "Deliver the final executive proposal to the CFO"]
        : stage === "Design"
          ? ["Finalize the reference architecture and BOM", isDR ? "Confirm DR/replication targets and WAN bandwidth" : "Confirm sizing with the technical team", "Schedule the executive readout"]
          : ["Complete the Collector run and analyze the output", "Schedule the architectural deep dive", "Build the initial sizing and budgetary quote"];
    const nextStepsToClose = [
      "Next Steps to Close",
      log,
      "",
      "Next Steps Last Updated",
      fmtStampShort(lastUpdated.d, lastUpdated.time),
      "",
      "Open next steps:",
      ...openSteps.map((s) => `- ${s}`),
    ].join("\n");

    // ---- Outcome block (Nutanix Recent Notes + Done checklist) -------------
    const outcomeLine = `${targetPhrase[0].toUpperCase()}${targetPhrase.slice(1)} while retiring the ${incumbent} estate.`;
    const envNote = `${fmtStamp(dateBack(180), "")} ${secondaryInitials[i % secondaryInitials.length]} - Currently running ${arch.currentEnvironment} across ${cities[0]} HQ and ${cities[1]} DR. ${isDR ? "DR orchestration is largely manual and rarely tested." : "No automated DR orchestration today; failover is manual and untested."}`;
    const concern = isDatabase
      ? "SQL Server performance on HCI"
      : isEUC
        ? "login-storm and GPU-accelerated desktop performance"
        : isGPU
          ? "GPU scheduling and multi-tenant isolation"
          : isDR
            ? "RPO/RTO targets for the tier-1 applications"
            : "mixed-workload performance and resiliency";
    const workshopNote = `${fmtStamp(dateBack(120), "")} - Onsite workshop with the ${isDatabase ? "database" : "infrastructure"} team. Addressed ${concern}; provided validated benchmarks and engineering whitepapers. The team was reassured and tentatively signed off on the architecture.`;
    const doneAll = [
      "Run Nutanix Collector & analyze RVTools",
      `Deliver architectural deep dive and ${demoName} demo`,
      `Generate initial ${nodeShorts[i % nodeShorts.length]} BOM and budgetary quote`,
    ];
    const doneCount = stage === "Discovery" ? 1 : stage === "Design" ? 2 : 3;
    const outcome = [
      `Outcome: ${outcomeLine}`,
      "",
      "Notes:",
      envNote,
      "",
      workshopNote,
      "",
      "Done:",
      ...doneAll.slice(0, doneCount).map((step) => `- ${step}`),
    ].join("\n");

    const technicalCloseDate = stage === "Discovery" ? null : closeDate;

    // ~15% sparse: rep only jotted a Why Now and the decision maker.
    if (i % 7 === 5) {
      return { whyNow, whyNutanix: null, nextStepsToClose: null, outcome: null, technicalDecisionMaker: tdm, technicalCloseDate: null };
    }

    return { whyNow, whyNutanix, nextStepsToClose, outcome, technicalDecisionMaker: tdm, technicalCloseDate };
  };

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

    const partnerName = ["CDW", "WWT", "Presidio", "Insight", "SHI", "-"][i % 6];
    const oppNotes = buildOppNotes(i, arch, stage, closeDate, owner, partnerName);

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
        partners: partnerName,
        useCase: arch.useCase,
        currentEnvironment: arch.currentEnvironment,
        whyNow: oppNotes.whyNow,
        whyNutanix: oppNotes.whyNutanix,
        outcome: oppNotes.outcome,
        nextStepsToClose: oppNotes.nextStepsToClose,
        technicalDecisionMaker: oppNotes.technicalDecisionMaker,
        technicalCloseDate: oppNotes.technicalCloseDate,
        intendToUseForNc2: arch.portfolio.includes("NC2"),
        bomAttached: technicalCloseStatus === "99" || technicalCloseStatus === "100",
        xrayUsed: stage === "Validation",
        aiOptOut: aiOptedOutCompanies.has(company),
      },
    });

    // --- Additional opportunities on the SAME account --------------------
    // Real accounts carry several opps across years: an old closed-won that
    // seeded the footprint and current expansion/renewal plays. Dates span
    // 2020..now and each carries its own SFDC stage + technical close status,
    // so the Account-AI brain can list and toggle them independently. These are
    // standalone Deal rows sharing accountName (meetings/notes stay on the
    // primary opp above).
    const historicalYear = 2020 + (i % 4);
    const expStage = stageCycle[(i + 1) % stageCycle.length];
    const expClose = addDays(now, 20 + (i % 5) * 40);
    const expNotes = buildOppNotes(i + 1000, arch, expStage, expClose, owner, partnerName);
    type SiblingOpp = {
      name: string;
      stage: string;
      nextAction: string;
      latestSignal: string | null;
      amount: number;
      technicalCloseStatus: string;
      closeDate: Date;
      isClosed: boolean;
      forecastCategory: string;
      whyNow: string | null;
      whyNutanix: string | null;
      outcome: string | null;
      nextStepsToClose: string | null;
      technicalDecisionMaker: string | null;
      technicalCloseDate: Date | null;
    };
    const siblingDeals: SiblingOpp[] = [
      {
        name: `${firstWord} Initial ${arch.portfolio[0] ?? "NCI"} Footprint`,
        stage: "Closed Won",
        nextAction: "Closed - in production",
        latestSignal: null,
        amount: 40000 + (i % 10) * 15000,
        technicalCloseStatus: "100",
        closeDate: new Date(historicalYear, (i * 5) % 12, 8 + (i % 18)),
        isClosed: true,
        forecastCategory: "Closed",
        whyNow: `Original purchase that replaced the first aging ${arch.incumbentVendor} cluster; in production since ${historicalYear}.`,
        whyNutanix: null,
        outcome: `Outcome: Won. Deployed the initial ${nodeShorts[i % nodeShorts.length]} cluster in ${historicalYear}; this is the reference footprint later expansions build on.`,
        nextStepsToClose: null,
        technicalDecisionMaker: oppNotes.technicalDecisionMaker,
        technicalCloseDate: null,
      },
      {
        name: `${firstWord} ${arch.portfolio.includes("NC2") ? "Cloud DR" : arch.portfolio.includes("EUC") ? "EUC" : "Platform"} Expansion FY26`,
        stage: expStage,
        nextAction: nextActionsByStage[expStage][i % 3],
        latestSignal: arch.signal,
        amount: 90000 + (i % 12) * 25000,
        technicalCloseStatus: ["-", "25", "50", "75", "99"][i % 5],
        closeDate: expClose,
        isClosed: false,
        forecastCategory: expStage === "Validation" ? "Commit" : expStage === "Design" ? "Best Case" : "Pipeline",
        whyNow: expNotes.whyNow,
        whyNutanix: expNotes.whyNutanix,
        outcome: expNotes.outcome,
        nextStepsToClose: expNotes.nextStepsToClose,
        technicalDecisionMaker: expNotes.technicalDecisionMaker,
        technicalCloseDate: expNotes.technicalCloseDate,
      },
    ];
    // A third of accounts also carry a closed-lost from a prior cycle.
    if (i % 3 === 0) {
      const lostYear = 2021 + (i % 3);
      siblingDeals.push({
        name: `${firstWord} ${arch.portfolio.includes("NUS (Files/Objects/Volumes)") ? "Storage" : "DR"} Refresh (Lost)`,
        stage: "Closed Lost",
        nextAction: "Closed lost - revisit at next refresh",
        latestSignal: null,
        amount: 55000 + (i % 8) * 12000,
        technicalCloseStatus: "0",
        closeDate: new Date(lostYear, (i * 7) % 12, 5 + (i % 20)),
        isClosed: true,
        forecastCategory: "Omitted",
        whyNow: `Earlier ${arch.primaryCompetitor} evaluation; lost on price/timing in ${lostYear}. Worth revisiting at the next hardware refresh.`,
        whyNutanix: null,
        outcome: `Outcome: Lost to ${arch.primaryCompetitor}. Budget pulled mid-cycle; the relationship stayed intact for a future re-engagement.`,
        nextStepsToClose: null,
        technicalDecisionMaker: null,
        technicalCloseDate: null,
      });
    }
    for (const s of siblingDeals) {
      const siblingDeal = await prisma.deal.create({
        data: {
          name: s.name,
          accountName: company,
          stage: s.stage,
          owner,
          nextAction: s.nextAction,
          latestSignal: s.latestSignal,
          amount: s.amount,
          acvAmount: Math.round(s.amount / 3 / 1000) * 1000,
          servicesAcv: Math.round((s.amount * 0.08) / 1000) * 1000,
          technicalCloseStatus: s.technicalCloseStatus,
          closeDate: s.closeDate,
          isClosed: s.isClosed,
          forecastCategory: s.forecastCategory,
          industry: arch.industry,
          employees: 500 + ((i * 137) % 9500),
          region: regions[i % regions.length],
          incumbentVendor: arch.incumbentVendor,
          primaryCompetitor: arch.primaryCompetitor,
          hypervisor: arch.hypervisor,
          portfolio: JSON.stringify(arch.portfolio),
          products: JSON.stringify(arch.products),
          tags: JSON.stringify(arch.tags),
          partners: partnerName,
          useCase: arch.useCase,
          whyNow: s.whyNow,
          whyNutanix: s.whyNutanix,
          outcome: s.outcome,
          nextStepsToClose: s.nextStepsToClose,
          technicalDecisionMaker: s.technicalDecisionMaker,
          technicalCloseDate: s.technicalCloseDate,
          intendToUseForNc2: arch.portfolio.includes("NC2"),
          aiOptOut: aiOptedOutCompanies.has(company),
        },
      });

      // Every opportunity carries its own activity trail so no workspace opens
      // empty: meetings, notes, and (where it makes sense) an asset — scaled to
      // the opp's stage and age. Historical opps get a historical record;
      // open expansions get live activity.
      const sibIsWon = s.stage === "Closed Won";
      const sibIsLost = s.stage === "Closed Lost";
      const at = (base: Date, days: number, hour: number) => {
        const d = addDays(base, days);
        d.setHours(hour, i % 2 === 0 ? 0 : 30, 0, 0);
        return d;
      };

      if (sibIsWon) {
        const kickoff = await prisma.meeting.create({
          data: {
            source: "internal_seed",
            subject: `Deployment Kickoff - ${s.name}`,
            organizer: ownerEmail,
            startTime: at(s.closeDate, -45, 10),
            endTime: at(s.closeDate, -45, 11),
            attendeesJson: JSON.stringify([
              { email: `it@${domain}`, displayName: `${company} IT` },
              { email: ownerEmail, displayName: owner },
            ]),
            externalDomains: domain,
            dealId: siblingDeal.id,
          },
        });
        await prisma.meeting.create({
          data: {
            source: "internal_seed",
            subject: `Go-Live Readiness Review - ${company}`,
            organizer: ownerEmail,
            startTime: at(s.closeDate, -7, 14),
            endTime: at(s.closeDate, -7, 15),
            attendeesJson: JSON.stringify([{ email: `it@${domain}`, displayName: `${company} IT` }]),
            externalDomains: domain,
            dealId: siblingDeal.id,
          },
        });
        await prisma.meetingNote.createMany({
          data: [
            {
              dealId: siblingDeal.id,
              meetingId: kickoff.id,
              role: "SE",
              author: ownerEmail,
              body: `Deployment kickoff for the initial footprint. Foundation imaging scheduled; cluster network (VLANs, OOB) confirmed with the customer's network admin. Handover runbook drafted.`,
            },
            {
              dealId: siblingDeal.id,
              role: "SE",
              author: ownerEmail,
              body: `Post go-live wrap-up: cluster in production, Prism Central registered, protection policies applied. Customer signed off on the as-built. This footprint is the reference for later expansions on this account.`,
            },
          ],
        });
        await prisma.meetingAsset.create({
          data: {
            dealId: siblingDeal.id,
            type: "PRESENTATION",
            source: "manual",
            sourceTool: "Proposal Builder",
            title: `${company} As-Built & Handover.pptx`,
            uri: `uploaded://${encodeURIComponent(`${company}-as-built.pptx`)}`,
            uploadedBy: ownerEmail,
            previewStatus: "FAILED",
          },
        });
      } else if (sibIsLost) {
        const debrief = await prisma.meeting.create({
          data: {
            source: "internal_seed",
            subject: `Loss Review - ${s.name}`,
            organizer: ownerEmail,
            startTime: at(s.closeDate, 10, 11),
            endTime: at(s.closeDate, 10, 12),
            attendeesJson: JSON.stringify([{ email: ownerEmail, displayName: owner }]),
            externalDomains: "",
            dealId: siblingDeal.id,
          },
        });
        await prisma.meetingNote.create({
          data: {
            dealId: siblingDeal.id,
            meetingId: debrief.id,
            role: "AE",
            author: ownerEmail,
            body: `Loss review: lost to ${arch.primaryCompetitor} on price/timing. Technical evaluation went well; budget was pulled mid-cycle. Relationship intact — flagged for re-engagement at the next hardware refresh.`,
          },
        });
      } else {
        // Open expansion opp: one recent meeting, one upcoming, live notes, and
        // a sizing artifact.
        const recent = await prisma.meeting.create({
          data: {
            source: "internal_seed",
            subject: `${s.stage} Working Session - ${s.name}`,
            organizer: ownerEmail,
            startTime: at(now, -(6 + (i % 9)), 13),
            endTime: at(now, -(6 + (i % 9)), 14),
            attendeesJson: JSON.stringify([
              { email: `it@${domain}`, displayName: `${company} IT` },
              { email: ownerEmail, displayName: owner },
            ]),
            externalDomains: domain,
            joinUrl: joinUrlFor(i + 7),
            dealId: siblingDeal.id,
          },
        });
        await prisma.meeting.create({
          data: {
            source: "internal_seed",
            subject: `Expansion Design Review - ${company}`,
            organizer: ownerEmail,
            startTime: at(now, 5 + (i % 10), 10),
            endTime: at(now, 5 + (i % 10), 11),
            attendeesJson: JSON.stringify([{ email: `it@${domain}`, displayName: `${company} IT` }]),
            externalDomains: domain,
            joinUrl: joinUrlFor(i + 9),
            dealId: siblingDeal.id,
          },
        });
        await prisma.meetingNote.createMany({
          data: [
            {
              dealId: siblingDeal.id,
              meetingId: recent.id,
              role: "SE",
              author: ownerEmail,
              body: `Expansion working session: validated the current cluster's headroom against projected growth. Customer wants the expansion sized against the existing footprint — pulling utilization from Prism before the design review.`,
            },
            {
              dealId: siblingDeal.id,
              role: "AE",
              author: ownerEmail,
              body: aeNoteBodies[(i + 3) % aeNoteBodies.length],
            },
          ],
        });
        await prisma.meetingAsset.create({
          data: {
            dealId: siblingDeal.id,
            type: "COLLECTOR",
            source: "manual",
            sourceTool: "Nutanix Collector",
            title: `${company} Expansion Collector Output.csv`,
            uri: `uploaded://${encodeURIComponent(`${company}-expansion-collector.csv`)}`,
            uploadedBy: ownerEmail,
            previewStatus: "FAILED",
          },
        });
      }
    }

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

    // A handful of accounts additionally get a full ~1-hour Zoom "deep dive"
    // recording with a clean AI summary, auto-imported into the brain, so the
    // Account-AI has substantial, realistic source material to reason over.
    const deepDiveIdx = deepDiveByCompany[company];
    if (deepDiveIdx !== undefined) {
      const dd = deepDives[deepDiveIdx];
      const ddStart = weekdayAt(-(6 + (i % 5)), 10, 0);
      const ddMeeting = await prisma.meeting.create({
        data: {
          source: "zoom",
          subject: `${dd.subject} - ${company}`,
          organizer: ownerEmail,
          startTime: ddStart,
          endTime: endBy5(ddStart, 60),
          attendeesJson: JSON.stringify([
            { email: ownerEmail, displayName: owner },
            { email: `infra@${domain}`, displayName: `${company} Infrastructure` },
            { email: externalContactEmail(i + 11, domain) },
            { email: externalContactEmail(i + 13, domain) },
          ]),
          externalDomains: domain,
          joinUrl: joinUrlFor(i + 9),
          dealId: deal.id,
        },
      });
      await prisma.meetingTranscript.create({
        data: {
          meetingId: ddMeeting.id,
          dealId: deal.id,
          source: "zoom",
          summary: dd.summary,
          notes: dd.notes,
          transcript: dd.transcript,
          autoIngestedAt: addDays(now, -(5 + (i % 4))),
        },
      });
    }

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

  await generateFoundationAccountMapCsv();
}

// --- Foundation account-map CSV -------------------------------------------
// The Account Map (Foundation environment) reads public/data/account-map-dummy.csv.
// Generate it from the freshly-seeded DB accounts so the map and the workspace
// pages describe the SAME accounts: pins can link into /accounts/{dealId}, SE
// names match deal owners, and metrics are derived from the seeded pipeline.
async function generateFoundationAccountMapCsv() {
  const { writeFile } = await import("node:fs/promises");
  const path = await import("node:path");

  // Deterministic city pools per seeded deal region.
  const CITY_POOLS: Record<string, { city: string; state: string; country: string; lat: number; lng: number }[]> = {
    "AMER - East": [
      { city: "New York", state: "NY", country: "United States", lat: 40.7128, lng: -74.006 },
      { city: "Boston", state: "MA", country: "United States", lat: 42.3601, lng: -71.0589 },
      { city: "Atlanta", state: "GA", country: "United States", lat: 33.749, lng: -84.388 },
      { city: "Charlotte", state: "NC", country: "United States", lat: 35.2271, lng: -80.8431 },
      { city: "Philadelphia", state: "PA", country: "United States", lat: 39.9526, lng: -75.1652 },
      { city: "Miami", state: "FL", country: "United States", lat: 25.7617, lng: -80.1918 },
    ],
    "AMER - West": [
      { city: "San Jose", state: "CA", country: "United States", lat: 37.3382, lng: -121.8863 },
      { city: "Seattle", state: "WA", country: "United States", lat: 47.6062, lng: -122.3321 },
      { city: "Denver", state: "CO", country: "United States", lat: 39.7392, lng: -104.9903 },
      { city: "Phoenix", state: "AZ", country: "United States", lat: 33.4484, lng: -112.074 },
      { city: "Los Angeles", state: "CA", country: "United States", lat: 34.0522, lng: -118.2437 },
      { city: "Portland", state: "OR", country: "United States", lat: 45.5152, lng: -122.6784 },
    ],
    "AMER - Central": [
      { city: "Chicago", state: "IL", country: "United States", lat: 41.8781, lng: -87.6298 },
      { city: "Dallas", state: "TX", country: "United States", lat: 32.7767, lng: -96.797 },
      { city: "Minneapolis", state: "MN", country: "United States", lat: 44.9778, lng: -93.265 },
      { city: "Austin", state: "TX", country: "United States", lat: 30.2672, lng: -97.7431 },
      { city: "Kansas City", state: "MO", country: "United States", lat: 39.0997, lng: -94.5786 },
      { city: "Houston", state: "TX", country: "United States", lat: 29.7604, lng: -95.3698 },
    ],
    EMEA: [
      { city: "London", state: "", country: "United Kingdom", lat: 51.5074, lng: -0.1278 },
      { city: "Frankfurt", state: "", country: "Germany", lat: 50.1109, lng: 8.6821 },
      { city: "Paris", state: "", country: "France", lat: 48.8566, lng: 2.3522 },
      { city: "Amsterdam", state: "", country: "Netherlands", lat: 52.3676, lng: 4.9041 },
      { city: "Madrid", state: "", country: "Spain", lat: 40.4168, lng: -3.7038 },
      { city: "Stockholm", state: "", country: "Sweden", lat: 59.3293, lng: 18.0686 },
    ],
    APJ: [
      { city: "Sydney", state: "NSW", country: "Australia", lat: -33.8688, lng: 151.2093 },
      { city: "Singapore", state: "", country: "Singapore", lat: 1.3521, lng: 103.8198 },
      { city: "Tokyo", state: "", country: "Japan", lat: 35.6762, lng: 139.6503 },
      { city: "Bangalore", state: "KA", country: "India", lat: 12.9716, lng: 77.5946 },
      { city: "Seoul", state: "", country: "South Korea", lat: 37.5665, lng: 126.978 },
      { city: "Melbourne", state: "VIC", country: "Australia", lat: -37.8136, lng: 144.9631 },
    ],
  };
  const AE_NAMES = ["Chris Alvarez", "Morgan Patel", "Riley Thompson", "Jamie Fox", "Taylor Brooks", "Alex Nguyen", "Casey Rivera"];
  const streetNames = ["Main St", "Market St", "Innovation Dr", "Commerce Blvd", "Enterprise Way", "Industrial Pkwy"];

  const deals = await prisma.deal.findMany({
    select: {
      accountName: true,
      owner: true,
      industry: true,
      region: true,
      amount: true,
      stage: true,
      isClosed: true,
    },
    orderBy: { accountName: "asc" },
  });

  const byAccount = new Map<string, typeof deals>();
  for (const deal of deals) {
    const list = byAccount.get(deal.accountName) ?? [];
    list.push(deal);
    byAccount.set(deal.accountName, list);
  }

  const esc = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const rows: string[] = [
    [
      "Account Name",
      "Account Executive",
      "System Engineer",
      "Theater",
      "Region",
      "Sub-Region",
      "Vertical",
      "Last Sales",
      "Account Type",
      "Country",
      "State",
      "City",
      "Street",
      "Active Cluster Count",
      "Node Count",
      "VM Count",
      "Latitude",
      "Longitude",
    ].join(","),
  ];

  let idx = 0;
  for (const [accountName, accountDeals] of byAccount) {
    const primary = accountDeals[0];
    const region = primary.region && CITY_POOLS[primary.region] ? primary.region : "AMER - Central";
    const pool = CITY_POOLS[region];
    const loc = pool[idx % pool.length];
    const theater = region.startsWith("AMER") ? "Americas" : region;

    const wonAmount = accountDeals.filter((d) => d.stage === "Closed Won").reduce((sum, d) => sum + d.amount, 0);
    const hasWon = wonAmount > 0;
    const hasOpen = accountDeals.some((d) => !d.isClosed);
    const accountType = hasWon ? "Customer" : hasOpen ? "Prospect" : "Ex - Customer";

    const clusters = hasWon ? 1 + (idx % 4) : 0;
    const nodes = clusters * (3 + (idx % 5));
    const vms = hasWon ? 120 + ((idx * 53) % 900) : 0;
    // Small jitter (~±0.02°) so co-located accounts don't stack on one pixel.
    const jitterLat = ((idx * 37) % 41 - 20) / 1000;
    const jitterLng = ((idx * 53) % 41 - 20) / 1000;

    rows.push(
      [
        esc(accountName),
        esc(AE_NAMES[idx % AE_NAMES.length]),
        esc(primary.owner),
        esc(theater),
        esc(region),
        esc(region),
        esc(primary.industry ?? "Technology"),
        String(Math.round(wonAmount)),
        esc(accountType),
        esc(loc.country),
        esc(loc.state),
        esc(loc.city),
        esc(`${100 + ((idx * 7) % 899)} ${streetNames[idx % streetNames.length]}`),
        String(clusters),
        String(nodes),
        String(vms),
        (loc.lat + jitterLat).toFixed(5),
        (loc.lng + jitterLng).toFixed(5),
      ].join(","),
    );
    idx += 1;
  }

  const dataDir = path.join(process.cwd(), "public", "data");
  await writeFile(path.join(dataDir, "account-map-dummy.csv"), rows.join("\n") + "\n", "utf8");
  // The billing companion file previously carried unrelated dummy accounts;
  // reduce it to a header so it no longer injects accounts that don't exist in
  // the workspace DB.
  await writeFile(
    path.join(dataDir, "account-map2-dummy.csv"),
    "Account Name,Account Owner,SE Owner,Type,Billing Street,Billing City,Billing State/Province,Billing Country,Latitude,Longitude,Total Cluster Count\n",
    "utf8",
  );
  console.log(`Account map CSV regenerated for ${byAccount.size} accounts (foundation environment).`);
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
