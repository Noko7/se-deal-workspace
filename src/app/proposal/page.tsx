import { FileText } from "lucide-react";
import { Card } from "@/components/ui";
import { ProposalBuilder } from "@/components/proposal-builder";

export default function ProposalPage() {
  return (
    <div className="space-y-6">
      <Card
        title="Proposal Builder"
        subtitle="Turn a Nutanix Sizer scenario into a polished, on-brand customer proposal: a 2-page Solution Brief (mini-TCO) PDF and an improved Bill of Materials deck, in seconds."
        icon={<FileText className="h-5 w-5" />}
      >
        <ProposalBuilder defaultSe="Nutanix SE" />
      </Card>
    </div>
  );
}
