import { IntegrationStatus, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.integrationConnection.upsert({
    where: { integrationKey: "zoom" },
    update: {},
    create: {
      integrationKey: "zoom",
      displayName: "Zoom",
      status: IntegrationStatus.NOT_CONNECTED,
      setupNotes:
        "Configure in the Zoom section below: enable auto-sync, set the webhook secret, and point Zoom's recording/summary webhook at /api/integrations/zoom/webhook. Auto-attaches notes, AI summary, and transcript to feed Account-AI and the Note Formatter.",
    },
  });
  console.log("zoom integration ensured");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
