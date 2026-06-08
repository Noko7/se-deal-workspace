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

  // This is a single-SE workspace: every deal/account belongs to the logged-in
  // SE, so we reassign ownership to them and show the whole book.
  const session = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const se =
    session?.name?.trim() || resolveSeOwner(pipelineDeals.map((deal) => deal.owner), null) || "Me";
  const myPipelineDeals = pipelineDeals.map((deal) => ({ ...deal, owner: se }));
  const myAccounts = accounts.map((account) => ({ ...account, owner: se }));

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
