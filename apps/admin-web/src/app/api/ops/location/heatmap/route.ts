import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const UNGUJA_CORRIDORS = [
  { id: "stone-town", name: "Stone Town & Darajani", lat: -6.1649, lng: 39.1936, radiusMeters: 2500 },
  { id: "malindi-ferry", name: "Malindi Ferry Terminal", lat: -6.1582, lng: 39.1929, radiusMeters: 2000 },
  { id: "michenzani", name: "Michenzani & Ng'ambo", lat: -6.1695, lng: 39.2085, radiusMeters: 2500 },
  { id: "mwanakwerekwe", name: "Mwanakwerekwe & Fuoni", lat: -6.1885, lng: 39.231, radiusMeters: 3500 },
  { id: "znz-airport", name: "ZNZ International Airport & Kisauni", lat: -6.222, lng: 39.2249, radiusMeters: 3500 },
  { id: "bububu", name: "Bububu & Mtoni Coast", lat: -6.1155, lng: 39.2179, radiusMeters: 4500 },
  { id: "paje-jambiani", name: "Paje, Bwejuu & Jambiani", lat: -6.2695, lng: 39.5322, radiusMeters: 8000 },
  { id: "nungwi-kendwa", name: "Nungwi & Kendwa North", lat: -5.736, lng: 39.293, radiusMeters: 7000 },
];

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const [fleetRows, recentDemandRows] = await Promise.all([
      sql`
        SELECT operator_id AS "operatorId", transport_type AS "transportType",
               operator_title AS "operatorTitle", plate_number AS "plateNumber",
               home_kituo AS "homeKituo", is_busy AS "isBusy", lat, lng, rating_avg AS "ratingAvg"
        FROM location.operator_positions
        WHERE is_online = TRUE
        LIMIT 200
      `,
      sql`
        SELECT id, status, transport_type AS "transportType",
               pickup_effective_lat AS "lat", pickup_effective_lng AS "lng",
               pickup_label AS "pickupLabel", created_at AS "createdAt"
        FROM trip.trips
        WHERE created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC
        LIMIT 200
      `,
    ]);

    const fleet = fleetRows as Array<{
      operatorId: string;
      transportType: "BODABODA" | "BAJAJI";
      operatorTitle: "RIDER" | "DRIVER";
      plateNumber: string;
      homeKituo: string;
      isBusy: boolean;
      lat: number;
      lng: number;
      ratingAvg: number;
    }>;

    const demands = recentDemandRows as Array<{
      id: string;
      status: string;
      transportType: string;
      lat: number;
      lng: number;
      pickupLabel: string;
    }>;

    function approxMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
      const dLat = (lat2 - lat1) * 111320;
      const dLng = (lng2 - lng1) * 111320 * Math.cos((lat1 * Math.PI) / 180);
      return Math.hypot(dLat, dLng);
    }

    const zones = UNGUJA_CORRIDORS.map((c) => {
      const inZoneFleet = fleet.filter(
        (f) => approxMeters(c.lat, c.lng, f.lat, f.lng) <= c.radiusMeters
      );
      const idleRiders = inZoneFleet.filter(
        (f) => !f.isBusy && f.transportType === "BODABODA"
      ).length;
      const idleDrivers = inZoneFleet.filter(
        (f) => !f.isBusy && f.transportType === "BAJAJI"
      ).length;
      const zoneDemand = demands.filter(
        (d) => approxMeters(c.lat, c.lng, d.lat, d.lng) <= c.radiusMeters
      );
      const unmetDemand = zoneDemand.filter(
        (d) => d.status === "SEARCHING" || d.status === "NO_OPERATOR_FOUND"
      ).length;
      const totalIdle = idleRiders + idleDrivers;
      const demandScore = zoneDemand.length + unmetDemand * 2;
      const pressure =
        unmetDemand > 0 || (demandScore > totalIdle && totalIdle < 2)
          ? ("SURGE_HOTSPOT" as const)
          : totalIdle === 0
            ? ("UNDERSERVED" as const)
            : ("BALANCED" as const);

      return {
        ...c,
        idleRiders,
        idleDrivers,
        totalIdle,
        recentRequests24h: zoneDemand.length,
        unmetRequests: unmetDemand,
        pressure,
        recommendation:
          pressure === "SURGE_HOTSPOT"
            ? `Reposition +2 idle Bodaboda Riders & +1 Bajaji Driver toward ${c.name}.`
            : pressure === "UNDERSERVED"
              ? `No idle vehicles in ${c.name} — broadcast incentive to nearby Kituo.`
              : `Healthy Unguja supply coverage (${totalIdle} idle online).`,
      };
    });

    return NextResponse.json({
      zones,
      fleet,
      demandPoints: demands.slice(0, 60),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "HEATMAP_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
