"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Bike,
  CarFront,
  CheckCircle2,
  FileCheck2,
  HardHat,
  Maximize2,
  ShieldCheck,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { Badge, Button, Card } from "@goboda/ui";
import { useAdminPortal } from "@admin/components/admin-portal-shell";

interface OperatorDetailResponse {
  profile: {
    id: string;
    userId: string;
    transportType: "BODABODA" | "BAJAJI";
    operatorTitle: "RIDER" | "DRIVER";
    fullName: string;
    phone: string;
    homeKituo: string;
    nationalIdNo: string;
    licenseNo: string;
    licenseExpiry: string | null;
    plateNumber: string;
    vehicleModel: string;
    vehicleColor: string;
    insuranceExpiry: string | null;
    payoutMobileNumber: string;
    kycStatus: "PENDING_VERIFICATION" | "APPROVED" | "REJECTED" | "SUSPENDED";
    helmetVerified: boolean;
    isOnline: boolean;
    rejectionReason: string | null;
    approvedAt: string | null;
    createdAt: string;
  };
  checklist: Array<{
    docType: string;
    uploaded: boolean;
    status: string;
    storageKey: string | null;
    bucket: string;
    uploadedAt: string | null;
  }>;
  wallets: Array<{
    accountType: string;
    balanceTzs: number;
    isFloatBlocked: boolean;
  }>;
  tripsSummary: {
    totalTrips: number;
    completedTrips: number;
    totalNetTzs: number | string;
  };
  helmetLogs: Array<{
    id: string;
    tripId: string;
    helmetProvided: boolean;
    note: string;
    createdAt: string;
  }>;
  auditEvents: Array<{
    id: string;
    subject: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
}

export default function AdminOperatorDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { notify, refreshOverview } = useAdminPortal();
  const [detail, setDetail] = React.useState<OperatorDetailResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [zoomDoc, setZoomDoc] = React.useState<
    OperatorDetailResponse["checklist"][number] | null
  >(null);

