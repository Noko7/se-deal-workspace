import { Presentation } from "lucide-react";
import { Card } from "@/components/ui";
import { QbrBuilder } from "@/components/qbr-builder";

export default function QbrPage() {
  return (
    <div className="space-y-6">
      <Card
        title="QBR Deck Builder"
        subtitle="Pull a customer's CS360 health report and assemble a curated, on-brand Quarterly Business Review deck, guided by the Jan 2026 Health Check Guide. Preview, curate, and export to PowerPoint."
        icon={<Presentation className="h-5 w-5" />}
      >
        <QbrBuilder defaultSe="SE" />
      </Card>
    </div>
  );
}
