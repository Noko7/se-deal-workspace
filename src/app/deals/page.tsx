import { Briefcase, Cpu } from "lucide-react";
import { addRequirementAction, decideRecommendationAction, generateRecommendationAction } from "@/lib/actions";
import { getDashboardData, getPipelineDeals } from "@/lib/data";
import { parseJsonArray } from "@/lib/format";
import { ActionBar, Button, Card, EmptyState, FormRow, RecommendationStatusPill, SectionHeader } from "@/components/ui";
import { PipelineBoard } from "@/components/pipeline-board";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const { deals } = await getDashboardData();
  const pipelineDeals = await getPipelineDeals();

  return (
    <div className="space-y-6">
      <Card
        title="Current Deals"
        subtitle="Technical Close pipeline synced from Salesforce (mock data until the connector is live). Each column is a Technical Close Status; 100% means the SE's technical work is complete."
        icon={<Briefcase className="h-5 w-5" />}
      >
        <PipelineBoard deals={pipelineDeals} />
      </Card>

      <Card
        title="Environment Requirements + AI Suggested Build"
        subtitle="Capture deal constraints and produce explainable sizing guidance."
        icon={<Cpu className="h-5 w-5" />}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-lg border border-charcoal-200 bg-charcoal-50 p-4">
            <SectionHeader
              title="Requirement Intake"
              subtitle="Capture prerequisites, restrictions, and workload details before generating recommendations."
            />
            <form action={addRequirementAction} className="space-y-3">
              <FormRow label="Deal" htmlFor="dealId" helper="Requirement notes will attach to this deal record.">
                <select id="dealId" name="dealId">
                  {deals.map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {deal.name}
                    </option>
                  ))}
                </select>
              </FormRow>
              <FormRow
                label="Requirements"
                htmlFor="rawText"
                helper="Include constraints like DR, rack limits, resource pressure, and customer priorities."
              >
                <textarea
                  id="rawText"
                  name="rawText"
                  rows={5}
                  placeholder="Describe prerequisites, restrictions, workload profile, and customer goals."
                  required
                />
              </FormRow>
              <ActionBar>
                <Button type="submit">Save Requirement</Button>
              </ActionBar>
            </form>
            <form action={generateRecommendationAction} className="rounded-lg border border-charcoal-200 bg-white p-3">
              <FormRow label="Generate for Deal" htmlFor="genDealId" helper="Uses the most recent requirement entries for this deal.">
                <select id="genDealId" name="dealId">
                  {deals.map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {deal.name}
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
            <SectionHeader
              title="Latest Recommendations"
              subtitle="Review rule matches and approve or reject with clear notes."
            />
            {deals.flatMap((deal) => deal.recommendations).length === 0 ? (
              <EmptyState
                title="No recommendations yet"
                description="Generate a recommendation after adding requirement context."
              />
            ) : (
              deals.flatMap((deal) =>
                deal.recommendations.map((recommendation) => (
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
                )),
              )
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
