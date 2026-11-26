"use client";

import * as React from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Compass, Crosshair } from "lucide-react";
import { UNGUJA_GEO } from "@goboda/shared-types";

export interface MapVehicle {
  operatorId: string;
  transportType: "BODABODA" | "BAJAJI";
  operatorTitle: "RIDER" | "DRIVER";
  homeKituo: string;
  lat: number;
  lng: number;
  heading: number;
  ratingAvg: number;
  distanceMeters: number;
  etaMinutes: number;
}

export interface MapPoint {
  lat: number;
  lng: number;
  label: string;
}

export interface RouteGeoJson {
  type: "LineString";
  coordinates: Array<[number, number]>;
}

interface UngujaMapProps {
  locale: "sw" | "en";
  vehicles: MapVehicle[];
  pickup: MapPoint;
  snappedPickup?: MapPoint | null;
  dropoff: MapPoint | null;
  routeGeometry?: RouteGeoJson | null;
  pinMode: "pickup" | "dropoff";
  onMapSelect?: (coords: { lat: number; lng: number }) => void;
}

const DEFAULT_MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
  "https://tiles.openfreemap.org/styles/liberty";

// Strictly locked to Unguja Island, Zanzibar
const UNGUJA_MAX_BOUNDS: [[number, number], [number, number]] = [
  [39.08, -6.55],
  [39.64, -5.66],
];

const ROUTE_SOURCE_ID = "goboda-route-source";
const ROUTE_CASING_LAYER_ID = "goboda-route-casing";
const ROUTE_LINE_LAYER_ID = "goboda-route-line";
const WALK_SOURCE_ID = "goboda-walk-source";
const WALK_LINE_LAYER_ID = "goboda-walk-line";

function buildPinElement(
  badgeText: string,
  bgHex: string,
  textHex: string,
  title: string
): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.title = title;
  wrap.style.cssText =
    "display:flex;flex-direction:column;align-items:center;cursor:pointer;";

  const circle = document.createElement("div");
  circle.textContent = badgeText;
  circle.style.cssText = `
    min-width: 28px;
    height: 28px;
    padding: 0 7px;
    border-radius: 9999px;
    background: ${bgHex};
    color: ${textHex};
    font-size: 11px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2.5px solid #ffffff;
    box-shadow: 0 3px 10px rgba(15,23,42,0.32);
    letter-spacing: 0.02em;
  `;

  const stem = document.createElement("div");
  stem.style.cssText = `
    width: 3px;
    height: 8px;
    background: ${bgHex};
    border-radius: 0 0 3px 3px;
  `;

  wrap.appendChild(circle);
  wrap.appendChild(stem);
  return wrap;
}

function buildVehicleElement(v: MapVehicle): HTMLDivElement {
  const isBodaboda = v.transportType === "BODABODA";
  const el = document.createElement("div");
  el.style.cssText = `
    width: 30px;
    height: 30px;
    border-radius: 9999px;
    background: ${isBodaboda ? "#0f766e" : "#f59e0b"};
    color: ${isBodaboda ? "#ffffff" : "#0f172a"};
    border: 2px solid #ffffff;
    box-shadow: 0 2px 8px rgba(15,23,42,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  `;
  el.textContent = isBodaboda ? "B" : "3W";
  el.title = isBodaboda
    ? `Bodaboda Rider • ~${v.etaMinutes} min`
    : `Bajaji Driver • ~${v.etaMinutes} min`;
  return el;
}

