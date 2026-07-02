// Normalizes every Deal's `stage` onto the canonical 1–7 sales-cycle labels
// (Discovery → Design → Validation → Proposal → Negotiation → Closed Won →
// Closed Lost). Legacy/synonym values are mapped to the closest canonical
// stage. Idempotent — safe to re-run.
//
// Run: node --import tsx scripts/relabel-stages.ts
import { prisma } from "@/lib/prisma";
import { normalizeStage } from "@/lib/opportunity-stage";

async function main() {
  const deals = await prisma.deal.findMany({ select: { id: true, stage: true } });
  let changed = 0;
  for (const deal of deals) {
    const canonical = normalizeStage(deal.stage);
    if (canonical !== deal.stage) {
      await prisma.deal.update({ where: { id: deal.id }, data: { stage: canonical } });
      changed += 1;
    }
  }
  console.log(`Checked ${deals.length} deals; relabeled ${changed} to canonical stages.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
