import { promises as fs } from "node:fs";
import path from "node:path";

export type AccountMapRecord = {
  accountName: string;
  accountExecutive: string;
  systemEngineer: string;
  theater: string;
  region: string;
  subRegion: string;
  vertical: string;
  lastSales: number;
  country: string;
  state: string;
  city: string;
  street: string;
  activeClusterCount: number;
  totalClusterCount: number;
  cpuCoreCountActiveClusters: number;
  vmCount: number;
  latitude: number;
  longitude: number;
};

const cityCoordinates: Record<string, [number, number]> = {
  "san francisco,ca": [37.7749, -122.4194],
  "austin,tx": [30.2672, -97.7431],
  "new york,ny": [40.7128, -74.006],
  "philadelphia,pa": [39.9526, -75.1652],
  "seattle,wa": [47.6062, -122.3321],
  "denver,co": [39.7392, -104.9903],
  "new orleans,la": [29.9511, -90.0715],
  "atlanta,ga": [33.749, -84.388],
  "chicago,il": [41.8781, -87.6298],
  "detroit,mi": [42.3314, -83.0458],
  "charlotte,nc": [35.2271, -80.8431],
  "kansas city,mo": [39.0997, -94.5786],
  "san diego,ca": [32.7157, -117.1611],
  "boston,ma": [42.3601, -71.0589],
  "phoenix,az": [33.4484, -112.074],
  "miami,fl": [25.7617, -80.1918],
  "los angeles,ca": [34.0522, -118.2437],
  "nashville,tn": [36.1627, -86.7816],
  "salt lake city,ut": [40.7608, -111.891],
  "richmond,va": [37.5407, -77.436],
  "newark,nj": [40.7357, -74.1724],
  "orlando,fl": [28.5383, -81.3792],
  "san jose,ca": [37.3382, -121.8863],
  "raleigh,nc": [35.7796, -78.6382],
  "omaha,ne": [41.2565, -95.9345],
  "columbus,oh": [39.9612, -82.9988],
  "portland,or": [45.5152, -122.6784],
  "hartford,ct": [41.7658, -72.6734],
  "minneapolis,mn": [44.9778, -93.265],
  "houston,tx": [29.7604, -95.3698],
};

const asNumber = (value: string) => Number(value.trim()) || 0;

function splitCsvLine(line: string) {
  return line.split(",").map((entry) => entry.trim());
}

function parseCsv(csv: string): AccountMapRecord[] {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows = lines.slice(1);

  return rows.map((row) => {
    const [
      accountName,
      accountExecutive,
      systemEngineer,
      theater,
      region,
      subRegion,
      vertical,
      lastSales,
      country,
      state,
      city,
      street,
      activeClusterCount,
      totalClusterCount,
      cpuCoreCountActiveClusters,
      vmCount,
      latitudeRaw,
      longitudeRaw,
    ] = splitCsvLine(row);

    // Prefer explicit coordinates from the CSV for accurate plotting; fall back
    // to a city lookup, then to the US geographic center as a last resort.
    const key = `${city.toLowerCase()},${state.toLowerCase()}`;
    const [fallbackLat, fallbackLng] = cityCoordinates[key] ?? [39.8283, -98.5795];
    const latitude = Number.isFinite(Number(latitudeRaw)) && latitudeRaw?.trim() ? Number(latitudeRaw) : fallbackLat;
    const longitude = Number.isFinite(Number(longitudeRaw)) && longitudeRaw?.trim() ? Number(longitudeRaw) : fallbackLng;

    return {
      accountName,
      accountExecutive,
      systemEngineer,
      theater,
      region,
      subRegion,
      vertical,
      lastSales: asNumber(lastSales),
      country,
      state,
      city,
      street,
      activeClusterCount: asNumber(activeClusterCount),
      totalClusterCount: asNumber(totalClusterCount),
      cpuCoreCountActiveClusters: asNumber(cpuCoreCountActiveClusters),
      vmCount: asNumber(vmCount),
      latitude,
      longitude,
    };
  });
}

// Resolve the account data file. In production set ACCOUNT_DATA_FILE to the
// path of the real (sensitive) customer file, e.g.
// /etc/se-deal-workspace/accounts.csv. That file lives OUTSIDE the repo and is
// never committed. When the env var is unset we fall back to the non-sensitive
// sample bundled for local development. The file is read server-side only and
// is intentionally NOT under public/ so it is never served as a static asset.
function resolveDataPath(): string {
  const configured = process.env.ACCOUNT_DATA_FILE?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }
  return path.join(process.cwd(), "data", "account-map-sample.csv");
}

export async function getAccountMapRecords() {
  const csv = await fs.readFile(resolveDataPath(), "utf8");
  return parseCsv(csv);
}
