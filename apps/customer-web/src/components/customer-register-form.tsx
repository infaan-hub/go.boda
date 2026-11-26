"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { KeyRound, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { BrandLogo, Button, Card } from "@goboda/ui";

export function CustomerRegisterForm() {
  const router = useRouter();
  const isSw = useLocale() === "sw";

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(
        isSw
          ? "Nenosiri lazima liwe na angalau herufi 8."
          : "Password must be at least 8 characters."
      );
      return;
    }
    if (password !== confirm) {
      setError(isSw ? "Manenosiri hayafanani." : "Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/customer/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          password,
          language: isSw ? "sw" : "en",
        }),
      });
      const json = (await res.json()) as {
        registered?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !json.registered) {
        setError(
          json.message ||
            json.error ||
            (isSw ? "Usajili umeshindikana." : "Registration failed.")
        );
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="mb-6 flex w-full max-w-md items-center justify-between">
        <BrandLogo
          subtitle={isSw ? "Karibu Go.boda Unguja" : "Welcome to Go.boda Unguja"}
        />
        <Link
          href="/login"
          className="text-xs font-semibold text-teal-700 hover:underline"
        >
          {isSw ? "Ingia" : "Sign in"}
        </Link>
      </div>

      <Card className="w-full max-w-md p-6">
        <h1 className="text-lg font-bold text-slate-900">
          {isSw ? "Fungua Akaunti" : "Create Account"}
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          {isSw
            ? "Agiza Bodaboda na Bajaji popote Unguja"
            : "Book Bodaboda and Bajaji across Unguja"}
        </p>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              {isSw ? "Jina Kamili" : "Full Name"}
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 focus-within:border-teal-600">
              <UserRound className="h-4 w-4 text-teal-700" />
              <input
                type="text"
                autoComplete="name"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isSw ? "Amina Juma" : "Amina Juma"}
                className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              {isSw ? "Namba ya Simu" : "Phone Number"}
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 focus-within:border-teal-600">
              <Smartphone className="h-4 w-4 text-teal-700" />
              <input
                type="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+255770123456"
                className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              {isSw ? "Nenosiri" : "Password"}
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 focus-within:border-teal-600">
              <KeyRound className="h-4 w-4 text-teal-700" />
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSw ? "Angalau herufi 8" : "At least 8 characters"}
                className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              {isSw ? "Rudia Nenosiri" : "Confirm Password"}
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 focus-within:border-teal-600">
              <KeyRound className="h-4 w-4 text-teal-700" />
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
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
                ? "Inasajili..."
                : "Creating account..."
              : isSw
                ? "Sajili na Ingia"
                : "Create Account & Sign In"}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-500">
          {isSw ? "Tayari una akaunti?" : "Already have an account?"}{" "}
          <Link href="/login" className="font-semibold text-teal-700 hover:underline">
            {isSw ? "Ingia" : "Sign in"}
          </Link>
        </p>
      </Card>
    </div>
  );
}
