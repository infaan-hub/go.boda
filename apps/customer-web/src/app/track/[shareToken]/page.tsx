import { PublicTrackView } from "@/components/public-track-view";

export default async function ShareTrackPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;
  return <PublicTrackView shareToken={shareToken} />;
}
