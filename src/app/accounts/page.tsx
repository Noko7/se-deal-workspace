import { Users } from "lucide-react";
import { getAccountsOverview } from "@/lib/data";
import { Card } from "@/components/ui";
import { AccountsExplorer } from "@/components/accounts-explorer";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const accounts = await getAccountsOverview();

  return (
    <div className="space-y-6">
      <Card
        title="My Accounts"
        subtitle="Every customer account grouped by deal stage. Filter and search to jump into history, notes, and assets."
        icon={<Users className="h-5 w-5" />}
      >
        <AccountsExplorer accounts={accounts} />
      </Card>
    </div>
  );
}
