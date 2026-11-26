"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Bike,
  CarFront,
  Route,
  ShieldAlert,
} from "lucide-react";
import { Badge, Card } from "@goboda/ui";
import { useAdminPortal } from "@/components/admin-portal-shell";

function formatTzs(amount: number | null | undefined): string {
  return `TZS ${Number(amount ?? 0).toLocaleString("en-TZ")}`;
}

export default function AdminDashboardOverviewPage() {
  const t = useTranslations();
  const { data } = useAdminPortal();
  if (!data) return null;

  const pendingOperators = data.operators
    .filter((o) => o.kycStatus === "PENDING_VERIFICATION")
    .slice(0, 6);
  const recentTrips = data.trips.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Operational KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/admin/live-map" className="block">
          <Card className="p-4 transition hover:border-slate-300">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                {t("admin.onlineRiders")}
              </p>
              <Bike className="h-4 w-4 text-teal-700" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {data.kpis.onlineRiders}
            </p>
          </Card>
        </Link>

        <Link href="/admin/live-map" className="block">
          <Card className="p-4 transition hover:border-slate-300">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                {t("admin.onlineDrivers")}
              </p>
              <CarFront className="h-4 w-4 text-amber-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {data.kpis.onlineDrivers}
            </p>
          </Card>
        </Link>

        <Link href="/admin/trips" className="block">
          <Card className="p-4 transition hover:border-slate-300">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                {t("admin.activeTrips")}
              </p>
              <Route className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              {data.kpis.activeTrips}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {data.kpis.completedTrips} completed of {data.kpis.totalTrips}
            </p>
          </Card>
        </Link>

        <Link href="/admin/sos" className="block">
          <Card
            className={`p-4 transition hover:border-slate-300 ${
              data.kpis.openSosCount > 0 ? "border-rose-300 bg-rose-50/50" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">
                {t("admin.openSos")}
              </p>
              <ShieldAlert className="h-4 w-4 text-rose-600" />
            </div>
            <p
              className={`mt-2 text-2xl font-bold ${
                data.kpis.openSosCount > 0
                  ? "text-rose-700"
                  : "text-slate-900"
              }`}
            >
              {data.kpis.openSosCount}
            </p>
          </Card>
        </Link>

        <Link href="/admin/finance" className="block">
          <Card className="p-4 transition hover:border-slate-300">
            <p className="text-xs font-medium text-slate-500">Total GMV</p>
            <p className="mt-2 text-xl font-bold text-slate-900">
              {formatTzs(data.kpis.gmvTzs)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Commission: {formatTzs(data.kpis.platformCommissionTzs)}
            </p>
          </Card>
        </Link>

        <Link href="/admin/operators" className="block">
          <Card className="p-4 transition hover:border-slate-300">
            <p className="text-xs font-medium text-slate-500">Pending KYC</p>
            <p className="mt-2 text-xl font-bold text-amber-700">
              {data.kpis.pendingKycCount}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {data.kpis.approvedOperatorsCount} approved
            </p>
          </Card>
        </Link>

        <Link href="/admin/finance" className="block">
          <Card className="p-4 transition hover:border-slate-300">
            <p className="text-xs font-medium text-slate-500">Ledger</p>
            <p
              className={`mt-2 text-xl font-bold ${
                data.kpis.ledgerBalanced ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {data.kpis.ledgerBalanced ? "Balanced" : "Mismatch"}
            </p>
          </Card>
        </Link>

        <Link href="/admin/vituo" className="block">
          <Card className="p-4 transition hover:border-slate-300">
            <p className="text-xs font-medium text-slate-500">
              Unguja Locations
            </p>
            <p className="mt-2 text-xl font-bold text-slate-900">
              {data.ungujaBootstrap?.landmarksCount ?? 64}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {data.ungujaBootstrap?.snapPointsCount ?? 10} Stone Town pickup gates
            </p>
          </Card>
        </Link>
      </div>

      {/* Recent Trips & Pending KYC */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-bold text-slate-900">Recent Trips</h2>
            <Link
              href="/admin/trips"
              className="text-xs font-semibold text-teal-700 hover:underline"
            >
              View all
            </Link>
          </div>
          {recentTrips.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-500">
              No trips yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Trip</th>
                    <th className="px-4 py-2.5">Route</th>
                    <th className="px-4 py-2.5">Fare</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentTrips.map((tr) => (
                    <tr key={tr.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/admin/trips/${tr.id}`}
                          className="font-mono font-bold text-teal-800 hover:underline"
                        >
                          {tr.tripCode}
                        </Link>
                        <div className="text-[11px] text-slate-500">
                          {tr.transportType === "BODABODA" ? "Bodaboda" : "Bajaji"}
                          {tr.operatorPlate ? ` • ${tr.operatorPlate}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">
                        {tr.pickupLabel} → {tr.dropoffLabel}
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-900">
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
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-bold text-slate-900">
              Pending Verification
            </h2>
            <Link
              href="/admin/operators"
              className="text-xs font-semibold text-teal-700 hover:underline"
            >
              Manage
            </Link>
          </div>
          {pendingOperators.length === 0 ? (
            <p className="p-6 text-center text-xs text-slate-500">
              No pending applications.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingOperators.map((op) => (
                <Link
                  key={op.id}
                  href={`/admin/operators/${op.id}`}
                  className="flex items-center justify-between px-5 py-3 text-xs hover:bg-slate-50"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{op.fullName}</p>
                    <p className="text-[11px] text-slate-500">
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
    </div>
  );
}
