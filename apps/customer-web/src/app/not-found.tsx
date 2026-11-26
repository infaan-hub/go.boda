import Link from "next/link";
import { BrandLogo, Card } from "@goboda/ui";

export default function CustomerNotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F3EEE8] px-4 py-10 text-[#122927]">
      <div className="mb-6">
        <BrandLogo subtitle="Unguja, Zanzibar" />
      </div>
      <Card className="w-full max-w-md space-y-4 border-[#17645F]/15 bg-[#FAF7F2] p-7 text-center">
        <p className="font-display text-6xl leading-none text-[#17645F]">404</p>
        <h1 className="text-base font-extrabold uppercase tracking-[0.14em] text-[#17645F]">
          Page not found
        </h1>
        <p className="text-xs text-[#17645F]/75">
          The page you are looking for could not be found.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Link
            href="/dashboard"
            className="rounded-full bg-[#17645F] px-5 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#F3EEE8] hover:bg-[#114E4A]"
          >
            Book a Ride
          </Link>
          <Link
            href="/trips"
            className="rounded-full border border-[#17645F] px-5 py-2 text-xs font-bold uppercase tracking-[0.14em] text-[#17645F] hover:bg-[#17645F] hover:text-[#F3EEE8]"
          >
            My Trips
          </Link>
        </div>
      </Card>
    </div>
  );
}
