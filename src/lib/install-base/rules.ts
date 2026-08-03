// Install Base Report — deterministic conditional-formatting rules.
//
// Encodes the reference workbook's Legend sheet. Each rule is a pure function of
// the cell's own value (and, for a couple of columns, its sibling in the same
// row). No AI, no network.
//
// NOTE: A few columns (Managing PC Version, AOS/PC Version, Hypervisor Version,
// NCC Version) are colored in the source workbook via separate EOL/parent-version
// reference sheets. Those lists aren't available here, so they're approximated
// with version rules and flagged in the UI.

import type { FieldKey, MergedRow } from "./parse";

export type ColorCategory = "green" | "yellow" | "red" | "orange" | "blue" | "none";

// Legend palette: Excel "Classic" fills for green/yellow/red, an orange for the
// Appliance license class, and a teal/blue for Hyper-V.
export const CATEGORY_STYLE: Record<
  Exclude<ColorCategory, "none">,
  { fill: string; font: string }
> = {
  green: { fill: "FFC6EFCE", font: "FF006100" },
  yellow: { fill: "FFFFEB9C", font: "FF9C6500" },
  red: { fill: "FFFFC7CE", font: "FF9C0006" },
  orange: { fill: "FFFCBA7D", font: "FF7A3E00" },
  blue: { fill: "FF9BD3DD", font: "FF10505C" },
};

// --- Value parsing ----------------------------------------------------------

/** Parse a percentage cell to a 0–100+ number. Handles "85.2%", "85.2", and
 *  fractional "0.852" (only when there's no explicit % sign). N-1 values may
 *  exceed 100. Returns null for non-numeric cells (e.g. "-"). */
