import { cookies } from "next/headers";
import { FileText } from "lucide-react";
import { getAccountsOverview, getProposalOppOptions, resolveSeOwner } from "@/lib/data";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { Card } from "@/components/ui";
import { ProposalBuilder } from "@/components/proposal-builder";

export const dynamic = "force-dynamic";

export default async function ProposalPage() {
  const [overview, opps, store] = await Promise.all([getAccountsOverview(), getProposalOppOptions(), cookies()]);
  const session = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  const se = session?.name?.trim() || resolveSeOwner(overview.map((a) => a.owner), null) || "Nutanix SE";

  return (
    <div className="space-y-6">
      <Card
        title="Proposal Builder"
        subtitle="Turn a Nutanix Sizer scenario into a polished, on-brand customer proposal — a 2-page Solution Brief (mini-TCO) PDF and an improved Bill of Materials deck — in seconds."
        icon={<FileText className="h-5 w-5" />}
      >
        <ProposalBuilder defaultSe={se} opps={opps} />
      </Card>
    </div>
  );
}
