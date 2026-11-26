"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { KeyRound, Lock, Phone, ShieldCheck } from "lucide-react";
import { Badge, BrandLogo, Button, Card, LanguageSwitchLink } from "@goboda/ui";

export interface AuthenticatedAdmin {
  id: string;
  phone: string;
  name: string;
  role: "ADMIN";
}

export function AdminLoginGate() {
  const router = useRouter();
  const locale = useLocale() === "sw" ? "sw" : "en";
  const isSw = locale === "sw";

  const [step, setStep] = React.useState<"phone" | "otp">("phone");
  const [phone, setPhone] = React.useState("+255770000112");
  const [code, setCode] = React.useState("");
  const [pilotOtpHint, setPilotOtpHint] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/auth/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, channel: "WHATSAPP" }),
      });
      const json = (await res.json()) as {
        sent?: boolean;
        pilotOtp?: string;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(json.message || json.error || "Failed to request OTP");
        return;
      }
      if (json.pilotOtp) {
        setPilotOtpHint(json.pilotOtp);
        setCode(json.pilotOtp);
      } else {
        setPilotOtpHint(null);
      }
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/auth/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const json = (await res.json()) as {
        authenticated?: boolean;
        admin?: AuthenticatedAdmin;
        error?: string;
        message?: string;
      };
      if (!res.ok || !json.authenticated || !json.admin) {
        setError(json.message || json.error || "Invalid OTP code");
        return;
      }
      router.replace("/admin/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <div className="mb-6 flex w-full max-w-md items-center justify-between">
        <BrandLogo
          dark
          subtitle={isSw ? "Msimamizi wa Operesheni" : "Operations Admin"}
        />
        <LanguageSwitchLink
          currentLocale={locale}
          hrefSw="/admin/login?lang=sw"
          hrefEn="/admin/login?lang=en"
        />
      </div>

      <Card className="w-full max-w-md border-slate-800 bg-slate-900 p-6 text-white shadow-2xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700/20 text-teal-400">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white">
                {isSw
                  ? "Ingia — Kituo cha Operesheni"
                  : "Operations Command Sign-In"}
              </h1>
              <p className="text-xs text-slate-400">
                {isSw
                  ? "Uhakiki wa OTP kwa Wasimamizi wa Unguja pekee"
                  : "Verified Unguja Operations Admin OTP Gate"}
              </p>
            </div>
          </div>
          <Badge tone="amber">ADMIN</Badge>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-200">
            {error}
          </div>
        ) : null}

        {step === "phone" ? (
          <form onSubmit={requestOtp} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs font-semibold text-slate-300">
                {isSw
                  ? "Namba ya Simu ya Msimamizi (+255...)"
                  : "Admin Phone Number (+255...)"}
              </span>
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 focus-within:border-teal-500">
                <Phone className="h-4 w-4 text-teal-400" />
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+255770000112"
                  className="w-full bg-transparent font-mono text-sm text-white placeholder:text-slate-500 focus:outline-none"
                />
              </div>
            </label>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={busy}
            >
              <ShieldCheck className="h-4 w-4" />
              {busy
                ? isSw
                  ? "Inatuma OTP..."
                  : "Sending OTP..."
                : isSw
                  ? "Omba Msimbo wa OTP (WhatsApp)"
                  : "Request Admin OTP (WhatsApp)"}
            </Button>

            <p className="text-center text-[11px] text-slate-500">
              {isSw
                ? "Baada ya uthibitisho utaelekezwa moja kwa moja /admin/dashboard."
                : "Redirects to /admin/dashboard with a signed HttpOnly JWT session."}
            </p>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="mt-5 space-y-4">
            <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 px-3.5 py-2.5 text-xs text-teal-200">
              {isSw
                ? `Msimbo wa tarakimu 6 umetumwa kwa ${phone}.`
                : `6-digit verification code sent to ${phone}.`}
              {pilotOtpHint ? (
                <div className="mt-1 font-mono font-bold text-amber-300">
                  Pilot OTP: {pilotOtpHint}
                </div>
              ) : null}
            </div>

            <label className="block">
              <span className="text-xs font-semibold text-slate-300">
                {isSw ? "Weka Msimbo wa Tarakimu 6" : "Enter 6-Digit OTP Code"}
              </span>
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 focus-within:border-amber-400">
                <KeyRound className="h-4 w-4 text-amber-400" />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full bg-transparent font-mono text-lg font-bold tracking-[0.3em] text-white placeholder:text-slate-600 focus:outline-none"
                />
              </div>
            </label>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={() => {
                  setStep("phone");
                  setCode("");
                  setError(null);
                }}
              >
                {isSw ? "Rudi" : "Back"}
              </Button>
              <Button
                type="submit"
                variant="amber"
                size="md"
                className="flex-1"
                disabled={busy || code.length !== 6}
              >
                {busy
                  ? isSw
                    ? "Inathibitisha..."
                    : "Verifying..."
                  : isSw
                    ? "Thibitisha na Fungua Dashboard"
                    : "Verify & Go to Dashboard"}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
