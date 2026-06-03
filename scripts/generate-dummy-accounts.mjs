#!/usr/bin/env node
// Generates a large, GLOBAL dummy account dataset for the Account Map.
// Includes Latitude/Longitude columns so accounts pin exactly, mirroring the
// real source data (which ships geocoded coordinates). No network is used.
//
// Run:  node scripts/generate-dummy-accounts.mjs
// Output: public/data/account-map-dummy.csv (overwritten)

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { coordsFor } from "./city-coords.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, "..", "public", "data", "account-map-dummy.csv");

// Deterministic RNG so re-runs produce the same data.
function mulberry32(seed) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260602);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;

// region, theater, subRegion, country, state, city
// (lat/lng are added per row from scripts/city-coords.mjs)
const CITIES = [
  ["North America", "AMER", "US West", "USA", "CA", "San Francisco"],
  ["North America", "AMER", "US West", "USA", "CA", "Los Angeles"],
  ["North America", "AMER", "US West", "USA", "WA", "Seattle"],
  ["North America", "AMER", "US West", "USA", "CO", "Denver"],
  ["North America", "AMER", "US West", "USA", "AZ", "Phoenix"],
  ["North America", "AMER", "US Central", "USA", "TX", "Austin"],
  ["North America", "AMER", "US Central", "USA", "TX", "Dallas"],
  ["North America", "AMER", "US Central", "USA", "IL", "Chicago"],
  ["North America", "AMER", "US Central", "USA", "MN", "Minneapolis"],
  ["North America", "AMER", "US East", "USA", "NY", "New York City"],
  ["North America", "AMER", "US East", "USA", "MA", "Boston"],
  ["North America", "AMER", "US East", "USA", "DC", "Washington"],
  ["North America", "AMER", "US East", "USA", "GA", "Atlanta"],
  ["North America", "AMER", "US East", "USA", "FL", "Miami"],
  ["North America", "AMER", "Canada", "Canada", "ON", "Toronto"],
  ["North America", "AMER", "Canada", "Canada", "BC", "Vancouver"],
  ["North America", "AMER", "Mexico", "Mexico", "CDMX", "Mexico City"],
  ["South America", "AMER", "Brazil", "Brazil", "SP", "Sao Paulo"],
  ["South America", "AMER", "Southern Cone", "Argentina", "BA", "Buenos Aires"],
  ["South America", "AMER", "Southern Cone", "Chile", "RM", "Santiago"],
  ["South America", "AMER", "Andes", "Colombia", "DC", "Bogota"],
  ["South America", "AMER", "Andes", "Peru", "LIM", "Lima"],
  ["EMEA", "EMEA", "UK & Ireland", "United Kingdom", "England", "London"],
  ["EMEA", "EMEA", "UK & Ireland", "Ireland", "Leinster", "Dublin"],
  ["EMEA", "EMEA", "Western Europe", "France", "Ile-de-France", "Paris"],
  ["EMEA", "EMEA", "DACH", "Germany", "BE", "Berlin"],
  ["EMEA", "EMEA", "DACH", "Germany", "BY", "Munich"],
  ["EMEA", "EMEA", "DACH", "Switzerland", "ZH", "Zurich"],
  ["EMEA", "EMEA", "Benelux", "Netherlands", "NH", "Amsterdam"],
  ["EMEA", "EMEA", "Iberia", "Spain", "MD", "Madrid"],
  ["EMEA", "EMEA", "Southern Europe", "Italy", "Lombardy", "Milan"],
  ["EMEA", "EMEA", "Nordics", "Sweden", "Stockholm", "Stockholm"],
  ["EMEA", "EMEA", "Middle East", "UAE", "Dubai", "Dubai"],
  ["EMEA", "EMEA", "Middle East", "Israel", "Tel Aviv", "Tel Aviv"],
  ["EMEA", "EMEA", "Africa", "South Africa", "GP", "Johannesburg"],
  ["APAC", "APAC", "Japan & Korea", "Japan", "Tokyo", "Tokyo"],
  ["APAC", "APAC", "Japan & Korea", "South Korea", "Seoul", "Seoul"],
  ["APAC", "APAC", "SEA", "Singapore", "Singapore", "Singapore"],
  ["APAC", "APAC", "SEA", "Thailand", "Bangkok", "Bangkok"],
  ["APAC", "APAC", "SEA", "Indonesia", "Jakarta", "Jakarta"],
  ["APAC", "APAC", "ANZ", "Australia", "NSW", "Sydney"],
  ["APAC", "APAC", "ANZ", "Australia", "VIC", "Melbourne"],
  ["APAC", "APAC", "ANZ", "New Zealand", "Auckland", "Auckland"],
  ["APAC", "APAC", "India", "India", "MH", "Mumbai"],
  ["APAC", "APAC", "India", "India", "KA", "Bengaluru"],
  ["APAC", "APAC", "Greater China", "China", "Shanghai", "Shanghai"],
  ["APAC", "APAC", "Greater China", "Hong Kong", "HK", "Hong Kong"],
];

