import { ArrowRight, CircleUserRound, History, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSql } from "@goboda/db";
import type { SupportedLocale } from "@goboda/i18n";
import { CustomerPortalShell } from "@/components/customer-portal-shell";
import {
  CUSTOMER_COOKIE_NAME,
  readCustomerSessionToken,
} from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

interface CustomerProfile {
  username: string | null;
  email: string | null;
  language: string | null;
  createdAt: string | Date | null;
}

export default async function CustomerProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_COOKIE_NAME)?.value;
  const customer = token ? await readCustomerSessionToken(token) : null;
  if (!customer) redirect("/login");

  const { lang } = await searchParams;
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale: SupportedLocale =
    lang === "sw" || lang === "en"
      ? lang
      : cookieLocale === "sw"
        ? "sw"
        : "en";
  const sw = locale === "sw";

  let profile: CustomerProfile | null = null;
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = (await sql`
      SELECT username, email, language, created_at AS "createdAt"
      FROM auth.users
      WHERE id = ${customer.id}::uuid AND role = 'CUSTOMER'
      LIMIT 1
    `) as CustomerProfile[];
    profile = rows[0] ?? null;
  } catch {
    // Keep core account details available from the signed session if the DB is temporarily unavailable.
  }

  return (
    <CustomerPortalShell locale={locale} customerName={customer.name} showSignOut>
      <main className="mx-auto max-w-3xl space-y-5 px-4 pt-6 sm:px-6">
        <header className="border-b border-[#17645F]/15 pb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#17645F]/75">
            {sw ? "AKAUNTI YAKO" : "YOUR ACCOUNT"}
          </p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-4xl uppercase leading-none text-[#17645F]">
            <CircleUserRound className="h-7 w-7" />
            {sw ? "WASIFU" : "PROFILE"}
          </h1>
        </header>

        <section className="rounded-2xl border border-[#17645F]/15 bg-white/85 p-5 shadow-sm sm:p-7">
          <div className="flex items-center gap-4 border-b border-[#17645F]/10 pb-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#17645F] font-display text-xl uppercase text-[#F3EEE8]">
              {customer.name.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-display text-2xl uppercase text-[#17645F]">
                {customer.name}
              </h2>
              <p className="text-sm text-[#122927]/60">
                {sw ? "Mteja wa Go.boda" : "Go.boda Customer"}
              </p>
            </div>
          </div>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#122927]/50">
                {sw ? "JINA" : "NAME"}
              </dt>
              <dd className="mt-1 font-semibold">{customer.name}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#122927]/50">
                {sw ? "SIMU" : "PHONE"}
              </dt>
              <dd className="mt-1 font-semibold">{customer.phone || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#122927]/50">
                {sw ? "BARUA PEPE" : "EMAIL"}
              </dt>
              <dd className="mt-1 break-all font-semibold">{profile?.email || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#122927]/50">
                {sw ? "JINA LA MTUMIAJI" : "USERNAME"}
              </dt>
              <dd className="mt-1 font-semibold">{profile?.username || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#122927]/50">
                {sw ? "LUGHA UNAYOPENDA" : "PREFERRED LANGUAGE"}
              </dt>
              <dd className="mt-1 font-semibold">
                {profile?.language === "sw" ? "Kiswahili" : profile?.language === "en" ? "English" : locale === "sw" ? "Kiswahili" : "English"}
              </dd>
            </div>
          </dl>
        </section>

        <nav className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/trips"
            className="flex items-center justify-between rounded-2xl border border-[#17645F]/15 bg-white/80 p-4 font-semibold text-[#17645F] transition hover:bg-white"
          >
            <span className="flex items-center gap-2"><History className="h-4 w-4" />{sw ? "Safari zangu" : "My trips"}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/safety"
            className="flex items-center justify-between rounded-2xl border border-[#17645F]/15 bg-white/80 p-4 font-semibold text-[#17645F] transition hover:bg-white"
          >
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />{sw ? "Mipangilio ya usalama" : "Safety contacts"}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>
      </main>
    </CustomerPortalShell>
  );
}
