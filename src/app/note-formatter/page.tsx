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
        subtitle="Turn raw notes into clean plain text for the Deal Workspace. Choose Regular Notes by default, or switch to Implementation Plan when needed."
        icon={<NotebookPen className="h-5 w-5" />}
      >
        <NoteFormatterTool />
      </Card>
    </div>
  );
}
