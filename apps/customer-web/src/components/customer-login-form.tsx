"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { KeyRound, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { Badge, BrandLogo, Button, Card } from "@goboda/ui";

export function CustomerLoginForm() {
  const router = useRouter();
  const isSw = useLocale() === "sw";

  const [identifier, setIdentifier] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/customer/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const json = (await res.json()) as {
        authenticated?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !json.authenticated) {
        setError(
          json.message ||
            json.error ||
            (isSw
              ? "Namba ya simu au nenosiri si sahihi."
              : "Invalid phone/username or password.")
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
          subtitle={isSw ? "Karibu tena Unguja" : "Welcome back to Unguja"}
        />
        <Link
          href="/register"
          className="text-xs font-semibold text-teal-700 hover:underline"
        >
          {isSw ? "Sajili akaunti" : "Create account"}
        </Link>
      </div>

      <Card className="w-full max-w-md p-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900">
                {isSw ? "Ingia — Mteja" : "Customer Sign-In"}
              </h1>
              <p className="text-xs text-slate-500">
                {isSw
                  ? "Ingia kwa namba ya simu na nenosiri"
                  : "Sign in with your phone number and password"}
              </p>
            </div>
          </div>
          <Badge tone="teal">CUSTOMER</Badge>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">
              {isSw ? "Namba ya Simu au Username" : "Phone Number or Username"}
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 focus-within:border-teal-600">
              <UserRound className="h-4 w-4 text-teal-700" />
              <input
                type="text"
                autoComplete="username"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
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
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
                ? "Inathibitisha..."
                : "Signing in..."
              : isSw
                ? "Ingia kwenye Dashboard"
                : "Sign In to Dashboard"}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-500">
          {isSw ? "Huna akaunti?" : "New to Go.boda?"}{" "}
          <Link href="/register" className="font-semibold text-teal-700 hover:underline">
            {isSw ? "Sajili akaunti ya Mteja" : "Create a customer account"}
          </Link>
        </p>
      </Card>
    </div>
  );
}
