import { PartnerTripsView } from "@partner/components/partner-trips-view";
import { requirePartnerPageData } from "@partner/lib/partner-page-data";

export default async function PartnerTripsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const data = await requirePartnerPageData(searchParams);

  return (
    <PartnerTripsView
      locale={data.locale}
      partnerName={data.partnerName}
      partnerTransportType={data.partnerTransportType}
      partnerPlateNumber={data.partnerPlateNumber}
    />
  );
}
