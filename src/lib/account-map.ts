import { promises as fs } from "node:fs";
import path from "node:path";
import type { EnvironmentId } from "@/lib/environment";

export type AccountMapRecord = {
  accountName: string;
  accountExecutive: string;
  accountExecutiveEmail: string;
  systemEngineer: string;
  systemEngineerEmail: string;
  theater: string;
  region: string;
  subRegion: string;
  vertical: string;
  lastSales: number;
  accountType: string;
  country: string;
  state: string;
  city: string;
  street: string;
  activeClusterCount: number;
  nodeCount: number;
  vmCount: number;
  latitude: number;
  longitude: number;
};

// Maps our record fields to the header names we accept (case-insensitive, exact
// match after normalizing). The parser is header-driven so column order and
// extra columns don't matter.
// Accepts BOTH schemas so the two sources can be combined:
//  - the main account-map schema (Account Executive, Theater, Region, ...)
//  - the billing "account-map2" schema (Account Owner, Type, Billing Street/City/...)
const HEADER_ALIASES: Record<keyof AccountMapRecord, string[]> = {
  accountName: ["account name"],
  accountExecutive: ["account executive", "account owner"],
  accountExecutiveEmail: ["account executive email"],
  systemEngineer: ["system engineer", "se owner"],
  systemEngineerEmail: ["system engineer email"],
  theater: ["theater", "theatre"],
  region: ["region"],
  subRegion: ["sub-region", "sub region"],
  vertical: ["vertical"],
  lastSales: ["last sales"],
  accountType: ["account type", "type"],
  country: ["country", "billing country"],
  state: ["state", "billing state/province"],
  city: ["city", "billing city"],
  street: ["street", "billing street"],
  activeClusterCount: ["active cluster count"],
  nodeCount: ["node count (operational)", "node count", "total cluster count"],
  vmCount: ["vm count"],
  // EXACT coordinates from the source (e.g. Salesforce geocodes billing
  // addresses into Latitude/Longitude). Rows without usable coords are skipped.
  latitude: ["latitude", "billing latitude", "geocode latitude", "lat"],
  longitude: ["longitude", "billing longitude", "geocode longitude", "lng", "lon", "long"],
};

const asNumber = (value: string | undefined) => {
  const cleaned = (value ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Quote-aware single-line CSV splitter (handles commas inside quoted fields).
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.map((entry) => entry.trim());
}

function buildFieldIndex(headerCells: string[]): Record<keyof AccountMapRecord, number> {
  const normalized = headerCells.map((cell) => cell.trim().toLowerCase());
  const index = {} as Record<keyof AccountMapRecord, number>;
  for (const field of Object.keys(HEADER_ALIASES) as (keyof AccountMapRecord)[]) {
    index[field] = normalized.findIndex((name) => HEADER_ALIASES[field].includes(name));
  }
  return index;
}

function parseCsv(csv: string): AccountMapRecord[] {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return [];
  }

  const fieldIndex = buildFieldIndex(splitCsvLine(lines[0]));
  const at = (cells: string[], field: keyof AccountMapRecord) => {
    const idx = fieldIndex[field];
    return idx >= 0 ? cells[idx] ?? "" : "";
  };

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return {
      accountName: at(cells, "accountName"),
      accountExecutive: at(cells, "accountExecutive"),
      accountExecutiveEmail: at(cells, "accountExecutiveEmail"),
      systemEngineer: at(cells, "systemEngineer"),
      systemEngineerEmail: at(cells, "systemEngineerEmail"),
      theater: at(cells, "theater"),
      region: at(cells, "region"),
      subRegion: at(cells, "subRegion"),
      vertical: at(cells, "vertical"),
      lastSales: asNumber(at(cells, "lastSales")),
      accountType: at(cells, "accountType"),
      country: at(cells, "country"),
      state: at(cells, "state"),
      city: at(cells, "city"),
      street: at(cells, "street"),
      activeClusterCount: asNumber(at(cells, "activeClusterCount")),
      nodeCount: asNumber(at(cells, "nodeCount")),
      vmCount: asNumber(at(cells, "vmCount")),
      latitude: asNumber(at(cells, "latitude")),
      longitude: asNumber(at(cells, "longitude")),
    };
  });
}

