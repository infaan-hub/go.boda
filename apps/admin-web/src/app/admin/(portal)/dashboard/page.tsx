"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Bike,
  CarFront,
  Route,
  ShieldAlert,
} from "lucide-react";
import {
  Badge,
  Card,
  EditorialScrollHero,
  ScrollReveal,
} from "@goboda/ui";
import { useAdminPortal } from "@/components/admin-portal-shell";

function formatTzs(amount: number | null | undefined): string {
  return `TZS ${Number(amount ?? 0).toLocaleString("en-TZ")}`;
}

export default function AdminDashboardOverviewPage() {
  const t = useTranslations();
  const { data, locale } = useAdminPortal();
  if (!data) return null;

  const pendingOperators = data.operators
    .filter((o) => o.kycStatus === "PENDING_VERIFICATION")
    .slice(0, 6);
  const recentTrips = data.trips.slice(0, 8);
  const totalOnline = data.kpis.onlineRiders + data.kpis.onlineDrivers;

  return (
    <div className="space-y-7">
      {/* Editorial Bodaboda Scroll-Transition Hero for Admin Home */}
      <div className="overflow-hidden rounded-3xl border border-[#17645F]/15 shadow-sm">
        <EditorialScrollHero
          compact
          eyebrowItems={["FLEET CONTROL", "DISPATCH RADAR", "KYC & SAFETY", "UNGUJA"]}
          displayWordLeft={locale === "sw" ? "ONGOZA" : "RUN"}
          displayWordRight="UNGUJA"
          taglineLines={
            locale === "sw"
              ? ["USIMAMIZI WA BODABODA,", "BAJAJI, NAULI NA", "USALAMA UNGUJA."]
              : ["LIVE FLEET, KYC,", "TARIFFS & SAFETY", "ACROSS UNGUJA."]
          }
          ctaLabel={locale === "sw" ? "TAZAMA TAKWIMU" : "VIEW FLEET"}
          ctaHref="#workspace"
          imageSrc="/images/bodaboda-hero.webp"
          imageAlt="Go.boda Zanzibar Operations Bodaboda Fleet"
          scrollHint={
            locale === "sw" ? "Shuka chini kuona takwimu" : "Scroll to live operations"
          }
          features={[
            {
              icon: <Bike className="h-4 w-4" />,
              title: `${totalOnline} ONLINE`,
              subtitle: `${data.kpis.onlineRiders} BODA • ${data.kpis.onlineDrivers} BAJAJI`,
            },
            {
              icon: <Route className="h-4 w-4" />,
              title: `${data.kpis.activeTrips} ACTIVE TRIPS`,
              subtitle: `${data.kpis.completedTrips} COMPLETED`,
            },
            {
              icon: <ShieldAlert className="h-4 w-4" />,
              title: `${data.kpis.openSosCount} OPEN SOS`,
              subtitle: `${data.kpis.pendingKycCount} PENDING KYC`,
            },
          ]}
        />
      </div>

      {/* Operational KPIs */}
      <div id="workspace" className="scroll-mt-24 space-y-6">
        <ScrollReveal>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Link href="/admin/live-map" className="block">
              <Card className="p-4 transition hover:border-[#17645F]/40">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">
                    {t("admin.onlineRiders")}
                  </p>
                  <Bike className="h-4 w-4 text-[#17645F]" />
                </div>
                <p className="mt-2 font-display text-3xl leading-none text-[#17645F]">
                  {data.kpis.onlineRiders}
                </p>
              </Card>
            </Link>

            <Link href="/admin/live-map" className="block">
              <Card className="p-4 transition hover:border-[#17645F]/40">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">
                    {t("admin.onlineDrivers")}
                  </p>
                  <CarFront className="h-4 w-4 text-[#B86B2B]" />
                </div>
                <p className="mt-2 font-display text-3xl leading-none text-[#122927]">
                  {data.kpis.onlineDrivers}
                </p>
              </Card>
            </Link>

            <Link href="/admin/trips" className="block">
              <Card className="p-4 transition hover:border-[#17645F]/40">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">
                    {t("admin.activeTrips")}
                  </p>
                  <Route className="h-4 w-4 text-[#17645F]" />
                </div>
                <p className="mt-2 font-display text-3xl leading-none text-[#17645F]">
                  {data.kpis.activeTrips}
                </p>
                <p className="mt-1.5 text-xs text-[#17645F]/65">
                  {data.kpis.completedTrips} completed of {data.kpis.totalTrips}
                </p>
              </Card>
            </Link>

            <Link href="/admin/sos" className="block">
              <Card
                className={`p-4 transition hover:border-[#17645F]/40 ${
                  data.kpis.openSosCount > 0
                    ? "border-[#A93232]/40 bg-[#A93232]/10"
                    : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">
                    {t("admin.openSos")}
                  </p>
                  <ShieldAlert className="h-4 w-4 text-[#A93232]" />
                </div>
                <p
                  className={`mt-2 font-display text-3xl leading-none ${
                    data.kpis.openSosCount > 0
                      ? "text-[#A93232]"
                      : "text-[#17645F]"
                  }`}
                >
                  {data.kpis.openSosCount}
                </p>
              </Card>
            </Link>

            <Link href="/admin/finance" className="block">
              <Card className="p-4 transition hover:border-[#17645F]/40">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">
                  Total GMV
                </p>
                <p className="mt-2 font-display text-2xl leading-none text-[#17645F]">
                  {formatTzs(data.kpis.gmvTzs)}
                </p>
                <p className="mt-1.5 text-xs text-[#17645F]/65">
                  Commission: {formatTzs(data.kpis.platformCommissionTzs)}
                </p>
              </Card>
            </Link>

            <Link href="/admin/operators" className="block">
              <Card className="p-4 transition hover:border-[#17645F]/40">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">
                  Pending KYC
                </p>
                <p className="mt-2 font-display text-2xl leading-none text-[#B86B2B]">
                  {data.kpis.pendingKycCount}
                </p>
                <p className="mt-1.5 text-xs text-[#17645F]/65">
                  {data.kpis.approvedOperatorsCount} approved
                </p>
              </Card>
            </Link>

            <Link href="/admin/finance" className="block">
              <Card className="p-4 transition hover:border-[#17645F]/40">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">
                  Ledger
                </p>
                <p
                  className={`mt-2 font-display text-2xl leading-none ${
                    data.kpis.ledgerBalanced ? "text-[#17645F]" : "text-[#A93232]"
                  }`}
                >
                  {data.kpis.ledgerBalanced ? "Balanced" : "Mismatch"}
                </p>
              </Card>
            </Link>

            <Link href="/admin/vituo" className="block">
              <Card className="p-4 transition hover:border-[#17645F]/40">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">
                  Unguja Locations
                </p>
                <p className="mt-2 font-display text-2xl leading-none text-[#17645F]">
                  {data.ungujaBootstrap?.landmarksCount ?? 64}
                </p>
                <p className="mt-1.5 text-xs text-[#17645F]/65">
                  {data.ungujaBootstrap?.snapPointsCount ?? 10} Stone Town pickup gates
                </p>
              </Card>
            </Link>
          </div>
        </ScrollReveal>

        {/* Recent Trips & Pending KYC */}
        <ScrollReveal delayMs={80}>
          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="overflow-hidden xl:col-span-2">
              <div className="flex items-center justify-between border-b border-[#17645F]/15 px-5 py-3.5">
                <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#17645F]">
                  Recent Trips
                </h2>
                <Link
                  href="/admin/trips"
                  className="text-xs font-bold text-[#17645F] underline underline-offset-4 hover:text-[#114E4A]"
                >
                  View all
                </Link>
              </div>
              {recentTrips.length === 0 ? (
                <p className="p-6 text-center text-xs text-[#17645F]/70">
                  No trips yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#EDE7DF] text-[10px] font-bold uppercase tracking-[0.14em] text-[#17645F]/80">
                      <tr>
                        <th className="px-4 py-2.5">Trip</th>
                        <th className="px-4 py-2.5">Route</th>
                        <th className="px-4 py-2.5">Fare</th>
                        <th className="px-4 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#17645F]/10">
                      {recentTrips.map((tr) => (
                        <tr key={tr.id} className="hover:bg-[#F3EEE8]/70">
                          <td className="px-4 py-2.5">
                            <Link
                              href={`/admin/trips/${tr.id}`}
                              className="font-mono font-bold text-[#17645F] hover:underline"
                            >
                              {tr.tripCode}
                            </Link>
                            <div className="text-[11px] text-[#17645F]/65">
                              {tr.transportType === "BODABODA" ? "Bodaboda" : "Bajaji"}
                              {tr.operatorPlate ? ` • ${tr.operatorPlate}` : ""}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-[#122927]">
                            {tr.pickupLabel} → {tr.dropoffLabel}
                          </td>
                          <td className="px-4 py-2.5 font-bold text-[#17645F]">
                            {formatTzs(tr.finalFareTzs ?? tr.estimatedFareTzs)}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge
                              tone={
                                tr.status === "PAID_COMPLETED" ||
                                tr.status === "COMPLETED_UNPAID"
                                  ? "emerald"
                                  : tr.status === "SOS_ACTIVE"
                                    ? "rose"
                                    : "slate"
                              }
                            >
                              {tr.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#17645F]/15 px-5 py-3.5">
                <h2 className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#17645F]">
                  Pending Verification
                </h2>
                <Link
                  href="/admin/operators"
                  className="text-xs font-bold text-[#17645F] underline underline-offset-4 hover:text-[#114E4A]"
                >
                  Manage
                </Link>
              </div>
              {pendingOperators.length === 0 ? (
                <p className="p-6 text-center text-xs text-[#17645F]/70">
                  No pending applications.
                </p>
              ) : (
                <div className="divide-y divide-[#17645F]/10">
                  {pendingOperators.map((op) => (
                    <Link
                      key={op.id}
                      href={`/admin/operators/${op.id}`}
                      className="flex items-center justify-between px-5 py-3 text-xs hover:bg-[#F3EEE8]/70"
                    >
                      <div>
                        <p className="font-bold text-[#122927]">{op.fullName}</p>
                        <p className="text-[11px] text-[#17645F]/65">
                          {op.transportType === "BODABODA" ? "Rider" : "Driver"} •{" "}
                          {op.plateNumber}
                        </p>
                      </div>
                      <Badge tone="amber">Pending</Badge>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </ScrollReveal>
      </div>
    </div>
  );
}
