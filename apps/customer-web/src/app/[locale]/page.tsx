import type { SupportedLocale } from "@goboda/i18n";
import { CustomerHomeView } from "@/components/customer-home-view";

export default async function CustomerHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <CustomerHomeView locale={locale as SupportedLocale} />;
}
