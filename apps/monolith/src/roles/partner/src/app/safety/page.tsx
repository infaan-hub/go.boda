import { cookies } from "next/headers";
import { getSql } from "@goboda/db";
import {
  PARTNER_COOKIE_NAME,
  readPartnerSessionToken,
} from "@partner/lib/partner-auth";
import { PartnerSafetyView } from "@partner/components/partner-safety-view";

export default async function PartnerSafetyPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(PARTNER_COOKIE_NAME)?.value;
  const partner = token ? await readPartnerSessionToken(token) : null;

  const { lang } = await searchParams;
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale: "sw" | "en" =
    lang === "sw" || lang === "en"
      ? lang
      : cookieLocale === "sw"
        ? "sw"
        : "en";

  let plateNumber: string | undefined;
  let assignedRole: "BODABODA_RIDER" | "BAJAJI_DRIVER" | undefined = partner?.role;
  if (partner) {
    try {
      const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
      const rows = (await sql`
        SELECT transport_type AS "transportType",
               plate_number AS "plateNumber"
        FROM operator.profiles
        WHERE user_id = ${partner.id}::uuid
        LIMIT 1
      `) as Array<{ transportType: string | null; plateNumber: string | null }>;
      plateNumber = rows[0]?.plateNumber ?? undefined;
      if (rows[0]?.transportType === "BAJAJI") {
        assignedRole = "BAJAJI_DRIVER";
      } else if (rows[0]?.transportType === "BODABODA") {
        assignedRole = "BODABODA_RIDER";
      }
    } catch {
      plateNumber = undefined;
    }
  }

  return (
    <PartnerSafetyView
      locale={locale}
      partnerId={partner?.id}
      partnerName={partner?.name}
      partnerRole={assignedRole}
      partnerPlateNumber={plateNumber}
    />
  );
}