  const load = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ops/operators/${id}`, { cache: "no-store" });
      const json = (await res.json()) as OperatorDetailResponse & {
        error?: string;
        message?: string;
      };
      if (!res.ok) throw new Error(json.message || json.error || "Operator not found");
      setDetail(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load operator");
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function submitDecision(decision: "APPROVED" | "REJECTED" | "SUSPENDED") {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/ops/operators/${detail.profile.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          reason,
          helmetVerified:
            decision === "APPROVED" && detail.profile.transportType === "BODABODA"
              ? true
              : undefined,
        }),
      });
      if (!res.ok) {
        notify("rose", "Failed to update operator KYC decision");
        return;
      }
      notify("emerald", `${detail.profile.fullName} updated to ${decision}.`);
      await Promise.all([load(), refreshOverview()]);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-8 text-center text-sm text-[#17645F]/70">
        Loading operator...
      </Card>
    );
  }

  if (error || !detail) {
    return (
      <Card className="border-[#A93232]/25 bg-[#A93232]/10 p-6 text-sm text-[#A93232]">
        <p>{error || "Operator not found"}</p>
        <Link href="/admin/operators" className="mt-3 inline-block font-bold underline">
          ← Back to Riders &amp; Drivers KYC
        </Link>
      </Card>
    );
  }

  const { profile, checklist, wallets, tripsSummary, helmetLogs, auditEvents } = detail;
  const isBoda = profile.transportType === "BODABODA";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/operators"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#17645F] hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Riders &amp; Drivers KYC Queue
        </Link>
        <div className="flex flex-wrap gap-2">
          <Badge tone={isBoda ? "teal" : "amber"}>
            {isBoda ? "Bodaboda Rider (RIDER)" : "Bajaji Driver (DRIVER)"}
          </Badge>
          <Badge
            tone={
              profile.kycStatus === "APPROVED"
                ? "emerald"
                : profile.kycStatus === "PENDING_VERIFICATION"
                  ? "amber"
                  : "rose"
            }
          >
            {profile.kycStatus}
          </Badge>
          {isBoda ? (
            <Badge tone={profile.helmetVerified ? "emerald" : "rose"}>
              <HardHat className="h-3 w-3" />
              {profile.helmetVerified ? "2x Helmets Verified" : "Helmets Unverified"}
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Header Dossier Card */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                isBoda ? "bg-[#17645F]/15 text-[#17645F]" : "bg-amber-100 text-amber-800"
              }`}
            >
              {isBoda ? <Bike className="h-6 w-6" /> : <CarFront className="h-6 w-6" />}
            </div>
            <div>
              <h2 className="font-display text-2xl uppercase tracking-wide text-[#17645F]">{profile.fullName}</h2>
              <p className="text-xs text-[#17645F]/70">
                Plate <strong className="font-mono text-[#122927]">{profile.plateNumber}</strong> •{" "}
                {profile.vehicleColor} {profile.vehicleModel} • Home Kituo:{" "}
                <strong>{profile.homeKituo}</strong>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Audit / rejection note..."
              className="h-9 w-56 rounded-lg border border-[#17645F]/15 px-3 text-xs focus:border-[#17645F] focus:outline-none"
            />
            <Button size="sm" variant="primary" disabled={busy} onClick={() => submitDecision("APPROVED")}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approve
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => submitDecision("REJECTED")}>
              <XCircle className="h-3.5 w-3.5 text-[#A93232]" />
              Reject
            </Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => submitDecision("SUSPENDED")}>
              Suspend
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 rounded-xl bg-[#F3EEE8] p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[#17645F]/55">Phone / Payout</p>
            <p className="font-mono font-bold text-[#122927]">{profile.phone}</p>
            <p className="font-mono text-[11px] text-[#17645F]/70">Payout: {profile.payoutMobileNumber}</p>
          </div>
          <div>
            <p className="text-[#17645F]/55">National ID &amp; License</p>
            <p className="font-mono font-semibold text-[#122927]">{profile.nationalIdNo}</p>
            <p className="font-mono text-[11px] text-[#17645F]/80">
              DL: {profile.licenseNo} (exp {profile.licenseExpiry?.slice(0, 10) || "N/A"})
            </p>
          </div>
          <div>
            <p className="text-[#17645F]/55">Insurance &amp; Trips</p>
            <p className="font-semibold text-[#122927]">
              Exp: {profile.insuranceExpiry?.slice(0, 10) || "On file"}
            </p>
            <p className="text-[11px] text-[#17645F]/70">
              {tripsSummary.completedTrips} completed / {tripsSummary.totalTrips} trips (Net TZS{" "}
              {Number(tripsSummary.totalNetTzs ?? 0).toLocaleString("en-TZ")})
            </p>
          </div>
          <div>
            <p className="text-[#17645F]/55">TZS Wallets</p>
            {wallets.length === 0 ? (
              <p className="text-[#17645F]/70">Provisioned on approval</p>
            ) : (
              wallets.map((w) => (
                <p key={w.accountType} className="font-mono text-[11px] font-bold text-[#122927]">
                  <Wallet className="mr-1 inline h-3 w-3 text-[#17645F]" />
                  {w.accountType}: TZS {Number(w.balanceTzs).toLocaleString("en-TZ")}
                </p>
              ))
            )}
          </div>
        </div>
      </Card>

      {/* KYC Documents */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-[#17645F]" />
            <h3 className="text-sm font-bold text-[#122927]">
              KYC Documents ({checklist.filter((c) => c.uploaded).length}/{checklist.length})
            </h3>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {checklist.map((doc) => (
            <button
              key={doc.docType}
              type="button"
              onClick={() => setZoomDoc(doc)}
              className={`group rounded-xl border p-3.5 text-left transition hover:border-[#17645F]/25 ${
                doc.uploaded
                  ? "border-[#17645F]/25 bg-emerald-50/40"
                  : "border-dashed border-[#17645F]/25 bg-[#F3EEE8]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#122927]">
                  {doc.docType.replace(/_/g, " ")}
                </span>
                <Maximize2 className="h-3.5 w-3.5 text-[#17645F]/55 group-hover:text-[#17645F]" />
              </div>
              <div className="mt-2 flex h-20 flex-col items-center justify-center rounded-lg bg-[#17645F] p-2 text-center text-[11px] text-slate-200">
                <ShieldCheck
                  className={`h-5 w-5 ${doc.uploaded ? "text-emerald-400" : "text-[#17645F]/70"}`}
                />
                <span className="mt-1 text-[11px] text-slate-300">
                  {doc.uploaded ? "Uploaded" : "Pending upload"}
                </span>
              </div>
              <div className="mt-2">
                <Badge tone={doc.uploaded ? "emerald" : "amber"}>{doc.status}</Badge>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Activity Log & Helmet Checks */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-bold text-[#122927]">Activity Log</h3>
          {auditEvents.length === 0 ? (
            <p className="mt-3 text-xs text-[#17645F]/70">No activity recorded yet.</p>
          ) : (
            <div className="mt-3 divide-y divide-[#17645F]/10">
              {auditEvents.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between py-2.5 text-xs">
                  <span className="font-medium text-[#122927]">{ev.subject}</span>
                  <span className="text-[11px] text-[#17645F]/55">
                    {new Date(ev.createdAt).toLocaleString("en-GB")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-bold text-[#122927]">Helmet Checks</h3>
          {helmetLogs.length === 0 ? (
            <p className="mt-3 text-xs text-[#17645F]/70">No helmet checks yet.</p>
          ) : (
            <div className="mt-3 divide-y divide-[#17645F]/10">
              {helmetLogs.map((h) => (
                <div key={h.id} className="flex items-center justify-between py-2.5 text-xs">
                  <div>
                    <p className="font-medium text-[#122927]">
                      {h.helmetProvided ? "Helmet provided" : "Missing helmet"}
                    </p>
                    <p className="text-[11px] text-[#17645F]/70">{h.note || "Trip rating"}</p>
                  </div>
                  <Badge tone={h.helmetProvided ? "emerald" : "rose"}>
                    {h.helmetProvided ? "PASS" : "FLAG"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Document Lightbox */}
      {zoomDoc ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
          onClick={() => setZoomDoc(null)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-slate-700 bg-[#17645F] p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-base font-bold">
                {zoomDoc.docType.replace(/_/g, " ")} — {profile.fullName}
              </h4>
              <button
                type="button"
                onClick={() => setZoomDoc(null)}
                className="rounded-lg bg-slate-800 p-2 text-slate-300 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex h-56 flex-col items-center justify-center rounded-xl border border-slate-700 bg-[#122927] p-6 text-center">
              <ShieldCheck className="h-10 w-10 text-teal-400" />
              <p className="mt-3 text-sm font-semibold">
                {zoomDoc.uploaded ? "Document on file" : "Not uploaded yet"}
              </p>
              {zoomDoc.storageKey ? (
                <p className="mt-1 break-all font-mono text-xs text-[#17645F]/55">
                  {zoomDoc.storageKey}
                </p>
              ) : null}
              {zoomDoc.uploadedAt ? (
                <p className="mt-2 text-[11px] text-emerald-400">
                  Uploaded {new Date(zoomDoc.uploadedAt).toLocaleString("en-GB")}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
