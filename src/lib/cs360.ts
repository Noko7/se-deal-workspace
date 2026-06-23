// CS360 connector — STUB.
//
// In production this module will authenticate to CS360 (VPN required) and pull
// the auto-generated QBR Report for a customer via:
//   Cluster -> Cluster Summary -> Actions -> Download QBR Report
// For now we synthesize a realistic, *deterministic* health report per account
// (seeded by the account name) so the QBR builder behaves exactly as it will
// against the live connector. The field set mirrors the real CS360 QBR export
// (see the "Nutanix QBR for UCLA Anderson" reference deck).

export interface OpenCases {
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  rfe: number;
}

export interface ClusterUtil {
  name: string;
  cpuMaxPct: number;
  memMaxPct: number;
  storageMaxPct: number;
}

export interface LicenseRow {
  cluster: string;
  name: string;
  tier: string;
  attribute: string;
  created: string;
  expiry: string;
  status: "Activated" | "Unapplied";
  entitled: number;
  used: number;
  unused: number;
}

export interface SoftwareVersionRow {
  cluster: string;
  aosVersion: string;
  aosEom: string; // End of Maintenance
  aosEos: string; // End of Support
  hypervisor: string; // "AHV-10.0.1.7" | "ESX-7.0.3-..."
  ncc: string;
}

export interface SupportCaseRow {
  number: string;
  subject: string;
  currentPriority: string;
  initialPriority: string;
  status: string;
  created: string;
  closed: string;
}

export interface ClusterSummaryRow {
  name: string;
  licenseClass: string;
  licenseType: string;
  userVms: number;
  nodes: number;
  blocks: number;
  aosVersion: string;
  hypervisor: string;
  ncc: string;
  lastPulse: string;
}

export interface BlockRow {
  serial: string;
  model: string;
  cluster: string;
  nodes: string;
  location: string;
  shipDate: string;
  contractStatus: string;
  ssd: string;
  cores: string;
}

export interface DiscoveryRow {
  cluster: string;
  policy: string;
  description: string;
  severity: string;
  recommendation: string;
}

export interface ResourceMetric {
  metric: "CPU" | "Memory" | "Storage";
  unit: string;
  series: { cluster: string; points: number[] }[];
}

export interface Cs360HealthReport {
  account: { name: string; vertical: string };
  pulseEnabled: boolean;
  lastPulse: string;
  team: { ae: string; se: string[]; csm: string; associateSe: string[] };
  summary: {
    activeClusters: number;
    totalClusters: number;
    prismCentrals: number;
    blocksAndSwAssets: number;
    nodes: number;
    vms: number;
    totalLicenseActivation: number;
    ahvAdoption: number;
    pulseHdAdoption: number;
    uptimePct: number;
    npsScore: number | null;
    openCases: OpenCases;
  };
  clusterUtilization: ClusterUtil[];
  nodePurchaseHistory: { year: number; nodes: number }[];
  licenses: LicenseRow[];
  featureAdoption: {
    compression: boolean;
    deduplication: boolean;
    erasureCoding: boolean;
    asyncDr: boolean;
    prismCentral: boolean;
    metroAvailability: boolean;
  };
  resourceUtilization: ResourceMetric[];
  softwareVersions: SoftwareVersionRow[];
  supportCases: SupportCaseRow[];
  clusterSummary: ClusterSummaryRow[];
  prismCentral: {
    name: string;
    size: string;
    clustersManaged: number;
    pcVersion: string;
    pcEom: string;
    pcEos: string;
    ncc: string;
    lastPulse: string;
  };
  blocks: BlockRow[];
  discoveries: DiscoveryRow[];
  recommendations: {
    agingAssets4Plus: number;
    agingAssets3to4: number;
    eolClusters: number;
    eolUnder6mo: number;
    over75Capacity: number;
    forecast90: number;
    licensesNotActivated12: number;
    supportRenewals0to6: number;
    supportRenewals6to12: number;
    nccCritical: number;
  };
}

// --- deterministic PRNG (mulberry32 seeded by a string hash) -----------------

