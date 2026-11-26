import type { SupportedLocale } from "@goboda/i18n";
import { AdminDashboardView } from "@/components/admin-dashboard-view";

export default async function AdminHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <AdminDashboardView locale={locale as SupportedLocale} />;
}
