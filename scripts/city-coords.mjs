// Approximate city-center coordinates used ONLY to generate dummy data with
// realistic Latitude/Longitude columns (mirroring the real source, which ships
// geocoded coordinates). Each account gets a small, deterministic offset from
// the city center so points spread out instead of stacking.

export const CITY_COORDS = {
  "San Francisco": [37.7749, -122.4194],
  "Los Angeles": [34.0522, -118.2437],
  Seattle: [47.6062, -122.3321],
  Denver: [39.7392, -104.9903],
  Phoenix: [33.4484, -112.074],
  Austin: [30.2672, -97.7431],
  Dallas: [32.7767, -96.797],
  Chicago: [41.8781, -87.6298],
  Minneapolis: [44.9778, -93.265],
  "New York City": [40.7128, -74.006],
  Boston: [42.3601, -71.0589],
  Washington: [38.9072, -77.0369],
  Atlanta: [33.749, -84.388],
  Miami: [25.7617, -80.1918],
  Toronto: [43.6532, -79.3832],
  Vancouver: [49.2827, -123.1207],
  "Mexico City": [19.4326, -99.1332],
  "Sao Paulo": [-23.5505, -46.6333],
  "Buenos Aires": [-34.6037, -58.3816],
  Santiago: [-33.4489, -70.6693],
  Bogota: [4.711, -74.0721],
  Lima: [-12.0464, -77.0428],
  London: [51.5074, -0.1278],
  Dublin: [53.3498, -6.2603],
  Paris: [48.8566, 2.3522],
  Berlin: [52.52, 13.405],
  Munich: [48.1351, 11.582],
  Zurich: [47.3769, 8.5417],
  Amsterdam: [52.3676, 4.9041],
  Madrid: [40.4168, -3.7038],
  Milan: [45.4642, 9.19],
  Stockholm: [59.3293, 18.0686],
  Dubai: [25.2048, 55.2708],
  "Tel Aviv": [32.0853, 34.7818],
  Johannesburg: [-26.2041, 28.0473],
  Tokyo: [35.6762, 139.6503],
  Seoul: [37.5665, 126.978],
  Singapore: [1.3521, 103.8198],
  Bangkok: [13.7563, 100.5018],
  Jakarta: [-6.2088, 106.8456],
  Sydney: [-33.8688, 151.2093],
  Melbourne: [-37.8136, 144.9631],
  Auckland: [-36.8485, 174.7633],
  Mumbai: [19.076, 72.8777],
  Bengaluru: [12.9716, 77.5946],
  Shanghai: [31.2304, 121.4737],
  "Hong Kong": [22.3193, 114.1694],
};

// Deterministic ~city-sized offset (a few km) from a string seed.
function jitter(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = ((h & 0xffff) / 0xffff) * 2 - 1;
  const v = (((h >>> 16) & 0xffff) / 0xffff) * 2 - 1;
  return [u * 0.03, v * 0.04];
}

export function coordsFor(city, seed) {
  const base = CITY_COORDS[city];
  if (!base) {
    return null;
  }
  const [dLat, dLng] = jitter(seed);
  return [Math.round((base[0] + dLat) * 1e5) / 1e5, Math.round((base[1] + dLng) * 1e5) / 1e5];
}