function hashString(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VERTICALS = [
  "Higher Education",
  "Financial Services",
  "Healthcare",
  "Retail",
  "Public Sector",
  "Manufacturing",
  "Technology",
];

const AE_POOL = ["Steven Roman", "Priya Natarajan", "Marcus Webb", "Dana Kessler"];
const CSM_POOL = ["Gabriel Flores", "Erin Mathews", "Tobias Lund", "Sofia Marquez"];

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/**
 * Synthesize a deterministic CS360 health report for an account. Same input
 * always yields the same report, so the demo is stable across reloads.
 */
export function fetchCs360HealthReport(
  accountName: string,
  options: { se?: string } = {},
): Cs360HealthReport {
  const rng = mulberry32(hashString(accountName || "Account"));
  const now = new Date();
  const lastPulse = isoDate(addDays(now, -2 - Math.floor(rng() * 4)));
  const vertical = pick(rng, VERTICALS);

  const clusterCount = 1 + Math.floor(rng() * 2.4); // 1..3
  const prismCentrals = 1;
  const clusterNames = Array.from({ length: clusterCount }, (_, i) => `NTXCluster0${i + 1}`);

  // Per-cluster fundamentals
  const utilization: ClusterUtil[] = clusterNames.map((name, i) => {
    // Make at least one cluster run hot for some accounts to exercise the
    // ">75% utilization -> expansion" talk track.
    const hot = i === 0 && rng() > 0.45;
    return {
      name,
      cpuMaxPct: round(hot ? 62 + rng() * 30 : 28 + rng() * 30, 1),
      memMaxPct: round(hot ? 68 + rng() * 28 : 35 + rng() * 30, 1),
      storageMaxPct: round(hot ? 78 + rng() * 18 : 45 + rng() * 28, 1),
    };
  });

  const nodesPerCluster = clusterNames.map(() => 3 + Math.floor(rng() * 6)); // 3..8
  const nodes = nodesPerCluster.reduce((a, b) => a + b, 0);
  const vms = clusterNames.reduce((sum) => sum + 30 + Math.floor(rng() * 170), 0);
  const blocksAndSwAssets = nodes + clusterCount * 3;

  // Node purchase history (oldest cluster sets the start year)
  const startYear = 2018 + Math.floor(rng() * 3);
  const historyYears = Math.min(now.getFullYear() - startYear + 1, 7);
  const nodePurchaseHistory = Array.from({ length: historyYears }, (_, i) => ({
    year: startYear + i,
    nodes: i === 0 ? 3 + Math.floor(rng() * 3) : Math.floor(rng() * 4),
  }));

  // Hypervisor mix — some accounts run ESXi (migration talk track)
  const usesEsxi = rng() > 0.5;
  const aosChoices = [
    { v: "6.5.5.7", eom: "2025-09-30", eos: "2026-03-31" }, // near EOS
    { v: "6.10.1.14", eom: "2026-08-31", eos: "2027-02-28" },
    { v: "7.0.1.13", eom: "2027-04-30", eos: "2027-10-31" },
    { v: "7.3.0.5", eom: "2028-01-31", eos: "2028-07-31" },
  ];

  const softwareVersions: SoftwareVersionRow[] = clusterNames.map((name, i) => {
    const aos = i === 0 && rng() > 0.4 ? aosChoices[0] : pick(rng, aosChoices.slice(1));
    const esxi = usesEsxi && i === 0;
    return {
      cluster: name,
      aosVersion: aos.v,
      aosEom: aos.eom,
      aosEos: aos.eos,
      hypervisor: esxi ? "ESX-7.0.3-24585291" : "AHV-10.0.1.7",
      ncc: "5.3.0.1",
    };
  });

  const coresPerNode = 64;
  const clusterSummary: ClusterSummaryRow[] = clusterNames.map((name, i) => ({
    name,
    licenseClass: "software_only",
    licenseType: rng() > 0.7 ? "NCI Ultimate" : "NCI Pro",
    userVms: 20 + Math.floor(rng() * 160),
    nodes: nodesPerCluster[i],
    blocks: Math.max(2, Math.ceil(nodesPerCluster[i] / 2)),
    aosVersion: softwareVersions[i].aosVersion,
    hypervisor: softwareVersions[i].hypervisor,
    ncc: "5.3.0.1",
    lastPulse,
  }));

  // Licenses — sometimes a tier is unapplied (Advanced Replication) to exercise
  // the "downgraded / not using DR" talk track from the guide.
  const replicationUnapplied = rng() > 0.55;
  const licenses: LicenseRow[] = clusterNames.map((name, i) => {
    const cores = nodesPerCluster[i] * coresPerNode;
    return {
      cluster: name,
      name: `LIC-0${2500000 + Math.floor(rng() * 99999)}`,
      tier: clusterSummary[i].licenseType,
      attribute: "CORES",
      created: isoDate(addDays(now, -300 - Math.floor(rng() * 200))),
      expiry: isoDate(addDays(now, 200 + Math.floor(rng() * 400))),
      status: "Activated",
      entitled: cores,
      used: cores,
      unused: 0,
    };
  });
  if (replicationUnapplied) {
    licenses.push({
      cluster: clusterNames[0],
      name: `LIC-0${2500000 + Math.floor(rng() * 99999)}`,
      tier: "NCI Advanced Replication",
      attribute: "CORES",
      created: isoDate(addDays(now, -400)),
      expiry: isoDate(addDays(now, 365)),
      status: "Unapplied",
      entitled: nodesPerCluster[0] * coresPerNode,
      used: 0,
      unused: nodesPerCluster[0] * coresPerNode,
    });
  }
  const totalEntitled = licenses.reduce((a, l) => a + l.entitled, 0);
  const totalUsed = licenses.reduce((a, l) => a + l.used, 0);
  const totalLicenseActivation = round((totalUsed / Math.max(1, totalEntitled)) * 100, 1);

  // Feature adoption
  const featureAdoption = {
    compression: rng() > 0.15,
    deduplication: rng() > 0.7,
    erasureCoding: nodes >= 4 && rng() > 0.55,
    asyncDr: rng() > 0.45,
    prismCentral: true,
    metroAvailability: clusterCount > 1 && rng() > 0.7,
  };

  // Resource utilization time-series (last ~12 points), one series per cluster.
  const makeSeries = (base: number, drift: number) =>
    clusterNames.map((name, idx) => ({
      cluster: name,
      points: Array.from({ length: 12 }, (_, t) => {
        const trend = base + drift * (t / 11) * (idx === 0 ? 1 : 0.6);
        return round(Math.max(2, Math.min(99, trend + (rng() - 0.5) * 10)), 1);
      }),
    }));
  const resourceUtilization: ResourceMetric[] = [
    { metric: "CPU", unit: "%", series: makeSeries(utilization[0].cpuMaxPct - 15, 12) },
    { metric: "Memory", unit: "%", series: makeSeries(utilization[0].memMaxPct - 12, 10) },
    { metric: "Storage", unit: "%", series: makeSeries(utilization[0].storageMaxPct - 8, 14) },
  ];

  // Open support cases
  const hasActiveCase = rng() > 0.8;
  const openCases: OpenCases = {
    p1: 0,
    p2: hasActiveCase ? 1 : 0,
    p3: Math.floor(rng() * 2),
    p4: Math.floor(rng() * 2),
    rfe: Math.floor(rng() * 2),
  };

  const caseSubjects = [
    "Node has incorrect license mode",
    "Prism Central not starting up",
    "LCM upgrade pre-check failure",
    "Disk removal not completing",
    "Alert: CVM memory usage high",
    "Foundation imaging timeout",
  ];
  const supportCases: SupportCaseRow[] = Array.from(
    { length: 2 + Math.floor(rng() * 3) },
    (_, i) => {
      const created = addDays(now, -200 + Math.floor(rng() * 150));
      return {
        number: `025${20000 + Math.floor(rng() * 79999)}`,
        subject: pick(rng, caseSubjects),
        currentPriority: pick(rng, ["P3 - Normal", "P4 - Low", "P2 - High"]),
        initialPriority: pick(rng, ["P1 - Emergency", "P2 - High", "P3 - Normal"]),
        status: "Closed",
        created: isoDate(created),
        closed: isoDate(addDays(created, 1 + Math.floor(rng() * 10))),
      };
    },
  );

  // Blocks / hardware
  const models = usesEsxi ? ["NX-8235-G7", "NX-3060-G8"] : ["NX-8170-G9", "NX-3155-G9"];
  const location = pick(rng, ["Los Angeles", "Dallas", "Ashburn", "Chicago", "Frankfurt"]);
  const blocks: BlockRow[] = clusterNames.flatMap((name, ci) =>
    Array.from({ length: Math.min(3, nodesPerCluster[ci]) }, (_, i) => {
      const shipDate = addDays(now, -((2 + Math.floor(rng() * 4)) * 365));
      const ageYears = (now.getTime() - shipDate.getTime()) / (365 * 86400000);
      return {
        serial: `2${i}FM3F2${500000 + Math.floor(rng() * 99999)}`,
        model: pick(rng, models),
        cluster: name,
        nodes: String(2),
        location,
        shipDate: isoDate(shipDate),
        contractStatus: ageYears > 4.6 ? "Expiring" : "Under Support",
        ssd: `${round(13 + rng() * 6, 2)} TiB`,
        cores: String(coresPerNode),
      };
    }),
  );
  const aging4Plus = blocks.filter((b) => b.contractStatus === "Expiring").length;

  // Discoveries
  const discoveries: DiscoveryRow[] = [];
  if (usesEsxi) {
    discoveries.push({
      cluster: clusterNames[0],
      policy: "D3-0290",
      description: "Manual upgrades to ESXi 8 may break Nutanix VIBs impacting manageability of the cluster",
      severity: "Info",
      recommendation: "Follow KB 17266",
    });
  }
  if (featureAdoption.asyncDr) {
    discoveries.push({
      cluster: clusterNames[0],
      policy: "D3-0336",
      description: "Disaster Recovery is enabled — confirm replication targets and RPO/RTO objectives",
      severity: "Info",
      recommendation: "Validate DR runbook with the customer",
    });
  }

  const npsGiven = rng() > 0.4;

  return {
    account: { name: accountName, vertical },
    pulseEnabled: rng() > 0.08,
    lastPulse,
    team: {
      ae: pick(rng, AE_POOL),
      se: [options.se?.trim() || "Lizi Singletary"],
      csm: pick(rng, CSM_POOL),
      associateSe: rng() > 0.5 ? ["Luke Piermarini"] : [],
    },
    summary: {
      activeClusters: clusterCount,
      totalClusters: clusterCount,
      prismCentrals,
      blocksAndSwAssets,
      nodes,
      vms,
      totalLicenseActivation,
      ahvAdoption: round(usesEsxi ? 20 + rng() * 30 : 80 + rng() * 19, 1),
      pulseHdAdoption: round(60 + rng() * 38, 1),
      uptimePct: round(99.9 + rng() * 0.09, 2),
      npsScore: npsGiven ? Math.floor(40 + rng() * 55) : null,
      openCases,
    },
    clusterUtilization: utilization,
    nodePurchaseHistory,
    licenses,
    featureAdoption,
    resourceUtilization,
    softwareVersions,
    supportCases,
    clusterSummary,
    prismCentral: {
      name: `${accountName.slice(0, 4).toLowerCase()}-pc-01`,
      size: nodes > 24 ? "Large" : "Small",
      clustersManaged: clusterCount,
      pcVersion: "7.3.1.3",
      pcEom: "2027-06-30",
      pcEos: "2027-12-31",
      ncc: "5.3.0.1",
      lastPulse,
    },
    blocks,
    discoveries,
    recommendations: {
      agingAssets4Plus: aging4Plus,
      agingAssets3to4: Math.max(0, blocks.length - aging4Plus - 1),
      eolClusters: 0,
      eolUnder6mo: softwareVersions.some((s) => s.aosVersion.startsWith("6.5")) ? 1 : 0,
      over75Capacity: utilization.filter((u) => u.storageMaxPct > 75).length,
      forecast90: utilization.filter((u) => u.storageMaxPct > 85).length,
      licensesNotActivated12: 0,
      supportRenewals0to6: aging4Plus,
      supportRenewals6to12: Math.max(0, clusterCount - 1),
      nccCritical: 0,
    },
  };
}
