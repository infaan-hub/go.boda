import { PartnerHomeView } from "@partner/components/partner-home-view";
import { requirePartnerPageData } from "@partner/lib/partner-page-data";

export default async function PartnerKycPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const data = await requirePartnerPageData(searchParams);

  return (
    <PartnerHomeView
      page="kyc"
      locale={data.locale}
      partnerName={data.partnerName}
      partnerTransportType={data.partnerTransportType}
      partnerPlateNumber={data.partnerPlateNumber}
      partnerKituo={data.partnerKituo}
    />
  );
}
