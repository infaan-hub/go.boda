import { PartnerHomeView } from "@/components/partner-home-view";
import { requirePartnerPageData } from "@/lib/partner-page-data";

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
