// Licensing reference for the whole Nutanix portfolio, not just NCI.
//
// `nci-editions.ts` carries the NCI and NCM edition matrices in a fixed
// Starter/Pro/Ultimate shape. Several products license on two tiers (NUS, EUC,
// NCI-C, Prism) or a single tier (NDB, NC2, NAI), so this module re-expresses
// every product's licensing on a tier-agnostic shape and adds the products the
// deck previously had no pages for. One renderer then covers the portfolio.
//
// Each matrix is a curated summary of the official Nutanix software-options
// collateral -- the same editorial standard as the NCI matrix -- and links back
// to the authoritative source rather than reproducing the full feature grid.

import type { Cell, EditionSection } from "@/lib/nci-editions";
import {
  EDITION_IDEAL,
  EDITION_TAGLINE,
  NCI_EDITION_MATRIX,
  NCI_EDITIONS_SOURCE,
  NCM_EDITION_IDEAL,
  NCM_EDITION_MATRIX,
  NCM_EDITION_TAGLINE,
} from "@/lib/nci-editions";
import { LICENSE_CATALOG, type LicenseProductKey } from "@/lib/license-catalog";

// A capability row whose cells line up positionally with `ProductLicensing.tiers`.
export type MatrixRow = { feature: string; cells: Cell[] };
export type MatrixSection = { title: string; rows: MatrixRow[] };

export type ProductLicensing = {
  product: LicenseProductKey;
  abbrev: string; // "NUS"
  name: string; // "Nutanix Unified Storage"
  // One line on how the product is metered, shown under the page title.
  meter: string;
  tiers: string[];
  tagline: Record<string, string>;
  ideal: Record<string, string>;
  sections: MatrixSection[];
  source: string;
};

// Fixed-shape Starter/Pro/Ultimate sections -> positional cells.
function fromEditionSections(sections: EditionSection[]): MatrixSection[] {
  return sections.map((s) => ({
    title: s.title,
    rows: s.rows.map((r) => ({ feature: r.feature, cells: [r.starter, r.pro, r.ultimate] })),
  }));
}

const SOURCE = NCI_EDITIONS_SOURCE;

const NCI: ProductLicensing = {
  product: "CloudInfrastructure",
  abbrev: "NCI",
  name: "Nutanix Cloud Infrastructure",
  meter: "Licensed per physical CPU core across the cluster",
  tiers: ["Starter", "Pro", "Ultimate"],
  tagline: EDITION_TAGLINE,
  ideal: EDITION_IDEAL,
  sections: fromEditionSections(NCI_EDITION_MATRIX),
  source: SOURCE,
};

const NCM: ProductLicensing = {
  product: "CloudManager",
  abbrev: "NCM",
  name: "Nutanix Cloud Manager",
  meter: "Licensed per physical CPU core on the clusters it manages",
  tiers: ["Starter", "Pro", "Ultimate"],
  tagline: NCM_EDITION_TAGLINE,
  ideal: NCM_EDITION_IDEAL,
  sections: fromEditionSections(NCM_EDITION_MATRIX),
  source: SOURCE,
};

const NCI_C: ProductLicensing = {
  product: "ComputeInfrastructure",
  abbrev: "NCI-C",
  name: "Nutanix Cloud Infrastructure Compute",
  meter: "Licensed per physical CPU core; storage is served by the external array",
  tiers: ["Pro", "Ultimate"],
  tagline: {
    Pro: "AHV compute against an external enterprise array",
    Ultimate: "External-storage compute with advanced security and multi-site DR",
  },
  ideal: {
    Pro: "Refreshing compute while keeping an existing FlashArray or PowerStore investment",
    Ultimate: "External-storage estates that also need microsegmentation and multi-site recovery",
  },
  sections: [
    {
      title: "Compute Platform",
      rows: [
        { feature: "AHV virtualization (hypervisor included)", cells: [true, true] },
        { feature: "External array connectivity over NVMe/TCP", cells: [true, true] },
        { feature: "Independent compute and storage scaling", cells: [true, true] },
        { feature: "Online cluster grow / shrink", cells: [true, true] },
      ],
    },
    {
      title: "Management & Mobility",
      rows: [
        { feature: "Prism Central multi-cluster management", cells: [true, true] },
        { feature: "Live migration and VM:host affinity policies", cells: [true, true] },
        { feature: "Cross-cluster live migration", cells: [false, true] },
      ],
    },
    {
      title: "Security & Recovery",
      rows: [
        { feature: "Data-at-rest encryption on the array", cells: ["Array-native", "Array-native"] },
        { feature: "Microsegmentation (Flow)", cells: ["addon", true] },
        { feature: "Multi-site DR orchestration", cells: ["addon", true] },
      ],
    },
  ],
  source: SOURCE,
};

