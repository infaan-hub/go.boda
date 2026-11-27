import { notFound } from "next/navigation";
import { PartnerTripWorkflowView } from "@partner/components/partner-trip-workflow-view";
import { requirePartnerPageData } from "@partner/lib/partner-page-data";

export default async function PartnerTripStepPage({ params, searchParams }: { params: Promise<{ step: string }>; searchParams: Promise<{ lang?: string }> }) {
  const [{ step }, data] = await Promise.all([params, requirePartnerPageData(searchParams)]);
  if (!["confirm", "pickup", "destination", "finalize"].includes(step)) notFound();
  return <PartnerTripWorkflowView locale={data.locale} stage={step as "confirm" | "pickup" | "destination" | "finalize"} />;
}
