// Install Base Report — Part 3 "Hardware" (Salesforce "Accounts with Assets"
// report). Client-side & stateless.
//
// Part 3 is a Salesforce report export (Excel .xlsx "Formatted Report" or CSV
// "Details Only"). It becomes its own "Hardware" worksheet after the Install
// Base sheet. A formatted report has a title, a "Filtered By" block, then the
// real header row, then detail rows — so we auto-detect the header row and skip
// the surrounding chrome. Pure deterministic code — no network, no AI.

import ExcelJS from "exceljs";
import { parseCsvRows } from "./parse";
import type { ColorCategory } from "./rules";

export type HardwareFieldKey =
  | "accountOwner"
  | "accountName"
  | "clusterName"
  | "productName"
  | "serialNumber"
  | "installCity"
  | "contractStatus"
  | "contractEndDate";

export type HardwareColumnDef = { key: HardwareFieldKey; label: string };

// Column order matches the Salesforce report.
export const HARDWARE_COLUMNS: HardwareColumnDef[] = [
  { key: "accountOwner", label: "Account Owner" },
  { key: "accountName", label: "Account Name" },
  { key: "clusterName", label: "Cluster Name" },
  { key: "productName", label: "Product Name" },
  { key: "serialNumber", label: "Serial Number" },
  { key: "installCity", label: "Install City" },
  { key: "contractStatus", label: "Contract Status" },
  { key: "contractEndDate", label: "Contract End Date" },
];

export type HardwareRow = Record<HardwareFieldKey, string>;

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Fuzzy header patterns — tolerant of the CS360 vs Salesforce naming
// differences (e.g. Product Name/Node Model, Install City/Install Location).
const HARDWARE_PATTERNS: Record<HardwareFieldKey, string[]> = {
  accountOwner: ["accountowner"],
  accountName: ["accountname"],
  clusterName: ["clustername"],
  productName: ["productname", "nodemodel", "model"],
  serialNumber: ["serialnumber", "nodeserialnumber", "serial"],
  installCity: ["installcity", "installlocation", "location", "city"],
  contractStatus: ["contractstatus"],
  contractEndDate: ["contractenddate", "contractexpiry", "enddate", "expirationdate"],
};

function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// Convert any ExcelJS cell value (string, number, date, richtext, hyperlink,
// formula result) to a plain trimmed string.
function cellToString(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return fmtDate(v);
  if (typeof v === "object") {
    const obj = v as unknown as Record<string, unknown>;
    if (Array.isArray(obj.richText)) {
      return (obj.richText as { text?: string }[]).map((r) => r.text ?? "").join("").trim();
    }
    if (typeof obj.text === "string") return obj.text.trim();
    if ("result" in obj) return cellToString(obj.result as ExcelJS.CellValue);
    if ("formula" in obj) return "";
  }
  return String(v).trim();
}

/** Read an uploaded Part 3 file (Excel or CSV) into a raw grid of rows. */
export async function readTabularFile(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  const looksExcel = /\.xlsx?$/.test(name) || /sheet|excel/i.test(file.type);
  if (looksExcel) {
    const buf = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    const rows: string[][] = [];
    if (ws) {
      ws.eachRow({ includeEmpty: true }, (row) => {
        const vals = row.values as ExcelJS.CellValue[]; // 1-indexed; [0] is empty
        const arr: string[] = [];
        for (let c = 1; c < vals.length; c += 1) arr.push(cellToString(vals[c]));
        rows.push(arr);
      });
    }
    return rows;
  }
  return parseCsvRows(await file.text());
}

export type HardwareParseResult = { rows: HardwareRow[]; missing: HardwareFieldKey[]; headerFound: boolean };

const KEYS = HARDWARE_COLUMNS.map((c) => c.key);

// Which fields does a given row's cells look like a header for?
function matchedFields(row: string[]): Set<HardwareFieldKey> {
  const set = new Set<HardwareFieldKey>();
  const cells = row.map(norm);
  for (const key of KEYS) {
    if (cells.some((cell) => cell && HARDWARE_PATTERNS[key].some((p) => cell.includes(p)))) set.add(key);
  }
  return set;
}

