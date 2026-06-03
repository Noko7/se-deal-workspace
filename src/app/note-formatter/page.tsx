import { NotebookPen } from "lucide-react";
import { Card } from "@/components/ui";
import { NoteFormatterTool } from "@/components/note-formatter-tool";

export const metadata = {
  title: "Note Formatter · SE Deal Workspace",
};

export default function NoteFormatterPage() {
  return (
    <div className="space-y-6">
      <Card
        title="Note Formatter"
        subtitle="Turn raw notes into a clean implementation plan with helper tasks and open questions — formatted by your local LLM (configured in Integrations), with an instant offline fallback."
        icon={<NotebookPen className="h-5 w-5" />}
      >
        <NoteFormatterTool />
      </Card>
    </div>
  );
}
