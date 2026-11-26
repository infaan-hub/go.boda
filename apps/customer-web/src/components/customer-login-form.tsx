"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { BrandLogo, Button, Card } from "@goboda/ui";

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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F3EEE8] px-4 py-10 text-[#122927]">
      <div className="mb-8 flex w-full max-w-md items-center justify-between">
        <BrandLogo
          subtitle={isSw ? "Karibu tena Unguja" : "Welcome back to Unguja"}
        />
        <Link
          href="/register"
          className="rounded-full border border-[#17645F]/40 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#17645F] transition hover:bg-[#17645F] hover:text-[#F3EEE8]"
        >
          {isSw ? "Sajili" : "Sign Up"}
        </Link>
      </div>

      <div className="mb-6 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-[#17645F]/75">
          BODABODA • BAJAJI • UNGUJA
        </p>
        <h1 className="mt-1 font-display text-5xl uppercase leading-none tracking-tight text-[#17645F]">
          {isSw ? "INGIA GO.BODA" : "RIDE UNGUJA"}
        </h1>
      </div>

      <Card className="w-full max-w-md border-[#17645F]/15 bg-[#FAF7F2] p-6 sm:p-7">
        <h2 className="text-base font-extrabold uppercase tracking-[0.12em] text-[#17645F]">
          {isSw ? "Ingia Akaunti" : "Sign In"}
        </h2>
        <p className="mt-1 text-xs text-[#17645F]/70">
          {isSw
            ? "Ingia kwa namba ya simu na nenosiri"
            : "Sign in with your phone number and password"}
        </p>

        {error ? (
          <div className="mt-4 rounded-2xl border border-[#A93232]/25 bg-[#A93232]/10 px-3.5 py-2.5 text-xs font-semibold text-[#A93232]">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#17645F]/80">
              {isSw ? "Namba ya Simu au Username" : "Phone Number or Username"}
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3.5 py-2.5 focus-within:border-[#17645F] focus-within:bg-[#FAF7F2]">
              <UserRound className="h-4 w-4 text-[#17645F]" />
              <input
                type="text"
                autoComplete="username"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="+255770123456"
                className="w-full bg-transparent text-sm text-[#122927] placeholder:text-[#17645F]/40 focus:outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#17645F]/80">
              {isSw ? "Nenosiri" : "Password"}
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3.5 py-2.5 focus-within:border-[#17645F] focus-within:bg-[#FAF7F2]">
              <KeyRound className="h-4 w-4 text-[#17645F]" />
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-transparent text-sm text-[#122927] placeholder:text-[#17645F]/40 focus:outline-none"
              />
            </div>
          </label>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full uppercase tracking-[0.14em]"
            disabled={busy}
          >
            <ShieldCheck className="h-4 w-4" />
            {busy
              ? isSw
                ? "Inathibitisha..."
                : "Signing in..."
              : isSw
                ? "Ingia Sasa"
                : "Sign In"}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-[#17645F]/75">
          {isSw ? "Huna akaunti?" : "New to Go.boda?"}{" "}
          <Link
            href="/register"
            className="font-bold text-[#17645F] underline underline-offset-4 hover:text-[#114E4A]"
          >
            {isSw ? "Sajili akaunti ya Mteja" : "Create a customer account"}
          </Link>
        </p>
      </Card>
    </div>
  );
}
