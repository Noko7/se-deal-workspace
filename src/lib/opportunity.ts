// Shared "Salesforce-style opportunity" view model derived from a Deal.
// Used by both the Current Deals page and the Pipeline hover card so the two
// stay perfectly in sync.

export type OpportunityInput = {
  id: string;
  name: string;
  accountName: string;
  stage: string;
  amount: number;
  closeDate: Date | null;
  owner: string;
  nextAction: string;
  technicalCloseStatus: string;
  latestSignal: string | null;
  meetingsCount: number;
  emailsCount: number;
  recommendationsCount: number;
};

export type Opportunity = {
  id: string;
  oppId: string;
  opportunityName: string;
  accountName: string;
  stage: string;
  probability: number;
  amount: number;
  arr: number;
  closeQuarter: string;
  owner: string;
  nextAction: string;
  technicalCloseStatus: string;
  latestSignal: string | null;
  meetings: number;
  emails: number;
  recommendations: number;
  fit: string;
  notePolicy: "implementation-only" | "regular";
};

export function stageProbability(stage: string): number {
  const s = stage.toLowerCase();
  if (s.includes("prospect")) return 10;
  if (s.includes("qual")) return 25;
  if (s.includes("discov")) return 35;
  if (s.includes("proposal")) return 55;
  if (s.includes("negoti")) return 70;
  if (s.includes("tech")) return 85;
  if (s.includes("close") || s.includes("won")) return 95;
  return 45;
}

export function quarterOf(date: Date | null): string {
  if (!date) return "TBD";
  const q = Math.floor(date.getMonth() / 3) + 1;
  return `Q${q} ${date.getFullYear()}`;
}

export function buildOpportunity(deal: OpportunityInput): Opportunity {
  const probability = stageProbability(deal.stage);
  const arr = Math.round(deal.amount * 0.2);
  const fit = deal.technicalCloseStatus.toLowerCase().includes("green")
    ? "Strong"
    : deal.technicalCloseStatus === "-"
      ? "Unknown"
      : "Watch";
  const notePolicy = deal.stage.toLowerCase().includes("tech") ? "implementation-only" : "regular";

  return {
    id: deal.id,
    oppId: `SF-${deal.id.slice(0, 8).toUpperCase()}`,
    opportunityName: `${deal.accountName} - ${deal.name}`,
    accountName: deal.accountName,
    stage: deal.stage,
    probability,
    amount: deal.amount,
    arr,
    closeQuarter: quarterOf(deal.closeDate),
    owner: deal.owner,
    nextAction: deal.nextAction,
    technicalCloseStatus: deal.technicalCloseStatus,
    latestSignal: deal.latestSignal,
    meetings: deal.meetingsCount,
    emails: deal.emailsCount,
    recommendations: deal.recommendationsCount,
    fit,
    notePolicy,
  };
}