const EUC: ProductLicensing = {
  product: "EUC",
  abbrev: "EUC",
  name: "Nutanix End User Computing",
  meter: "Licensed per physical CPU core on the desktop clusters",
  tiers: ["Pro", "Ultimate"],
  tagline: {
    Pro: "Full-stack platform for virtual desktops and apps",
    Ultimate: "End user computing with advanced management and security",
  },
  ideal: {
    Pro: "VDI and published-app estates consolidating onto a single platform",
    Ultimate: "Regulated or multi-site desktop estates needing microsegmentation and DR",
  },
  sections: [
    {
      title: "Desktop Platform",
      rows: [
        { feature: "AHV virtualization for desktops and apps", cells: [true, true] },
        { feature: "Citrix, Omnissa Horizon and Frame brokers", cells: [true, true] },
        { feature: "MCS / PVS and instant-clone provisioning", cells: [true, true] },
        { feature: "GPU passthrough and vGPU profiles", cells: [true, true] },
      ],
    },
    {
      title: "Data Services",
      rows: [
        { feature: "Inline and capacity compression", cells: [true, true] },
        { feature: "Capacity deduplication (profile and image sprawl)", cells: [true, true] },
        { feature: "Erasure Coding (EC-X)", cells: [true, true] },
        { feature: "Files for user profiles and home directories", cells: ["addon", "addon"] },
      ],
    },
    {
      title: "Security & Continuity",
      rows: [
        { feature: "Data-at-rest encryption + Native KMS", cells: [true, true] },
        { feature: "Microsegmentation (Flow)", cells: ["addon", true] },
        { feature: "Multi-site desktop DR", cells: ["addon", true] },
      ],
    },
  ],
  source: SOURCE,
};

const NUS: ProductLicensing = {
  product: "NUS",
  abbrev: "NUS",
  name: "Nutanix Unified Storage",
  meter: "Licensed per TiB of usable capacity, pooled across files, objects and volumes",
  tiers: ["Pro", "Ultimate"],
  tagline: {
    Pro: "Unified files, objects and block storage",
    Ultimate: "Unified storage with advanced data services and security",
  },
  ideal: {
    Pro: "Consolidating file shares, S3 buckets and iSCSI volumes onto the platform",
    Ultimate: "Multi-site unstructured data with retention, ransomware and DR requirements",
  },
  sections: [
    {
      title: "Storage Services",
      rows: [
        { feature: "Files: SMB and NFS shares", cells: [true, true] },
        { feature: "Objects: S3-compatible buckets", cells: [true, true] },
        { feature: "Volumes: iSCSI block storage", cells: [true, true] },
        { feature: "Multiprotocol access on a single share", cells: [true, true] },
      ],
    },
    {
      title: "Data Protection",
      rows: [
        { feature: "Snapshots and self-service restore", cells: [true, true] },
        { feature: "Async replication between sites", cells: [true, true] },
        { feature: "Smart DR failover and failback for Files", cells: [false, true] },
        { feature: "Objects streaming replication", cells: [false, true] },
      ],
    },
    {
      title: "Security & Governance",
      rows: [
        { feature: "Data-at-rest encryption", cells: [true, true] },
        { feature: "WORM / Object Lock retention", cells: [false, true] },
        { feature: "Ransomware detection and blocking", cells: ["addon", true] },
        { feature: "Data Lens analytics and auditing", cells: ["addon", "addon"] },
      ],
    },
  ],
  source: SOURCE,
};

const DATA_LENS: ProductLicensing = {
  product: "DataLens",
  abbrev: "NDL",
  name: "Nutanix Data Lens",
  meter: "SaaS service, licensed per TiB of monitored unstructured capacity",
  tiers: ["Starter", "Pro"],
  tagline: {
    Starter: "Data lifecycle management and signature-based ransomware protection",
    Pro: "Adds behavior-based threat detection and self-service restore",
  },
  ideal: {
    Starter: "Gaining visibility and basic ransomware blocking across file estates",
    Pro: "Security teams needing anomaly detection, permission risk and longer retention",
  },
  sections: [
    {
      title: "Visibility & Governance",
      rows: [
        { feature: "Global file and object inventory", cells: [true, true] },
        { feature: "Audit trail retention", cells: ["1 month", "1 year"] },
        { feature: "Data age, type and capacity analytics", cells: [true, true] },
        { feature: "Permission risk analytics", cells: [false, true] },
      ],
    },
    {
      title: "Ransomware Protection",
      rows: [
        { feature: "Signature-based blocking (known patterns)", cells: [true, true] },
        { feature: "Behavior-based anomaly detection", cells: [false, true] },
        { feature: "Automated share lockdown on detection", cells: [false, true] },
        { feature: "One-click self-service restore", cells: [false, true] },
      ],
    },
  ],
  source: SOURCE,
};

