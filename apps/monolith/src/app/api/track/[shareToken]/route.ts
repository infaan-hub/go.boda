import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ shareToken: string }> }
) {
  const { shareToken } = await context.params;

  // Built-in Unguja live preview token for instant walkthroughs
  if (shareToken === "demo-unguja" || shareToken.startsWith("demo-")) {
    const isBajaji = shareToken.includes("bajaji");
    return NextResponse.json({
      shareToken,
      isDemo: true,
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      viewsCount: 3,
      trip: {
        tripCode: isBajaji ? "GB-48219" : "GB-76640",
        status: "IN_PROGRESS",
        transportType: isBajaji ? "BAJAJI" : "BODABODA",
        operatorTitle: isBajaji ? "DRIVER" : "RIDER",
        operatorName: isBajaji ? "Khamis Bakari" : "Hassan Ali",
        operatorPlate: isBajaji ? "Z 612 BBA" : "Z 104 AAB",
        pickup: {
          lat: -6.1613,
          lng: 39.1885,
          label: "Forodhani Gardens Edge, Stone Town",
        },
        dropoff: {
          lat: -6.222,
          lng: 39.2249,
          label: "Abeid Amani Karume Airport (ZNZ)",
        },
        distanceKm: 7.4,
        durationMinutes: 15,
        timestamps: {
          assignedAt: new Date(Date.now() - 8 * 60000).toISOString(),
          arrivedAt: new Date(Date.now() - 5 * 60000).toISOString(),
          startedAt: new Date(Date.now() - 3 * 60000).toISOString(),
          completedAt: null,
        },
      },
      livePosition: {
        lat: -6.1865,
        lng: 39.2055,
        heading: 150,
        speedKmh: 34,
        lastSeenAt: new Date().toISOString(),
      },
      breadcrumbs: [],
      activeSos: null,
    });
  }

  // Resolve non-demo shares directly in the monolith database layer.
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const linkRows = (await sql`
      SELECT id, trip_id, expires_at, revoked_at, views_count
      FROM safety.share_links
      WHERE token = ${shareToken}
      LIMIT 1
    `) as Array<{
      id: string;
      trip_id: string;
      expires_at: string;
      revoked_at: string | null;
      views_count: number;
    }>;

    const link = linkRows[0];
    if (!link) {
      return NextResponse.json(
        { error: "SHARE_LINK_NOT_FOUND" },
        { status: 404 }
      );
    }
    if (link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "SHARE_LINK_EXPIRED" },
        { status: 410 }
      );
    }

    const tripRows = (await sql`
      SELECT
        id, trip_code, transport_type, operator_title, status,
        operator_id, operator_plate, operator_name,
        pickup_effective_lat, pickup_effective_lng, pickup_label,
        dropoff_lat, dropoff_lng, dropoff_label,
        distance_meters, duration_seconds,
        assigned_at, arrived_at, started_at, completed_at
      FROM trip.trips
      WHERE id = ${link.trip_id}::uuid
      LIMIT 1
    `) as Array<{
      id: string;
      trip_code: string;
      transport_type: "BODABODA" | "BAJAJI";
      operator_title: "RIDER" | "DRIVER";
      status: string;
      operator_id: string | null;
      operator_plate: string | null;
      operator_name: string | null;
      pickup_effective_lat: number;
      pickup_effective_lng: number;
      pickup_label: string;
      dropoff_lat: number;
      dropoff_lng: number;
      dropoff_label: string;
      distance_meters: number;
      duration_seconds: number;
      assigned_at: string | null;
      arrived_at: string | null;
      started_at: string | null;
      completed_at: string | null;
    }>;

    const trip = tripRows[0];
    if (!trip) {
      return NextResponse.json({ error: "TRIP_NOT_FOUND" }, { status: 404 });
    }

    const [posRows, sosRows] = await Promise.all([
      trip.operator_id
        ? sql`
            SELECT lat, lng, heading, speed_kmh AS "speedKmh", last_seen_at AS "lastSeenAt"
            FROM location.operator_positions
            WHERE operator_id = ${trip.operator_id}::uuid
            LIMIT 1
          `
        : Promise.resolve([]),
      sql`
        SELECT alert_code AS "alertCode", status, created_at AS "createdAt"
        FROM safety.sos_alerts
        WHERE trip_id = ${trip.id}::uuid AND status IN ('OPEN', 'ACKNOWLEDGED')
        ORDER BY created_at DESC
        LIMIT 1
      `,
    ]);

    return NextResponse.json({
      shareToken,
      expiresAt: link.expires_at,
      viewsCount: link.views_count,
      trip: {
        tripCode: trip.trip_code,
        status: trip.status,
        transportType: trip.transport_type,
        operatorTitle: trip.operator_title,
        operatorName: trip.operator_name,
        operatorPlate: trip.operator_plate,
        pickup: {
          lat: trip.pickup_effective_lat,
          lng: trip.pickup_effective_lng,
          label: trip.pickup_label,
        },
        dropoff: {
          lat: trip.dropoff_lat,
          lng: trip.dropoff_lng,
          label: trip.dropoff_label,
        },
        distanceKm: Number((trip.distance_meters / 1000).toFixed(2)),
        durationMinutes: Math.max(1, Math.round(trip.duration_seconds / 60)),
        timestamps: {
          assignedAt: trip.assigned_at,
          arrivedAt: trip.arrived_at,
          startedAt: trip.started_at,
          completedAt: trip.completed_at,
        },
      },
      livePosition: posRows[0] ?? null,
      breadcrumbs: [],
      activeSos: sosRows[0] ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "TRACK_UNAVAILABLE",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 503 }
    );
  }
}
