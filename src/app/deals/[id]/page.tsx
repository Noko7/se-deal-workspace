import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getOpportunityDetail } from "@/lib/opportunity-detail";
import { OpportunityDetail } from "@/components/opportunity-detail";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opp = await getOpportunityDetail(id);
  if (!opp) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <Link href="/deals" className="inline-flex items-center gap-1 text-sm font-medium text-iris-600 hover:text-iris-700">
        <ArrowLeft className="h-4 w-4" /> Back to deals
      </Link>
      <OpportunityDetail opp={opp} />
    </div>
  );
}