const NDB: ProductLicensing = {
  product: "Database",
  abbrev: "NDB",
  name: "Nutanix Database Service",
  meter: "Licensed per physical CPU core running database workloads",
  tiers: ["Standard"],
  tagline: { Standard: "Database lifecycle automation and copy data management" },
  ideal: { Standard: "DBA teams automating provisioning, patching and refresh across engines" },
  sections: [
    {
      title: "Supported Engines",
      rows: [
        { feature: "Oracle, Microsoft SQL Server", cells: [true] },
        { feature: "PostgreSQL, MySQL, MariaDB", cells: [true] },
        { feature: "MongoDB, SAP HANA", cells: [true] },
      ],
    },
    {
      title: "Lifecycle Automation",
      rows: [
        { feature: "One-click provisioning from curated profiles", cells: [true] },
        { feature: "Patch management with rollback", cells: [true] },
        { feature: "High availability and cluster provisioning", cells: [true] },
        { feature: "Multi-cluster and multi-cloud database fleet view", cells: [true] },
      ],
    },
    {
      title: "Copy Data Management",
      rows: [
        { feature: "Time Machine continuous protection", cells: [true] },
        { feature: "Point-in-time clones and refresh", cells: [true] },
        { feature: "Space-efficient clones for dev/test", cells: [true] },
      ],
    },
  ],
  source: SOURCE,
};

const NKP: ProductLicensing = {
  product: "NKP",
  abbrev: "NKP",
  name: "Nutanix Kubernetes Platform",
  meter: "Licensed per physical CPU core running Kubernetes workloads",
  tiers: ["Starter", "Pro", "Ultimate"],
  tagline: {
    Starter: "Managed Kubernetes essentials",
    Pro: "Production Kubernetes with lifecycle management",
    Ultimate: "Enterprise Kubernetes with full platform services",
  },
  ideal: {
    Starter: "First production clusters on Nutanix, included with NCI Pro and Ultimate",
    Pro: "Platform teams running a managed fleet with GitOps and observability",
    Ultimate: "Multi-tenant or air-gapped platforms needing the full application catalog",
  },
  sections: [
    {
      title: "Cluster Platform",
      rows: [
        { feature: "CNCF-conformant Kubernetes distribution", cells: [true, true, true] },
        { feature: "Cluster lifecycle: create, scale, upgrade", cells: [true, true, true] },
        { feature: "CSI and CNI integration with the platform", cells: [true, true, true] },
        { feature: "Managed fleet across clusters and clouds", cells: [false, true, true] },
      ],
    },
    {
      title: "Platform Services",
      rows: [
        { feature: "Observability stack (metrics, logs, alerting)", cells: [false, true, true] },
        { feature: "GitOps application delivery (Flux)", cells: [false, true, true] },
        { feature: "Application catalog and platform add-ons", cells: [false, "Core set", true] },
        { feature: "Service mesh and advanced networking", cells: [false, false, true] },
      ],
    },
    {
      title: "Enterprise Operations",
      rows: [
        { feature: "Multi-tenancy with project isolation", cells: [false, true, true] },
        { feature: "Air-gapped installation", cells: [false, true, true] },
        { feature: "Cost visibility and chargeback", cells: [false, false, true] },
      ],
    },
  ],
  source: SOURCE,
};

const NC2: ProductLicensing = {
  product: "NC2",
  abbrev: "NC2",
  name: "Nutanix Cloud Clusters",
  meter: "Licensed per physical CPU core on the cloud bare-metal instances",
  tiers: ["Standard"],
  tagline: { Standard: "Run Nutanix natively in AWS and Azure" },
  ideal: { Standard: "Bursting, DR targets and datacenter exits without refactoring VMs" },
  sections: [
    {
      title: "Cloud Platform",
      rows: [
        { feature: "AWS and Microsoft Azure bare-metal", cells: [true] },
        { feature: "Same AHV stack and VM format as on-prem", cells: [true] },
        { feature: "Native cloud networking integration", cells: [true] },
      ],
    },
    {
      title: "Operations",
      rows: [
        { feature: "Cluster create, scale and terminate from Prism", cells: [true] },
        { feature: "Hibernate and resume to cut idle cost", cells: [true] },
        { feature: "Bi-directional replication with on-prem clusters", cells: [true] },
        { feature: "Elastic DR: scale the target only during failover", cells: [true] },
      ],
    },
  ],
  source: SOURCE,
};

