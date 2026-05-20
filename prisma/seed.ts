import { PrismaClient, IntegrationStatus, AssetType, PreviewStatus, QBRItemStatus } from "@prisma/client";
import { addDays, addHours } from "date-fns";

const prisma = new PrismaClient();

async function main() {
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

  const alphaDeal = await prisma.deal.create({
    data: {
      name: "Acme Capacity Refresh",
      accountName: "Acme Manufacturing",
      stage: "Discovery",
      owner: "Lizi Singletary",
      nextAction: "Finalize discovery summary before QBR",
      latestSignal: "Storage utilization sustained above 80%.",
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
    },
  });

  const now = new Date();

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
        previewImageUri: "https://placehold.co/640x360?text=Presentation+Preview",
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
        previewImageUri: "https://placehold.co/640x360?text=Whiteboard+Preview",
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
    ],
  });

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
