import { Calculator } from "lucide-react";
import { Card } from "@/components/ui";
import { SimpleSizerTool } from "@/components/simple-sizer-tool";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Simple Sizer · SE Deal Workspace",
};

export default function SimpleSizerPage() {
  return (
    <div className="space-y-6">
      <Card
        title="Simple Sizer"
        subtitle="Import Collector or RVTools exports and generate an SE-ready sizing summary for OEM hardware teams."
        icon={<Calculator className="h-5 w-5" />}
      >
        <SimpleSizerTool />
      </Card>
    </div>
  );
}

