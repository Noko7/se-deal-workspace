interface ParsedRequirement {
  constraints: string[];
  prerequisites: string[];
  restrictions: string[];
  workloadHints: string[];
}

const RULES = [
  {
    id: "storage_high",
    match: (text: string) => /(high storage|storage .*80|utilization .*75|capacity pressure)/i.test(text),
    recommendation: "Increase storage capacity headroom and prioritize dense all-flash nodes.",
    risk: "Validate growth assumptions over next 2 quarters.",
  },
  {
    id: "dr_required",
    match: (text: string) => /(dr|disaster recovery|replication|rto|rpo)/i.test(text),
    recommendation: "Include Async DR design path and document recovery objectives.",
    risk: "Confirm replication bandwidth and target-site readiness.",
  },
  {
    id: "rack_restricted",
    match: (text: string) => /(no rack|limited rack|space constraint|datacenter space)/i.test(text),
    recommendation: "Optimize with higher density nodes due to physical footprint constraints.",
    risk: "Thermal and power envelope validation required.",
  },
  {
    id: "ai_or_db_workload",
    match: (text: string) => /(database|ai|analytics|latency sensitive)/i.test(text),
    recommendation: "Balance CPU/RAM profile for mixed performance workloads.",
    risk: "Confirm IOPS profile and workload burst patterns.",
  },
];

export function parseRequirementText(rawText: string): ParsedRequirement {
  const lower = rawText.toLowerCase();
  const constraints = [];
  const prerequisites = [];
  const restrictions = [];
  const workloadHints = [];

  if (/(high storage|storage .*80|capacity)/i.test(lower)) {
    constraints.push("high_storage_utilization");
  }
  if (/(dr|disaster recovery|replication|rto|rpo)/i.test(lower)) {
    constraints.push("dr_requirement");
    prerequisites.push("validate_dr_target_and_bandwidth");
  }
  if (/(no rack|limited rack|space constraint)/i.test(lower)) {
    restrictions.push("datacenter_space_constraint");
  }
  if (/(database|erp|sql|oracle)/i.test(lower)) {
    workloadHints.push("database_workload");
  }
  if (/(ai|gpu|inference|ml)/i.test(lower)) {
    workloadHints.push("ai_workload_signal");
  }

  return {
    constraints,
    prerequisites,
    restrictions,
    workloadHints,
  };
}

export function buildSizingRecommendation(requirementTexts: string[]) {
  const combinedText = requirementTexts.join(" ");
  const matches = RULES.filter((rule) => rule.match(combinedText));

  const suggestedConfig = {
    nodeCount: matches.length > 2 ? 6 : 4,
    storageTier: matches.some((m) => m.id === "storage_high") ? "All-flash preferred" : "Hybrid or all-flash",
    drMode: matches.some((m) => m.id === "dr_required") ? "Async DR recommended" : "Single-site with future DR plan",
    notes: matches.map((m) => m.recommendation),
  };

  return {
    suggestedConfig,
    ruleMatches: matches.map((m) => m.recommendation),
    riskFlags: matches.map((m) => m.risk),
    confidenceScore: Math.min(0.95, 0.55 + matches.length * 0.12),
  };
}
