import Link from "next/link";
import { BriefcaseBusiness, Cpu, Search } from "lucide-react";
import { addRequirementAction, decideRecommendationAction, generateRecommendationAction } from "@/lib/actions";
import { getDashboardData } from "@/lib/data";
import { parseJsonArray } from "@/lib/format";
import { buildOpportunity } from "@/lib/opportunity";
import { ActionBar, Button, Card, EmptyState, FormRow, RecommendationStatusPill, SectionHeader } from "@/components/ui";
import { OpportunityCard } from "@/components/opportunity-card";

export const dynamic = "force-dynamic";

type DealsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function DealsPage({ searchParams }: DealsPageProps) {
  const { deals } = await getDashboardData();
  const params = await searchParams;
  const query = (params.q ?? "").trim().toLowerCase();

  const opportunities = deals.map((deal) =>
    buildOpportunity({
      id: deal.id,
      name: deal.name,
      accountName: deal.accountName,
      stage: deal.stage,
      amount: deal.amount,
      closeDate: deal.closeDate,
      owner: deal.owner,
      nextAction: deal.nextAction,
      technicalCloseStatus: deal.technicalCloseStatus,
      latestSignal: deal.latestSignal,
      meetingsCount: deal.meetings.length,
      emailsCount: deal.emails.length,
      recommendationsCount: deal.recommendations.length,
    }),
  );
  const filtered = query
    ? opportunities.filter(
        (opp) =>
          opp.opportunityName.toLowerCase().includes(query) ||
          opp.accountName.toLowerCase().includes(query) ||
          opp.owner.toLowerCase().includes(query) ||
          opp.oppId.toLowerCase().includes(query),
      )
    : opportunities;

  const recommendationList = deals.flatMap((deal) =>
    deal.recommendations.map((recommendation) => ({ deal, recommendation })),
  );

  return (
    <div className="space-y-6">
      <Card
        title="Current Deals"
        subtitle="Searchable, Salesforce-style opportunity view for SE workflows and technical-close execution."
        icon={<BriefcaseBusiness className="h-5 w-5" />}
      >
        <form className="mb-4 flex flex-wrap items-end gap-2" method="GET">
          <div className="min-w-[260px] flex-1">
            <label htmlFor="deal-search" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-charcoal-500">
              Search Opportunities
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" />
              <input
                id="deal-search"
                name="q"
                defaultValue={params.q ?? ""}
                className="w-full pl-8"
                placeholder="Search by opportunity, account, owner, or SF ID"
              />
            </div>
          </div>
          <Button type="submit">Search</Button>
          {params.q ? (
            <Link href="/deals" className="rounded-md bg-white px-3 py-2 text-sm font-medium text-charcoal-800 hover:bg-charcoal-50" style={{ border: "1px solid var(--color-charcoal-300)" }}>
              Clear
            </Link>
          ) : null}
        </form>

        {filtered.length === 0 ? (
          <EmptyState title="No matching opportunities" description="Adjust your search to find opportunities." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {filtered.map((opp) => (
              <OpportunityCard
                key={opp.id}
                opp={opp}
                actions={
                  <>
                    <Link
                      href={`/deals/${opp.id}`}
                      className="rounded-md bg-iris-500 px-3 py-2 text-sm font-medium text-white hover:bg-iris-600"
                    >
                      View Opportunity
                    </Link>
                    <Link
                      href={
                        opp.notePolicy === "implementation-only"
                          ? "/note-formatter?noteType=plan&locked=1"
                          : "/note-formatter?noteType=meeting"
                      }
                      className="rounded-md bg-white px-3 py-2 text-sm font-medium text-charcoal-800 hover:bg-charcoal-50"
                      style={{ border: "1px solid var(--color-charcoal-300)" }}
                    >
                      {opp.notePolicy === "implementation-only" ? "Create Implementation Note" : "Create New Note"}
                    </Link>
                    <Link
                      href={`/accounts/${opp.id}`}
                      className="rounded-md bg-white px-3 py-2 text-sm font-medium text-charcoal-800 hover:bg-charcoal-50"
                      style={{ border: "1px solid var(--color-charcoal-300)" }}
                    >
                      View Deal Workspace
                    </Link>
                  </>
                }
              />
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Environment Requirements + AI Suggested Build"
        subtitle="Capture constraints and generate explainable recommendations using dummy Salesforce-style opportunity context."
        icon={<Cpu className="h-5 w-5" />}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-lg border border-charcoal-200 bg-charcoal-50 p-4">
            <SectionHeader
              title="Requirement Intake"
              subtitle="Attach requirement and sizing context directly to a selected opportunity."
            />
            <form action={addRequirementAction} className="space-y-3">
              <FormRow label="Opportunity" htmlFor="dealId" helper="Requirement notes attach to this deal record.">
                <select id="dealId" name="dealId">
                  {filtered.map((opp) => (
                    <option key={opp.id} value={opp.id}>
                      {opp.oppId} - {opp.opportunityName}
                    </option>
                  ))}
                </select>
              </FormRow>
              <FormRow
                label="Requirements"
                htmlFor="rawText"
                helper="Include DR, workload profile, constraints, rack limits, and customer priorities."
              >
                <textarea
                  id="rawText"
                  name="rawText"
                  rows={6}
                  placeholder="Describe prerequisites, restrictions, workload profile, and customer goals."
                  required
                />
              </FormRow>
              <ActionBar>
                <Button type="submit">Save Requirement</Button>
              </ActionBar>
            </form>

            <form action={generateRecommendationAction} className="rounded-lg border border-charcoal-200 bg-white p-3">
              <FormRow label="Generate for Opportunity" htmlFor="genDealId" helper="Uses the most recent requirement entries for this deal.">
                <select id="genDealId" name="dealId">
                  {filtered.map((opp) => (
                    <option key={opp.id} value={opp.id}>
                      {opp.oppId} - {opp.opportunityName}
                    </option>
                  ))}
                </select>
              </FormRow>
              <ActionBar>
                <Button type="submit">Generate Suggested Build</Button>
              </ActionBar>
            </form>
          </div>

          <div className="space-y-4">
            <SectionHeader title="Latest Recommendations" subtitle="Approve or reject recommendations with explicit notes." />
            {recommendationList.length === 0 ? (
              <EmptyState title="No recommendations yet" description="Generate a recommendation after adding requirement context." />
            ) : (
              recommendationList.map(({ deal, recommendation }) => (
                <div key={recommendation.id} className="rounded-md border border-charcoal-200 border-l-4 border-l-iris-400 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{deal.name}</p>
                    <RecommendationStatusPill status={recommendation.decision} />
                  </div>
                  <p className="mt-2 text-xs text-charcoal-600">
                    Confidence: <span className="font-semibold text-iris-600">{(recommendation.confidenceScore * 100).toFixed(0)}%</span>
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-charcoal-700">
                    {parseJsonArray(recommendation.ruleMatches).map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                  <form action={decideRecommendationAction} className="mt-3 rounded-md border border-charcoal-200 p-3">
                    <input type="hidden" name="recommendationId" value={recommendation.id} />
                    <div className="grid gap-2 md:grid-cols-[1fr_1fr]">
                      <FormRow label="Decision" htmlFor={`decision-${recommendation.id}`}>
                        <select id={`decision-${recommendation.id}`} name="decision">
                          <option value="APPROVED">Approve</option>
                          <option value="REJECTED">Reject</option>
                        </select>
                      </FormRow>
                      <FormRow label="Decision Notes" htmlFor={`notes-${recommendation.id}`}>
                        <input id={`notes-${recommendation.id}`} name="notes" placeholder="Add context for this decision" />
                      </FormRow>
                    </div>
                    <ActionBar>
                      <Button type="submit">Submit Decision</Button>
                    </ActionBar>
                  </form>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
