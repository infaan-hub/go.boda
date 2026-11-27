import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";

export const dynamic = "force-dynamic";

const rateSchema = z.object({
  stars: z.number().int().min(1).max(5),
  helmetProvided: z.boolean().optional(),
  comment: z.string().trim().max(300).default(""),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = rateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = (await sql`
      SELECT id, customer_id, operator_id, transport_type
      FROM trip.trips
      WHERE id = ${id}::uuid
      LIMIT 1
    `) as Array<{
      id: string;
      customer_id: string;
      operator_id: string | null;
      transport_type: "BODABODA" | "BAJAJI";
    }>;

    const trip = rows[0];
    if (!trip) {
      return NextResponse.json({ error: "TRIP_NOT_FOUND" }, { status: 404 });
    }

    const rateeId = trip.operator_id ?? trip.customer_id;
    const helmetProvided =
      trip.transport_type === "BODABODA" ? (d.helmetProvided ?? true) : null;

    await sql`
      INSERT INTO trip.ratings (
        trip_id, rater_id, rater_role, ratee_id, stars, helmet_provided, comment
      )
      VALUES (
        ${trip.id}::uuid, ${trip.customer_id}::uuid, 'CUSTOMER', ${rateeId}::uuid,
        ${d.stars}, ${helmetProvided}, ${d.comment}
      )
      ON CONFLICT (trip_id, rater_id) DO UPDATE SET
        stars = EXCLUDED.stars,
        helmet_provided = EXCLUDED.helmet_provided,
        comment = EXCLUDED.comment
    `;

    if (helmetProvided !== null) {
      await sql`
        UPDATE trip.trips SET helmet_provided = ${helmetProvided}, updated_at = NOW()
        WHERE id = ${trip.id}::uuid
      `;
      if (trip.operator_id) {
        await sql`
          INSERT INTO safety.helmet_compliance_logs (
            trip_id, operator_id, customer_id, helmet_provided, note
          )
          VALUES (
            ${trip.id}::uuid, ${trip.operator_id}::uuid, ${trip.customer_id}::uuid,
            ${helmetProvided}, ${d.comment}
          )
          ON CONFLICT (trip_id) DO UPDATE SET
            helmet_provided = EXCLUDED.helmet_provided,
            note = EXCLUDED.note
        `;
      }
    }

    return NextResponse.json({
      rated: true,
      stars: d.stars,
      helmetProvided,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "RATING_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
