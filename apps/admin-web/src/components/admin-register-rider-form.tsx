"use client";

import * as React from "react";
import { Bike, CarFront, KeyRound, ShieldCheck, UserRound, X } from "lucide-react";
import { Button, Card } from "@goboda/ui";

interface RegisteredRider {
  username: string;
  name: string;
  role: string;
  transportType: string;
}

export function AdminRegisterRiderForm({
  onRegistered,
  onClose,
}: {
  onRegistered: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [transportType, setTransportType] = React.useState<"BODABODA" | "BAJAJI">(
    "BODABODA"
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [registered, setRegistered] = React.useState<RegisteredRider | null>(
    null
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formElement = e.currentTarget;
    setBusy(true);
    setError(null);
    const form = new FormData(formElement);

    const payload = {
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
      const res = await fetch("/api/ops/operators/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        registered?: boolean;
        rider?: RegisteredRider;
        error?: string;
        message?: string;
        details?: { fieldErrors?: Record<string, string[] | undefined> };
      };
      if (!res.ok || !json.registered || !json.rider) {
        const fieldMessages = json.details?.fieldErrors
          ? Object.entries(json.details.fieldErrors)
              .flatMap(([k, errs]) => (errs ?? []).map((msg) => `${k}: ${msg}`))
              .join(" • ")
          : "";
        setError(
          json.message || fieldMessages || json.error || "Registration failed."
        );
        return;
      }
      setRegistered(json.rider);
      formElement.reset();
      await onRegistered();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-[#17645F]/25 bg-[#FAF7F2] px-3 py-2.5 text-sm text-[#122927] placeholder:text-[#17645F]/45 focus:border-[#17645F] focus:outline-none";
  const labelClass = "block text-xs font-semibold text-[#122927]/85";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#122927]/65 p-4">
      <Card className="relative my-6 w-full max-w-2xl p-5 sm:p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-[#17645F]/70 hover:bg-[#EDE7DF]"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#B86B2B]/10 text-[#B86B2B]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-[#122927]">
              Register a Rider-Driver
            </h2>
            <p className="text-xs text-[#17645F]/70">
              Admin-only. Account is auto-approved and ready to sign in.
            </p>
          </div>
        </div>

        {registered ? (
          <div className="mt-4 rounded-2xl border border-[#17645F]/25 bg-[#17645F]/10 p-4 text-sm text-[#17645F]">
            <p className="flex items-center gap-2 font-bold">
              <ShieldCheck className="h-4 w-4" />
              Rider-Driver registered!
            </p>
            <p className="mt-1 text-xs text-[#17645F]">
              {registered.name} • {registered.transportType} • @{registered.username}
            </p>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-[#A93232]/25 bg-[#A93232]/10 px-3.5 py-2.5 text-xs font-medium text-[#A93232]">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-[#17645F]/70">
              <KeyRound className="h-4 w-4" />
              Rider-Driver credentials
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Username
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
                Password
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
            <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-[#17645F]/70">
              <UserRound className="h-4 w-4" />
              Full operator information
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Full name
                <input
                  name="fullName"
                  type="text"
                  required
                  placeholder="Hassan Ali"
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Phone number
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
              <span className={labelClass}>Transport type</span>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTransportType("BODABODA")}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                    transportType === "BODABODA"
                      ? "border-[#17645F] bg-[#17645F] text-white"
                      : "border-[#17645F]/25 bg-[#FAF7F2] text-[#122927]/85"
                  }`}
                >
                  <Bike className="h-4 w-4" />
                  Bodaboda Rider
                </button>
                <button
                  type="button"
                  onClick={() => setTransportType("BAJAJI")}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                    transportType === "BAJAJI"
                      ? "border-[#B86B2B] bg-[#B86B2B] text-[#122927]"
                      : "border-[#17645F]/25 bg-[#FAF7F2] text-[#122927]/85"
                  }`}
                >
                  <CarFront className="h-4 w-4" />
                  Bajaji Driver
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Plate number (Z...)
                <input
                  name="plateNumber"
                  type="text"
                  required
                  placeholder="Z 104 AAB"
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Home kituo
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
                National ID (NIDA / ZanID)
                <input
                  name="nationalIdNo"
                  type="text"
                  required
                  placeholder="19900101-12345-00001-12"
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                License number
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
                License expiry
                <input
                  name="licenseExpiry"
                  type="date"
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Insurance expiry
                <input
                  name="insuranceExpiry"
                  type="date"
                  className={inputClass}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Vehicle model
                <input
                  name="vehicleModel"
                  type="text"
                  required
                  placeholder="Honda CG 125"
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Vehicle color
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
              Payout mobile number (optional — defaults to Phone)
              <input
                name="payoutMobileNumber"
                type="tel"
                placeholder="+255770123456"
                className={inputClass}
              />
            </label>

            {transportType === "BODABODA" ? (
              <label className="flex items-center gap-2 rounded-xl border border-[#17645F]/15 bg-[#F3EEE8] px-3 py-2.5 text-xs font-semibold text-[#122927]/85">
                <input
                  name="helmetVerified"
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 accent-[#17645F]"
                />
                2 clean helmets verified
              </label>
            ) : null}
          </section>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" size="lg" disabled={busy}>
              <ShieldCheck className="h-4 w-4" />
              {busy ? "Registering..." : "Register Rider-Driver"}
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