/** Locate the header row (best match containing Contract Status), map columns,
 *  and pull the detail rows, skipping title/filter/footer/subtotal rows. */
export function extractHardware(grid: string[][]): HardwareParseResult {
  let headerIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < grid.length; i += 1) {
    const fields = matchedFields(grid[i]);
    if (fields.has("contractStatus") && fields.size > bestScore) {
      bestScore = fields.size;
      headerIdx = i;
    }
  }
  if (headerIdx < 0 || bestScore < 3) {
    return { rows: [], missing: KEYS, headerFound: false };
  }

  const headerCells = grid[headerIdx].map(norm);
  const map: Partial<Record<HardwareFieldKey, number>> = {};
  for (const key of KEYS) {
    for (let c = 0; c < headerCells.length; c += 1) {
      if (headerCells[c] && HARDWARE_PATTERNS[key].some((p) => headerCells[c].includes(p))) {
        if (map[key] === undefined) map[key] = c;
      }
    }
  }

  const get = (row: string[], idx: number | undefined): string =>
    idx === undefined ? "" : (row[idx] ?? "").trim();

  const rows: HardwareRow[] = [];
  for (let i = headerIdx + 1; i < grid.length; i += 1) {
    const raw = grid[i];
    const out = {} as HardwareRow;
    for (const key of KEYS) out[key] = get(raw, map[key]);
    // A real detail row has an account AND at least one asset/contract field —
    // this filters blank rows, grouping subtotals, and footer lines.
    const hasAccount = Boolean(out.accountName || out.accountOwner);
    const hasDetail = Boolean(out.serialNumber || out.productName || out.contractStatus || out.contractEndDate);
    if (hasAccount && hasDetail) rows.push(out);
  }

  return { rows, missing: KEYS.filter((k) => map[k] === undefined), headerFound: true };
}

export async function parseHardwareFile(file: File): Promise<HardwareParseResult> {
  return extractHardware(await readTabularFile(file));
}

// --- Color rules ------------------------------------------------------------

// Contract Status: green under support, yellow not found, red expired, orange
// no support contract.
export function contractStatusCategory(raw: string): ColorCategory {
  const v = (raw ?? "").trim();
  if (!v) return "none";
  if (/expired/i.test(v)) return "red";
  if (/no\s*(support\s*)?contract/i.test(v)) return "orange";
  if (/not\s*found/i.test(v)) return "yellow";
  if (/under\s*support|supported|active/i.test(v)) return "green";
  return "none";
}

/** Parse a date cell. Handles M/D/YY, M/D/YYYY, ISO, and common textual dates. */
export function parseDate(raw: string): Date | null {
  const v = (raw ?? "").trim();
  if (!v || v === "-") return null;
  const mdy = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    let year = Number(mdy[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
}

// Contract End Date, relative to `now` (report generation time):
//  - past due             -> red
//  - within 6 months      -> orange
//  - within 1 year        -> yellow
//  - more than 1 year out -> green
export function contractEndDateCategory(raw: string, now: Date): ColorCategory {
  const d = parseDate(raw);
  if (!d) return "none";
  if (d.getTime() < now.getTime()) return "red";
  const in6 = new Date(now);
  in6.setMonth(in6.getMonth() + 6);
  if (d.getTime() < in6.getTime()) return "orange";
  const in12 = new Date(now);
  in12.setFullYear(in12.getFullYear() + 1);
  if (d.getTime() < in12.getTime()) return "yellow";
  return "green";
}

export function hardwareCategoryFor(key: HardwareFieldKey, row: HardwareRow, now: Date): ColorCategory {
  if (key === "contractStatus") return contractStatusCategory(row.contractStatus);
  if (key === "contractEndDate") return contractEndDateCategory(row.contractEndDate, now);
  return "none";
}
