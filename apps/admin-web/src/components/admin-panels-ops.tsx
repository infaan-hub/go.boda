"use client";

import * as React from "react";
import {
  Bike,
  CarFront,
  CheckCircle2,
  MapPin,
  Plus,
  Save,
  ShieldCheck,
  Tag,
  XCircle,
} from "lucide-react";
import { Badge, Button, Card } from "@goboda/ui";
import type {
  AdminLandmarkRow,
  AdminOperatorRow,
  AdminPromoRow,
  AdminTariffRow,
  AdminTripRow,
} from "./admin-types";

function formatTzs(amount: number | null | undefined): string {
  return `TZS ${Number(amount ?? 0).toLocaleString("en-TZ")}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/* ============================================================================
 * TAB 3 — RIDERS & DRIVERS KYC VERIFICATION QUEUE
 * ========================================================================== */
export function OperatorsKycPanel({
  operators,
  onMutated,
  onNotify,
}: {
  operators: AdminOperatorRow[];
  onMutated: () => Promise<void>;
  onNotify: (tone: "emerald" | "rose", msg: string) => void;
}) {
  const [filter, setFilter] = React.useState<
    "ALL" | "PENDING_VERIFICATION" | "APPROVED" | "SUSPENDED"
  >("ALL");
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    if (filter === "ALL") return operators;
    return operators.filter((op) => op.kycStatus === filter);
  }, [operators, filter]);

  async function handleReview(
    op: AdminOperatorRow,
    decision: "APPROVED" | "REJECTED" | "SUSPENDED"
  ) {
    setBusyId(op.id);
    try {
      const reason = (reasons[op.id] ?? "").trim();
      const res = await fetch(`/api/ops/operators/${op.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          reason,
          helmetVerified:
            decision === "APPROVED" && op.transportType === "BODABODA"
              ? true
              : undefined,
        }),
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        onNotify("rose", json.message || json.error || "KYC review failed");
        return;
      }
      const roleLabel =
        op.transportType === "BODABODA" ? "Bodaboda Rider" : "Bajaji Driver";
      onNotify(
        "emerald",
        `${roleLabel} ${op.fullName} (${op.plateNumber}) marked ${decision}${
          decision === "APPROVED" ? " — wallets provisioned." : "."
        }`
      );
      await onMutated();
    } catch (err) {
      onNotify(
        "rose",
        err instanceof Error ? err.message : "Network error reviewing operator"
      );
    } finally {
      setBusyId(null);
    }
  }

  const counts = {
    ALL: operators.length,
    PENDING_VERIFICATION: operators.filter(
      (o) => o.kycStatus === "PENDING_VERIFICATION"
    ).length,
    APPROVED: operators.filter((o) => o.kycStatus === "APPROVED").length,
    SUSPENDED: operators.filter((o) => o.kycStatus === "SUSPENDED").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">
            Bodaboda Riders &amp; Bajaji Drivers KYC Queue
          </h2>
          <p className="text-xs text-slate-500">
            Approving an operator automatically provisions their TZS Earnings &amp;
            Commission Float wallets. Suspending takes them offline immediately.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href={`${
              process.env.NEXT_PUBLIC_PARTNER_APP_URL ?? "http://localhost:3001"
            }/partner/register`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Register Partner
          </a>
          {(
            [
              ["ALL", "All"],
              ["PENDING_VERIFICATION", "Pending KYC"],
              ["APPROVED", "Approved"],
              ["SUSPENDED", "Suspended"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                filter === key
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-teal-600" />
          <p className="mt-2 text-sm font-bold text-slate-800">
            No operators in this filter
          </p>
          <p className="mt-1 text-xs text-slate-500">
            New Bodaboda Riders and Bajaji Drivers onboarding from the Partner
            PWA appear here automatically.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((op) => {
            const isBoda = op.transportType === "BODABODA";
            const statusTone =
              op.kycStatus === "APPROVED"
                ? "emerald"
                : op.kycStatus === "PENDING_VERIFICATION"
                  ? "amber"
                  : "rose";

            return (
              <Card key={op.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        isBoda
                          ? "bg-teal-100 text-teal-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {isBoda ? (
                        <Bike className="h-5 w-5" />
                      ) : (
                        <CarFront className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {op.fullName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {isBoda ? "Bodaboda Rider" : "Bajaji Driver"} •{" "}
                        <span className="font-mono font-semibold text-slate-700">
                          {op.plateNumber}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={statusTone}>{op.kycStatus}</Badge>
                    {isBoda ? (
                      <Badge tone={op.helmetVerified ? "teal" : "slate"}>
                        {op.helmetVerified ? "2x Helmets OK" : "Helmets Pending"}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs">
                  <div>
                    <span className="text-slate-400">Phone:</span>{" "}
                    <span className="font-mono text-slate-800">{op.phone}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Home Kituo:</span>{" "}
                    <span className="font-medium text-slate-800">
                      {op.homeKituo || "Unguja"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">License:</span>{" "}
                    <span className="font-mono text-slate-800">
                      {op.licenseNo}
                    </span>
                    {op.licenseExpiry ? (
                      <span className="text-slate-500">
                        {" "}
                        (exp {op.licenseExpiry.slice(0, 10)})
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <span className="text-slate-400">Insurance Exp:</span>{" "}
                    <span className="font-medium text-slate-800">
                      {op.insuranceExpiry
                        ? op.insuranceExpiry.slice(0, 10)
                        : "On file"}
                    </span>
                  </div>
                </div>

                {op.rejectionReason ? (
                  <p className="mt-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
                    Note: {op.rejectionReason}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={reasons[op.id] ?? ""}
                    onChange={(e) =>
                      setReasons((prev) => ({
                        ...prev,
                        [op.id]: e.target.value,
                      }))
                    }
                    placeholder="Optional note / rejection reason..."
                    className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-xs text-slate-800 focus:border-teal-600 focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {op.kycStatus !== "APPROVED" ? (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={busyId === op.id}
                        onClick={() => handleReview(op, "APPROVED")}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {op.kycStatus === "SUSPENDED" ? "Reactivate" : "Approve"}
                      </Button>
                    ) : null}
                    {op.kycStatus === "PENDING_VERIFICATION" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === op.id}
                        onClick={() => handleReview(op, "REJECTED")}
                      >
                        <XCircle className="h-3.5 w-3.5 text-rose-600" />
                        Reject
                      </Button>
                    ) : null}
                    {op.kycStatus === "APPROVED" ? (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busyId === op.id}
                        onClick={() => handleReview(op, "SUSPENDED")}
                      >
                        Suspend
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================================
 * TAB 4 — LIVE & RECENT UNGUJA TRIPS MONITOR
 * ========================================================================== */
export function TripsMonitorPanel({ trips }: { trips: AdminTripRow[] }) {
  function statusTone(status: string) {
    if (status === "PAID_COMPLETED" || status === "COMPLETED_UNPAID")
      return "emerald" as const;
    if (status === "SOS_ACTIVE" || status === "PAYMENT_DISPUTED")
      return "rose" as const;
    if (
      status === "IN_PROGRESS" ||
      status === "ASSIGNED" ||
      status === "ARRIVED_AT_PICKUP"
    )
      return "teal" as const;
    if (status === "SEARCHING" || status === "OFFERED_TO_OPERATOR")
      return "amber" as const;
    return "slate" as const;
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">
            Unguja Trips Monitor
          </h2>
          <p className="text-xs text-slate-500">
            Real-time snapshot of Go.boda (Bodaboda Rider) &amp; Go.bajaji
            (Bajaji Driver) trips across Unguja Island.
          </p>
        </div>
        <Badge tone="teal">{trips.length} recent trips</Badge>
      </div>

      {trips.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          No recorded trips yet. Book a trip in the Customer Web PWA to inspect
          live dispatch and settlement states here.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Trip Code</th>
                <th className="px-4 py-3">Transport &amp; Plate</th>
                <th className="px-4 py-3">Route (Pickup → Dropoff)</th>
                <th className="px-4 py-3">Fare &amp; Payment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trips.map((tr) => {
                const isBoda = tr.transportType === "BODABODA";
                return (
                  <tr key={tr.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">
                      {tr.tripCode}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-semibold ${
                          isBoda ? "text-teal-800" : "text-amber-700"
                        }`}
                      >
                        {isBoda
                          ? "Go.boda (Rider)"
                          : "Go.bajaji (Driver)"}
                      </span>
                      <div className="font-mono text-[11px] text-slate-500">
                        {tr.operatorPlate || "Unassigned"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5 font-medium text-slate-800">
                        <span>{tr.pickupLabel}</span>
                        {tr.pickupSnapped ? (
                          <Badge tone="amber">Smart Snap</Badge>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        → {tr.dropoffLabel}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">
                        {formatTzs(tr.finalFareTzs ?? tr.estimatedFareTzs)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {tr.paymentMethod}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(tr.status)}>{tr.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(tr.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ============================================================================
 * TAB 5 — ZONES, LANDMARKS (VITUO) & LIVE TZS TARIFF / PROMO EDITOR
 * ========================================================================== */
function TariffEditorCard({
  tariff,
  onSaved,
  onNotify,
}: {
  tariff: AdminTariffRow;
  onSaved: () => Promise<void>;
  onNotify: (tone: "emerald" | "rose", msg: string) => void;
}) {
  const isBoda = tariff.transportType === "BODABODA";
  const [form, setForm] = React.useState({
    baseFareTzs: tariff.baseFareTzs,
    perKmTzs: tariff.perKmTzs,
    perMinTzs: tariff.perMinTzs,
    minFareTzs: tariff.minFareTzs,
    cancelFeeTzs: tariff.cancelFeeTzs,
    commissionPct: tariff.commissionPct,
    activeMultiplier: Number(tariff.activeMultiplier),
    multiplierReason: tariff.multiplierReason || "NORMAL",
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setForm({
      baseFareTzs: tariff.baseFareTzs,
      perKmTzs: tariff.perKmTzs,
      perMinTzs: tariff.perMinTzs,
      minFareTzs: tariff.minFareTzs,
      cancelFeeTzs: tariff.cancelFeeTzs,
      commissionPct: tariff.commissionPct,
      activeMultiplier: Number(tariff.activeMultiplier),
      multiplierReason: tariff.multiplierReason || "NORMAL",
    });
  }, [tariff]);

  async function saveTariff(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/ops/tariffs/${tariff.transportType}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseFareTzs: Number(form.baseFareTzs),
          perKmTzs: Number(form.perKmTzs),
          perMinTzs: Number(form.perMinTzs),
          minFareTzs: Number(form.minFareTzs),
          cancelFeeTzs: Number(form.cancelFeeTzs),
          commissionPct: Number(form.commissionPct),
          activeMultiplier: Math.min(1.25, Math.max(1, Number(form.activeMultiplier))),
          multiplierReason: form.multiplierReason.trim() || "NORMAL",
        }),
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        onNotify("rose", json.message || json.error || "Tariff update failed");
        return;
      }
      onNotify(
        "emerald",
        `${isBoda ? "Go.boda (Bodaboda Rider)" : "Go.bajaji (Bajaji Driver)"} live TZS tariff saved. Immediate quotes updated.`
      );
      await onSaved();
    } catch (err) {
      onNotify("rose", err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${
              isBoda
                ? "bg-teal-100 text-teal-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {isBoda ? <Bike className="h-5 w-5" /> : <CarFront className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              {isBoda ? "Go.boda — Bodaboda Rider" : "Go.bajaji — Bajaji Driver"}
            </h3>
            <p className="text-[11px] text-slate-500">
              Max {tariff.maxPassengers} passenger(s) • 500 TZS rounding • Cap
              1.25x
            </p>
          </div>
        </div>
        <Badge tone={isBoda ? "teal" : "amber"}>{tariff.transportType}</Badge>
      </div>

      <form onSubmit={saveTariff} className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(
            [
              ["baseFareTzs", "Base Fare (TZS)"],
              ["perKmTzs", "Per Km (TZS)"],
              ["perMinTzs", "Per Min (TZS)"],
              ["minFareTzs", "Min Fare (TZS)"],
              ["cancelFeeTzs", "Cancel Fee (TZS)"],
              ["commissionPct", "Commission (%)"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="block">
              <span className="text-[11px] font-semibold text-slate-600">
                {label}
              </span>
              <input
                type="number"
                value={form[field]}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    [field]: Number(e.target.value),
                  }))
                }
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-900 focus:border-teal-600 focus:outline-none"
              />
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600">
              Active Multiplier (1.00 – 1.25)
            </span>
            <input
              type="number"
              step="0.05"
              min="1"
              max="1.25"
              value={form.activeMultiplier}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  activeMultiplier: Number(e.target.value),
                }))
              }
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-900 focus:border-teal-600 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-600">
              Multiplier Reason
            </span>
            <input
              type="text"
              value={form.multiplierReason}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  multiplierReason: e.target.value,
                }))
              }
              placeholder="NORMAL / RAIN / NIGHT"
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-900 focus:border-teal-600 focus:outline-none"
            />
          </label>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-slate-400">
            Updated: {formatDate(tariff.updatedAt)}
          </span>
          <Button type="submit" size="sm" variant={isBoda ? "primary" : "amber"} disabled={saving}>
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save Live Tariff"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function ZonesTariffsPanel({
  tariffs,
  promos,
  landmarks,
  onMutated,
  onNotify,
}: {
  tariffs: AdminTariffRow[];
  promos: AdminPromoRow[];
  landmarks: AdminLandmarkRow[];
  onMutated: () => Promise<void>;
  onNotify: (tone: "emerald" | "rose", msg: string) => void;
}) {
  // Promo form state
  const [promoForm, setPromoForm] = React.useState({
    code: "",
    discountType: "PERCENT" as "PERCENT" | "FLAT_TZS",
    discountValue: 15,
    maxDiscountTzs: 2000,
    minFareTzs: 2000,
  });
  const [savingPromo, setSavingPromo] = React.useState(false);

  // Landmark / Kituo form state
  const [lmForm, setLmForm] = React.useState({
    nameSw: "",
    nameEn: "",
    area: "Mjini",
    category: "KITUO",
    isKituo: true,
    lat: -6.1659,
    lng: 39.2026,
  });
  const [savingLm, setSavingLm] = React.useState(false);

  async function handleSavePromo(e: React.FormEvent) {
    e.preventDefault();
    if (!promoForm.code.trim()) return;
    setSavingPromo(true);
    try {
      const res = await fetch("/api/ops/promos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...promoForm,
          code: promoForm.code.trim().toUpperCase(),
          active: true,
        }),
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        onNotify("rose", json.message || json.error || "Promo save failed");
        return;
      }
      onNotify(
        "emerald",
        `Promo code ${promoForm.code.trim().toUpperCase()} saved & active.`
      );
      setPromoForm((p) => ({ ...p, code: "" }));
      await onMutated();
    } finally {
      setSavingPromo(false);
    }
  }

  async function togglePromo(promo: AdminPromoRow) {
    const res = await fetch("/api/ops/promos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: promo.code,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        maxDiscountTzs: promo.maxDiscountTzs,
        minFareTzs: promo.minFareTzs,
        active: !promo.active,
      }),
    });
    if (res.ok) {
      onNotify(
        "emerald",
        `Promo ${promo.code} ${!promo.active ? "activated" : "paused"}.`
      );
      await onMutated();
    }
  }

  async function handleCreateLandmark(e: React.FormEvent) {
    e.preventDefault();
    if (!lmForm.nameEn.trim() || !lmForm.nameSw.trim()) return;
    setSavingLm(true);
    try {
      const res = await fetch("/api/ops/landmarks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...lmForm,
          lat: Number(lmForm.lat),
          lng: Number(lmForm.lng),
        }),
      });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        onNotify(
          "rose",
          json.message || json.error || "Landmark creation blocked"
        );
        return;
      }
      onNotify(
        "emerald",
        `Unguja ${lmForm.isKituo ? "Kituo" : "Landmark"} "${lmForm.nameEn}" added to PostGIS.`
      );
      setLmForm((prev) => ({ ...prev, nameSw: "", nameEn: "" }));
      await onMutated();
    } finally {
      setSavingLm(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Live TZS Tariffs */}
      <div>
        <h2 className="text-base font-extrabold text-slate-900">
          Live Unguja TZS Tariffs
        </h2>
        <p className="text-xs text-slate-500">
          Updates write directly to <code>pricing.tariffs</code> and apply
          immediately to Customer upfront fare quotes.
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {tariffs.map((tr) => (
            <TariffEditorCard
              key={tr.transportType}
              tariff={tr}
              onSaved={onMutated}
              onNotify={onNotify}
            />
          ))}
        </div>
      </div>

      {/* Promo Codes & Landmarks Grid */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Promo Codes */}
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-teal-700" />
            <h3 className="text-sm font-extrabold text-slate-900">
              Promo Codes (TZS Discounts)
            </h3>
          </div>
          <form
            onSubmit={handleSavePromo}
            className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3"
          >
            <input
              type="text"
              required
              placeholder="Code (e.g. ZNZ2026)"
              value={promoForm.code}
              onChange={(e) =>
                setPromoForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))
              }
              className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs font-mono font-bold uppercase focus:border-teal-600 focus:outline-none"
            />
            <select
              value={promoForm.discountType}
              onChange={(e) =>
                setPromoForm((p) => ({
                  ...p,
                  discountType: e.target.value as "PERCENT" | "FLAT_TZS",
                }))
              }
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium"
            >
              <option value="PERCENT">Percent (%)</option>
              <option value="FLAT_TZS">Flat TZS</option>
            </select>
            <input
              type="number"
              min={1}
              value={promoForm.discountValue}
              onChange={(e) =>
                setPromoForm((p) => ({
                  ...p,
                  discountValue: Number(e.target.value),
                }))
              }
              placeholder="Value"
              className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold"
            />
            <input
              type="number"
              min={100}
              value={promoForm.maxDiscountTzs}
              onChange={(e) =>
                setPromoForm((p) => ({
                  ...p,
                  maxDiscountTzs: Number(e.target.value),
                }))
              }
              placeholder="Max TZS"
              className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs"
            />
            <input
              type="number"
              min={500}
              value={promoForm.minFareTzs}
              onChange={(e) =>
                setPromoForm((p) => ({
                  ...p,
                  minFareTzs: Number(e.target.value),
                }))
              }
              placeholder="Min Fare TZS"
              className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs"
            />
            <Button type="submit" size="sm" disabled={savingPromo}>
              <Plus className="h-3.5 w-3.5" />
              Save Promo
            </Button>
          </form>

          <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100">
            {promos.map((p) => (
              <div
                key={p.code}
                className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs"
              >
                <div>
                  <span className="font-mono font-bold text-slate-900">
                    {p.code}
                  </span>
                  <span className="ml-2 text-slate-500">
                    {p.discountType === "PERCENT"
                      ? `${p.discountValue}% off (max ${formatTzs(p.maxDiscountTzs)})`
                      : `${formatTzs(p.discountValue)} flat`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => togglePromo(p)}
                  className="cursor-pointer"
                >
                  <Badge tone={p.active ? "emerald" : "slate"}>
                    {p.active ? "Active" : "Paused"}
                  </Badge>
                </button>
              </div>
            ))}
          </div>
        </Card>

        {/* Unguja Landmarks & Vituo */}
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-extrabold text-slate-900">
                Unguja Landmarks &amp; Vituo (PostGIS)
              </h3>
            </div>
            <button
              type="button"
              onClick={() =>
                setLmForm({
                  nameSw: "Chake Chake (Pemba Test)",
                  nameEn: "Chake Chake (Pemba Test)",
                  area: "Pemba",
                  category: "KITUO",
                  isKituo: true,
                  lat: -5.2458,
                  lng: 39.7666,
                })
              }
              className="text-[11px] font-semibold text-rose-700 underline hover:text-rose-900"
            >
              Test Pemba Coords (Should Block 422)
            </button>
          </div>

          <form
            onSubmit={handleCreateLandmark}
            className="mt-3 grid grid-cols-2 gap-2.5"
          >
            <input
              type="text"
              required
              placeholder="Kiswahili Name (e.g. Kituo cha Kijangwani)"
              value={lmForm.nameSw}
              onChange={(e) =>
                setLmForm((p) => ({ ...p, nameSw: e.target.value }))
              }
              className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs"
            />
            <input
              type="text"
              required
              placeholder="English Name (e.g. Kijangwani Stage)"
              value={lmForm.nameEn}
              onChange={(e) =>
                setLmForm((p) => ({ ...p, nameEn: e.target.value }))
              }
              className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs"
            />
            <input
              type="text"
              required
              placeholder="Unguja Area (e.g. Stone Town, Nungwi)"
              value={lmForm.area}
              onChange={(e) =>
                setLmForm((p) => ({ ...p, area: e.target.value }))
              }
              className="h-9 rounded-lg border border-slate-200 px-2.5 text-xs"
            />
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={lmForm.isKituo}
                onChange={(e) =>
                  setLmForm((p) => ({ ...p, isKituo: e.target.checked }))
                }
              />
              Official Bodaboda/Bajaji Kituo
            </label>
            <input
              type="number"
              step="0.0001"
              value={lmForm.lat}
              onChange={(e) =>
                setLmForm((p) => ({ ...p, lat: Number(e.target.value) }))
              }
              placeholder="Latitude"
              className="h-9 rounded-lg border border-slate-200 px-2.5 font-mono text-xs"
            />
            <input
              type="number"
              step="0.0001"
              value={lmForm.lng}
              onChange={(e) =>
                setLmForm((p) => ({ ...p, lng: Number(e.target.value) }))
              }
              placeholder="Longitude"
              className="h-9 rounded-lg border border-slate-200 px-2.5 font-mono text-xs"
            />
            <div className="col-span-2 flex justify-end">
              <Button type="submit" size="sm" variant="amber" disabled={savingLm}>
                <Plus className="h-3.5 w-3.5" />
                Add Unguja Landmark
              </Button>
            </div>
          </form>

          <div className="mt-4 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100">
            {landmarks.slice(0, 20).map((lm) => (
              <div
                key={lm.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-900">
                    {lm.nameEn}
                  </span>
                  <span className="ml-1.5 text-slate-400">({lm.area})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {lm.isKituo ? <Badge tone="teal">Kituo</Badge> : null}
                  <span className="font-mono text-[10px] text-slate-400">
                    {Number(lm.lat).toFixed(3)}, {Number(lm.lng).toFixed(3)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
