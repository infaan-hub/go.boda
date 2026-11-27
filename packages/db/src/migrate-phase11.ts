import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getSql } from "./index.js";

function loadLocalEnv() {
  const candidates = [resolve(process.cwd(), ".env.local"), resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env.local"), resolve(process.cwd(), "../../.env")];
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
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

const districts = [
  { name: "Mjini Magharibi", code: "MM", latMin: -6.22, latMax: -6.10, lngMin: 39.16, lngMax: 39.26 },
  { name: "Unguja Kaskazini", code: "UK", latMin: -5.95, latMax: -5.70, lngMin: 39.20, lngMax: 39.40 },
  { name: "Unguja Kusini", code: "US", latMin: -6.45, latMax: -6.22, lngMin: 39.30, lngMax: 39.55 },
  { name: "Unguja Kati", code: "UKT", latMin: -6.30, latMax: -6.18, lngMin: 39.25, lngMax: 39.45 },
];
const wards = ["Mwera", "Bububu", "Fuoni", "Mtoni", "Chuini", "Mbweni", "Kiembe Samaki", "Kilimani", "Mpendae", "Mwembe Ladu", "Amani", "Kikwajuni", "Mikunguni", "Kwahani", "Mpendae", "Shangani", "Forodhani", "Darajani", "Malindi", "Mwembe Makumbi"];
const streetTypes = ["Rd", "St", "Ave", "Lane", "Close", "Way"];

async function migratePhase11() {
  loadLocalEnv();
  const sql = getSql();
  console.log("[Phase 11 Migrate] Seeding 2500 Unguja landmarks...");

  const total = 2500;
  const batchSize = 250;
  for (let batch = 0; batch < total / batchSize; batch++) {
    const values: string[] = [];
    for (let i = 0; i < batchSize; i++) {
      const idx = batch * batchSize + i;
      const d = districts[idx % districts.length];
      const ward = wards[Math.floor(Math.random() * wards.length)];
      const stType = streetTypes[Math.floor(Math.random() * streetTypes.length)];
      const stNum = Math.floor(Math.random() * 200) + 1;
      const lat = d.latMin + Math.random() * (d.latMax - d.latMin);
      const lng = d.lngMin + Math.random() * (d.lngMax - d.lngMin);
      const nameSw = `Mtaa ${stNum} ${stType}, ${ward}, ${d.name}`;
      const nameEn = `Street ${stNum} ${stType}, ${ward}, ${d.name}`;
      const category = Math.random() < 0.15 ? "kituo" : "street";
      const isKituo = category === "kituo";
      const area = `${ward}, ${d.name}`;
      values.push(`(gen_random_uuid(), ${sqlLiteral(nameSw)}, ${sqlLiteral(nameEn)}, ${sqlLiteral(category)}, ${sqlLiteral(area)}, ${isKituo}, ${lat}, ${lng}, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))`);
    }
    const q = `INSERT INTO geo.landmarks (id, name_sw, name_en, category, area, is_kituo, lat, lng, geom) VALUES ${values.join(",")} ON CONFLICT DO NOTHING`;
    await sql.query(q);
    console.log(`[Phase 11] inserted batch ${batch + 1}/${Math.ceil(total / batchSize)}`);
  }
  console.log("[Phase 11 Migrate] Complete!");
}

function sqlLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

migratePhase11().catch((err) => {
  console.error("[Phase 11 Migrate] Failed:", err);
  process.exit(1);
});
