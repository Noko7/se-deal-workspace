import { MapPinned } from "lucide-react";
import { AccountMapExplorer } from "@/components/account-map-explorer";
import { Card } from "@/components/ui";
import { getAccountMapRecords } from "@/lib/account-map";

export const dynamic = "force-dynamic";

export default async function AccountMapPage() {
  const records = await getAccountMapRecords();

  return (
    <div className="space-y-6">
      <Card
        title="Account Map"
        subtitle="Live map of every customer and prospect. Filter by region, vertical, and owner, then click a point for details."
        icon={<MapPinned className="h-5 w-5" />}
      >
        <AccountMapExplorer records={records} />
      </Card>
    </div>
  );
}
