import { cookies } from "next/headers";
import type { SupportedLocale } from "@goboda/i18n";
import {
  CUSTOMER_COOKIE_NAME,
  readCustomerSessionToken,
} from "@/lib/customer-auth";
import { CustomerSafetyView } from "@/components/customer-safety-view";

export default async function CustomerSafetyPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_COOKIE_NAME)?.value;
  const customer = token ? await readCustomerSessionToken(token) : null;

  const { lang } = await searchParams;
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale: SupportedLocale =
    lang === "sw" || lang === "en"
      ? lang
      : cookieLocale === "sw"
        ? "sw"
        : "en";

  return (
    <CustomerSafetyView
      locale={locale}
      customerId={customer?.id}
      customerName={customer?.name}
    />
  );
}
