"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { FeatureCollection } from "geojson";
import { MapLoading } from "@/components/map-loading";
import type { AccountMapRecord } from "@/lib/account-map";

type Props = {
  records: AccountMapRecord[];
  meSe: string | null;
  // When provided, the fullscreen button toggles this element (filters + map)
  // instead of only the map canvas, so the filters stay usable in fullscreen.
  fullscreenContainer?: RefObject<HTMLElement | null>;
};

// Plots are colored by Account Type.
const CUSTOMER_COLOR = "#7855fa"; // purple
const PROSPECT_COLOR = "#22c55e"; // green
const EX_CUSTOMER_COLOR = "#ef4444"; // red
const OTHER_COLOR = "#94a3b8"; // gray (unknown/other types)

const typeColors: Record<string, string> = {
  Customer: CUSTOMER_COLOR,
  Prospect: PROSPECT_COLOR,
  "Prospect - Lead": PROSPECT_COLOR,
  "Ex - Customer": EX_CUSTOMER_COLOR,
};

// A self-hosted PMTiles basemap (set NEXT_PUBLIC_BASEMAP_URL=/basemap.pmtiles)
// is used when present; otherwise we fall back to OpenStreetMap raster tiles so
// the map always shows roads.
const BASEMAP_URL = process.env.NEXT_PUBLIC_BASEMAP_URL ?? "";
const GLYPHS_URL =
  process.env.NEXT_PUBLIC_MAP_GLYPHS_URL ??
  "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";

const CIRCLE_COLOR: maplibregl.ExpressionSpecification = [
  "match",
  ["get", "accountType"],
  "Customer",
  CUSTOMER_COLOR,
  ["Prospect", "Prospect - Lead"],
  PROSPECT_COLOR,
  "Ex - Customer",
  EX_CUSTOMER_COLOR,
  OTHER_COLOR,
];

function buildStyle(): maplibregl.StyleSpecification {
  if (BASEMAP_URL.endsWith(".pmtiles")) {
    return {
      version: 8,
      glyphs: GLYPHS_URL,
      sources: {
        protomaps: {
          type: "vector",
          url: `pmtiles://${BASEMAP_URL}`,
          attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
        },
      },
      layers: layers("protomaps", namedFlavor("light"), { lang: "en" }) as maplibregl.LayerSpecification[],
    };
  }

  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [
          "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };
}

function toFeatureCollection(records: AccountMapRecord[], meSe: string | null): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: records.map((record) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [record.longitude, record.latitude] },
      properties: {
        accountName: record.accountName,
        street: record.street,
        city: record.city,
        state: record.state,
        country: record.country,
        region: record.region,
        subRegion: record.subRegion,
        systemEngineer: record.systemEngineer,
        accountExecutive: record.accountExecutive,
        vertical: record.vertical,
        accountType: record.accountType,
        activeClusterCount: record.activeClusterCount,
        nodeCount: record.nodeCount,
        vmCount: record.vmCount,
        lastSales: record.lastSales,
        mine: meSe !== null && record.systemEngineer === meSe,
      },
    })),
  };
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);

function popupHtml(properties: Record<string, unknown>): string {
  const row = (label: string, value: string) =>
    `<div style="color:#8e8e8e">${label}</div><div style="text-align:right;font-weight:500;color:#313131">${value}</div>`;
  const mine = properties.mine ? ' <span style="color:#6d4de2;font-weight:600">(you)</span>' : "";
  const locationParts = [properties.city, properties.state, properties.country]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");
  const accountType = String(properties.accountType ?? "").trim();
  return `
    <div style="font-family:inherit;min-width:200px">
      <div style="font-weight:600;font-size:13px;color:#313131">${escapeHtml(String(properties.accountName))}</div>
      <div style="color:#757575;font-size:11px;margin-bottom:8px">${escapeHtml(String(properties.street ?? ""))}${
        properties.street ? "<br/>" : ""
      }${escapeHtml(locationParts)}${properties.region ? ` · ${escapeHtml(String(properties.region))}` : ""}</div>
      <div style="display:grid;grid-template-columns:auto auto;gap:3px 12px;font-size:12px">
        ${accountType ? row("Type", escapeHtml(accountType)) : ""}
        ${row("SE", escapeHtml(String(properties.systemEngineer)) + mine)}
        ${row("AE", escapeHtml(String(properties.accountExecutive)))}
        ${row("Vertical", escapeHtml(String(properties.vertical)))}
        ${row("Active clusters", String(properties.activeClusterCount))}
        ${row("Nodes", String(properties.nodeCount))}
        ${row("VMs", Number(properties.vmCount).toLocaleString())}
      </div>
    </div>`;
}

