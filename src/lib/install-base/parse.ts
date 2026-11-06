// Install Base Report — CSV parsing + merge (fully client-side, stateless).
//
// Two CS360 Pro exports (Part 1 + Part 2) are parsed in memory and merged into a
// single, ordered set of rows matching the reference Install Base workbook. CS360
// caps a report at 20 columns, so Part 2 supplies the licensing/version columns
// that don't fit in Part 1. Nothing here touches the network, disk, a database,
// or any AI — pure deterministic code.

export type FieldKey =
  | "accountName"
  | "clusterName"
  | "accountExecutive"
  | "accountExecutiveEmail"
  | "clusterUuid"
  | "managingPcVersion"
  | "blockCount"
  | "nodeCount"
  | "userVmCount"
  | "cpuCoreCount"
  | "memoryCapacity"
  | "storageCapacity"
  | "cpuUsedPct"
  | "memoryUsedPct"
  | "storageUsedPct"
  | "n1CpuPct"
  | "n1MemoryPct"
  | "n1StoragePct"
  | "hypervisor"
  | "subRegion"
  | "hypervisorVersion"
  | "licenseType"
  | "licenseClass"
  | "aosVersion"
  | "nccVersion"
  | "lcmVersion"
  | "foundationVersion"
  | "lastPulse"
  | "clusterExpiryDate";

export type ColumnDef = {
  key: FieldKey;
  /** Header written into the Excel sheet. */
  label: string;
  /** Which export the column is sourced from. */
  source: "part1" | "part2";
  /** Hidden in the output (kept for reference, e.g. AE email). */
  hidden?: boolean;
};

// Final column order (A→AB), matching the reference Install Base workbook.
export const COLUMNS: ColumnDef[] = [
  { key: "accountName", label: "Account Name", source: "part1" },
  { key: "clusterName", label: "Cluster Name", source: "part1" },
  { key: "accountExecutive", label: "Account Executive", source: "part1" },
  { key: "accountExecutiveEmail", label: "Account Executive Email", source: "part1", hidden: true },
  { key: "clusterUuid", label: "Cluster UUID", source: "part1" },
  { key: "managingPcVersion", label: "Managing PC Version", source: "part1" },
  { key: "blockCount", label: "Block Count", source: "part1" },
  { key: "nodeCount", label: "Node Count (Operational)", source: "part1" },
  { key: "userVmCount", label: "User VM Count", source: "part1" },
  { key: "cpuCoreCount", label: "CPU Core Count", source: "part1" },
  { key: "memoryCapacity", label: "Memory Capacity", source: "part1" },
  { key: "storageCapacity", label: "Storage Capacity", source: "part1" },
  { key: "cpuUsedPct", label: "CPU Used %", source: "part1" },
  { key: "memoryUsedPct", label: "Memory Used %", source: "part1" },
  { key: "storageUsedPct", label: "Storage Used %", source: "part1" },
  { key: "n1CpuPct", label: "N-1 CPU Use % as on Pulse Date", source: "part1" },
  { key: "n1MemoryPct", label: "N-1 Memory Use % as on Pulse Date", source: "part1" },
  { key: "n1StoragePct", label: "N-1 Storage Use % as on Pulse Date", source: "part1" },
  { key: "hypervisor", label: "Hypervisor", source: "part1" },
  { key: "subRegion", label: "Sub-Region", source: "part1" },
  { key: "hypervisorVersion", label: "Hypervisor Version", source: "part2" },
  { key: "licenseType", label: "License Type", source: "part2" },
  { key: "licenseClass", label: "License Class", source: "part2" },
  { key: "aosVersion", label: "AOS/PC Version", source: "part2" },
  { key: "nccVersion", label: "NCC Version", source: "part2" },
  { key: "lcmVersion", label: "LCM Version", source: "part2" },
  { key: "foundationVersion", label: "Foundation Version", source: "part2" },
  { key: "lastPulse", label: "Last Pulse", source: "part1" },
  { key: "clusterExpiryDate", label: "Cluster Expiry Date", source: "part2" },
];

