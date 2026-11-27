"use client";

import * as React from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Compass } from "lucide-react";
import { UNGUJA_GEO } from "@goboda/shared-types";

export interface AdminFleetMarker {
  operatorId: string;
  transportType: "BODABODA" | "BAJAJI";
  operatorTitle: "RIDER" | "DRIVER";
  plateNumber: string;
  homeKituo: string;
  isBusy: boolean;
  lat: number;
  lng: number;
  ratingAvg: number;
}

export interface AdminSosMarker {
  id: string;
  alertCode: string;
  operatorPlate: string | null;
  status: string;
  lat: number;
  lng: number;
  reason: string;
}

const DEFAULT_MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL ||
  "https://tiles.openfreemap.org/styles/liberty";

const UNGUJA_MAX_BOUNDS: [[number, number], [number, number]] = [
  [39.08, -6.55],
  [39.64, -5.66],
];

export function AdminUngujaMap({
  fleet,
  sosAlerts,
}: {
  fleet: AdminFleetMarker[];
  sosAlerts: AdminSosMarker[];
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const markersRef = React.useRef<maplibregl.Marker[]>([]);
  const [mapError, setMapError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    try {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: DEFAULT_MAP_STYLE,
        center: [UNGUJA_GEO.CENTER.lng, UNGUJA_GEO.CENTER.lat],
        zoom: 11.2,
        minZoom: 9.2,
        maxZoom: 18,
        maxBounds: UNGUJA_MAX_BOUNDS,
        attributionControl: false,
      });
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "bottom-right"
      );
      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        "bottom-left"
      );
      mapRef.current = map;
      return () => {
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];
        map.remove();
        mapRef.current = null;
      };
    } catch (err) {
      setMapError(err instanceof Error ? err.message : "WebGL unavailable");
    }
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const v of fleet) {
      const isBoda = v.transportType === "BODABODA";
      const el = document.createElement("div");
      el.style.cssText = `
        width: 30px; height: 30px; border-radius: 9999px;
        background: ${v.isBusy ? "#2563eb" : isBoda ? "#17645F" : "#B86B2B"};
        color: ${isBoda || v.isBusy ? "#ffffff" : "#0f172a"};
        border: 2px solid #ffffff; box-shadow: 0 2px 8px rgba(15,23,42,0.32);
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 800; cursor: pointer;
      `;
      el.textContent = isBoda ? "B" : "3W";
      const popup = new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(
        `<div style="font-family:system-ui,sans-serif;font-size:12px;">
          <strong>${isBoda ? "Bodaboda Rider" : "Bajaji Driver"}</strong> (${v.plateNumber})<br/>
          <span>${v.homeKituo || "Unguja"} • ★ ${Number(v.ratingAvg).toFixed(1)}</span><br/>
          <span style="color:${v.isBusy ? "#2563eb" : "#17645F"};font-weight:700;">${
            v.isBusy ? "ON ACTIVE TRIP" : "ONLINE AVAILABLE"
          }</span>
        </div>`
      );
      markersRef.current.push(
        new maplibregl.Marker({ element: el })
          .setLngLat([v.lng, v.lat])
          .setPopup(popup)
          .addTo(map)
      );
    }

    const openSos = sosAlerts.filter(
      (s) => s.status === "OPEN" || s.status === "ACKNOWLEDGED"
    );
    for (const s of openSos) {
      const el = document.createElement("div");
      el.style.cssText = `
        padding: 0 8px; height: 28px; border-radius: 9999px;
        background: #A93232; color: #ffffff; border: 2px solid #ffffff;
        box-shadow: 0 0 0 6px rgba(225,29,72,0.32);
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 900; cursor: pointer;
      `;
      el.textContent = "SOS";
      const popup = new maplibregl.Popup({ offset: 18 }).setHTML(
        `<div style="font-family:system-ui,sans-serif;font-size:12px;">
          <strong style="color:#A93232;">${s.alertCode} (${s.status})</strong><br/>
          <span>Plate: ${s.operatorPlate ?? "N/A"}</span><br/>
          <span>${s.reason}</span>
        </div>`
      );
      markersRef.current.push(
        new maplibregl.Marker({ element: el })
          .setLngLat([s.lng, s.lat])
          .setPopup(popup)
          .addTo(map)
      );
    }
  }, [fleet, sosAlerts]);

  if (mapError) {
    return (
      <div className="flex h-[380px] flex-col items-center justify-center rounded-2xl border border-[#17645F]/15 bg-[#17645F] p-6 text-center text-white">
        <Compass className="h-8 w-8 text-amber-400" />
        <p className="mt-2 text-sm font-bold">Unguja Live Operations Map</p>
        <p className="mt-1 text-xs text-[#17645F]/55">{mapError}</p>
      </div>
    );
  }

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-2xl border border-[#17645F]/15 bg-[#EDE7DF] shadow-sm">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF7F2]/95 px-2.5 py-1 text-[11px] font-bold text-[#122927] shadow-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-[#17645F]" />
          Bodaboda Rider (B)
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF7F2]/95 px-2.5 py-1 text-[11px] font-bold text-[#122927] shadow-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-[#B86B2B]" />
          Bajaji Driver (3W)
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FAF7F2]/95 px-2.5 py-1 text-[11px] font-bold text-[#A93232] shadow-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-[#A93232]" />
          Open SOS
        </span>
      </div>
    </div>
  );
}
