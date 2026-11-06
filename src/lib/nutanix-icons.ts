// Registry for the official Nutanix product icons (extracted from the Nutanix
// brand "Product Icons" asset pack into /public/brand/icons). Each product has a
// full "text" lockup (icon + product name) and an "abbreviated" badge, in
// Color / White / Grey variants. Use getProductIcon() to resolve a path.

export type ProductKey =
  | "CloudInfrastructure" // NCI
  | "CloudManager" // NCM
  | "NUS"
  | "Database" // NDB
  | "NAI"
  | "Prism"
  | "NC2"
  | "NKP";

export type IconVariant = "Color" | "White" | "Grey";
export type IconStyle = "text" | "abbreviated";

// The asset pack misspells "CloudManager" as "CloudManger" in filenames, and NKP
// uses "Abbreviations" (not "Abbreviated") in the abbreviated set.
const FILE_PRODUCT: Record<ProductKey, string> = {
  CloudInfrastructure: "CloudInfrastructure",
  CloudManager: "CloudManger",
  NUS: "NUS",
  Database: "Database",
  NAI: "NAI",
  Prism: "Prism",
  NC2: "NC2",
  NKP: "NKP",
};

export const PRODUCT_LABEL: Record<ProductKey, string> = {
  CloudInfrastructure: "Nutanix Cloud Infrastructure (NCI)",
  CloudManager: "Nutanix Cloud Manager (NCM)",
  NUS: "Nutanix Unified Storage (NUS)",
  Database: "Nutanix Database (NDB)",
  NAI: "Nutanix Enterprise AI (NAI)",
  Prism: "Prism",
  NC2: "Nutanix Cloud Clusters (NC2)",
  NKP: "Nutanix Kubernetes Platform (NKP)",
};

export function getProductIcon(product: ProductKey, variant: IconVariant = "Color", style: IconStyle = "text"): string {
  const p = FILE_PRODUCT[product];
  if (style === "abbreviated") {
    // NKP uses "Abbreviations-Digital-NKP-...", everything else "Abbreviated-Digital-<Product>-...".
    const seg = product === "NKP" ? `Abbreviations-Digital-NKP` : `Abbreviated-Digital-${p}`;
    return `/brand/icons/Product-Icons-${seg}-${variant}.png`;
  }
  return `/brand/icons/Product-Icons-Text-Digital-${p}-${variant}.png`;
}

// Default products to surface in a proposal's "platform" band.
export const PROPOSAL_PRODUCTS: ProductKey[] = ["CloudInfrastructure", "CloudManager", "NUS", "Database", "NAI", "NKP"];