export type MergedRow = Record<FieldKey, string>;

// --- CSV parsing ------------------------------------------------------------

// RFC-4180-ish tokenizer: handles quoted fields, embedded commas/newlines, and
// escaped double-quotes. Returns every record (including empty ones).
function tokenizeCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      record.push(field);
      field = "";
      records.push(record);
      record = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/** Parse a CSV to header row + data rows (first non-empty row is the header). */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const nonEmpty = tokenizeCsv(text).filter((r) => r.some((c) => c.trim().length > 0));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = nonEmpty;
  return { headers: headers.map((h) => h.trim()), rows };
}

/** Parse a CSV to all non-empty rows (no header assumption). Used when the real
 *  header isn't the first row, e.g. a Salesforce formatted report. */
export function parseCsvRows(text: string): string[][] {
  return tokenizeCsv(text).filter((r) => r.some((c) => c.trim().length > 0));
}

// --- Header → field mapping -------------------------------------------------

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// Ordered keyword patterns per field. `not` guards prevent mis-matches (e.g.
// plain "CPU Used" grabbing the "N-1 CPU" column, or "Account Executive"
// grabbing the email column).
const FIELD_PATTERNS: Record<FieldKey, { any: string[]; not?: string[] }> = {
  accountName: { any: ["accountname"] },
  clusterName: { any: ["clustername"] },
  accountExecutive: { any: ["accountexecutive", "accountexec"], not: ["email", "mail"] },
  accountExecutiveEmail: { any: ["accountexecutiveemail", "executiveemail", "aeemail", "email"] },
  clusterUuid: { any: ["clusteruuid", "uuid"] },
  managingPcVersion: { any: ["managingpcversion", "managingpc"] },
  blockCount: { any: ["blockcount"] },
  nodeCount: { any: ["nodecountoperational", "operationalnode", "nodecount"] },
  userVmCount: { any: ["uservmcount", "vmcount"] },
  cpuCoreCount: { any: ["cpucorecount", "corecount"] },
  memoryCapacity: { any: ["memorycapacity"] },
  storageCapacity: { any: ["storagecapacity"] },
  cpuUsedPct: { any: ["cpuused"], not: ["n1"] },
  memoryUsedPct: { any: ["memoryused"], not: ["n1"] },
  storageUsedPct: { any: ["storageused"], not: ["n1"] },
  n1CpuPct: { any: ["n1cpu"] },
  n1MemoryPct: { any: ["n1memory"] },
  n1StoragePct: { any: ["n1storage"] },
  hypervisor: { any: ["hypervisor"], not: ["version"] },
  subRegion: { any: ["subregion"] },
  hypervisorVersion: { any: ["hypervisorversion", "hypervisororversion"] },
  licenseType: { any: ["licensetype"] },
  licenseClass: { any: ["licenseclass"] },
  aosVersion: { any: ["aospcversion", "aosversion", "aos"] },
  nccVersion: { any: ["nccversion", "ncc"] },
  lcmVersion: { any: ["lcmversion", "lcm"] },
  foundationVersion: { any: ["foundationversion", "foundation"] },
  lastPulse: { any: ["lastpulse"] },
  clusterExpiryDate: { any: ["clusterexpirydate", "clusterexpiry", "expirydate", "expirationdate"] },
};

function matchColumn(headers: string[], field: FieldKey): number {
  const { any, not } = FIELD_PATTERNS[field];
  const normed = headers.map(norm);
  for (let i = 0; i < normed.length; i += 1) {
    const h = normed[i];
    if (!h) continue;
    if (not && not.some((n) => h.includes(n))) continue;
    if (any.some((a) => h.includes(a))) return i;
  }
  return -1;
}

