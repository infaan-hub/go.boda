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
      <Card className="p-8 text-center text-sm text-[#17645F]/70">
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
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#17645F] hover:underline"
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
            <h2 className="flex items-center gap-2 font-mono text-xl font-extrabold text-[#122927]">
              <Route className="h-5 w-5 text-[#17645F]" />
              {trip.tripCode}
            </h2>
            <p className="mt-1 text-xs text-[#17645F]/80">
              <strong>{trip.pickupLabel}</strong>
              {trip.pickupSnapped ? ` (Smart Snap: ${trip.pickupSnapGateName ?? "Perimeter Gate"}, ${trip.pickupWalkMeters}m walk)` : ""}{" "}
              → <strong>{trip.dropoffLabel}</strong>
            </p>
            <p className="mt-1 text-xs text-[#17645F]/70">
              Operator: <strong>{trip.operatorName ?? "Unassigned"}</strong> ({trip.operatorPlate ?? "—"}) •
              <KeyRound className="mx-1 inline h-3 w-3" />
              Start PIN: <strong className="font-mono">{trip.startPin}</strong>{" "}
              {trip.pinVerifiedAt ? "(Verified)" : "(Pending)"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-[#17645F]">
              {fmt(trip.finalFareTzs ?? trip.estimatedFareTzs)}
            </p>
            <p className="text-xs text-[#17645F]/70">
              {trip.paymentMethod} • Wait Fee: {fmt(trip.waitFeeTzs)} • Net: {fmt(trip.operatorNetTzs)}
            </p>
          </div>
        </div>
      </Card>

      {/* State Transition Timeline + Dispute Adjustment */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[#122927]">
            <Clock className="h-4 w-4 text-[#17645F]" />
            Timeline ({transitions.length})
          </h3>
          {transitions.length === 0 ? (
            <p className="mt-3 text-xs text-[#17645F]/70">Created at {new Date(trip.createdAt).toLocaleString("en-GB")}.</p>
          ) : (
            <ol className="mt-3 space-y-2.5 border-l-2 border-[#17645F]/25 pl-4 text-xs">
              {transitions.map((tr) => (
                <li key={tr.id}>
                  <p className="font-bold text-[#122927]">
                    {tr.fromStatus ? `${tr.fromStatus} → ` : ""}
                    <span className="text-[#17645F]">{tr.toStatus}</span>{" "}
                    <span className="font-normal text-[#17645F]/55">({tr.actorRole})</span>
                  </p>
                  {tr.note ? <p className="text-[#17645F]/80">{tr.note}</p> : null}
                  <p className="font-mono text-[10px] text-[#17645F]/55">
                    {new Date(tr.createdAt).toLocaleString("en-GB")}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[#122927]">
            <Scale className="h-4 w-4 text-[#B86B2B]" />
            Fare Adjustment
          </h3>
          <form onSubmit={applyAdjustment} className="mt-4 space-y-3 text-xs">
            <label className="block">
              <span className="font-semibold text-[#17645F]/80">Adjusted Final Fare (TZS)</span>
              <input
                type="number"
                min={500}
                step={500}
                value={adjustedFare}
                onChange={(e) => setAdjustedFare(Number(e.target.value))}
                className="mt-1 h-9 w-full rounded-lg border border-[#17645F]/15 px-3 font-mono font-bold"
              />
            </label>
            <label className="block">
              <span className="font-semibold text-[#17645F]/80">Reason</span>
              <input
                type="text"
                required
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Waived wait fee after Stone Town road closure"
                className="mt-1 h-9 w-full rounded-lg border border-[#17645F]/15 px-3"
              />
            </label>
            <Button type="submit" size="sm" variant="amber" disabled={busy}>
              Save Adjustment
            </Button>
          </form>

          {payments.length > 0 ? (
            <div className="mt-4 rounded-xl bg-[#F3EEE8] p-3 text-xs">
              <p className="font-bold text-[#122927]">Finance Settlement Record</p>
              {payments.map((p) => (
                <p key={p.id} className="mt-1 font-mono text-[11px] text-[#17645F]/80">
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
          <h4 className="font-extrabold text-[#122927]">GPS Breadcrumbs ({breadcrumbs.length})</h4>
          {breadcrumbs.length === 0 ? (
            <p className="mt-2 text-[#17645F]/70">No in-trip breadcrumbs captured.</p>
          ) : (
            <div className="mt-2 max-h-44 space-y-1 overflow-y-auto font-mono text-[11px]">
              {breadcrumbs.slice(0, 20).map((b) => (
                <div key={b.id} className="flex justify-between text-[#17645F]/80">
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
          <h4 className="flex items-center gap-1.5 font-extrabold text-[#122927]">
            <MessageSquare className="h-3.5 w-3.5 text-[#17645F]" />
            Quick-Chat Log ({chatMessages.length})
          </h4>
          {chatMessages.length === 0 ? (
            <p className="mt-2 text-[#17645F]/70">No chat messages on this trip.</p>
          ) : (
            <div className="mt-2 space-y-1.5">
              {chatMessages.map((m) => (
                <div key={m.id} className="rounded-lg bg-[#F3EEE8] p-2">
                  <span className="font-bold text-[#17645F]">{m.senderRole}: </span>
                  <span>{m.bodyText}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4 text-xs">
          <h4 className="flex items-center gap-1.5 font-extrabold text-[#122927]">
            <ShieldAlert className="h-3.5 w-3.5 text-[#A93232]" />
            SOS Incidents ({sosAlerts.length})
          </h4>
          {sosAlerts.length === 0 ? (
            <p className="mt-2 text-[#17645F]">Zero safety alerts on this trip.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {sosAlerts.map((s) => (
                <div key={s.id} className="rounded-lg border border-[#A93232]/25 bg-[#A93232]/10 p-2">
                  <p className="font-mono font-bold text-[#A93232]">
                    {s.alertCode} ({s.status})
                  </p>
                  <p className="text-[#122927]/85">{s.reason}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
