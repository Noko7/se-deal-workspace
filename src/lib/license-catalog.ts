// Software scope line items for a technical sizing proposal: which Nutanix
// products and editions the design includes, and the quantity to license, in
// each product's metering unit (cores, TiB, GPUs, ...). This is intentionally
// scope only -- there is NO pricing here; commercials live in a separate quote.

import type { ProductKey } from "@/lib/nutanix-icons";

// EUC (End User Computing) is not in the product-icon set, so license lines use a
// slightly wider key than ProductKey.
export type LicenseProductKey = ProductKey | "EUC";

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
};

// Customer-readable descriptor for a product + tier, e.g. "Rich data services,
// resilience and management features" for NCI Pro.
export function licenseBlurb(product: LicenseProductKey, tier: string): string {
  const cat = LICENSE_CATALOG[product];
  return cat.blurbs[tier] ?? Object.values(cat.blurbs)[0] ?? "";
}

// Base platform licenses: every design has exactly one. EUC can replace NCI for
// end-user-computing / VDI deployments.
export const BASE_PLATFORMS: LicenseProductKey[] = ["CloudInfrastructure", "EUC"];
export const isBasePlatform = (p: LicenseProductKey) => BASE_PLATFORMS.includes(p);

// Add-on products shown in the "add product" controls (base platforms excluded
// so NCI can never be added as a redundant duplicate line).
export const LICENSE_PRODUCT_ORDER: LicenseProductKey[] = ["CloudManager", "NUS", "Database", "NAI", "NKP", "NC2"];

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
