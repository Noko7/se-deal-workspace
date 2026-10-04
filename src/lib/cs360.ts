// CS360 health-report types.
//
// These interfaces describe the shape of a customer's CS360 data that the QBR
// deck is built from. The data is produced by `parseQbrFiles()` (see
// `qbr-import.ts`), which reads the two real CS360 downloads an SE uploads:
//   - the "QBR Report"    (.pptx, the CS360 Pro QBR Generator deck)
//   - the "Health Report" (.docx, the CS360 Pro TAM Health Check)
// Nothing here fabricates data — it's a pure type contract.

export interface OpenCases {
  p1: number;
  p2: number;
  p3: number;
  p4: number;
  rfe: number;
}

// --- Customer Progress Report fields ----------------------------------------

export interface CapabilityRow {
  version: string;
  capability: string;
  usage: "Power" | "Standard" | "Usage Unknown";
}

export interface CertRow {
  label: string;
  users: number;
  pct: number;
}

export interface EosSoftwareRow {
  version: string;
  eom: string;
  eos: string;
  latest: string;
  clusters: number;
}

export interface RenewalRow {
  product: string;
  earliest: string;
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
  team: { ae: string; se: string; sam: string; ase: string; executiveSponsor: string; tam: string; csResident: string };
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
  // --- Progress Report data ---
  pnpReadiness: { allClusters: number; peClusters: number; prismCentrals: number; licensed: number; ready: number; insufficientData: number; prereqNotMet: number };
  licenseActivationLabel: string; // e.g. "320 / 320 (100%)"
  licenseActivationPct: number;
  productTier: string; // e.g. "NCI Pro"
  capabilityAdoption: CapabilityRow[];
  supportOverview: { sinceDate: string; open: number; closed: number; byInitialPriority: OpenCases };
  renewals: { sinceLabel: string; items: RenewalRow[]; totalQuantity: number; licenseType: string; renewalPeriod: string };
  certifications: CertRow[];
  eosSoftware: EosSoftwareRow[];
  blocksReview: { totalBlocks: number; age3to5: number; ageOver5: number; eomNow: number; eomUnder1yr: number };
  discoveriesSummary: { critical: number; warning: number; active: number };
}
