import Link from "next/link";
import { BrandLogo, Card } from "@goboda/ui";

export default function PartnerNotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <div className="mb-6">
        <BrandLogo dark subtitle="Rider-Driver" />
      </div>
      <Card className="w-full max-w-md space-y-4 border-slate-800 bg-slate-900 p-6 text-center text-white">
        <p className="font-mono text-sm font-bold text-slate-400">404</p>
        <h1 className="text-lg font-bold">Page not found</h1>
        <p className="text-xs text-slate-400">
          The page you are looking for could not be found.
        </p>
        <div className="flex justify-center gap-3 pt-1">
          <Link
            href="/partner/dashboard"
            className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
          >
            Shift Dashboard
          </Link>
          <Link
            href="/partner/login"
            className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
          >
            Sign In
          </Link>
        </div>
      </Card>
    </div>
  );
}
