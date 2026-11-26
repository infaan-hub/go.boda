"use client";

import * as React from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import {
  Bike,
  CarFront,
  CheckCircle2,
  FileCheck2,
  KeyRound,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Badge, BrandLogo, Button, Card } from "@goboda/ui";

interface RegisteredPartner {
  username: string;
  name: string;
  role: string;
  transportType: string;
}

export function PartnerRegisterForm() {
  const isSw = useLocale() === "sw";
  const [transportType, setTransportType] = React.useState<"BODABODA" | "BAJAJI">(
    "BODABODA"
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [registered, setRegistered] = React.useState<RegisteredPartner | null>(
    null
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget;
    setBusy(true);
    setError(null);
    const form = new FormData(formElement);

    const payload = {
      adminUsername: String(form.get("adminUsername") ?? ""),
      adminPassword: String(form.get("adminPassword") ?? ""),
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
      fullName: String(form.get("fullName") ?? ""),
      phone: String(form.get("phone") ?? ""),
      transportType,
      plateNumber: String(form.get("plateNumber") ?? ""),
      homeKituo: String(form.get("homeKituo") ?? ""),
      nationalIdNo: String(form.get("nationalIdNo") ?? ""),
      licenseNo: String(form.get("licenseNo") ?? ""),
      licenseExpiry: String(form.get("licenseExpiry") ?? ""),
      vehicleModel: String(form.get("vehicleModel") ?? ""),
      vehicleColor: String(form.get("vehicleColor") ?? ""),
      insuranceExpiry: String(form.get("insuranceExpiry") ?? ""),
      payoutMobileNumber: String(form.get("payoutMobileNumber") ?? ""),
      helmetVerified: form.get("helmetVerified") === "on",
    };

    try {
      const res = await fetch("/api/partner/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        registered?: boolean;
        partner?: RegisteredPartner;
        error?: string;
        message?: string;
      };
      if (!res.ok || !json.registered || !json.partner) {
        setError(
          json.message ||
            json.error ||
            (isSw ? "Usajili umeshindikana." : "Registration failed.")
        );
        return;
      }
      setRegistered(json.partner);
      formElement.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none";
  const labelClass = "block text-xs font-semibold text-slate-300";

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <BrandLogo
            dark
            subtitle={
              isSw
                ? "Usajili wa Partner — Admin Pekee"
                : "Partner Registration — Admin Only"
            }
          />
          <Link
            href="/partner/login"
            className="text-xs font-semibold text-amber-300 hover:underline"
          >
            {isSw ? "Nina akaunti — Ingia" : "I have an account — Sign in"}
          </Link>
        </div>

        <Card className="border-slate-800 bg-slate-900 p-5 text-white shadow-2xl sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
                <FileCheck2 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-extrabold">
                  {isSw
                    ? "Sajili Bodaboda Rider / Bajaji Driver"
                    : "Register a Bodaboda Rider / Bajaji Driver"}
                </h1>
                <p className="text-xs text-slate-400">
                  {isSw
                    ? "Akaunti hizi husajiliwa na Go.boda Admin pekee."
                    : "Only Go.boda Admins can create partner accounts."}
                </p>
              </div>
            </div>
            <Badge tone="amber">ADMIN ONLY</Badge>
          </div>

          {registered ? (
            <div className="mt-5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              <p className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="h-4 w-4" />
                {isSw ? "Partner amesajiliwa!" : "Partner registered!"}
              </p>
              <p className="mt-1 text-xs text-emerald-200">
                {registered.name} • {registered.transportType} • @
                {registered.username}
              </p>
              <Link
                href="/partner/login"
                className="mt-2 inline-flex text-xs font-semibold text-emerald-300 underline"
              >
                {isSw
                  ? "Nenda kwenye Partner Login →"
                  : "Go to Partner Login →"}
              </Link>
            </div>
          ) : null}

          {error ? (
            <div className="mt-5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-200">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-5 space-y-5">
            <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
              <h2 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-amber-300">
                <ShieldCheck className="h-4 w-4" />
                {isSw ? "Uthibitisho wa Admin" : "Admin authorization"}
              </h2>
              <p className="mt-1 text-[11px] text-slate-400">
                {isSw
                  ? "Weka vitambulisho vya Admin ili kuwezesha usajili."
                  : "Enter your admin credentials to unlock partner registration."}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>
                  {isSw ? "Jina la Admin" : "Admin username"}
                  <input
                    name="adminUsername"
                    type="text"
                    autoComplete="username"
                    required
                    placeholder="admin504"
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  {isSw ? "Nenosiri la Admin" : "Admin password"}
                  <input
                    name="adminPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                    placeholder="••••••••"
                    className={inputClass}
                  />
                </label>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-300">
                <KeyRound className="h-4 w-4" />
                {isSw ? "Vitambulisho vya Partner" : "Partner credentials"}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>
                  {isSw ? "Jina la mtumiaji" : "Partner username"}
                  <input
                    name="username"
                    type="text"
                    required
                    minLength={3}
                    maxLength={40}
                    placeholder="hassan_boda"
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  {isSw ? "Nenosiri" : "Password"}
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    className={inputClass}
                  />
                </label>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-slate-300">
                <UserRound className="h-4 w-4" />
                {isSw ? "Taarifa Kamili za Operator" : "Full operator information"}
              </h2>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>
                  {isSw ? "Jina kamili" : "Full name"}
                  <input
                    name="fullName"
                    type="text"
                    required
                    placeholder="Hassan Ali"
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  {isSw ? "Namba ya simu" : "Phone number"}
                  <input
                    name="phone"
                    type="tel"
                    required
                    placeholder="+255770123456"
                    className={inputClass}
                  />
                </label>
              </div>

              <div>
                <span className={labelClass}>
                  {isSw ? "Aina ya chombo" : "Transport type"}
                </span>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTransportType("BODABODA")}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                      transportType === "BODABODA"
                        ? "border-teal-500 bg-teal-600 text-white"
                        : "border-slate-700 bg-slate-950 text-slate-300"
                    }`}
                  >
                    <Bike className="h-4 w-4" />
                    {isSw ? "Bodaboda Rider" : "Bodaboda Rider"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransportType("BAJAJI")}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                      transportType === "BAJAJI"
                        ? "border-amber-500 bg-amber-500 text-slate-950"
                        : "border-slate-700 bg-slate-950 text-slate-300"
                    }`}
                  >
                    <CarFront className="h-4 w-4" />
                    {isSw ? "Bajaji Driver" : "Bajaji Driver"}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>
                  {isSw ? "Namba ya chombo (Z...)" : "Plate number (Z...)"}
                  <input
                    name="plateNumber"
                    type="text"
                    required
                    placeholder="Z 104 AAB"
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  {isSw ? "Kituo cha nyumbani" : "Home kituo"}
                  <input
                    name="homeKituo"
                    type="text"
                    required
                    placeholder="Darajani / Creek Road Stage"
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>
                  {isSw ? "Namba ya NIDA / ZanID" : "National ID (NIDA / ZanID)"}
                  <input
                    name="nationalIdNo"
                    type="text"
                    required
                    placeholder="19900101-12345-00001-12"
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  {isSw ? "Namba ya leseni" : "License number"}
                  <input
                    name="licenseNo"
                    type="text"
                    required
                    placeholder="ZN-A-48219"
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>
                  {isSw ? "Leseni inaisha" : "License expiry"}
                  <input
                    name="licenseExpiry"
                    type="date"
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  {isSw ? "Bima inaisha" : "Insurance expiry"}
                  <input
                    name="insuranceExpiry"
                    type="date"
                    className={inputClass}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>
                  {isSw ? "Modeli ya chombo" : "Vehicle model"}
                  <input
                    name="vehicleModel"
                    type="text"
                    required
                    placeholder="Honda CG 125"
                    className={inputClass}
                  />
                </label>
                <label className={labelClass}>
                  {isSw ? "Rangi ya chombo" : "Vehicle color"}
                  <input
                    name="vehicleColor"
                    type="text"
                    required
                    placeholder="Red"
                    className={inputClass}
                  />
                </label>
              </div>

              <label className={labelClass}>
                {isSw
                  ? "Namba ya malipo (Mobile Money)"
                  : "Payout mobile number"}
                <input
                  name="payoutMobileNumber"
                  type="tel"
                  required
                  placeholder="+255770123456"
                  className={inputClass}
                />
              </label>

              {transportType === "BODABODA" ? (
                <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs font-semibold text-slate-200">
                  <input
                    name="helmetVerified"
                    type="checkbox"
                    defaultChecked
                    className="h-4 w-4 accent-teal-600"
                  />
                  {isSw
                    ? "Helmeti 2 safi zimehakikiwa"
                    : "2 clean helmets verified"}
                </label>
              ) : null}
            </section>

            <Button
              type="submit"
              variant="amber"
              size="lg"
              className="w-full"
              disabled={busy}
            >
              <ShieldCheck className="h-4 w-4" />
              {busy
                ? isSw
                  ? "Inasajili..."
                  : "Registering..."
                : isSw
                  ? "Sajili Partner"
                  : "Register Partner"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
