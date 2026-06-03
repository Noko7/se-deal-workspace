import { readFileSync } from "node:fs";
import path from "node:path";

// Fully offline address -> coordinate resolution backed by a BUNDLED GeoNames
// city dataset (data/geo/cities.json, built by scripts/build-geocoder.mjs).
// No runtime network/API calls are ever made and no customer data leaves the
// machine. Accounts are placed at their real city (global coverage), then nudged
// by a small DETERMINISTIC offset derived from the street + name so points in the
// same city spread out and don't stack. The same address is always stable.
//
// Note: this resolves to real city centers (on land), not literal rooftop pins.
// Rooftop accuracy would require an address-point dataset (OpenAddresses) or
// coordinates supplied in the source data.

type Coords = [number, number];
type Dataset = {
  countryToIso: Record<string, string>;
  coords: Record<string, Coords>;
  admin: Record<string, Coords>;
};

let dataset: Dataset | null = null;

function load(): Dataset {
  if (!dataset) {
    const file = path.join(process.cwd(), "data", "geo", "cities.json");
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Dataset;
    // Country-name variants used in business data that GeoNames spells/labels
    // differently (e.g. it stores "The Netherlands").
    Object.assign(parsed.countryToIso, {
      netherlands: "NL",
      "south korea": "KR",
      "north korea": "KP",
      uae: "AE",
      uk: "GB",
      usa: "US",
    });
    dataset = parsed;
  }
  return dataset;
}

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");

// Common city-name variants -> the name used by the dataset.
const CITY_ALIASES: Record<string, string> = {
  "new york": "new york city",
  bangalore: "bengaluru",
};

// Generate normalized name variants to absorb common abbreviation differences
// between source data and the dataset (St./Saint, Ft./Fort, Mt./Mount).
function cityVariants(city: string): string[] {
  const base = normalize(city);
  const out = new Set<string>([base]);
  if (CITY_ALIASES[base]) out.add(CITY_ALIASES[base]);
  const swaps: Array<[RegExp, string]> = [
    [/^st /, "saint "],
    [/^saint /, "st "],
    [/^ft /, "fort "],
    [/^fort /, "ft "],
    [/^mt /, "mount "],
    [/^mount /, "mt "],
  ];
  for (const [re, rep] of swaps) {
    if (re.test(base)) out.add(base.replace(re, rep));
  }
  return [...out];
}

// US state full names -> 2-letter code (GeoNames stores US admin1 as 2-letter,
// matching most CRM "State" columns; this also covers full-name inputs).
const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

function stateCode(state: string): string {
  const raw = state.trim();
  if (!raw) {
    return "";
  }
  // Already a code like "MD" or "md".
  if (raw.length <= 3) {
    return raw.toLowerCase();
  }
  const full = US_STATES[raw.toLowerCase()];
  return (full ?? raw).toLowerCase();
}

function toIso(country: string): string | null {
  const ds = load();
  const n = normalize(country);
  return ds.countryToIso[n] ?? ds.countryToIso[country.trim().toLowerCase()] ?? null;
}

function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

// Keep the spread small (~0.7-0.9 km) so points stay near the real city center
// (on land) while still fanning out enough not to stack.
const SPREAD_LAT = 0.0065;
const SPREAD_LNG = 0.008;

export function locate(city: string, state: string, country: string, seed: string): Coords | null {
  const ds = load();
  const iso = toIso(country);
  if (!iso) {
    return null;
  }
  const variants = cityVariants(city);
  const sc = stateCode(state);

  let base: Coords | undefined;
  if (sc) {
    // 1) Exact city within the given state.
    for (const cv of variants) {
      base = ds.coords[`${cv}|${sc}|${iso}`];
      if (base) break;
    }
    // 2) City not found in that state: fall back to the STATE centroid so the
    //    point stays in the CORRECT state (never a same-named city elsewhere).
    if (!base) {
      base = ds.admin[`${sc}|${iso}`];
    }
  }
  // 3) No usable state: best-effort city match within the country.
  if (!base) {
    for (const cv of variants) {
      base = ds.coords[`${cv}|${iso}`];
      if (base) break;
    }
  }
  if (!base) {
    return null;
  }
  const h = hash(seed);
  const u = ((h & 0xffff) / 0xffff) * 2 - 1;
  const v = (((h >>> 16) & 0xffff) / 0xffff) * 2 - 1;
  return [round5(base[0] + u * SPREAD_LAT), round5(base[1] + v * SPREAD_LNG)];
}
