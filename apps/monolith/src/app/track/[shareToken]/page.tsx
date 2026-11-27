import { cookies } from "next/headers";
import type { SupportedLocale } from "@goboda/i18n";
import {
  CUSTOMER_COOKIE_NAME,
  readCustomerSessionToken,
} from "@/lib/customer-auth";
import { PublicTrackView } from "@/components/public-track-view";

export default async function ShareTrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ shareToken: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ shareToken }, { lang }, cookieStore] = await Promise.all([
    params,
    searchParams,
    cookies(),
  ]);
  const token = cookieStore.get(CUSTOMER_COOKIE_NAME)?.value;
  const customer = token ? await readCustomerSessionToken(token) : null;
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale: SupportedLocale =
    lang === "sw" || lang === "en"
      ? lang
      : cookieLocale === "sw"
        ? "sw"
        : "en";

  return (
    <PublicTrackView
      shareToken={shareToken}
      locale={locale}
      customerName={customer?.name}
      isAuthenticated={Boolean(customer)}
    />
  );
}
