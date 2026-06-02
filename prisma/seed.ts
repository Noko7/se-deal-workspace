import { PrismaClient, IntegrationStatus, AssetType, PreviewStatus, QBRItemStatus, Prisma } from "@prisma/client";
import { addDays, addHours } from "date-fns";

const prisma = new PrismaClient();

async function main() {
  await prisma.meetingNote.deleteMany();
  await prisma.contextEvidence.deleteMany();
  await prisma.sizingRecommendation.deleteMany();
  await prisma.environmentRequirement.deleteMany();
  await prisma.customerContext.deleteMany();
  await prisma.qBRChecklistItem.deleteMany();
  await prisma.qBRArtifact.deleteMany();
  await prisma.dealEmail.deleteMany();
  await prisma.meetingAsset.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.integrationConnection.deleteMany();
  await prisma.deal.deleteMany();

  const now = new Date();

  const alphaDeal = await prisma.deal.create({
    data: {
      name: "Acme Capacity Refresh",
      accountName: "Acme Manufacturing",
      stage: "Discovery",
      owner: "Lizi Singletary",
      nextAction: "Finalize discovery summary before QBR",
      latestSignal: "Storage utilization sustained above 80%.",
      amount: 420000,
      technicalCloseStatus: "25",
      closeDate: addDays(now, 18),
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
      technicalCloseStatus: "50",
      closeDate: addDays(now, 9),
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
      technicalCloseStatus: "99",
      closeDate: addDays(now, 5),
    },
  });

  const acmeMeeting = await prisma.meeting.create({
    data: {
      source: "internal_seed",
      subject: "QBR Prep - Acme Manufacturing",
      organizer: "lizi.singletary@nutanix.com",
      startTime: addDays(now, 1),
      endTime: addHours(addDays(now, 1), 1),
      attendeesJson: JSON.stringify([
        { email: "it.ops@acme.example", displayName: "Acme IT Ops" },
        { email: "sam@nutanix.com", displayName: "Sam (AM)" },
      ]),
      externalDomains: "acme.example",
      dealId: alphaDeal.id,
    },
  });

  const acmeKickoffMeeting = await prisma.meeting.create({
    data: {
      source: "internal_seed",
      subject: "Discovery Kickoff - Acme Manufacturing",
      organizer: "lizi.singletary@nutanix.com",
      startTime: addDays(now, -7),
      endTime: addHours(addDays(now, -7), 1),
      attendeesJson: JSON.stringify([
        { email: "it.ops@acme.example", displayName: "Acme IT Ops" },
        { email: "cio@acme.example", displayName: "Acme CIO" },
      ]),
      externalDomains: "acme.example",
      dealId: alphaDeal.id,
    },
  });

  const betaMeeting = await prisma.meeting.create({
    data: {
      source: "internal_seed",
      subject: "Design Review - Beta Financial",
      organizer: "jordan.kim@nutanix.com",
      startTime: addDays(now, 2),
      endTime: addHours(addDays(now, 2), 1),
      attendeesJson: JSON.stringify([
        { email: "architecture@betafin.example", displayName: "Beta Architecture" },
      ]),
      externalDomains: "betafin.example",
      dealId: bravoDeal.id,
    },
  });

  const gammaPocMeeting = await prisma.meeting.create({
    data: {
      source: "internal_seed",
      subject: "POC Readout - Gamma Healthcare",
      organizer: "priya.nadar@nutanix.com",
      startTime: addDays(now, -10),
      endTime: addHours(addDays(now, -10), 1),
      attendeesJson: JSON.stringify([
        { email: "infra@gammahealth.example", displayName: "Gamma Infrastructure" },
        { email: "security@gammahealth.example", displayName: "Gamma Security" },
      ]),
      externalDomains: "gammahealth.example",
      dealId: gammaDeal.id,
    },
  });

  await prisma.meeting.create({
    data: {
      source: "internal_seed",
      subject: "Validation Sign-off - Gamma Healthcare",
      organizer: "priya.nadar@nutanix.com",
      startTime: addDays(now, 3),
      endTime: addHours(addDays(now, 3), 1),
      attendeesJson: JSON.stringify([
        { email: "infra@gammahealth.example", displayName: "Gamma Infrastructure" },
      ]),
      externalDomains: "gammahealth.example",
      dealId: gammaDeal.id,
    },
  });

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
        setupNotes: "Pipeline sync is planned after foundation validation.",
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
        previewStatus: PreviewStatus.FAILED,
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

    const deal = await prisma.deal.create({
      data: {
        name: dealName,
        accountName: company,
        stage,
        owner,
        nextAction: nextActionsByStage[stage][i % 3],
        latestSignal: signals[i % signals.length],
        amount,
        technicalCloseStatus,
        closeDate,
        isClosed,
      },
    });

    const upcomingMeeting = await prisma.meeting.create({
      data: {
        source: "internal_seed",
        subject: `${stage} Sync - ${company}`,
        organizer: ownerEmail,
        startTime: addHours(addDays(now, (i % 20) + 1), 9 + (i % 7)),
        endTime: addHours(addDays(now, (i % 20) + 1), 10 + (i % 7)),
        attendeesJson: JSON.stringify([
          { email: `it@${domain}`, displayName: `${company} IT` },
          { email: ownerEmail, displayName: owner },
        ]),
        externalDomains: domain,
        dealId: deal.id,
      },
    });

    const pastMeeting = await prisma.meeting.create({
      data: {
        source: "internal_seed",
        subject: `Intro Call - ${company}`,
        organizer: ownerEmail,
        startTime: addHours(addDays(now, -((i % 12) + 1)), 13),
        endTime: addHours(addDays(now, -((i % 12) + 1)), 14),
        attendeesJson: JSON.stringify([
          { email: `infra@${domain}`, displayName: `${company} Infrastructure` },
        ]),
        externalDomains: domain,
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
          body: seNoteBodies[i % seNoteBodies.length],
        },
        {
          dealId: deal.id,
          meetingId: pastMeeting.id,
          role: "AE",
          author: `${fakeOwners[(i + 3) % fakeOwners.length].toLowerCase().replace(/[^a-z]+/g, ".")}@nutanix.com`,
          body: aeNoteBodies[i % aeNoteBodies.length],
        },
        {
          dealId: deal.id,
          meetingId: upcomingMeeting.id,
          role: "SE",
          author: ownerEmail,
          body: `Prep for ${stage} sync: ${signals[(i + 1) % signals.length]}`,
        },
        {
          dealId: deal.id,
          meetingId: null,
          role: "SAM",
          author: `${fakeOwners[(i + 5) % fakeOwners.length].toLowerCase().replace(/[^a-z]+/g, ".")}@nutanix.com`,
          body: samNoteBodies[i % samNoteBodies.length],
        },
      ],
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
        previewStatus: PreviewStatus.FAILED,
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
