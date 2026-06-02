import { Users } from "lucide-react";
import { getAccountsOverview, getPipelineDeals } from "@/lib/data";
import { Card } from "@/components/ui";
import { AccountsWorkspace } from "@/components/accounts-workspace";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const [accounts, pipelineDeals] = await Promise.all([getAccountsOverview(), getPipelineDeals()]);

  return (
    <div className="space-y-6">
      <Card
        title="My Accounts"
        subtitle="Pipeline view by Technical Close Status (100% = SE work complete), or the full A–Z account list. Synced from Salesforce (mock data until the connector is live)."
        icon={<Users className="h-5 w-5" />}
      >
        <AccountsWorkspace pipelineDeals={pipelineDeals} accounts={accounts} />
      </Card>
    </div>
  );
}
