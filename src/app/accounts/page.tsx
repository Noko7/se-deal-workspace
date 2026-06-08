import { cookies } from "next/headers";
import { Users } from "lucide-react";
import { getAccountsOverview, getPipelineDeals, resolveSeOwner } from "@/lib/data";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { Card } from "@/components/ui";
import { AccountsWorkspace } from "@/components/accounts-workspace";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const [accounts, pipelineDeals, store] = await Promise.all([
    getAccountsOverview(),
    getPipelineDeals(),
    cookies(),
  ]);

  // Scope everything to the logged-in SE's book of business.
  const session = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const se = resolveSeOwner(
    pipelineDeals.map((deal) => deal.owner),
    session?.name,
  );
  const myPipelineDeals = se ? pipelineDeals.filter((deal) => deal.owner === se) : pipelineDeals;
  const myAccounts = se ? accounts.filter((account) => account.owner === se) : accounts;

  return (
    <div className="space-y-6">
      <Card
        title="My Accounts"
        subtitle="Pipeline view by Technical Close Status (100% = SE work complete), or the full A–Z account list. Synced from Salesforce (mock data until the connector is live)."
        icon={<Users className="h-5 w-5" />}
      >
        <AccountsWorkspace pipelineDeals={myPipelineDeals} accounts={myAccounts} />
      </Card>
    </div>
  );
}