export function UngujaMap({
  locale,
  vehicles,
  pickup,
  snappedPickup,
  dropoff,
  routeGeometry,
  pinMode,
  onMapSelect,
}: UngujaMapProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const vehicleMarkersRef = React.useRef<maplibregl.Marker[]>([]);
  const pointMarkersRef = React.useRef<maplibregl.Marker[]>([]);
  const onMapSelectRef = React.useRef(onMapSelect);

  const [mapReady, setMapReady] = React.useState(false);
  const [mapError, setMapError] = React.useState<string | null>(null);

  React.useEffect(() => {
    onMapSelectRef.current = onMapSelect;
  }, [onMapSelect]);

  // Initialize MapLibre GL map once
  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: DEFAULT_MAP_STYLE,
        center: [pickup.lng, pickup.lat],
        zoom: 13.3,
        minZoom: 9.5,
        maxZoom: 18,
        maxBounds: UNGUJA_MAX_BOUNDS,
        attributionControl: false,
      });
    } catch (err) {
      setMapError(
        err instanceof Error ? err.message : "Unable to initialize WebGL map"
      );
      return;
    }

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "bottom-right"
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left"
    );

    map.on("load", () => {
      map.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: ROUTE_CASING_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": 7,
          "line-opacity": 0.9,
        },
      });
      map.addLayer({
        id: ROUTE_LINE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#0f766e",
          "line-width": 4.5,
        },
      });

      map.addSource(WALK_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: WALK_LINE_LAYER_ID,
        type: "line",
        source: WALK_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#d97706",
          "line-width": 3,
          "line-dasharray": [2, 2],
        },
      });

      setMapReady(true);
    });

    map.on("click", (e) => {
      if (onMapSelectRef.current) {
        onMapSelectRef.current({
          lat: Number(e.lngLat.lat.toFixed(6)),
          lng: Number(e.lngLat.lng.toFixed(6)),
        });
      }
    });

    mapRef.current = map;

    return () => {
      vehicleMarkersRef.current.forEach((m) => m.remove());
      pointMarkersRef.current.forEach((m) => m.remove());
      vehicleMarkersRef.current = [];
      pointMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // Intentionally initialize once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update nearby Bodaboda & Bajaji markers
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    vehicleMarkersRef.current.forEach((m) => m.remove());
    vehicleMarkersRef.current = [];

    for (const v of vehicles) {
      const el = buildVehicleElement(v);
      const roleLabel =
        v.transportType === "BODABODA"
          ? locale === "sw"
            ? "Rider wa Bodaboda"
            : "Bodaboda Rider"
          : locale === "sw"
            ? "Dereva wa Bajaji"
            : "Bajaji Driver";

      const popup = new maplibregl.Popup({
        offset: 18,
        closeButton: false,
      }).setHTML(
        `<div style="font-family:system-ui,sans-serif;font-size:12px;line-height:1.35;padding:2px 4px;">
          <strong style="color:#0f172a;">${roleLabel}</strong><br/>
          <span style="color:#0f766e;font-weight:700;">~${v.etaMinutes} min</span>
          <span style="color:#64748b;"> • ★ ${Number(v.ratingAvg).toFixed(1)}</span><br/>
          <span style="color:#475569;font-size:11px;">${v.homeKituo || "Unguja"}</span>
        </div>`
      );

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([v.lng, v.lat])
        .setPopup(popup)
        .addTo(map);
      vehicleMarkersRef.current.push(marker);
    }
  }, [vehicles, locale]);

  // Update Pickup, Stone Town Snapped Gate, Dropoff markers + Route & Walk layers
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    pointMarkersRef.current.forEach((m) => m.remove());
    pointMarkersRef.current = [];

    // Original pickup pin
    const pickupEl = buildPinElement(
      snappedPickup ? "Walk" : "A",
      snappedPickup ? "#64748b" : "#0f766e",
      "#ffffff",
      pickup.label
    );
    pointMarkersRef.current.push(
      new maplibregl.Marker({ element: pickupEl, anchor: "bottom" })
        .setLngLat([pickup.lng, pickup.lat])
        .addTo(map)
    );

    // Stone Town Smart Snap perimeter gate marker
    if (snappedPickup) {
      const gateEl = buildPinElement(
        "Gate",
        "#0f766e",
        "#ffffff",
        snappedPickup.label
      );
      pointMarkersRef.current.push(
        new maplibregl.Marker({ element: gateEl, anchor: "bottom" })
          .setLngLat([snappedPickup.lng, snappedPickup.lat])
          .addTo(map)
      );
    }

    // Dropoff marker
    if (dropoff) {
      const dropoffEl = buildPinElement("B", "#d97706", "#ffffff", dropoff.label);
      pointMarkersRef.current.push(
        new maplibregl.Marker({ element: dropoffEl, anchor: "bottom" })
          .setLngLat([dropoff.lng, dropoff.lat])
          .addTo(map)
      );
    }

    if (mapReady) {
      const routeSource = map.getSource(ROUTE_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (routeSource) {
        routeSource.setData(
          routeGeometry && routeGeometry.coordinates.length >= 2
            ? {
                type: "FeatureCollection",
                features: [
                  {
                    type: "Feature",
                    properties: {},
                    geometry: routeGeometry,
                  },
                ],
              }
            : { type: "FeatureCollection", features: [] }
        );
      }

      const walkSource = map.getSource(WALK_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      if (walkSource) {
        walkSource.setData(
          snappedPickup
            ? {
                type: "FeatureCollection",
                features: [
                  {
                    type: "Feature",
                    properties: {},
                    geometry: {
                      type: "LineString",
                      coordinates: [
                        [pickup.lng, pickup.lat],
                        [snappedPickup.lng, snappedPickup.lat],
                      ],
                    },
                  },
                ],
              }
            : { type: "FeatureCollection", features: [] }
        );
      }
    }

    // Smoothly frame pickup + dropoff inside Unguja bounds
    const inUnguja =
      pickup.lat <= UNGUJA_GEO.BOUNDS.northEast.lat &&
      pickup.lat >= UNGUJA_GEO.BOUNDS.southWest.lat &&
      pickup.lng >= UNGUJA_GEO.BOUNDS.southWest.lng &&
      pickup.lng <= UNGUJA_GEO.BOUNDS.northEast.lng;

    if (!inUnguja) return;

    if (
      dropoff &&
      dropoff.lat <= UNGUJA_GEO.BOUNDS.northEast.lat &&
      dropoff.lat >= UNGUJA_GEO.BOUNDS.southWest.lat &&
      dropoff.lng >= UNGUJA_GEO.BOUNDS.southWest.lng &&
      dropoff.lng <= UNGUJA_GEO.BOUNDS.northEast.lng
    ) {
      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([pickup.lng, pickup.lat]);
      if (snappedPickup) bounds.extend([snappedPickup.lng, snappedPickup.lat]);
      bounds.extend([dropoff.lng, dropoff.lat]);
      if (routeGeometry) {
        for (const coord of routeGeometry.coordinates) {
          bounds.extend(coord);
        }
      }
      map.fitBounds(bounds, {
        padding: { top: 58, bottom: 52, left: 44, right: 44 },
        maxZoom: 15.2,
        duration: 650,
      });
    } else {
      map.easeTo({
        center: [pickup.lng, pickup.lat],
        zoom: 13.8,
        duration: 500,
      });
    }
  }, [pickup, snappedPickup, dropoff, routeGeometry, mapReady]);

  const handleRecenter = () => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      center: [UNGUJA_GEO.STONE_TOWN.lng, UNGUJA_GEO.STONE_TOWN.lat],
      zoom: 13.2,
      duration: 500,
    });
  };

  if (mapError) {
    return (
      <div className="flex h-[320px] flex-col items-center justify-center rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-950 via-teal-900 to-emerald-900 p-6 text-center text-white">
        <Compass className="h-8 w-8 text-amber-300" />
        <p className="mt-2 text-sm font-bold">
          {locale === "sw"
            ? "Ramani ya Unguja (Hali ya Kawaida)"
            : "Unguja Live Map (Fallback View)"}
        </p>
        <p className="mt-1 text-xs text-teal-100/80">{mapError}</p>
      </div>
    );
  }

  return (
    <div className="relative h-[340px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm sm:h-[400px]">
      <div ref={containerRef} className="h-full w-full" />

      {/* Top-left fleet legend */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow-sm ring-1 ring-slate-200/80">
          <span className="h-2.5 w-2.5 rounded-full bg-teal-700" />
          Bodaboda (B)
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow-sm ring-1 ring-slate-200/80">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          Bajaji (3W)
        </span>
      </div>

      {/* Top-right pin mode hint + Stone Town recenter */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
        <span className="pointer-events-none rounded-full bg-slate-900/85 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur">
          {pinMode === "pickup"
            ? locale === "sw"
              ? "Gusa ramani: Kuchukuliwa (A)"
              : "Tap map: Pickup (A)"
            : locale === "sw"
              ? "Gusa ramani: Kushushwa (B)"
              : "Tap map: Dropoff (B)"}
        </span>
        <button
          type="button"
          onClick={handleRecenter}
          title={locale === "sw" ? "Rudi Stone Town" : "Recenter Stone Town"}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-teal-50 hover:text-teal-700"
        >
          <Crosshair className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
