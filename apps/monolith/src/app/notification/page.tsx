import { Bell, Inbox } from "lucide-react";
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

interface NotificationRow {
  id: string;
  channel: string;
  title: string;
  body: string;
  status: string;
  createdAt: string | Date;
}

export default async function CustomerNotificationsPage({
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

  let notifications: NotificationRow[] = [];
  let loadFailed = false;
  try {
    const sql = getSql(process.env.NOTIF_DATABASE_URL ?? process.env.DATABASE_URL);
    notifications = (await sql`
      SELECT id, channel, title, body, status, created_at AS "createdAt"
      FROM notif.messages
      WHERE user_id = ${customer.id}::uuid
      ORDER BY created_at DESC
      LIMIT 30
    `) as NotificationRow[];
  } catch {
    loadFailed = true;
  }

  return (
    <CustomerPortalShell locale={locale} customerName={customer.name} showSignOut>
      <main className="mx-auto max-w-3xl space-y-5 px-4 pt-6 sm:px-6">
        <header className="border-b border-[#17645F]/15 pb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#17645F]/75">
            {sw ? "AKAUNTI YAKO" : "YOUR ACCOUNT"}
          </p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-4xl uppercase leading-none text-[#17645F]">
            <Bell className="h-7 w-7" />
            {sw ? "TAARIFA" : "NOTIFICATIONS"}
          </h1>
          <p className="mt-2 text-sm text-[#122927]/65">
            {sw
              ? "Taarifa muhimu kuhusu safari na akaunti yako."
              : "Updates about your rides and Go.boda account."}
          </p>
        </header>

        {loadFailed ? (
          <div className="rounded-2xl border border-[#17645F]/15 bg-white/80 p-6 text-sm text-[#122927]/70">
            {sw
              ? "Taarifa haziwezi kupakiwa sasa hivi. Tafadhali jaribu tena baadaye."
              : "Notifications could not be loaded right now. Please try again later."}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#17645F]/25 bg-white/70 px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#17645F]/10 text-[#17645F]">
              <Inbox className="h-5 w-5" />
            </span>
            <h2 className="mt-4 font-display text-xl uppercase text-[#17645F]">
              {sw ? "HAKUNA TAARIFA MPYA" : "YOU’RE ALL CAUGHT UP"}
            </h2>
            <p className="mt-1 max-w-sm text-sm text-[#122927]/60">
              {sw
                ? "Taarifa mpya zitaonekana hapa."
                : "New ride and account updates will appear here."}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className="rounded-2xl border border-[#17645F]/12 bg-white/85 p-4 shadow-sm sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-[#17645F]">{notification.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#122927]/75">
                      {notification.body}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#17645F]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#17645F]">
                    {notification.channel}
                  </span>
                </div>
                <time
                  className="mt-3 block text-[11px] text-[#122927]/50"
                  dateTime={new Date(notification.createdAt).toISOString()}
                >
                  {new Date(notification.createdAt).toLocaleString(
                    sw ? "sw-TZ" : "en-TZ",
                    { dateStyle: "medium", timeStyle: "short" }
                  )}
                </time>
              </li>
            ))}
          </ul>
        )}
      </main>
    </CustomerPortalShell>
  );
}
