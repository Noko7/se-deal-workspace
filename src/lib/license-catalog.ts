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
};

export const LICENSE_CATALOG: Record<LicenseProductKey, CatalogEntry> = {
  CloudInfrastructure: { label: "NCI", category: "Cloud Infrastructure (per core)", unit: "cores", tiers: ["Starter", "Pro", "Ultimate"] },
  EUC: { label: "EUC", category: "End User Computing (per core)", unit: "cores", tiers: ["Pro", "Ultimate"] },
  CloudManager: { label: "NCM", category: "Cloud Manager (per core)", unit: "cores", tiers: ["Starter", "Pro", "Ultimate"] },
  NUS: { label: "NUS", category: "Unified Storage (per TiB)", unit: "TiB", tiers: ["Pro", "Ultimate"] },
  Database: { label: "NDB", category: "Database (per core)", unit: "cores", tiers: ["Standard"] },
  NAI: { label: "NAI", category: "Enterprise AI (per GPU)", unit: "GPUs", tiers: ["Standard"] },
  Prism: { label: "Prism", category: "Prism (per node)", unit: "nodes", tiers: ["Pro", "Ultimate"] },
  NC2: { label: "NC2", category: "Cloud Clusters (per core)", unit: "cores", tiers: ["Standard"] },
  NKP: { label: "NKP", category: "Kubernetes Platform (per core)", unit: "cores", tiers: ["Starter", "Pro", "Ultimate"] },
};

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