const NAI: ProductLicensing = {
  product: "NAI",
  abbrev: "NAI",
  name: "Nutanix Enterprise AI",
  meter: "Licensed per GPU used for model serving",
  tiers: ["Standard"],
  tagline: { Standard: "Generative AI model serving and inferencing on-prem" },
  ideal: { Standard: "Serving private LLM endpoints on infrastructure the data never leaves" },
  sections: [
    {
      title: "Model Serving",
      rows: [
        { feature: "OpenAI-compatible inference endpoints", cells: [true] },
        { feature: "Curated model hub with validated open models", cells: [true] },
        { feature: "Bring-your-own model from Hugging Face or NGC", cells: [true] },
        { feature: "NVIDIA NIM microservice support", cells: [true] },
      ],
    },
    {
      title: "Operations & Control",
      rows: [
        { feature: "API key issuance and role-based access", cells: [true] },
        { feature: "GPU utilization and endpoint monitoring", cells: [true] },
        { feature: "Runs on-prem, in NC2 or at the edge", cells: [true] },
        { feature: "Air-gapped deployment", cells: [true] },
      ],
    },
  ],
  source: SOURCE,
};

const PRISM: ProductLicensing = {
  product: "Prism",
  abbrev: "Prism",
  name: "Prism",
  meter: "Licensed per node; advanced operations capabilities ship in Nutanix Cloud Manager",
  tiers: ["Pro", "Ultimate"],
  tagline: {
    Pro: "Multicluster operations and analytics",
    Ultimate: "Operations with advanced automation and reporting",
  },
  ideal: {
    Pro: "Central operations across clusters and sites",
    Ultimate: "Operations teams needing deeper reporting and automated remediation",
  },
  sections: [
    {
      title: "Operations",
      rows: [
        { feature: "Prism Central multicluster management", cells: [true, true] },
        { feature: "Customizable dashboards and reporting", cells: [true, true] },
        { feature: "Capacity forecasting and rightsizing", cells: [true, true] },
        { feature: "Automated remediation playbooks", cells: [false, true] },
      ],
    },
    {
      title: "Portfolio Note",
      rows: [
        {
          feature: "Intelligent operations, cost governance and self-service are delivered by NCM in Portfolio 2",
          cells: ["See NCM", "See NCM"],
        },
      ],
    },
  ],
  source: SOURCE,
};

export const PRODUCT_LICENSING: Record<LicenseProductKey, ProductLicensing> = {
  CloudInfrastructure: NCI,
  ComputeInfrastructure: NCI_C,
  EUC,
  CloudManager: NCM,
  NUS,
  DataLens: DATA_LENS,
  Database: NDB,
  NKP,
  NC2,
  NAI,
  Prism: PRISM,
};

// Order licensing pages the way an SE reads a deck: base platform first, then
// add-ons in the same order as the software-scope editor.
const PAGE_ORDER: LicenseProductKey[] = [
  "CloudInfrastructure",
  "ComputeInfrastructure",
  "EUC",
  "CloudManager",
  "NUS",
  "Database",
  "DataLens",
  "NAI",
  "NKP",
  "NC2",
  "Prism",
];

/**
 * Licensing pages for the products a design actually includes, in deck order.
 * `selectedTier` is the tier quoted on that line, so the page can mark it.
 */
export function licensingPagesFor(
  products: { product: LicenseProductKey; tier: string }[],
): { licensing: ProductLicensing; selectedTier: string }[] {
  const byProduct = new Map(products.map((p) => [p.product, p.tier]));
  return PAGE_ORDER.filter((p) => byProduct.has(p)).map((p) => ({
    licensing: PRODUCT_LICENSING[p],
    selectedTier: byProduct.get(p) as string,
  }));
}

/** Every licensing page in the portfolio, for the "include all" deck option. */
export function allLicensingPages(): ProductLicensing[] {
  return PAGE_ORDER.map((p) => PRODUCT_LICENSING[p]);
}

/** Metering unit for a product, e.g. "cores" — mirrors the scope table. */
export function meterUnit(product: LicenseProductKey): string {
  return LICENSE_CATALOG[product].unit;
}
