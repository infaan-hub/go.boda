"use client";

import * as React from "react";
import {
  AlertTriangle,
  CalendarClock,
  Camera,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button, cn } from "@goboda/ui";
import type { ComplianceBucket } from "../lib/partner-realtime";
import { usePartnerRealtime } from "./partner-realtime-provider";

interface ExpiryEntry {
  expiryDate: string | null;
  daysLeft: number | null;
  bucket: ComplianceBucket;
  licenseNo?: string | null;
}

interface CompliancePayload {
  profile: {
    licenseNo: string;
    licenseExpiry: string | null;
    insuranceExpiry: string | null;
    plateNumber: string;
    kycStatus: string;
    rejectionReason: string | null;
  } | null;
  documents: Array<{
    docType: string;
    status: string;
    uploadedAt: string;
  }>;
  expiries: {
    license: ExpiryEntry;
    insurance: ExpiryEntry;
  };
}

function getBucketStyle(bucket: ComplianceBucket, sw: boolean) {
  switch (bucket) {
    case "EXPIRED":
      return {
        tone: "rose" as const,
        label: sw ? "IMEISHA MUDA" : "EXPIRED",
        barColor: "bg-[#A93232]",
        pct: 100,
      };
    case "7D":
      return {
        tone: "rose" as const,
        label: sw ? "DHARURA (≤ SIKU 7)" : "CRITICAL (≤ 7 DAYS)",
        barColor: "bg-[#A93232]",
        pct: 90,
      };
    case "14D":
      return {
        tone: "amber" as const,
        label: sw ? "ONYO (≤ SIKU 14)" : "DUE SOON (≤ 14 DAYS)",
        barColor: "bg-[#B86B2B]",
        pct: 70,
      };
    case "30D":
      return {
        tone: "amber" as const,
        label: sw ? "KUMBUSHO (≤ SIKU 30)" : "RENEW SOON (≤ 30 DAYS)",
        barColor: "bg-[#B86B2B]",
        pct: 45,
      };
    case "VALID":
      return {
        tone: "emerald" as const,
        label: sw ? "HALALI" : "VALID",
        barColor: "bg-[#17645F]",
        pct: 100,
      };
    default:
      return {
        tone: "slate" as const,
        label: sw ? "HAIJAWEKWA" : "NOT SET",
        barColor: "bg-current/30",
        pct: 15,
      };
  }
}

