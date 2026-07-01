import { cookies } from "next/headers";
import { MapPinned } from "lucide-react";
import { AccountMapExplorer } from "@/components/account-map-explorer";
import { Card } from "@/components/ui";
import { getAccountMapRecords } from "@/lib/account-map";
import { getAccountOptions } from "@/lib/data";
import { ENV_COOKIE, ENVIRONMENTS, resolveEnvironmentId } from "@/lib/environment";

export const dynamic = "force-dynamic";

export default async function AccountMapPage() {
  const store = await cookies();
  const environment = resolveEnvironmentId(store.get(ENV_COOKIE)?.value);
  const envLabel = ENVIRONMENTS.find((env) => env.id === environment)?.label ?? environment;

  const [records, accountOptions] = await Promise.all([
    getAccountMapRecords(environment).catch(() => null),
    getAccountOptions().catch(() => []),
  ]);
  // Map pins link into the account workspace when the account exists in the DB
  // (Foundation map data is generated from the same seeded accounts).
  const accountLinks: Record<string, string> = {};
  for (const option of accountOptions) accountLinks[option.accountName] = option.dealId;

  return (
    <div className="space-y-6">
      <Card
        title="Account Map"
        subtitle={`Live, global map of customers and prospects — environment: ${envLabel}. Filter by region, vertical, and owner, then click a point for details.`}
        icon={<MapPinned className="h-5 w-5" />}
      >
        {records === null ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">No data available for the “{envLabel}” environment.</p>
            <p className="mt-1">
              Expected a CSV file
              {environment === "dev" ? " at /etc/se-deal-workspace/account-map.csv" : ""}. Check that the file exists and is
              readable by the app, then refresh.
            </p>
          </div>
        ) : (
          <AccountMapExplorer records={records} accountLinks={accountLinks} />
        )}
      </Card>
    </div>
  );
}