function buildFieldMap(headers: string[]): Partial<Record<FieldKey, number>> {
  const map: Partial<Record<FieldKey, number>> = {};
  for (const col of COLUMNS) {
    const idx = matchColumn(headers, col.key);
    if (idx >= 0 && map[col.key] === undefined) map[col.key] = idx;
  }
  return map;
}

// Extract an email embedded in a value like "Jane Doe <jane@x.com>".
function extractEmail(value: string): string {
  const m = value.match(/[^\s,;|<>()]+@[^\s,;|<>()]+/);
  return m ? m[0] : "";
}

function stripEmail(value: string): string {
  return value
    .replace(/<[^>]*@[^>]*>/g, "")
    .replace(/\(([^)]*@[^)]*)\)/g, "")
    .replace(/[^\s,;|]+@[^\s,;|]+/g, "")
    .replace(/[\s,;|]+$/g, "")
    .trim();
}

export type MergeResult = {
  rows: MergedRow[];
  missingPart1: FieldKey[];
  missingPart2: FieldKey[];
  matchedPart2: number;
};

const PART1_KEYS = COLUMNS.filter((c) => c.source === "part1").map((c) => c.key);
const PART2_KEYS = COLUMNS.filter((c) => c.source === "part2").map((c) => c.key);

/**
 * Merge Part 1 + Part 2 into ordered rows. Part 1 is the spine (one row per
 * cluster); Part 2's licensing/version columns are joined on Cluster UUID
 * (falling back to Cluster Name). Part 2 is optional.
 */
export function mergeReports(part1Csv: string, part2Csv: string | null): MergeResult {
  const p1 = parseCsv(part1Csv);
  const map1 = buildFieldMap(p1.headers);

  const part2Provided = Boolean(part2Csv && part2Csv.trim().length > 0);
  const p2 = part2Provided ? parseCsv(part2Csv as string) : { headers: [], rows: [] };
  const map2 = part2Provided ? buildFieldMap(p2.headers) : {};

  const uuidIdx2 = map2.clusterUuid;
  const nameIdx2 = map2.clusterName;
  const byUuid = new Map<string, string[]>();
  const byName = new Map<string, string[]>();
  if (part2Provided) {
    for (const r of p2.rows) {
      if (uuidIdx2 !== undefined) {
        const k = norm(r[uuidIdx2] ?? "");
        if (k) byUuid.set(k, r);
      }
      if (nameIdx2 !== undefined) {
        const k = norm(r[nameIdx2] ?? "");
        if (k && !byName.has(k)) byName.set(k, r);
      }
    }
  }

  const get = (row: string[], idx: number | undefined): string =>
    idx === undefined ? "" : (row[idx] ?? "").trim();

  let matchedPart2 = 0;
  const rows: MergedRow[] = p1.rows.map((r1) => {
    const out = {} as MergedRow;
    for (const key of PART1_KEYS) out[key] = get(r1, map1[key]);

    // If AE name carries an embedded email and there's no dedicated email
    // column, split it into its own (hidden) column.
    if (!out.accountExecutiveEmail && out.accountExecutive) {
      const embedded = extractEmail(out.accountExecutive);
      if (embedded) out.accountExecutiveEmail = embedded;
    }
    if (out.accountExecutive) out.accountExecutive = stripEmail(out.accountExecutive);

    let r2: string[] | undefined;
    if (part2Provided) {
      const uuidKey = norm(out.clusterUuid);
      const nameKey = norm(out.clusterName);
      r2 = (uuidKey && byUuid.get(uuidKey)) || (nameKey && byName.get(nameKey)) || undefined;
      if (r2) matchedPart2 += 1;
    }
    for (const key of PART2_KEYS) out[key] = r2 ? get(r2, map2[key]) : "";
    return out;
  });

  return {
    rows,
    missingPart1: PART1_KEYS.filter((k) => map1[k] === undefined),
    missingPart2: part2Provided ? PART2_KEYS.filter((k) => map2[k] === undefined) : PART2_KEYS,
    matchedPart2,
  };
}