export function PartnerCompliancePanel({
  locale,
  nightMode,
}: {
  locale: "sw" | "en";
  nightMode: boolean;
}) {
  const sw = locale === "sw";
  const { snapshot, refreshNow } = usePartnerRealtime();

  const [data, setData] = React.useState<CompliancePayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [licenseNo, setLicenseNo] = React.useState("");
  const [licenseExpiry, setLicenseExpiry] = React.useState("");
  const [insuranceExpiry, setInsuranceExpiry] = React.useState("");
  const [renewDocType, setRenewDocType] = React.useState<
    "DRIVING_LICENSE" | "INSURANCE"
  >("DRIVING_LICENSE");
  const [renewFileName, setRenewFileName] = React.useState<string>("");
  const [message, setMessage] = React.useState<{
    tone: "ok" | "err";
    text: string;
  } | null>(null);

  const loadCompliance = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/partner/compliance", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as CompliancePayload;
        setData(json);
        if (json.profile) {
          setLicenseNo((prev) => prev || json.profile!.licenseNo || "");
          setLicenseExpiry(
            (prev) => prev || json.profile!.licenseExpiry || ""
          );
          setInsuranceExpiry(
            (prev) => prev || json.profile!.insuranceExpiry || ""
          );
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadCompliance(false);
  }, [loadCompliance]);

  React.useEffect(() => {
    if (!snapshot?.version) return;
    void loadCompliance(true);
  }, [snapshot?.version, loadCompliance]);

  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, string> = {};
      if (licenseNo.trim()) payload.licenseNo = licenseNo.trim();
      if (licenseExpiry) payload.licenseExpiry = licenseExpiry;
      if (insuranceExpiry) payload.insuranceExpiry = insuranceExpiry;
      if (renewFileName) {
        payload.renewedDocType = renewDocType;
        payload.renewedFileName = renewFileName;
      }

      const res = await fetch("/api/partner/compliance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { updated?: boolean; message?: string };
      if (!res.ok || !json.updated) {
        setMessage({
          tone: "err",
          text:
            json.message ||
            (sw
              ? "Imeshindwa kusasisha tarehe za nyaraka."
              : "Could not save document expiry dates."),
        });
        return;
      }
      setRenewFileName("");
      setMessage({
        tone: "ok",
        text: sw
          ? "Tarehe za leseni na bima zimesasishwa na kusawazishwa na Go.Boda Ops!"
          : "License & insurance expiry dates saved and synced with Go.Boda Ops!",
      });
      await loadCompliance(true);
      await refreshNow();
    } finally {
      setSaving(false);
    }
  };

  const cardTone = nightMode
    ? "border-[#F3EEE8]/15 bg-[#123D3A] text-[#F3EEE8]"
    : "border-[#17645F]/15 bg-[#FAF7F2] text-[#122927]";

  const subCardTone = nightMode
    ? "border-[#F3EEE8]/15 bg-[#0D302E]"
    : "border-[#17645F]/15 bg-[#F3EEE8]/75";

  const license = data?.expiries.license ?? {
    expiryDate: snapshot?.compliance.licenseExpiry ?? null,
    daysLeft: snapshot?.compliance.licenseDaysLeft ?? null,
    bucket: snapshot?.compliance.licenseBucket ?? "MISSING",
  };

  const insurance = data?.expiries.insurance ?? {
    expiryDate: snapshot?.compliance.insuranceExpiry ?? null,
    daysLeft: snapshot?.compliance.insuranceDaysLeft ?? null,
    bucket: snapshot?.compliance.insuranceBucket ?? "MISSING",
  };

  const cards = [
    {
      key: "license",
      title: sw ? "Leseni ya Udereva" : "Driving License",
      subtitle: data?.profile?.licenseNo ?? "",
      entry: license,
    },
    {
      key: "insurance",
      title: sw ? "Bima ya Chombo" : "Vehicle Insurance",
      subtitle: data?.profile?.plateNumber ?? "",
      entry: insurance,
    },
  ];

  return (
    <section className={cn("space-y-4 rounded-3xl border p-5 shadow-sm", cardTone)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-[#B86B2B]" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#B86B2B]">
              {sw
                ? "TAHADHARI ZA MUDA WA NYARAKA • SIKU 30 / 14 / 7"
                : "DOCUMENT EXPIRY COUNTDOWN • 30 / 14 / 7 DAYS"}
            </p>
            <h2 className="text-sm font-extrabold uppercase tracking-[0.1em]">
              {sw ? "Leseni & Bima ya Chombo" : "License & Insurance Alerts"}
            </h2>
          </div>
        </div>
        {data?.profile?.kycStatus ? (
          <Badge
            tone={
              data.profile.kycStatus === "APPROVED"
                ? "emerald"
                : data.profile.kycStatus === "SUSPENDED" ||
                    data.profile.kycStatus === "REJECTED"
                  ? "rose"
                  : "amber"
            }
          >
            {data.profile.kycStatus === "APPROVED" ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5" />
            )}
            {data.profile.kycStatus.replace(/_/g, " ")}
          </Badge>
        ) : null}
      </div>

      {data?.profile?.rejectionReason ? (
        <div className="flex items-start gap-2 rounded-2xl border border-[#A93232]/35 bg-[#A93232]/10 p-3 text-xs font-semibold text-[#A93232]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{data.profile.rejectionReason}</span>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="flex items-center gap-2 py-3 text-xs opacity-75">
          <Loader2 className="h-4 w-4 animate-spin text-[#17645F]" />
          {sw ? "Inakagua muda wa nyaraka..." : "Checking document expiry dates..."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((c) => {
            const style = getBucketStyle(c.entry.bucket, sw);
            const daysText =
              c.entry.daysLeft === null
                ? sw
                  ? "Weka tarehe ya mwisho hapa chini"
                  : "Add expiry date below"
                : c.entry.daysLeft < 0
                  ? sw
                    ? `Imeisha siku ${Math.abs(c.entry.daysLeft)} zilizopita`
                    : `Expired ${Math.abs(c.entry.daysLeft)}d ago`
                  : sw
                    ? `Imebaki siku ${c.entry.daysLeft}`
                    : `${c.entry.daysLeft} days left`;

            return (
              <div
                key={c.key}
                className={cn("space-y-2.5 rounded-2xl border p-4", subCardTone)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-extrabold">{c.title}</p>
                    {c.subtitle ? (
                      <p className="font-mono text-[11px] opacity-70">
                        {c.subtitle}
                      </p>
                    ) : null}
                  </div>
                  <Badge tone={style.tone}>{style.label}</Badge>
                </div>

                <div>
                  <p className="font-display text-2xl leading-none">
                    {daysText}
                  </p>
                  <p className="mt-1 text-[11px] opacity-70">
                    {c.entry.expiryDate
                      ? `${sw ? "Mwisho:" : "Expires:"} ${c.entry.expiryDate}`
                      : sw
                        ? "Tarehe haijasajiliwa"
                        : "Date not recorded"}
                  </p>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-current/10">
                  <div
                    className={cn("h-full rounded-full", style.barColor)}
                    style={{ width: `${style.pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inline Quick Renewal Form synced to Admin /admin/compliance/expiries */}
      <form
        onSubmit={handleRenewSubmit}
        className={cn("space-y-3 rounded-2xl border p-4", subCardTone)}
      >
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] opacity-80">
          {sw
            ? "Sasisha Tarehe za Leseni / Bima"
            : "Update Renewed License / Insurance Dates"}
        </p>

        {message ? (
          <div
            className={cn(
              "flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold",
              message.tone === "ok"
                ? "border-[#17645F]/35 bg-[#17645F]/15 text-[#17645F]"
                : "border-[#A93232]/35 bg-[#A93232]/10 text-[#A93232]"
            )}
          >
            {message.tone === "ok" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-75">
              {sw ? "Namba ya Leseni" : "License No."}
            </span>
            <input
              type="text"
              value={licenseNo}
              onChange={(e) => setLicenseNo(e.target.value)}
              placeholder="ZN-A-48219"
              className={cn(
                "w-full rounded-2xl border px-3 py-2 text-xs font-medium",
                nightMode
                  ? "border-[#F3EEE8]/20 bg-[#123D3A] text-[#F3EEE8]"
                  : "border-[#17645F]/20 bg-[#FAF7F2] text-[#122927]"
              )}
            />
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-75">
              {sw ? "Mwisho wa Leseni" : "License Expiry"}
            </span>
            <input
              type="date"
              value={licenseExpiry}
              onChange={(e) => setLicenseExpiry(e.target.value)}
              className={cn(
                "w-full rounded-2xl border px-3 py-2 text-xs font-medium",
                nightMode
                  ? "border-[#F3EEE8]/20 bg-[#123D3A] text-[#F3EEE8]"
                  : "border-[#17645F]/20 bg-[#FAF7F2] text-[#122927]"
              )}
            />
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-75">
              {sw ? "Mwisho wa Bima" : "Insurance Expiry"}
            </span>
            <input
              type="date"
              value={insuranceExpiry}
              onChange={(e) => setInsuranceExpiry(e.target.value)}
              className={cn(
                "w-full rounded-2xl border px-3 py-2 text-xs font-medium",
                nightMode
                  ? "border-[#F3EEE8]/20 bg-[#123D3A] text-[#F3EEE8]"
                  : "border-[#17645F]/20 bg-[#FAF7F2] text-[#122927]"
              )}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={renewDocType}
              onChange={(e) =>
                setRenewDocType(
                  e.target.value as "DRIVING_LICENSE" | "INSURANCE"
                )
              }
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-bold",
                nightMode
                  ? "border-[#F3EEE8]/20 bg-[#123D3A] text-[#F3EEE8]"
                  : "border-[#17645F]/20 bg-[#FAF7F2] text-[#122927]"
              )}
            >
              <option value="DRIVING_LICENSE">
                {sw ? "Picha ya Leseni Mpya" : "Renewed License Photo"}
              </option>
              <option value="INSURANCE">
                {sw ? "Picha ya Bima Mpya" : "Renewed Insurance Photo"}
              </option>
            </select>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#B86B2B]/40 bg-[#B86B2B]/10 px-3 py-1.5 text-xs font-bold text-[#B86B2B] hover:bg-[#B86B2B] hover:text-white">
              <Camera className="h-3.5 w-3.5" />
              <span>
                {renewFileName || (sw ? "Ambatanisha Picha" : "Attach Photo")}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) =>
                  setRenewFileName(e.target.files?.[0]?.name ?? "")
                }
              />
            </label>
          </div>

          <Button type="submit" size="sm" variant="primary" disabled={saving}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {sw ? "Hifadhi Sasisho" : "Save Renewal"}
          </Button>
        </div>
      </form>
    </section>
  );
}
