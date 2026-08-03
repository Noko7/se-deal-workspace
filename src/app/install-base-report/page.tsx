import { FileSpreadsheet } from "lucide-react";
import { Card } from "@/components/ui";
import { InstallBaseReport } from "@/components/install-base-report";

export default function InstallBaseReportPage() {
  return (
    <div className="space-y-6">
      <Card title="Install Base Report Generator" icon={<FileSpreadsheet className="h-5 w-5" />}>
        <InstallBaseReport />
      </Card>
    </div>
  );
}
