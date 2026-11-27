import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSql } from "@goboda/db";
import {
  PARTNER_COOKIE_NAME,
  readPartnerSessionToken,
} from "@partner/lib/partner-auth";
import { PartnerHomeView } from "@partner/components/partner-home-view";

interface PartnerProfileRow {
  plateNumber: string | null;
  homeKituo: string | null;
  kycStatus: string | null;
}

export default async function PartnerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(PARTNER_COOKIE_NAME)?.value;
  const partner = token ? await readPartnerSessionToken(token) : null;
  if (!partner) {
    redirect("/partner/login");
  }

  const { lang } = await searchParams;
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale =
    lang === "sw" || lang === "en"
      ? lang
      : cookieLocale === "sw"
        ? "sw"
        : "en";

  let profile: PartnerProfileRow | null = null;
  try {
    const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = (await sql`
      SELECT plate_number AS "plateNumber",
             home_kituo AS "homeKituo",
             kyc_status AS "kycStatus"
      FROM operator.profiles
      WHERE user_id = ${partner.id}::uuid
      LIMIT 1
    `) as PartnerProfileRow[];
    profile = rows[0] ?? null;
  } catch {
    profile = null;
  }

  return (
    <PartnerHomeView
      locale={locale}
      partnerName={partner.name}
      partnerTransportType={partner.transportType}
      partnerPlateNumber={profile?.plateNumber ?? undefined}
      partnerKituo={profile?.homeKituo ?? undefined}
    />
  );
}
