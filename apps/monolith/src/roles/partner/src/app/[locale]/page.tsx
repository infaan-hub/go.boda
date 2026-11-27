import type { SupportedLocale } from "@goboda/i18n";
import { PartnerHomeView } from "@partner/components/partner-home-view";

export default async function PartnerHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <PartnerHomeView locale={locale as SupportedLocale} />;
}