const COMPANIES = [
  "Acme", "Beacon", "Summit", "Delta", "Northstar", "Pioneer", "Bluewave", "Meridian",
  "Apex", "Evergreen", "Atlas", "Vertex", "Metro", "Harbor", "Pulse", "Quantum",
  "Horizon", "Catalyst", "Orbit", "Nimbus", "Vector", "Lattice", "Cobalt", "Granite",
  "Sequoia", "Cinder", "Falcon", "Lumen", "Tideway", "Ironclad", "Skyline", "Brightline",
  "Cardinal", "Monarch", "Onyx", "Pinnacle", "Riverstone", "Stratus", "Trident", "Aurora",
];

const VERTICALS = [
  "Healthcare", "Finance", "Retail", "Energy", "Public Sector", "Manufacturing",
  "Education", "Telecom", "Logistics", "Hospitality", "Media", "Biotech",
  "Insurance", "Consumer Goods", "Technology",
];

const ACCOUNT_TYPES = ["Customer", "Customer", "Customer", "Prospect", "Prospect"];

const STREETS = [
  "Market St", "Main St", "Broadway", "King St", "Queen St", "High St", "Park Ave",
  "Church St", "Station Rd", "George St", "Elizabeth St", "Orchard Rd", "Marina Blvd",
  "Commerce St", "Congress Ave", "Peachtree St", "State St", "Grand Ave", "Lincoln St",
  "Industrial Pkwy", "Innovation Way", "Technology Dr", "Harbor Blvd", "Summit Ave",
];

const FIRST = [
  "Jordan", "Riley", "Taylor", "Chris", "Sam", "Leslie", "Dakota", "Hayden", "Jamie",
  "Robin", "Blake", "Ryan", "Casey", "Kendall", "Alex", "Morgan", "Drew", "Quinn",
  "Parker", "Skylar", "Cameron", "Reese", "Logan", "Avery", "Emerson", "Harper",
  "Rowan", "Sawyer", "Finley", "Elliot",
];
const LAST = [
  "Lee", "Kim", "Nguyen", "Gomez", "Carter", "Park", "Shah", "Cruz", "Lin", "Ellis",
  "Young", "Flores", "Hall", "Brown", "Johnson", "Patel", "Foster", "Turner", "White",
  "Reed", "Diaz", "Bailey", "Price", "Morgan", "Gray", "Bennett", "Sullivan", "Hughes",
  "Foley", "Mercer",
];

function makePerson(seed) {
  const first = FIRST[seed % FIRST.length];
  const last = LAST[(seed * 7 + 3) % LAST.length];
  const name = `${first} ${last}`;
  const email = `${first}.${last}@nutanix.com`.toLowerCase();
  return { name, email };
}

const HEADER = [
  "Account Name", "Account Executive", "Account Executive Email", "System Engineer",
  "System Engineer Email", "Theater", "Region", "Sub-Region", "Vertical", "Last Sales",
  "Account Type", "Country", "State", "City", "Street", "Active Cluster Count",
  "Node Count (Operational)", "VM Count", "Latitude", "Longitude",
].join(",");

const csvField = (value) => {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const rows = [HEADER];

// A small AE/SE roster per region so "viewing as SE" highlights coherent books.
const rosterCount = 8;

for (const [region, theater, subRegion, country, state, city] of CITIES) {
  const accountsHere = randInt(9, 16);
  for (let i = 0; i < accountsHere; i += 1) {
    const company = pick(COMPANIES);
    const vertical = pick(VERTICALS);
    const ae = makePerson(randInt(0, rosterCount * 4));
    const se = makePerson(randInt(rosterCount * 4, rosterCount * 8));
    const activeClusters = randInt(1, 12);
    const nodeCount = activeClusters * randInt(3, 8);
    const vmCount = nodeCount * randInt(15, 45);
    const lastSales = randInt(10, 300) * 10000;
    const accountType = pick(ACCOUNT_TYPES);
    const street = `${randInt(1, 2400)} ${pick(STREETS)}`;
    const name = `${company} ${vertical.split(" ")[0]} ${city}`;
    const [lat, lng] = coordsFor(city, `${street}|${name}`) ?? ["", ""];

    rows.push(
      [
        name,
        ae.name,
        ae.email,
        se.name,
        se.email,
        theater,
        region,
        subRegion,
        vertical,
        lastSales,
        accountType,
        country,
        state,
        city,
        street,
        activeClusters,
        nodeCount,
        vmCount,
        lat,
        lng,
      ]
        .map(csvField)
        .join(","),
    );
  }
}

await fs.writeFile(OUTPUT, rows.join("\n") + "\n", "utf8");
console.log(`Wrote ${rows.length - 1} accounts across ${CITIES.length} cities to ${OUTPUT}`);
