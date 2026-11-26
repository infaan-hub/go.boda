"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  KeyRound,
  MessageSquare,
  Route,
  Scale,
  ShieldAlert,
} from "lucide-react";
import { Badge, Button, Card } from "@goboda/ui";
import { useAdminPortal } from "@/components/admin-portal-shell";

interface TripForensicData {
  trip: {
    id: string;
    tripCode: string;
    transportType: "BODABODA" | "BAJAJI";
    status: string;
    pickupLabel: string;
    pickupSnapped: boolean;
    pickupSnapGateName: string | null;
    pickupWalkMeters: number;
    dropoffLabel: string;
    distanceMeters: number;
    durationSeconds: number;
    paymentMethod: string;
    promoCode: string | null;
    grossFareTzs: number;
    discountTzs: number;
    estimatedFareTzs: number;
    waitFeeTzs: number;
    finalFareTzs: number | null;
    commissionTzs: number;
    operatorNetTzs: number;
    startPin: string;
    pinVerifiedAt: string | null;
    operatorName: string | null;
    operatorPlate: string | null;
    helmetProvided: boolean | null;
    createdAt: string;
  };
  transitions: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    actorRole: string;
    note: string;
    createdAt: string;
  }>;
  breadcrumbs: Array<{
    id: string;
    lat: number;
    lng: number;
    speedKmh: number;
    recordedAt: string;
  }>;
  chatMessages: Array<{
    id: string;
    senderRole: string;
    bodyText: string;
    createdAt: string;
  }>;
  sosAlerts: Array<{
    id: string;
    alertCode: string;
    status: string;
    reason: string;
    resolutionNote: string | null;
  }>;
  payments: Array<{
    id: string;
    paymentMethod: string;
    provider: string;
    customerPaidTzs: number;
    commissionTzs: number;
    operatorNetTzs: number;
    status: string;
  }>;
}

function fmt(n: number | null | undefined) {
  return `TZS ${Number(n ?? 0).toLocaleString("en-TZ")}`;
}

