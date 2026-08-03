import Link from "next/link";
import { Calculator, FileSpreadsheet, FileText, NotebookPen, Plug, Presentation } from "lucide-react";
import { Card } from "@/components/ui";

const tools = [
  { href: "/note-formatter", title: "Note Formatter", description: "Turn notes into implementation plans", icon: <NotebookPen className="h-5 w-5" /> },
  { href: "/simple-sizer", title: "Simple Sizer", description: "Import Collector/RVTools and size quickly", icon: <Calculator className="h-5 w-5" /> },
  { href: "/qbr", title: "QBR Deck Builder", description: "Pull CS360 health checks into an on-brand QBR deck", icon: <Presentation className="h-5 w-5" /> },
  { href: "/install-base-report", title: "Install Base Report", description: "Merge CS360 exports into a color-coded install base workbook", icon: <FileSpreadsheet className="h-5 w-5" /> },
  { href: "/proposal", title: "Proposal Builder", description: "Turn a Sizer scenario into a branded proposal + BOM", icon: <FileText className="h-5 w-5" /> },
  { href: "/integrations", title: "Integrations", description: "Connection setup and health checks", icon: <Plug className="h-5 w-5" /> },
];

export default function HomePage() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <Link key={tool.href} href={tool.href} className="block">
          <Card title={tool.title} subtitle={tool.description} icon={tool.icon}>
            <span className="text-sm font-medium text-iris-600">Open →</span>
          </Card>
        </Link>
      ))}
    </div>
  );
}
