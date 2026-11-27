import { PartnerNotificationsView } from "@partner/components/partner-notifications-view";
import { requirePartnerPageData } from "@partner/lib/partner-page-data";

export default async function PartnerNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const data = await requirePartnerPageData(searchParams);

  return (
    <PartnerNotificationsView
      locale={data.locale}
      partnerTransportType={data.partnerTransportType}
    />
  );
}
