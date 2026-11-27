import { PartnerTripWorkflowView } from "@partner/components/partner-trip-workflow-view";
import { requirePartnerPageData } from "@partner/lib/partner-page-data";

export default async function PartnerTripsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const data = await requirePartnerPageData(searchParams);

  return <PartnerTripWorkflowView locale={data.locale} stage="queue" />;
}