export default function AdminTripForensicPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { notify, refreshOverview } = useAdminPortal();
  const [data, setData] = React.useState<TripForensicData | null>(null);
  const [adjustedFare, setAdjustedFare] = React.useState(0);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/ops/trips/${id}`, { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as TripForensicData;
      setData(json);
      setAdjustedFare(json.trip.finalFareTzs ?? json.trip.estimatedFareTzs);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function applyAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !note.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/ops/trips/${data.trip.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          adjustedFareTzs: Number(adjustedFare),
          resolutionStatus: "PAID_COMPLETED",
          note: note.trim(),
        }),
      });
      if (res.ok) {
        notify("emerald", `Trip ${data.trip.tripCode} fare dispute adjusted to ${fmt(adjustedFare)}.`);
        setNote("");
        await Promise.all([load(), refreshOverview()]);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <Card className="p-8 text-center text-sm text-slate-500">
        Loading trip...
      </Card>
    );
  }

  const { trip, transitions, breadcrumbs, chatMessages, sosAlerts, payments } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/admin/trips"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-800 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Trips Monitor
        </Link>
        <div className="flex items-center gap-2">
          <Badge tone="teal">{trip.transportType === "BODABODA" ? "Go.boda (Rider)" : "Go.bajaji (Driver)"}</Badge>
          <Badge tone={trip.status === "SOS_ACTIVE" ? "rose" : "emerald"}>{trip.status}</Badge>
        </div>
      </div>

      {/* Trip Header & Fare Breakdown */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-mono text-xl font-extrabold text-slate-900">
              <Route className="h-5 w-5 text-teal-700" />
              {trip.tripCode}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              <strong>{trip.pickupLabel}</strong>
              {trip.pickupSnapped ? ` (Smart Snap: ${trip.pickupSnapGateName ?? "Perimeter Gate"}, ${trip.pickupWalkMeters}m walk)` : ""}{" "}
              → <strong>{trip.dropoffLabel}</strong>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Operator: <strong>{trip.operatorName ?? "Unassigned"}</strong> ({trip.operatorPlate ?? "—"}) •
              <KeyRound className="mx-1 inline h-3 w-3" />
              Start PIN: <strong className="font-mono">{trip.startPin}</strong>{" "}
              {trip.pinVerifiedAt ? "(Verified)" : "(Pending)"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-teal-800">
              {fmt(trip.finalFareTzs ?? trip.estimatedFareTzs)}
            </p>
            <p className="text-xs text-slate-500">
              {trip.paymentMethod} • Wait Fee: {fmt(trip.waitFeeTzs)} • Net: {fmt(trip.operatorNetTzs)}
            </p>
          </div>
        </div>
      </Card>

      {/* State Transition Timeline + Dispute Adjustment */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Clock className="h-4 w-4 text-teal-700" />
            Timeline ({transitions.length})
          </h3>
          {transitions.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">Created at {new Date(trip.createdAt).toLocaleString("en-GB")}.</p>
          ) : (
            <ol className="mt-3 space-y-2.5 border-l-2 border-teal-200 pl-4 text-xs">
              {transitions.map((tr) => (
                <li key={tr.id}>
                  <p className="font-bold text-slate-900">
                    {tr.fromStatus ? `${tr.fromStatus} → ` : ""}
                    <span className="text-teal-800">{tr.toStatus}</span>{" "}
                    <span className="font-normal text-slate-400">({tr.actorRole})</span>
                  </p>
                  {tr.note ? <p className="text-slate-600">{tr.note}</p> : null}
                  <p className="font-mono text-[10px] text-slate-400">
                    {new Date(tr.createdAt).toLocaleString("en-GB")}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Scale className="h-4 w-4 text-amber-600" />
            Fare Adjustment
          </h3>
          <form onSubmit={applyAdjustment} className="mt-4 space-y-3 text-xs">
            <label className="block">
              <span className="font-semibold text-slate-600">Adjusted Final Fare (TZS)</span>
              <input
                type="number"
                min={500}
                step={500}
                value={adjustedFare}
                onChange={(e) => setAdjustedFare(Number(e.target.value))}
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3 font-mono font-bold"
              />
            </label>
            <label className="block">
              <span className="font-semibold text-slate-600">Reason</span>
              <input
                type="text"
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Waived wait fee after Stone Town road closure"
                className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-3"
              />
            </label>
            <Button type="submit" size="sm" variant="amber" disabled={busy}>
              Save Adjustment
            </Button>
          </form>

          {payments.length > 0 ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs">
              <p className="font-bold text-slate-800">Finance Settlement Record</p>
              {payments.map((p) => (
                <p key={p.id} className="mt-1 font-mono text-[11px] text-slate-600">
                  {p.provider} • Paid {fmt(p.customerPaidTzs)} • Comm {fmt(p.commissionTzs)} • Net{" "}
                  {fmt(p.operatorNetTzs)} ({p.status})
                </p>
              ))}
            </div>
          ) : null}
        </Card>
      </div>

      {/* Breadcrumbs, Quick-Chat & SOS */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-4 text-xs">
          <h4 className="font-extrabold text-slate-900">GPS Breadcrumbs ({breadcrumbs.length})</h4>
          {breadcrumbs.length === 0 ? (
            <p className="mt-2 text-slate-500">No in-trip breadcrumbs captured.</p>
          ) : (
            <div className="mt-2 max-h-44 space-y-1 overflow-y-auto font-mono text-[11px]">
              {breadcrumbs.slice(0, 20).map((b) => (
                <div key={b.id} className="flex justify-between text-slate-600">
                  <span>
                    {Number(b.lat).toFixed(4)}, {Number(b.lng).toFixed(4)}
                  </span>
                  <span>{Number(b.speedKmh).toFixed(0)} km/h</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4 text-xs">
          <h4 className="flex items-center gap-1.5 font-extrabold text-slate-900">
            <MessageSquare className="h-3.5 w-3.5 text-teal-700" />
            Quick-Chat Log ({chatMessages.length})
          </h4>
          {chatMessages.length === 0 ? (
            <p className="mt-2 text-slate-500">No chat messages on this trip.</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {chatMessages.map((m) => (
                <div key={m.id} className="rounded-lg bg-slate-50 p-2">
                  <span className="font-bold text-teal-800">{m.senderRole}: </span>
                  <span>{m.bodyText}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4 text-xs">
          <h4 className="flex items-center gap-1.5 font-extrabold text-slate-900">
            <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
            SOS Incidents ({sosAlerts.length})
          </h4>
          {sosAlerts.length === 0 ? (
            <p className="mt-2 text-emerald-700">Zero safety alerts on this trip.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {sosAlerts.map((s) => (
                <div key={s.id} className="rounded-lg border border-rose-200 bg-rose-50 p-2">
                  <p className="font-mono font-bold text-rose-800">
                    {s.alertCode} ({s.status})
                  </p>
                  <p className="text-slate-700">{s.reason}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
