export default function PartnerOfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F3EEE8] p-6 text-[#122927]">
      <div className="max-w-sm rounded-3xl border border-[#17645F]/15 bg-[#FAF7F2] p-7 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#17645F] font-display text-lg text-[#F3EEE8]">
          GB
        </div>
        <h1 className="mt-4 font-display text-3xl uppercase text-[#17645F]">
          RIDER-DRIVER OFFLINE
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-[#17645F]/80">
          Reconnect to Unguja mobile data to resume GPS streaming and receive
          nearby Bodaboda or Bajaji requests.
        </p>
      </div>
    </main>
  );
}