// Both data sources are combined: the primary account map plus the billing
// "account-map2" file. Each environment points the pair at the right location.
function resolveFilesForEnvironment(environment: EnvironmentId): string[] {
  if (environment === "dev") {
    const dir = process.env.ACCOUNT_DATA_DIR ?? "/etc/se-deal-workspace";
    return [path.join(dir, "account-map.csv"), path.join(dir, "account-map2.csv")];
  }
  // foundation: bundled non-sensitive samples
  const dir = path.join(process.cwd(), "public", "data");
  return [path.join(dir, "account-map-dummy.csv"), path.join(dir, "account-map2-dummy.csv")];
}

async function readCsvIfPresent(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    // A combined source is optional: if account_map2.csv isn't there yet, just
    // use whatever files do exist instead of failing the whole page.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

// Fields filled when merging two rows for the same customer. The first
// (non-empty / non-zero) value wins, so the file processed first takes
// precedence and later files only fill in gaps.
const STRING_FIELDS: (keyof AccountMapRecord)[] = [
  "accountName",
  "accountExecutive",
  "accountExecutiveEmail",
  "systemEngineer",
  "systemEngineerEmail",
  "theater",
  "region",
  "subRegion",
  "vertical",
  "accountType",
  "country",
  "state",
  "city",
  "street",
];
const NUMBER_FIELDS: (keyof AccountMapRecord)[] = [
  "lastSales",
  "activeClusterCount",
  "nodeCount",
  "vmCount",
  "latitude",
  "longitude",
];

// Exact coordinates from the source data, if present and sane. (0,0) is treated
// as "missing" (Null Island) since it's almost always an unset/failed geocode.
function hasExactCoords(record: AccountMapRecord): boolean {
  const { latitude: lat, longitude: lng } = record;
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

// Same customer key: account name, normalized. Used to collapse the operational
// file and the billing file into ONE record per customer.
const accountKey = (record: AccountMapRecord) => record.accountName.trim().toLowerCase();

function mergeRecords(target: AccountMapRecord, src: AccountMapRecord): void {
  for (const field of STRING_FIELDS) {
    if (!target[field] && src[field]) {
      (target[field] as string) = src[field] as string;
    }
  }
  for (const field of NUMBER_FIELDS) {
    if (!target[field] && src[field]) {
      (target[field] as number) = src[field] as number;
    }
  }
}

export async function getAccountMapRecords(
  environment: EnvironmentId = "foundation",
): Promise<AccountMapRecord[]> {
  const files = resolveFilesForEnvironment(environment);
  const csvs = (await Promise.all(files.map(readCsvIfPresent))).filter(
    (csv): csv is string => csv !== null,
  );
  if (csvs.length === 0) {
    // Surface a clear error (page handles this) when no source is available.
    throw new Error(`No account map data found for "${environment}" (looked in: ${files.join(", ")})`);
  }

  // Combine both schemas into ONE record per customer. Rows are matched on the
  // account name; the operational file (processed first) wins on shared fields
  // and the billing file fills in anything missing (e.g. billing address, type)
  // and contributes customers that only exist there.
  const byCustomer = new Map<string, AccountMapRecord>();
  for (const csv of csvs) {
    for (const record of parseCsv(csv)) {
      const key = accountKey(record);
      if (!key) {
        continue;
      }
      const existing = byCustomer.get(key);
      if (existing) {
        mergeRecords(existing, record);
      } else {
        byCustomer.set(key, record);
      }
    }
  }

  // Placement uses the exact Latitude/Longitude from the source data (e.g.
  // Salesforce geocodes billing addresses into these columns), so accounts pin
  // to their real street with no lookup, network, or API. Rows without usable
  // coordinates can't be placed on the map and are skipped.
  return [...byCustomer.values()].filter(hasExactCoords);
}
