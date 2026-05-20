import { addRequirementAction, decideRecommendationAction, generateRecommendationAction } from "@/lib/actions";
import { getDashboardData } from "@/lib/data";
import { parseJsonArray } from "@/lib/format";
import { Card, RecommendationStatusPill } from "@/components/ui";

export default async function DealsPage() {
  const { deals } = await getDashboardData();

  return (
    <div className="space-y-6">
      <Card
        title="Current Deals"
        subtitle="Pipeline view backed by internal records. Salesforce parity will plug into this model in Wave 2."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {["Discovery", "Design", "Validation"].map((stage) => (
            <div key={stage} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{stage}</h3>
              <div className="space-y-3">
                {deals
                  .filter((deal) => deal.stage === stage)
                  .map((deal) => (
                    <div key={deal.id} className="rounded-md border border-slate-200 bg-white p-3">
                      <p className="font-semibold">{deal.name}</p>
                      <p className="text-xs text-slate-500">{deal.accountName}</p>
                      <p className="mt-2 text-xs text-slate-600">{deal.nextAction}</p>
                      {deal.latestSignal ? <p className="mt-2 text-xs text-emerald-700">{deal.latestSignal}</p> : null}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Environment Requirements + AI Suggested Build" subtitle="Capture deal constraints and produce explainable sizing guidance.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Add Requirement Context</h3>
            <form action={addRequirementAction} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="dealId">Deal</label>
                <select id="dealId" name="dealId">
                  {deals.map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {deal.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="rawText">Requirements</label>
                <textarea
                  id="rawText"
                  name="rawText"
                  rows={5}
                  placeholder="Describe prerequisites, restrictions, workload profile, and customer goals."
                  required
                />
              </div>
              <button type="submit">Save Requirement</button>
            </form>
            <form action={generateRecommendationAction}>
              <div className="space-y-1">
                <label htmlFor="genDealId">Generate For Deal</label>
                <select id="genDealId" name="dealId">
                  {deals.map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {deal.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="mt-2">
                Generate Suggested Build
              </button>
            </form>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Latest Recommendations</h3>
            {deals.flatMap((deal) =>
              deal.recommendations.map((recommendation) => (
                <div key={recommendation.id} className="rounded-md border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{deal.name}</p>
                    <RecommendationStatusPill status={recommendation.decision} />
                  </div>
                  <p className="mt-2 text-xs text-slate-600">Confidence: {(recommendation.confidenceScore * 100).toFixed(0)}%</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    {parseJsonArray(recommendation.ruleMatches).map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                  <form action={decideRecommendationAction} className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                    <input type="hidden" name="recommendationId" value={recommendation.id} />
                    <select name="decision">
                      <option value="APPROVED">Approve</option>
                      <option value="REJECTED">Reject</option>
                    </select>
                    <input name="notes" placeholder="Decision notes" />
                    <button type="submit">Submit</button>
                  </form>
                </div>
              )),
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
