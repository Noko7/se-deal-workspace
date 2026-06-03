#!/usr/bin/env node
// Builds a compact, fully-offline geocoding dataset from GeoNames reference data.
// Input (one-time reference data, NOT customer data):
//   data/geo/raw/cities1000.txt   (place names + coordinates)
//   data/geo/raw/countryInfo.txt  (country name <-> ISO2)
// Output:
//   data/geo/cities.json  { countryToIso, coords }
//
// To refresh the raw inputs (public reference data only):
//   curl -sSL -o data/geo/raw/cities1000.zip https://download.geonames.org/export/dump/cities1000.zip
//   curl -sSL -o data/geo/raw/countryInfo.txt https://download.geonames.org/export/dump/countryInfo.txt
//   (then unzip cities1000.zip)
//
// Run:  node scripts/build-geocoder.mjs

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(__dirname, "..", "data", "geo", "raw");
const OUT = path.join(__dirname, "..", "data", "geo", "cities.json");

const normalize = (value) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");

const round4 = (n) => Math.round(Number(n) * 1e4) / 1e4;

// --- country name -> ISO2 -------------------------------------------------
const countryInfo = await fs.readFile(path.join(RAW, "countryInfo.txt"), "utf8");
const countryToIso = {};
for (const line of countryInfo.split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const cols = line.split("\t");
  const iso2 = cols[0];
  const iso3 = cols[1];
  const name = cols[4];
  if (!iso2) continue;
  countryToIso[iso2.toLowerCase()] = iso2;
  if (iso3) countryToIso[iso3.toLowerCase()] = iso2;
  if (name) countryToIso[normalize(name)] = iso2;
}
// Common short forms / aliases used in business data.
Object.assign(countryToIso, {
  usa: "US",
  us: "US",
  "united states of america": "US",
  uk: "GB",
  "great britain": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",
  uae: "AE",
  "south korea": "KR",
  "north korea": "KP",
  russia: "RU",
  "czech republic": "CZ",
  "ivory coast": "CI",
  "republic of ireland": "IE",
});

// --- city -> coords -------------------------------------------------------
const cities = await fs.readFile(path.join(RAW, "cities500.txt"), "utf8");
const coords = {};
const popByKey = {};
// Per-state (admin1) running centroid, used as a fallback so an unknown town
// still lands in the CORRECT state instead of a same-named city elsewhere.
const adminAcc = {}; // `${admin1lc}|${cc}` -> { lat, lng, n }
let rows = 0;

for (const line of cities.split(/\r?\n/)) {
  if (!line) continue;
  const c = line.split("\t");
  const name = c[1];
  const ascii = c[2];
  const lat = c[4];
  const lng = c[5];
  const cc = c[8];
  const pop = parseInt(c[14], 10) || 0;
  if (!cc || !lat || !lng) continue;
  rows += 1;

  const admin1 = (c[10] || "").trim();
  const names = new Set([normalize(ascii || ""), normalize(name || "")].filter(Boolean));
  for (const nk of names) {
    // city|country (ambiguous: keeps the most populous match)
    const key = `${nk}|${cc}`;
    if (!(key in popByKey) || pop > popByKey[key]) {
      popByKey[key] = pop;
      coords[key] = [round4(lat), round4(lng)];
    }
    // city|state|country (disambiguates same-named cities in different states)
    if (admin1) {
      const skey = `${nk}|${admin1.toLowerCase()}|${cc}`;
      if (!(skey in popByKey) || pop > popByKey[skey]) {
        popByKey[skey] = pop;
        coords[skey] = [round4(lat), round4(lng)];
      }
    }
  }

  if (admin1) {
    const akey = `${admin1.toLowerCase()}|${cc}`;
    const acc = adminAcc[akey] ?? (adminAcc[akey] = { lat: 0, lng: 0, n: 0 });
    acc.lat += Number(lat);
    acc.lng += Number(lng);
    acc.n += 1;
  }
}

const admin = {};
for (const [key, acc] of Object.entries(adminAcc)) {
  admin[key] = [round4(acc.lat / acc.n), round4(acc.lng / acc.n)];
}

await fs.writeFile(OUT, JSON.stringify({ countryToIso, coords, admin }), "utf8");
const bytes = (await fs.stat(OUT)).size;
console.log(
  `Parsed ${rows} places -> ${Object.keys(coords).length} city keys, ${Object.keys(admin).length} state centroids, ${Object.keys(countryToIso).length} country aliases. Wrote ${(bytes / 1e6).toFixed(1)} MB to ${OUT}`,
);
