import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getSql } from "./index.js";

interface UngujaLandmark {
  id: string;
  nameSw: string;
  nameEn: string;
  category: string;
  area: string;
  isKituo: boolean;
  lat: number;
  lng: number;
}

function loadLocalEnv() {
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env.local"),
    resolve(process.cwd(), "../../.env"),
  ];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const raw = readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function migratePhase11() {
  loadLocalEnv();
  const sql = getSql();
  const dataPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "data/unguja-landmarks.json"
  );
  const data = JSON.parse(readFileSync(dataPath, "utf8")) as {
    locations: UngujaLandmark[];
  };

  if (data.locations.length !== 2500) {
    throw new Error(`Expected 2,500 named Unguja locations, found ${data.locations.length}.`);
  }

  console.log("[Phase 11 Migrate] Importing 2,500 named Unguja map and administrative locations...");

  const ungujaBoundary =
    "POLYGON((39.12 -6.18, 39.13 -6.08, 39.14 -5.96, 39.17 -5.85, 39.20 -5.76, 39.24 -5.69, 39.30 -5.64, 39.38 -5.64, 39.42 -5.71, 39.47 -5.84, 39.50 -5.98, 39.54 -6.10, 39.60 -6.20, 39.62 -6.34, 39.60 -6.42, 39.55 -6.50, 39.47 -6.52, 39.40 -6.52, 39.32 -6.46, 39.26 -6.37, 39.20 -6.29, 39.13 -6.22, 39.12 -6.18))";
  await sql`
    UPDATE geo.zones
    SET geom = ST_GeomFromText(${ungujaBoundary}, 4326)
    WHERE id = 'unguja-island'
  `;

  // Replace legacy randomized rows and previous catalog versions; keep curated legacy landmarks.
  await sql`
    DELETE FROM geo.landmarks
    WHERE id LIKE 'osm-%'
       OR id LIKE 'nbs-2022-%'
       OR name_en ~ '^Street [0-9]+ (Rd|St|Ave|Lane|Close|Way),'
       OR name_sw ~ '^Mtaa [0-9]+ (Rd|St|Ave|Lane|Close|Way),'
  `;

  const batchSize = 200;
  for (let offset = 0; offset < data.locations.length; offset += batchSize) {
    const batch = data.locations.slice(offset, offset + batchSize);
    const values = batch.map((location) => {
      if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
        throw new Error(`Invalid coordinates for ${location.id}.`);
      }
      return `(${sqlLiteral(location.id)}, ${sqlLiteral(location.nameSw)}, ${sqlLiteral(location.nameEn)}, ${sqlLiteral(location.category)}, ${sqlLiteral(location.area)}, ${location.isKituo}, ${location.lat}, ${location.lng}, ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326))`;
    });
    await sql.query(`
      INSERT INTO geo.landmarks (id, name_sw, name_en, category, area, is_kituo, lat, lng, geom)
      VALUES ${values.join(",")}
      ON CONFLICT (id) DO UPDATE SET
        name_sw = EXCLUDED.name_sw,
        name_en = EXCLUDED.name_en,
        category = EXCLUDED.category,
        area = EXCLUDED.area,
        is_kituo = EXCLUDED.is_kituo,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        geom = EXCLUDED.geom
    `);
    console.log(`[Phase 11] imported ${Math.min(offset + batchSize, data.locations.length)}/2,500`);
  }

  const [total] = (await sql`
    SELECT COUNT(*)::int AS count FROM geo.landmarks
  `) as Array<{ count: number }>;
  console.log("[Phase 11 Migrate] Complete:", { imported: data.locations.length, total: total?.count ?? 0 });
}

migratePhase11().catch((err) => {
  console.error("[Phase 11 Migrate] Failed:", err);
  process.exit(1);
});
