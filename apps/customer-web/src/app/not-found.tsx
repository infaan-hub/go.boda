import Link from "next/link";
import { BrandLogo, Card } from "@goboda/ui";

export default function CustomerNotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="mb-6">
        <BrandLogo subtitle="Unguja, Zanzibar" />
      </div>
      <Card className="w-full max-w-md space-y-4 p-6 text-center">
        <p className="font-mono text-sm font-bold text-slate-400">404</p>
        <h1 className="text-lg font-bold text-slate-900">Page not found</h1>
        <p className="text-xs text-slate-500">
          The page you are looking for could not be found.
        </p>
        <div className="flex justify-center gap-3 pt-1">
          <Link
            href="/dashboard"
            className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
          >
            Book a Ride
          </Link>
          <Link
            href="/trips"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            My Trips
          </Link>
        </div>
      </Card>
    </div>
  );
}
