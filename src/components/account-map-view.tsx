"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { layers, namedFlavor } from "@protomaps/basemaps";
import type { FeatureCollection } from "geojson";
import type { AccountMapRecord } from "@/lib/account-map";

type Props = {
  records: AccountMapRecord[];
  meSe: string | null;
};

const regionColors: Record<string, string> = {
  West: "#7855fa",
  East: "#1fd0e3",
  South: "#ff9478",
  Central: "#92d523",
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
  ["get", "region"],
  "West",
  regionColors.West,
  "East",
  regionColors.East,
  "South",
  regionColors.South,
  "Central",
  regionColors.Central,
  "#313131",
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
        city: record.city,
        state: record.state,
        region: record.region,
        subRegion: record.subRegion,
        systemEngineer: record.systemEngineer,
        accountExecutive: record.accountExecutive,
        vertical: record.vertical,
        activeClusterCount: record.activeClusterCount,
        totalClusterCount: record.totalClusterCount,
        cpuCores: record.cpuCoreCountActiveClusters,
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
  return `
    <div style="font-family:inherit;min-width:190px">
      <div style="font-weight:600;font-size:13px;color:#313131">${escapeHtml(String(properties.accountName))}</div>
      <div style="color:#757575;font-size:11px;margin-bottom:8px">${escapeHtml(String(properties.city))}, ${escapeHtml(
        String(properties.state),
      )} · ${escapeHtml(String(properties.region))}</div>
      <div style="display:grid;grid-template-columns:auto auto;gap:3px 12px;font-size:12px">
        ${row("SE", escapeHtml(String(properties.systemEngineer)) + mine)}
        ${row("AE", escapeHtml(String(properties.accountExecutive)))}
        ${row("Vertical", escapeHtml(String(properties.vertical)))}
        ${row("Active clusters", String(properties.activeClusterCount))}
        ${row("VMs", Number(properties.vmCount).toLocaleString())}
      </div>
    </div>`;
}

export function AccountMapView({ records, meSe }: Props) {
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
      center: [-98.5, 39.5],
      zoom: 3.4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.addControl(new maplibregl.FullscreenControl(), "top-left");

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
            ["+", 3, ["*", 0.45, ["get", "activeClusterCount"]]],
            9,
            ["+", 6, ["*", 1.1, ["get", "activeClusterCount"]]],
          ],
          "circle-opacity": ["case", ["get", "mine"], 0.95, 0.78],
          "circle-stroke-color": ["case", ["get", "mine"], "#3b1f9c", "#ffffff"],
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
  }, []);

  // Push filtered data into the map and fit the view to the visible accounts.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) {
      return;
    }

    const source = map.getSource("accounts") as maplibregl.GeoJSONSource | undefined;
    source?.setData(toFeatureCollection(records, meSe));

    if (records.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      for (const record of records) {
        bounds.extend([record.longitude, record.latitude]);
      }
      map.fitBounds(bounds, { padding: 64, maxZoom: 9, duration: 500 });
    }
  }, [records, meSe, loaded]);

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="h-[600px] w-full overflow-hidden rounded-lg border border-charcoal-200 bg-[#eef2fb]"
      />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {Object.entries(regionColors).map(([region, color]) => (
          <span
            key={region}
            className="inline-flex items-center gap-2 rounded-full border border-charcoal-200 bg-white px-2.5 py-1"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            {region}
          </span>
        ))}
        <span className="inline-flex items-center gap-2 rounded-full border border-charcoal-200 bg-white px-2.5 py-1">
          <span className="h-2.5 w-2.5 rounded-full ring-2 ring-[#3b1f9c]" style={{ backgroundColor: "#7855fa" }} />
          My accounts
        </span>
        <span className="ml-auto text-charcoal-400">Scroll to zoom · drag to pan · click a point for details</span>
      </div>
    </div>
  );
}
