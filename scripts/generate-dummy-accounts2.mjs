#!/usr/bin/env node
// Generates a dummy version of the "account_map2" billing-address schema:
//   "Account Owner","Account Name","Billing State/Province","Type","Billing Street",
//   "Billing City","Billing Country","Billing Zip/Postal Code","SE Owner","Latitude","Longitude"
// This mirrors the dev file at /etc/se-deal-workspace/account_map2.csv WITHOUT
// touching it. Output: public/data/account-map2-dummy.csv (overwritten).
//
// Run:  node scripts/generate-dummy-accounts2.mjs

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { coordsFor } from "./city-coords.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, "..", "public", "data", "account-map2-dummy.csv");

function mulberry32(seed) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260603);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;

// state, country, city (names match the bundled geocoder dataset)
const CITIES = [
  ["CA", "USA", "San Francisco"], ["CA", "USA", "Los Angeles"], ["WA", "USA", "Seattle"],
  ["CO", "USA", "Denver"], ["AZ", "USA", "Phoenix"], ["TX", "USA", "Austin"],
  ["TX", "USA", "Dallas"], ["IL", "USA", "Chicago"], ["MN", "USA", "Minneapolis"],
  ["NY", "USA", "New York City"], ["MA", "USA", "Boston"], ["DC", "USA", "Washington"],
  ["GA", "USA", "Atlanta"], ["FL", "USA", "Miami"], ["ON", "Canada", "Toronto"],
  ["BC", "Canada", "Vancouver"], ["CDMX", "Mexico", "Mexico City"], ["SP", "Brazil", "Sao Paulo"],
  ["BA", "Argentina", "Buenos Aires"], ["RM", "Chile", "Santiago"], ["DC", "Colombia", "Bogota"],
  ["LIM", "Peru", "Lima"], ["England", "United Kingdom", "London"], ["Leinster", "Ireland", "Dublin"],
  ["Ile-de-France", "France", "Paris"], ["BE", "Germany", "Berlin"], ["BY", "Germany", "Munich"],
  ["ZH", "Switzerland", "Zurich"], ["NH", "Netherlands", "Amsterdam"], ["MD", "Spain", "Madrid"],
  ["Lombardy", "Italy", "Milan"], ["Stockholm", "Sweden", "Stockholm"], ["Dubai", "UAE", "Dubai"],
  ["Tel Aviv", "Israel", "Tel Aviv"], ["GP", "South Africa", "Johannesburg"], ["Tokyo", "Japan", "Tokyo"],
  ["Seoul", "South Korea", "Seoul"], ["Singapore", "Singapore", "Singapore"], ["Bangkok", "Thailand", "Bangkok"],
  ["Jakarta", "Indonesia", "Jakarta"], ["NSW", "Australia", "Sydney"], ["VIC", "Australia", "Melbourne"],
  ["Auckland", "New Zealand", "Auckland"], ["MH", "India", "Mumbai"], ["KA", "India", "Bengaluru"],
  ["Shanghai", "China", "Shanghai"], ["HK", "Hong Kong", "Hong Kong"],
];

const COMPANIES = [
  "Acme", "Beacon", "Summit", "Delta", "Northstar", "Pioneer", "Bluewave", "Meridian",
  "Apex", "Evergreen", "Atlas", "Vertex", "Metro", "Harbor", "Pulse", "Quantum",
  "Horizon", "Catalyst", "Orbit", "Nimbus", "Vector", "Lattice", "Cobalt", "Granite",
  "Sequoia", "Cinder", "Falcon", "Lumen", "Tideway", "Ironclad", "Skyline", "Brightline",
];
const SUFFIX = ["Group", "Holdings", "Systems", "Industries", "Corp", "Partners", "Labs", "Networks"];
const TYPES = ["Customer", "Customer", "Customer", "Prospect", "Prospect"];
const STREETS = [
  "Market St", "Main St", "Broadway", "King St", "Queen St", "High St", "Park Ave",
  "Church St", "Station Rd", "George St", "Elizabeth St", "Orchard Rd", "Marina Blvd",
  "Commerce St", "Congress Ave", "Peachtree St", "State St", "Grand Ave", "Lincoln St",
];
const FIRST = [
  "Jordan", "Riley", "Taylor", "Chris", "Sam", "Leslie", "Dakota", "Hayden", "Jamie",
  "Robin", "Blake", "Ryan", "Casey", "Kendall", "Alex", "Morgan", "Drew", "Quinn",
];
const LAST = [
  "Lee", "Kim", "Nguyen", "Gomez", "Carter", "Park", "Shah", "Cruz", "Lin", "Ellis",
  "Young", "Flores", "Hall", "Brown", "Johnson", "Patel", "Foster", "Turner",
];

function postalCode(country) {
  if (country === "USA") return String(randInt(10000, 99999));
  if (country === "Canada") {
    const L = "ABCEGHJKLMNPRSTVXY";
    const l = () => L[randInt(0, L.length - 1)];
    const d = () => randInt(0, 9);
    return `${l()}${d()}${l()} ${d()}${l()}${d()}`;
  }
  if (country === "United Kingdom") return `${["SW", "EC", "WC", "N", "SE"][randInt(0, 4)]}${randInt(1, 9)} ${randInt(1, 9)}${"ABDEFGHJ"[randInt(0, 7)]}${"ABDEFGHJ"[randInt(0, 7)]}`;
  return String(randInt(1000, 99999));
}

const HEADER = [
  "Account Owner", "Account Name", "Billing State/Province", "Type", "Billing Street",
  "Billing City", "Billing Country", "Billing Zip/Postal Code", "SE Owner", "Latitude", "Longitude",
];

const csvField = (value) => `"${String(value).replace(/"/g, '""')}"`;

const rows = [HEADER.map(csvField).join(",")];

for (const [state, country, city] of CITIES) {
  const accountsHere = randInt(9, 16);
  for (let i = 0; i < accountsHere; i += 1) {
    const owner = `${pick(FIRST)} ${pick(LAST)}`;
    const seOwner = `${pick(FIRST)} ${pick(LAST)}`;
    const accountName = `${pick(COMPANIES)} ${pick(SUFFIX)}`;
    const type = pick(TYPES);
    const street = `${randInt(1, 2400)} ${pick(STREETS)}`;
    const [lat, lng] = coordsFor(city, `${street}|${accountName}`) ?? ["", ""];
    rows.push(
      [owner, accountName, state, type, street, city, country, postalCode(country), seOwner, lat, lng]
        .map(csvField)
        .join(","),
    );
  }
}

await fs.writeFile(OUTPUT, rows.join("\n") + "\n", "utf8");
console.log(`Wrote ${rows.length - 1} accounts to ${OUTPUT}`);
