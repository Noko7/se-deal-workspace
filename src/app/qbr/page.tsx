import { cookies } from "next/headers";
import { Presentation } from "lucide-react";
import { getAccountsOverview, resolveSeOwner } from "@/lib/data";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { UCLA_SAMPLE_ACCOUNT } from "@/lib/qbr-sample-ucla";
import { Card } from "@/components/ui";
import { QbrBuilder, type AccountLite } from "@/components/qbr-builder";

export const dynamic = "force-dynamic";

export default async function QbrPage() {
  const [overview, store] = await Promise.all([getAccountsOverview(), cookies()]);

  const session = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const se = session?.name?.trim() || resolveSeOwner(overview.map((a) => a.owner), null) || "Lizi Singletary";

  // De-duplicate to a unique customer (account) list — a QBR is built per
  // customer, not per opportunity.
  const seen = new Set<string>();
  const accounts: AccountLite[] = [];
  for (const a of overview) {
    if (seen.has(a.accountName)) continue;
    seen.add(a.accountName);
    accounts.push({ id: a.id, accountName: a.accountName });
  }
  accounts.sort((a, b) => a.accountName.localeCompare(b.accountName));

  // Bake the real UCLA Anderson downloads (QBR Report + Customer Progress
  // Report) in as the default sample so the tool demonstrates the real combined
  // deck out of the box.
  const accountsWithSample: AccountLite[] = [
    { id: "ucla-sample", accountName: UCLA_SAMPLE_ACCOUNT },
    ...accounts.filter((a) => a.accountName !== UCLA_SAMPLE_ACCOUNT),
  ];

  return (
    <div className="space-y-6">
      <Card
        title="QBR Deck Builder"
        subtitle="Pull a customer's CS360 health report and assemble a curated, on-brand Quarterly Business Review deck — guided by the Jan 2026 Health Check Guide. Preview, curate, and export to PowerPoint."
        icon={<Presentation className="h-5 w-5" />}
      >
        <QbrBuilder accounts={accountsWithSample} defaultSe={se} />
      </Card>
    </div>
  );
}
