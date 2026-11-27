import { PartnerProfileView } from "@partner/components/partner-profile-view";
import { requirePartnerPageData } from "@partner/lib/partner-page-data";

export default async function PartnerProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const data = await requirePartnerPageData(searchParams);

  return (
    <PartnerProfileView
      locale={data.locale}
      partnerId={data.partnerId}
      partnerName={data.partnerName}
      partnerPhone={data.partnerPhone}
      partnerTransportType={data.partnerTransportType}
      partnerPlateNumber={data.partnerPlateNumber}
      partnerKituo={data.partnerKituo}
    />
  );
}