export function AccountMapView({ records, meSe, fullscreenContainer }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(),
      center: [10, 25],
      zoom: 1.3,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.addControl(
      new maplibregl.FullscreenControl({ container: fullscreenContainer?.current ?? undefined }),
      "top-left",
    );

    map.on("load", () => {
      map.addSource("accounts", { type: "geojson", data: toFeatureCollection([], null) });

      map.addLayer({
        id: "accounts-circles",
        type: "circle",
        source: "accounts",
        paint: {
          "circle-color": CIRCLE_COLOR,
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            3,
            ["min", 7, ["+", 2.5, ["*", 0.18, ["get", "activeClusterCount"]]]],
            9,
            ["min", 14, ["+", 4, ["*", 0.4, ["get", "activeClusterCount"]]]],
          ],
          "circle-opacity": ["case", ["get", "mine"], 0.95, 0.78],
          "circle-stroke-color": ["case", ["get", "mine"], "#0f172a", "#ffffff"],
          "circle-stroke-width": ["case", ["get", "mine"], 3, 1.5],
        },
      });

      const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: "260px", offset: 12 });

      map.on("click", "accounts-circles", (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") {
          return;
        }
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        popup.setLngLat([lng, lat]).setHTML(popupHtml(feature.properties ?? {})).addTo(map);
      });

      map.on("mouseenter", "accounts-circles", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "accounts-circles", () => {
        map.getCanvas().style.cursor = "";
      });

      setLoaded(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      maplibregl.removeProtocol("pmtiles");
    };
  }, [fullscreenContainer]);

  // Push filtered data into the map and fit the view to the visible accounts.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) {
      return;
    }

    const source = map.getSource("accounts") as maplibregl.GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(records, meSe));

    const located = records.filter(
      (record) => Number.isFinite(record.longitude) && Number.isFinite(record.latitude),
    );
    if (located.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const record of located) {
        bounds.extend([record.longitude, record.latitude]);
      }
      map.fitBounds(bounds, { padding: 64, maxZoom: 12, duration: 500 });
    }
  }, [records, meSe, loaded]);

  // Legend only lists the account types actually present in the current view.
  const legendTypes = useMemo(() => {
    const present = new Set(records.map((record) => record.accountType).filter(Boolean));
    const order = ["Customer", "Prospect", "Prospect - Lead", "Ex - Customer"];
    const known = order.filter((type) => present.has(type));
    const rest = [...present].filter((type) => !order.includes(type)).sort();
    return [...known, ...rest];
  }, [records]);

  return (
    <div className="space-y-3">
      <div className="relative isolate z-0">
        <div
          ref={containerRef}
          className="account-map-canvas h-[600px] w-full overflow-hidden rounded-lg border border-charcoal-200 bg-[#eef2fb]"
        />
        {!loaded ? <MapLoading variant="overlay" /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {legendTypes.map((type) => (
          <span
            key={type}
            className="inline-flex items-center gap-2 rounded-full border border-charcoal-200 bg-white px-2.5 py-1"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: typeColors[type] ?? OTHER_COLOR }}
            />
            {type}
          </span>
        ))}
        <span className="inline-flex items-center gap-2 rounded-full border border-charcoal-200 bg-white px-2.5 py-1">
          <span className="h-2.5 w-2.5 rounded-full ring-2 ring-[#1e293b]" style={{ backgroundColor: CUSTOMER_COLOR }} />
          My accounts (highlighted ring)
        </span>
        <span className="ml-auto text-charcoal-400">Scroll to zoom · drag to pan · click a point for details</span>
      </div>
    </div>
  );
}
