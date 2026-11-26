import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export const MICROSERVICE_SCHEMAS = [
  "auth",
  "operator",
  "geo",
  "location",
  "pricing",
  "dispatch",
  "trip",
  "finance",
  "notif",
  "safety",
] as const;

export type MicroserviceSchema = (typeof MICROSERVICE_SCHEMAS)[number];

let _sql: NeonQueryFunction<false, false> | null = null;

/**
 * Lazy-initialized Neon HTTP SQL client (build-time safe for Next.js & Vercel Functions).
 * Strips unsupported query params if needed and connects securely over TLS.
 */
export function getSql(
  connectionString?: string
): NeonQueryFunction<false, false> {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not configured. Set DATABASE_URL in .env.local or Vercel Environment Variables."
    );
  }
  if (connectionString) {
    return neon(url);
  }
  if (!_sql) {
    _sql = neon(url);
  }
  return _sql;
}

export interface DatabaseHealthResult {
  connected: boolean;
  provider: "neon-postgres";
  database: string | null;
  postgresVersion: string | null;
  postgisVersion: string | null;
  schemasReady: string[];
  schemasMissing: string[];
  latencyMs: number;
  error?: string;
}

export async function checkDatabaseHealth(): Promise<DatabaseHealthResult> {
  const started = performance.now();
  if (!process.env.DATABASE_URL) {
    return {
      connected: false,
      provider: "neon-postgres",
      database: null,
      postgresVersion: null,
      postgisVersion: null,
      schemasReady: [],
      schemasMissing: [...MICROSERVICE_SCHEMAS],
      latencyMs: 0,
      error: "DATABASE_URL is not set",
    };
  }

  try {
    const sql = getSql();
    const infoRows = await sql`
      SELECT
        current_database() AS database_name,
        version() AS pg_version
    `;
    const firstInfo = infoRows[0] as
      | { database_name?: string; pg_version?: string }
      | undefined;

    let postgisVersion: string | null = null;
    try {
      const gisRows = await sql`SELECT PostGIS_Version() AS postgis_version`;
      const firstGis = gisRows[0] as { postgis_version?: string } | undefined;
      postgisVersion = firstGis?.postgis_version ?? null;
    } catch {
      postgisVersion = null;
    }

    const schemaRows = await sql`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name = ANY(${[...MICROSERVICE_SCHEMAS]})
      ORDER BY schema_name ASC
    `;
    const schemasReady = schemaRows
      .map((r) => String((r as { schema_name: string }).schema_name))
      .sort();
    const schemasMissing = MICROSERVICE_SCHEMAS.filter(
      (s) => !schemasReady.includes(s)
    );

    return {
      connected: true,
      provider: "neon-postgres",
      database: firstInfo?.database_name ?? null,
      postgresVersion: firstInfo?.pg_version?.split(",")[0] ?? null,
      postgisVersion,
      schemasReady,
      schemasMissing,
      latencyMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    return {
      connected: false,
      provider: "neon-postgres",
      database: null,
      postgresVersion: null,
      postgisVersion: null,
      schemasReady: [],
      schemasMissing: [...MICROSERVICE_SCHEMAS],
      latencyMs: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : "Unknown database error",
    };
  }
}

export interface UngujaBootstrapSummary {
  zonesCount: number;
  snapPointsCount: number;
  landmarksCount: number;
  tariffs: Array<{
    transportType: string;
    operatorRole: string;
    baseFareTzs: number;
    perKmTzs: number;
    perMinTzs: number;
    minFareTzs: number;
    commissionPct: number;
  }>;
}

export async function getUngujaBootstrapSummary(): Promise<UngujaBootstrapSummary | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const sql = getSql();
    const [zonesRes, snapRes, landmarksRes, tariffRows] = await Promise.all([
      sql`SELECT COUNT(*)::int AS count FROM geo.zones`,
      sql`SELECT COUNT(*)::int AS count FROM geo.snap_points`,
      sql`SELECT COUNT(*)::int AS count FROM geo.landmarks`,
      sql`
        SELECT
          transport_type AS "transportType",
          operator_role AS "operatorRole",
          base_fare_tzs AS "baseFareTzs",
          per_km_tzs AS "perKmTzs",
          per_min_tzs AS "perMinTzs",
          min_fare_tzs AS "minFareTzs",
          commission_pct AS "commissionPct"
        FROM pricing.tariffs
        ORDER BY transport_type ASC
      `,
    ]);

    return {
      zonesCount: Number((zonesRes[0] as { count?: number })?.count ?? 0),
      snapPointsCount: Number((snapRes[0] as { count?: number })?.count ?? 0),
      landmarksCount: Number(
        (landmarksRes[0] as { count?: number })?.count ?? 0
      ),
      tariffs: tariffRows as UngujaBootstrapSummary["tariffs"],
    };
  } catch {
    return null;
  }
}
