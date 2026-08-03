// Software scope line items for a technical sizing proposal: which Nutanix
// products and editions the design includes, and the quantity to license, in
// each product's metering unit (cores, TiB, GPUs, ...). This is intentionally
// scope only -- there is NO pricing here; commercials live in a separate quote.

import type { ProductKey } from "@/lib/nutanix-icons";

// EUC (End User Computing), NCI-C (NCI Compute) and NDL (Data Lens) are not in
// the product-icon set, so license lines use a slightly wider key than ProductKey.
export type LicenseProductKey = ProductKey | "EUC" | "ComputeInfrastructure" | "DataLens";

// Products rendered with a text badge instead of a brand product icon.
export const TEXT_BADGE_PRODUCTS: LicenseProductKey[] = ["EUC", "ComputeInfrastructure", "DataLens"];
export const hasBrandIcon = (p: LicenseProductKey): p is ProductKey => !TEXT_BADGE_PRODUCTS.includes(p);

export type LicenseLine = {
  id: string;
  product: LicenseProductKey;
  tier: string;
  qty: number;
  unit: string;
};

export type CatalogEntry = {
  label: string; // short name, e.g. "NCI"
  category: string; // product name shown in the "Category" field
  unit: string; // licensing/metering unit
  tiers: string[]; // available tiers/editions
  // Short, customer-readable descriptor per tier (e.g. NCI Pro: "Rich data
  // services, resilience and management features"). Keyed by tier name.
  blurbs: Record<string, string>;
};

export const LICENSE_CATALOG: Record<LicenseProductKey, CatalogEntry> = {
  CloudInfrastructure: {
    label: "NCI",
    category: "Cloud Infrastructure (per core)",
    unit: "cores",
    tiers: ["Starter", "Pro", "Ultimate"],
    blurbs: {
      Starter: "Core set of software functionality",
      Pro: "Rich data services, resilience and management features",
      Ultimate: "The full suite of Nutanix software capabilities for complex infrastructure",
    },
  },
  EUC: {
    label: "EUC",
    category: "End User Computing (per core)",
    unit: "cores",
    tiers: ["Pro", "Ultimate"],
    blurbs: {
      Pro: "Full-stack platform for virtual desktops and apps",
      Ultimate: "End user computing with advanced management and security",
    },
  },
  ComputeInfrastructure: {
    label: "NCI-C",
    category: "Cloud Infrastructure Compute (per core)",
    unit: "cores",
    tiers: ["Pro", "Ultimate"],
    blurbs: {
      Pro: "Nutanix compute (AHV) for nodes running against an external storage array",
      Ultimate: "Nutanix compute for external storage with advanced management and security",
    },
  },
  CloudManager: {
    label: "NCM",
    category: "Cloud Manager (per core)",
    unit: "cores",
    tiers: ["Starter", "Pro", "Ultimate"],
    blurbs: {
      Starter: "Intelligent operations and insights",
      Pro: "Operations plus self-service automation and orchestration",
      Ultimate: "Full automation, cost governance and security compliance",
    },
  },
  NUS: {
    label: "NUS",
    category: "Unified Storage (per TiB)",
    unit: "TiB",
    tiers: ["Pro", "Ultimate"],
    blurbs: {
      Pro: "Unified files, objects and block storage",
      Ultimate: "Unified storage with advanced data services and security",
    },
  },
  Database: {
    label: "NDB",
    category: "Database (per core)",
    unit: "cores",
    tiers: ["Standard"],
    blurbs: { Standard: "Database lifecycle automation and copy data management" },
  },
  NAI: {
    label: "NAI",
    category: "Enterprise AI (per GPU)",
    unit: "GPUs",
    tiers: ["Standard"],
    blurbs: { Standard: "Generative AI model serving and inferencing on-prem" },
  },
  Prism: {
    label: "Prism",
    category: "Prism (per node)",
    unit: "nodes",
    tiers: ["Pro", "Ultimate"],
    blurbs: {
      Pro: "Multicluster operations and analytics",
      Ultimate: "Operations with advanced automation and reporting",
    },
  },
  NC2: {
    label: "NC2",
    category: "Cloud Clusters (per core)",
    unit: "cores",
    tiers: ["Standard"],
    blurbs: { Standard: "Run Nutanix natively in AWS and Azure" },
  },
  NKP: {
    label: "NKP",
    category: "Kubernetes Platform (per core)",
    unit: "cores",
    tiers: ["Starter", "Pro", "Ultimate"],
    blurbs: {
      Starter: "Managed Kubernetes essentials",
      Pro: "Production Kubernetes with lifecycle management",
      Ultimate: "Enterprise Kubernetes with full platform services",
    },
  },
  // Data governance + ransomware protection for unstructured data, licensed by
  // capacity. For SaaS deployments the SKUs are designated "NDL HS Starter" and
  // "NDL HS Pro" (HS = hosted service).
  DataLens: {
    label: "NDL",
    category: "Data Lens (per TiB)",
    unit: "TiB",
    tiers: ["Starter", "Pro"],
    blurbs: {
      Starter: "Data lifecycle management, signature-based ransomware protection, and auditing (1-month retention)",
      Pro: "Adds behavior-based threat detection, permission risk analytics, and self-service restore (1-year retention)",
    },
  },
};

// Customer-readable descriptor for a product + tier, e.g. "Rich data services,
// resilience and management features" for NCI Pro.
export function licenseBlurb(product: LicenseProductKey, tier: string): string {
  const cat = LICENSE_CATALOG[product];
  return cat.blurbs[tier] ?? Object.values(cat.blurbs)[0] ?? "";
}

// Base platform licenses: every design has exactly one. EUC can replace NCI for
// end-user-computing / VDI deployments; NCI-C (Compute) is the base for designs
// where storage is delivered by an external array instead of Nutanix.
export const BASE_PLATFORMS: LicenseProductKey[] = ["CloudInfrastructure", "ComputeInfrastructure", "EUC"];
export const isBasePlatform = (p: LicenseProductKey) => BASE_PLATFORMS.includes(p);

// Add-on products shown in the "add product" controls (base platforms excluded
// so NCI can never be added as a redundant duplicate line).
export const LICENSE_PRODUCT_ORDER: LicenseProductKey[] = ["CloudManager", "NUS", "Database", "DataLens", "NAI", "NKP", "NC2"];

let counter = 0;
export function newLicenseLine(product: LicenseProductKey, opts: Partial<LicenseLine> = {}): LicenseLine {
  const c = LICENSE_CATALOG[product];
  const defaultTier = c.tiers.length > 1 ? c.tiers[1] : c.tiers[0];
  return {
    id: `ll_${Date.now().toString(36)}_${(counter++).toString(36)}`,
    product,
    tier: opts.tier ?? defaultTier,
    qty: opts.qty ?? 0,
    unit: c.unit,
  };
}
