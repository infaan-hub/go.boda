"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { KeyRound, Lock, ShieldCheck, UserRound } from "lucide-react";
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

  const [username, setUsername] = React.useState("admin504");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = (await res.json()) as {
        authenticated?: boolean;
        admin?: AuthenticatedAdmin;
        error?: string;
        message?: string;
      };
      if (!res.ok || !json.authenticated || !json.admin) {
        setError(
          json.message ||
            json.error ||
            (isSw
              ? "Jina la mtumiaji au nenosiri si sahihi."
              : "Invalid username or password.")
        );
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
                  ? "Ingia kwa jina la mtumiaji na nenosiri"
                  : "Sign in with your admin username and password"}
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

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-300">
              {isSw ? "Jina la Mtumiaji" : "Admin Username"}
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 focus-within:border-teal-500">
              <UserRound className="h-4 w-4 text-teal-400" />
              <input
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin504"
                className="w-full bg-transparent font-mono text-sm text-white placeholder:text-slate-500 focus:outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-300">
              {isSw ? "Nenosiri" : "Password"}
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 focus-within:border-amber-400">
              <KeyRound className="h-4 w-4 text-amber-400" />
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none"
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

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-[11px] text-slate-400">
            <p className="font-semibold text-slate-300">
              {isSw ? "Vitambulisho vya Pilot" : "Pilot credentials"}
            </p>
            <p className="mt-0.5 font-mono text-teal-300">
              admin504 / Admin009@504
            </p>
            <p className="mt-1">
              {isSw
                ? "Baada ya kuthibitishwa utaelekezwa /admin/dashboard."
                : "A signed HttpOnly JWT session redirects you to /admin/dashboard."}
            </p>
          </div>
        </form>
      </Card>
    </div>
  );
}
