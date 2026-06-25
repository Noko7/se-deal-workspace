import type { Cs360HealthReport } from "./cs360";

// Baked-in sample: the real CS360 downloads for UCLA Anderson School of Business
// (QBR Report + Customer Progress Report), transcribed verbatim from the two
// .pptx exports. Selecting this customer in the builder produces the real
// combined deck rather than synthesized data, so the tool demonstrates against
// an actual account.

export const UCLA_SAMPLE_ACCOUNT = "UCLA Anderson School of Business";

export function buildUclaSampleReport(se: string): Cs360HealthReport {
  const lastPulse = "2026-06-22";
  return {
    account: { name: UCLA_SAMPLE_ACCOUNT, vertical: "Higher Education" },
    pulseEnabled: true,
    lastPulse,
    team: {
      ae: "Steven Roman",
      se: se?.trim() || "Gabriel Flores",
      sam: "Daniel Rivera",
      ase: "TBA",
      executiveSponsor: "-",
      tam: "-",
      csResident: "-",
    },
    summary: {
      activeClusters: 3,
      totalClusters: 4,
      prismCentrals: 1,
      blocksAndSwAssets: 12,
      nodes: 11,
      vms: 159,
      totalLicenseActivation: 99.0,
      ahvAdoption: 30.0,
      pulseHdAdoption: 75.0,
      uptimePct: 100.0,
      npsScore: null,
      openCases: { p1: 0, p2: 0, p3: 0, p4: 0, rfe: 0 },
    },
    clusterUtilization: [
      { name: "NTXCluster01", cpuMaxPct: 44.67, memMaxPct: 61.85, storageMaxPct: 72.91 },
      { name: "NTXCluster02", cpuMaxPct: 20.73, memMaxPct: 41.97, storageMaxPct: 2.38 },
    ],
    nodePurchaseHistory: [
      { year: 2020, nodes: 6 },
      { year: 2021, nodes: 3 },
      { year: 2026, nodes: 2 },
    ],
    licenses: [
      { cluster: "NTXCluster01", name: "LIC-02566273", tier: "NCI Pro", attribute: "CORES", created: "2026-02-11", expiry: "2027-03-31", status: "Activated", entitled: 224, used: 224, unused: 0 },
      { cluster: "NTXCluster02", name: "LIC-02570671", tier: "NCI Pro", attribute: "CORES", created: "2026-03-23", expiry: "2027-03-22", status: "Activated", entitled: 96, used: 96, unused: 0 },
    ],
    featureAdoption: { compression: true, deduplication: false, erasureCoding: false, asyncDr: true, prismCentral: true, metroAvailability: false },
    resourceUtilization: [
      {
        metric: "CPU",
        unit: "%",
        series: [
          { cluster: "NTXCluster01", points: [31, 34, 30, 38, 42, 36, 40, 44, 41, 45, 43, 44] },
          { cluster: "NTXCluster02", points: [16, 18, 15, 20, 19, 17, 21, 18, 20, 19, 18, 20] },
        ],
      },
      {
        metric: "Memory",
        unit: "%",
        series: [
          { cluster: "NTXCluster01", points: [52, 55, 50, 58, 60, 57, 61, 59, 62, 60, 61, 62] },
          { cluster: "NTXCluster02", points: [36, 38, 35, 40, 42, 39, 41, 40, 42, 41, 40, 42] },
        ],
      },
      {
        metric: "Storage",
        unit: "%",
        series: [
          { cluster: "NTXCluster01", points: [66, 67, 68, 69, 70, 71, 72, 72, 73, 72, 73, 73] },
          { cluster: "NTXCluster02", points: [2, 2, 2, 3, 2, 3, 3, 2, 3, 3, 2, 2] },
        ],
      },
    ],
    softwareVersions: [
      { cluster: "NTXCluster01", aosVersion: "6.10.1.14", aosEom: "2026-01-31", aosEos: "2026-10-31", hypervisor: "ESX-8.0.3-24022510", ncc: "5.3.0.1" },
      { cluster: "NTXCluster02", aosVersion: "7.0.1.13", aosEom: "2026-03-31", aosEos: "2026-12-31", hypervisor: "AHV-10.0.1.7", ncc: "5.3.1" },
    ],
    supportCases: [
      { number: "02524221", subject: "Node 21FM3F230248 has incorrect license mode", currentPriority: "P3 - Normal", initialPriority: "P1 - Emergency", status: "Closed", created: "2026-04-15", closed: "2026-04-20" },
      { number: "02430692", subject: "Prism Central not starting up", currentPriority: "P3 - Normal", initialPriority: "P3 - Normal", status: "Closed", created: "2026-01-27", closed: "2026-02-09" },
      { number: "02021153", subject: "Node stuck on Phoenix BIOS update screen during NIC firmware", currentPriority: "P2 - Critical", initialPriority: "P2 - Critical", status: "Closed", created: "2025-07-18", closed: "2025-07-31" },
    ],
    clusterSummary: [
      { name: "NTXCluster01", licenseClass: "software_only", licenseType: "NCI Pro", userVms: 131, nodes: 6, blocks: 3, aosVersion: "6.10.1.14", hypervisor: "ESX-8.0.3-24022510", ncc: "5.3.0.1", lastPulse },
      { name: "NTXCluster02", licenseClass: "software_only", licenseType: "NCI Pro", userVms: 18, nodes: 4, blocks: 3, aosVersion: "7.0.1.13", hypervisor: "AHV-10.0.1.7", ncc: "5.3.1", lastPulse },
    ],
    prismCentral: { name: "e36bee75-dea6-4001-9eeb-76ab24a3934f", size: "Large", clustersManaged: 2, pcVersion: "7.3.1.3", pcEom: "2027-03-31", pcEos: "2027-09-30", ncc: "5.3.1.1", lastPulse },
    blocks: [
      { serial: "20FM3F250198", model: "NX-8235-G7", cluster: "NTXCluster01", nodes: "2", location: "Los Angeles", shipDate: "2020-06-23", contractStatus: "Under Support", ssd: "13.97 TiB", cores: "64" },
      { serial: "20FM3F250199", model: "NX-8235-G7", cluster: "NTXCluster01", nodes: "2", location: "Los Angeles", shipDate: "2020-06-23", contractStatus: "Under Support", ssd: "13.97 TiB", cores: "64" },
      { serial: "20FM3F250200", model: "NX-8235-G7", cluster: "NTXCluster01", nodes: "2", location: "Los Angeles", shipDate: "2020-06-23", contractStatus: "Under Support", ssd: "13.97 TiB", cores: "64" },
      { serial: "21FM3F230248", model: "NX-8235-G7-CM", cluster: "NTXCluster02", nodes: "1", location: "Los Angeles", shipDate: "2021-06-17", contractStatus: "Under Support", ssd: "6.98 TiB", cores: "48" },
      { serial: "21FM3F310029", model: "NX-8235-G7-CM", cluster: "NTXCluster02", nodes: "2", location: "Los Angeles", shipDate: "2021-08-05", contractStatus: "Under Support", ssd: "6.98 TiB", cores: "48" },
      { serial: "21SW000195101", model: "SW-MINE-1T-PRD-3YR", cluster: "Not Found", nodes: "-", location: "Los Angeles", shipDate: "2021-06-17", contractStatus: "EXPIRED", ssd: "-", cores: "-" },
      { serial: "20SW000146016", model: "SW-AOS-PRO-PRD-3YR", cluster: "Not Found", nodes: "-", location: "Los Angeles", shipDate: "2020-06-23", contractStatus: "EXPIRED", ssd: "-", cores: "-" },
    ],
    discoveries: [
      { cluster: "NTXCluster01", policy: "D3-0356 (PC)", description: "VNC Console access fails for Super Admin role in Prism Central pc.7.3.1.2-7.3.1.6 and pc.7.5-7.5.0.5", severity: "Critical", recommendation: "Upgrade Prism Central" },
      { cluster: "NTXCluster01", policy: "D3-0336", description: "Disaster Recovery is enabled; upgrading source/target to AOS 7.3.0.5 may disrupt DR workflows", severity: "Warning", recommendation: "Follow KB 19659" },
      { cluster: "NTXCluster01", policy: "D8-0041", description: "Detected File server version has reached End of Maintenance (EOM)", severity: "Warning", recommendation: "Upgrade Files (KB)" },
      { cluster: "NTXCluster01, NTXCluster02", policy: "D8-0030", description: "Installed AOS version has reached End of Maintenance (EOM)", severity: "Warning", recommendation: "Upgrade AOS via LCM" },
      { cluster: "NTXCluster02", policy: "D3-0358", description: "Installed AOS version may be affected by increased root partition space usage", severity: "Warning", recommendation: "Follow KB 19810" },
    ],
    recommendations: {
      agingAssets4Plus: 11,
      agingAssets3to4: 0,
      eolClusters: 0,
      eolUnder6mo: 1,
      over75Capacity: 0,
      forecast90: 0,
      licensesNotActivated12: 0,
      supportRenewals0to6: 0,
      supportRenewals6to12: 6,
      nccCritical: 1,
    },
    pnpReadiness: { allClusters: 3, peClusters: 2, prismCentrals: 1, licensed: 3, ready: 0, insufficientData: 0, prereqNotMet: 0 },
    licenseActivationLabel: "320 / 320 (100%)",
    licenseActivationPct: 100,
    productTier: "NCI Pro",
    capabilityAdoption: [
      { version: "2.0", capability: "Deployment Scale", usage: "Power" },
      { version: "2.0", capability: "Enterprise Data Services", usage: "Power" },
      { version: "2.0", capability: "Enterprise Compute", usage: "Power" },
      { version: "2.0", capability: "Data Protection & Disaster Recovery", usage: "Usage Unknown" },
      { version: "2.0", capability: "Security", usage: "Standard" },
      { version: "2.0", capability: "Networking & Network Security", usage: "Usage Unknown" },
      { version: "2.0", capability: "Management & Analytics", usage: "Standard" },
    ],
    supportOverview: { sinceDate: "2025-06-23", open: 0, closed: 3, byInitialPriority: { p1: 1, p2: 1, p3: 1, p4: 0, rfe: 0 } },
    renewals: { sinceLabel: "Next 12 Months", items: [{ product: "NCI - Cores", earliest: "2027/03" }], totalQuantity: 320, licenseType: "NCI Pro", renewalPeriod: "Feb-27" },
    certifications: [
      { label: "NCA Certified", users: 0, pct: 0 },
      { label: "NCM Certified", users: 0, pct: 0 },
      { label: "NCP Certified", users: 0, pct: 0 },
      { label: "Uncertified Portal Users", users: 4, pct: 100 },
    ],
    eosSoftware: [
      { version: "6.10.1.14", eom: "01/2026", eos: "10/2026", latest: "6.10.1.9", clusters: 1 },
      { version: "7.0.1.13", eom: "03/2026", eos: "12/2026", latest: "6.10.1.9", clusters: 1 },
    ],
    blocksReview: { totalBlocks: 6, age3to5: 1, ageOver5: 5, eomNow: 6, eomUnder1yr: 0 },
    discoveriesSummary: { critical: 1, warning: 5, active: 6 },
  };
}
