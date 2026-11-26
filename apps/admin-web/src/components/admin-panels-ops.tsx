"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bike,
  CarFront,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Plus,
  Save,
  ShieldCheck,
  Tag,
  XCircle,
} from "lucide-react";
import { Badge, Button, Card } from "@goboda/ui";
import { AdminRegisterRiderForm } from "./admin-register-rider-form";
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
  const [showRegister, setShowRegister] = React.useState(false);

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
          <h2 className="font-display text-2xl uppercase tracking-wide text-[#17645F]">
            Riders &amp; Drivers KYC
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">

          <button
            type="button"
            onClick={() => setShowRegister(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#B86B2B]/35 bg-[#B86B2B]/10 px-3 py-1.5 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Register Rider-Driver
          </button>

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
                  ? "border-[#17645F] bg-[#17645F] text-white"
                  : "border-[#17645F]/15 bg-[#FAF7F2] text-[#122927]/85 hover:bg-[#F3EEE8]"
              }`}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-[#17645F]" />
          <p className="mt-2 text-sm font-bold text-[#122927]">
            No operators in this filter
          </p>
          <p className="mt-1 text-xs text-[#17645F]/70">
            New Bodaboda Riders and Bajaji Drivers onboarding from the Rider-Driver
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
                          ? "bg-[#17645F]/15 text-[#17645F]"
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
                      <Link
                        href={`/admin/operators/${op.id}`}
                        className="inline-flex items-center gap-1 text-sm font-bold text-[#122927] hover:text-[#17645F] hover:underline"
                      >
                        {op.fullName}
                        <ExternalLink className="h-3 w-3 text-[#17645F]" />
                      </Link>
                      <p className="text-xs text-[#17645F]/70">
                        {isBoda ? "Bodaboda Rider" : "Bajaji Driver"} •{" "}
                        <span className="font-mono font-semibold text-[#122927]/85">
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

                <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#F3EEE8] p-3 text-xs">
                  <div>
                    <span className="text-[#17645F]/55">Phone:</span>{" "}
                    <span className="font-mono text-[#122927]">{op.phone}</span>
                  </div>
                  <div>
                    <span className="text-[#17645F]/55">Home Kituo:</span>{" "}
                    <span className="font-medium text-[#122927]">
                      {op.homeKituo || "Unguja"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#17645F]/55">License:</span>{" "}
                    <span className="font-mono text-[#122927]">
                      {op.licenseNo}
                    </span>
                    {op.licenseExpiry ? (
                      <span className="text-[#17645F]/70">
                        {" "}
                        (exp {op.licenseExpiry.slice(0, 10)})
                      </span>
                    ) : null}
                  </div>
                  <div>
                    <span className="text-[#17645F]/55">Insurance Exp:</span>{" "}
                    <span className="font-medium text-[#122927]">
                      {op.insuranceExpiry
                        ? op.insuranceExpiry.slice(0, 10)
                        : "On file"}
                    </span>
                  </div>
                </div>

                {op.rejectionReason ? (
                  <p className="mt-2 rounded-lg bg-[#A93232]/10 px-3 py-1.5 text-xs text-[#A93232]">
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
                    className="h-9 flex-1 rounded-lg border border-[#17645F]/15 px-3 text-xs text-[#122927] focus:border-[#17645F] focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    <Link
                      href={`/admin/operators/${op.id}`}
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#17645F]/15 bg-[#FAF7F2] px-3 text-xs font-semibold text-[#17645F] hover:bg-[#17645F]/10"
                    >
                      Details
                    </Link>
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
                        <XCircle className="h-3.5 w-3.5 text-[#A93232]" />
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
      {showRegister ? (
        <AdminRegisterRiderForm
          onRegistered={async () => {
            await onMutated();
          }}
          onClose={() => setShowRegister(false)}
        />
      ) : null}
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#17645F]/15 px-5 py-4">
        <h2 className="text-base font-bold text-[#122927]">Trips</h2>
        <Badge tone="teal">{trips.length}</Badge>
      </div>

      {trips.length === 0 ? (
        <div className="p-8 text-center text-xs text-[#17645F]/70">
          No trips recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#EDE7DF] uppercase text-[#17645F]/70">
              <tr>
                <th className="px-4 py-3">Trip Code</th>
                <th className="px-4 py-3">Transport &amp; Plate</th>
                <th className="px-4 py-3">Route (Pickup → Dropoff)</th>
                <th className="px-4 py-3">Fare &amp; Payment</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#17645F]/10">
              {trips.map((tr) => {
                const isBoda = tr.transportType === "BODABODA";
                return (
                  <tr key={tr.id} className="hover:bg-[#F3EEE8]/70">
                    <td className="px-4 py-3 font-mono font-bold text-[#122927]">
                      <Link
                        href={`/admin/trips/${tr.id}`}
                        className="inline-flex items-center gap-1 text-[#17645F] hover:underline"
                      >
                        {tr.tripCode}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-semibold ${
                          isBoda ? "text-[#17645F]" : "text-[#B86B2B]"
                        }`}
                      >
                        {isBoda
                          ? "Go.boda (Rider)"
                          : "Go.bajaji (Driver)"}
                      </span>
                      <div className="font-mono text-[11px] text-[#17645F]/70">
                        {tr.operatorPlate || "Unassigned"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5 font-medium text-[#122927]">
                        <span>{tr.pickupLabel}</span>
                        {tr.pickupSnapped ? (
                          <Badge tone="amber">Smart Snap</Badge>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-[#17645F]/70">
                        → {tr.dropoffLabel}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-[#122927]">
                        {formatTzs(tr.finalFareTzs ?? tr.estimatedFareTzs)}
                      </div>
                      <div className="text-[11px] text-[#17645F]/70">
                        {tr.paymentMethod}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(tr.status)}>{tr.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-[#17645F]/70">
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
                ? "bg-[#17645F]/15 text-[#17645F]"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {isBoda ? <Bike className="h-5 w-5" /> : <CarFront className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-[#122927]">
              {isBoda ? "Go.boda — Bodaboda Rider" : "Go.bajaji — Bajaji Driver"}
            </h3>
            <p className="text-[11px] text-[#17645F]/70">
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
              <span className="text-[11px] font-semibold text-[#17645F]/80">
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
                className="mt-1 h-9 w-full rounded-lg border border-[#17645F]/15 px-2.5 text-xs font-semibold text-[#122927] focus:border-[#17645F] focus:outline-none"
              />
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-semibold text-[#17645F]/80">
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
              className="mt-1 h-9 w-full rounded-lg border border-[#17645F]/15 px-2.5 text-xs font-semibold text-[#122927] focus:border-[#17645F] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-[#17645F]/80">
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
              className="mt-1 h-9 w-full rounded-lg border border-[#17645F]/15 px-2.5 text-xs font-semibold text-[#122927] focus:border-[#17645F] focus:outline-none"
            />
          </label>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-[#17645F]/55">
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
        `${lmForm.isKituo ? "Kituo" : "Landmark"} "${lmForm.nameEn}" added.`
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
        <h2 className="text-base font-bold text-[#122927]">Tariffs (TZS)</h2>
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
            <Tag className="h-4 w-4 text-[#17645F]" />
            <h3 className="text-sm font-extrabold text-[#122927]">
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
              className="h-9 rounded-lg border border-[#17645F]/15 px-2.5 text-xs font-mono font-bold uppercase focus:border-[#17645F] focus:outline-none"
            />
            <select
              value={promoForm.discountType}
              onChange={(e) =>
                setPromoForm((p) => ({
                  ...p,
                  discountType: e.target.value as "PERCENT" | "FLAT_TZS",
                }))
              }
              className="h-9 rounded-lg border border-[#17645F]/15 bg-[#FAF7F2] px-2 text-xs font-medium"
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
              className="h-9 rounded-lg border border-[#17645F]/15 px-2.5 text-xs font-semibold"
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
              className="h-9 rounded-lg border border-[#17645F]/15 px-2.5 text-xs"
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
              className="h-9 rounded-lg border border-[#17645F]/15 px-2.5 text-xs"
            />
            <Button type="submit" size="sm" disabled={savingPromo}>
              <Plus className="h-3.5 w-3.5" />
              Save Promo
            </Button>
          </form>

          <div className="mt-4 divide-y divide-[#17645F]/10 rounded-xl border border-[#17645F]/10">
            {promos.map((p) => (
              <div
                key={p.code}
                className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs"
              >
                <div>
                  <span className="font-mono font-bold text-[#122927]">
                    {p.code}
                  </span>
                  <span className="ml-2 text-[#17645F]/70">
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
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[#B86B2B]" />
            <h3 className="text-sm font-bold text-[#122927]">
              Unguja Landmarks &amp; Vituo
            </h3>
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
              className="h-9 rounded-lg border border-[#17645F]/15 px-2.5 text-xs"
            />
            <input
              type="text"
              required
              placeholder="English Name (e.g. Kijangwani Stage)"
              value={lmForm.nameEn}
              onChange={(e) =>
                setLmForm((p) => ({ ...p, nameEn: e.target.value }))
              }
              className="h-9 rounded-lg border border-[#17645F]/15 px-2.5 text-xs"
            />
            <input
              type="text"
              required
              placeholder="Unguja Area (e.g. Stone Town, Nungwi)"
              value={lmForm.area}
              onChange={(e) =>
                setLmForm((p) => ({ ...p, area: e.target.value }))
              }
              className="h-9 rounded-lg border border-[#17645F]/15 px-2.5 text-xs"
            />
            <label className="flex items-center gap-2 rounded-lg border border-[#17645F]/15 px-2.5 text-xs text-[#122927]/85">
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
              className="h-9 rounded-lg border border-[#17645F]/15 px-2.5 font-mono text-xs"
            />
            <input
              type="number"
              step="0.0001"
              value={lmForm.lng}
              onChange={(e) =>
                setLmForm((p) => ({ ...p, lng: Number(e.target.value) }))
              }
              placeholder="Longitude"
              className="h-9 rounded-lg border border-[#17645F]/15 px-2.5 font-mono text-xs"
            />
            <div className="col-span-2 flex justify-end">
              <Button type="submit" size="sm" variant="amber" disabled={savingLm}>
                <Plus className="h-3.5 w-3.5" />
                Add Unguja Landmark
              </Button>
            </div>
          </form>

          <div className="mt-4 max-h-56 divide-y divide-[#17645F]/10 overflow-y-auto rounded-xl border border-[#17645F]/10">
            {landmarks.slice(0, 20).map((lm) => (
              <div
                key={lm.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-semibold text-[#122927]">
                    {lm.nameEn}
                  </span>
                  <span className="ml-1.5 text-[#17645F]/55">({lm.area})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {lm.isKituo ? <Badge tone="teal">Kituo</Badge> : null}
                  <span className="font-mono text-[10px] text-[#17645F]/55">
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
