import { PartnerHotspotsView } from "@partner/components/partner-hotspots-view";
import { requirePartnerPageData } from "@partner/lib/partner-page-data";

export default async function PartnerHotspotsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const data = await requirePartnerPageData(searchParams);

  return (
    <PartnerHotspotsView
      locale={data.locale}
      partnerName={data.partnerName}
      partnerTransportType={data.partnerTransportType}
      partnerPlateNumber={data.partnerPlateNumber}
    />
  );
}
