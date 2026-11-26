"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Bike, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { Badge, BrandLogo, Button, Card } from "@goboda/ui";

export function PartnerLoginForm() {
  const router = useRouter();
  const isSw = useLocale() === "sw";

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/partner/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
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
              ? "Jina la mtumiaji au nenosiri si sahihi."
              : "Invalid username or password.")
        );
        return;
      }
      router.replace("/partner/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <div className="mb-6 w-full max-w-md">
        <BrandLogo
          dark
          subtitle={
            isSw
              ? "Rider & Driver — Go.boda Partner"
              : "Rider & Driver — Go.boda Partner"
          }
        />
      </div>

      <Card className="w-full max-w-md border-slate-800 bg-slate-900 p-6 text-white shadow-2xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
              <Bike className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white">
                {isSw ? "Ingia — Partner" : "Partner Sign-In"}
              </h1>
              <p className="text-xs text-slate-400">
                {isSw
                  ? "Bodaboda Rider au Bajaji Driver"
                  : "Bodaboda Rider or Bajaji Driver"}
              </p>
            </div>
          </div>
          <Badge tone="amber">PARTNER</Badge>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-200">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-slate-300">
              {isSw ? "Jina la Mtumiaji" : "Partner Username"}
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 focus-within:border-amber-400">
              <UserRound className="h-4 w-4 text-amber-400" />
              <input
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isSw ? "mfano: hassan_boda" : "e.g. hassan_boda"}
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
            variant="amber"
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

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-[11px] text-slate-400">
          <p>
            {isSw
              ? "Akaunti za Partner husajiliwa na Go.boda Admin pekee."
              : "Partner accounts are registered by Go.boda Admin only."}
          </p>
          <Link
            href="/partner/register"
            className="mt-1 inline-flex font-semibold text-amber-300 hover:underline"
          >
            {isSw
              ? "Admin: Sajili Partner Mpya →"
              : "Admin: Register a new Partner →"}
          </Link>
        </div>
      </Card>
    </div>
  );
}
