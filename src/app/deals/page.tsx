import { addRequirementAction, decideRecommendationAction, generateRecommendationAction } from "@/lib/actions";
import { getDashboardData } from "@/lib/data";
import { parseJsonArray } from "@/lib/format";
import { ActionBar, Button, Card, EmptyState, FormRow, RecommendationStatusPill, SectionHeader, StatusPill } from "@/components/ui";

export default async function DealsPage() {
  const { deals } = await getDashboardData();

  return (
    <div className="space-y-6">
      <Card
        title="Current Deals"
        subtitle="Pipeline view backed by internal records. Salesforce parity will plug into this model in Wave 2."
      >
        <SectionHeader
          title="Pipeline Snapshot"
          subtitle="Track each deal by stage and next action without leaving the workspace."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {["Discovery", "Design", "Validation"].map((stage) => (
            <div key={stage} className="rounded-lg border border-charcoal-200 bg-charcoal-50 p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-500">{stage}</h3>
                <StatusPill tone="neutral">{deals.filter((deal) => deal.stage === stage).length}</StatusPill>
              </div>
              <div className="space-y-3">
                {deals.filter((deal) => deal.stage === stage).length === 0 ? (
                  <EmptyState title={`No ${stage.toLowerCase()} deals`} description="Move deals into this stage as work progresses." />
                ) : (
                  deals
                    .filter((deal) => deal.stage === stage)
                    .map((deal) => (
                      <div key={deal.id} className="rounded-md border border-charcoal-200 bg-white p-3">
                        <p className="font-semibold">{deal.name}</p>
                        <p className="text-xs text-charcoal-500">{deal.accountName}</p>
                        <p className="mt-2 text-xs text-charcoal-600">{deal.nextAction}</p>
                        {deal.latestSignal ? <p className="mt-2 text-xs text-[#3f5e0a]">{deal.latestSignal}</p> : null}
                      </div>
                    ))
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Environment Requirements + AI Suggested Build" subtitle="Capture deal constraints and produce explainable sizing guidance.">
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
                  <div key={recommendation.id} className="rounded-md border border-charcoal-200 bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{deal.name}</p>
                      <RecommendationStatusPill status={recommendation.decision} />
                    </div>
                    <p className="mt-2 text-xs text-charcoal-600">Confidence: {(recommendation.confidenceScore * 100).toFixed(0)}%</p>
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