export function parsePercent(raw: string): number | null {
  if (raw == null) return null;
  const hadPercent = raw.includes("%");
  const cleaned = raw.replace(/[%,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (!hadPercent && n > 0 && n <= 1) return n * 100;
  return n;
}

export function parseNumber(raw: string): number | null {
  if (raw == null) return null;
  const m = raw.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** First dotted numeric version group as ints, e.g. "6.10.1" -> [6,10,1],
 *  "20230304" -> [20230304]. */
export function versionSegments(raw: string): number[] {
  if (!raw) return [];
  const m = raw.match(/\d+(?:\.\d+)+/);
  const src = m ? m[0] : (raw.match(/\d+/)?.[0] ?? "");
  if (!src) return [];
  return src.split(".").map((s) => Number(s)).filter((n) => Number.isFinite(n));
}

export function versionGte(value: number[], target: number[]): boolean {
  const len = Math.max(value.length, target.length);
  for (let i = 0; i < len; i += 1) {
    const a = value[i] ?? 0;
    const b = target[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

// --- Column rules -----------------------------------------------------------

// Usage columns: >= 80% red, 65–<80% yellow, else no fill. (Legend: "80% or
// more" red, "65% or more" yellow.) Applies to CPU/Memory/Storage and all three
// N-1 metrics. Non-numeric ("-") is left uncolored.
function usageCategory(raw: string): ColorCategory {
  const p = parsePercent(raw);
  if (p === null) return "none";
  if (p >= 80) return "red";
  if (p >= 65) return "yellow";
  return "none";
}

// Count columns: >= threshold green, else no fill. (Legend shows only the green
// "N or more" case; low values stay white in the reference sheet.)
function countCategory(raw: string, threshold: number): ColorCategory {
  const n = parseNumber(raw);
  if (n === null) return "none";
  return n >= threshold ? "green" : "none";
}

// Managing PC Version — approximation of the "PC EOL Sheet": current builds
// (2024.x / pc.7.3 / 7.5) green, clearly older builds red.
function managingPcCategory(raw: string): ColorCategory {
  if (!raw.trim()) return "none";
  const segs = versionSegments(raw);
  if (segs[0] === 2024 || segs[0] >= 2025 || /2024|2025/.test(raw)) return "green";
  if (segs[0] === 7 && (segs[1] === 3 || segs[1] === 5)) return "green";
  if (segs[0] === 2022 || segs[0] === 2023) return "red";
  return "none";
}

function hypervisorCategory(raw: string): ColorCategory {
  if (!raw.trim()) return "none";
  if (/ahv/i.test(raw)) return "green";
  if (/hyper\s*-?\s*v/i.test(raw)) return "blue";
  if (/esxi?|vmware/i.test(raw)) return "red";
  return "none";
}

// Hypervisor Version — legend flags "6 x ESX" red. Approximated as: ESX major
// < 8 red, and old AHV 2023.x builds red; everything else uncolored.
function hypervisorVersionCategory(raw: string, hypervisor: string): ColorCategory {
  if (!raw.trim()) return "none";
  const segs = versionSegments(raw);
  if (/esx/i.test(hypervisor)) {
    if (segs.length === 0) return "none";
    return segs[0] < 8 ? "red" : "none";
  }
  if (/ahv/i.test(hypervisor)) {
    if (segs[0] === 2023 || /^2023/.test(raw)) return "red";
    return "none";
  }
  return "none";
}

// License Type — green for real editions (NCI/NCM/NKP/EUC/NUS); red for
// "Not Found", bare "Pro", and "Prism Pro".
function licenseTypeCategory(raw: string): ColorCategory {
  const v = raw.trim();
  if (!v) return "none";
  if (/not\s*found/i.test(v)) return "red";
  if (/\b(nci|ncm|nkp|euc|nus)\b/i.test(v)) return "green";
  if (/prism\s*pro/i.test(v) || /^pro$/i.test(v)) return "red";
  return "none";
}

// License Class — Appliance orange, "Not Found" yellow, else uncolored.
function licenseClassCategory(raw: string): ColorCategory {
  const v = raw.trim();
  if (!v) return "none";
  if (/appliance/i.test(v)) return "orange";
  if (/not\s*found/i.test(v)) return "yellow";
  return "none";
}

// AOS/PC Version — approximation of the "AOS EOL Sheet": >= 6.10 green.
function aosCategory(raw: string): ColorCategory {
  if (!raw.trim()) return "none";
  return versionGte(versionSegments(raw), [6, 10]) ? "green" : "none";
}

// NCC Version — legend: "Parent Version" (current) green, "1 Version Behind"
// yellow. Approximated as >= 5.2 green else yellow.
function nccCategory(raw: string): ColorCategory {
  if (!raw.trim()) return "none";
  return versionGte(versionSegments(raw), [5, 2]) ? "green" : "yellow";
}

/** Category for a given column key in the context of its row. */
export function categoryFor(key: FieldKey, row: MergedRow): ColorCategory {
  const v = row[key] ?? "";
  switch (key) {
    case "managingPcVersion":
      return managingPcCategory(v);
    case "blockCount":
      return countCategory(v, 6);
    case "nodeCount":
      return countCategory(v, 6);
    case "userVmCount":
      return countCategory(v, 100);
    case "cpuCoreCount":
      return countCategory(v, 108);
    case "cpuUsedPct":
    case "memoryUsedPct":
    case "storageUsedPct":
    case "n1CpuPct":
    case "n1MemoryPct":
    case "n1StoragePct":
      return usageCategory(v);
    case "hypervisor":
      return hypervisorCategory(v);
    case "hypervisorVersion":
      return hypervisorVersionCategory(v, row.hypervisor ?? "");
    case "licenseType":
      return licenseTypeCategory(v);
    case "licenseClass":
      return licenseClassCategory(v);
    case "aosVersion":
      return aosCategory(v);
    case "nccVersion":
      return nccCategory(v);
    // LCM Version, Foundation Version, Sub-Region, capacities, IDs: no fill
    // in the reference legend.
    default:
      return "none";
  }
}
