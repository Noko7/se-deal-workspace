import { MapPinned } from "lucide-react";
import { Card } from "@/components/ui";
import { MapLoading } from "@/components/map-loading";

// Streamed while the server fetches/parses the account data (the dev sources are
// large), so the purple "Loading map…" spinner shows on the map area on every
// navigation/reload until the data is ready.
export default function Loading() {
  return (
    <div className="space-y-6">
      <Card
        title="Account Map"
        subtitle="Loading the latest customers and prospects…"
        icon={<MapPinned className="h-5 w-5" />}
      >
        <MapLoading variant="block" />
      </Card>
    </div>
  );
}
