import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupportedLocale } from "@goboda/i18n";
import {
  CUSTOMER_COOKIE_NAME,
  readCustomerSessionToken,
} from "@/lib/customer-auth";
import { CustomerNotificationsView } from "@/components/customer-notifications-view";

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

  return (
    <CustomerNotificationsView locale={locale} customerId={customer.id} customerName={customer.name} />
  );
}
