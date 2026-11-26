export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-teal-700 text-lg font-black text-white">
          G.
        </div>
        <h1 className="mt-4 text-lg font-bold text-slate-900">
          Go.boda — Offline / Huna Mtandao
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Check your Unguja mobile data connection. Active trip details stay
          cached on your device.
        </p>
      </div>
    </main>
  );
}
