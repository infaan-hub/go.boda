"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { KeyRound, UserRound } from "lucide-react";
import { BrandLogo, Button, Card } from "@goboda/ui";

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
      <div className="mb-6 w-full max-w-sm">
        <BrandLogo dark subtitle={isSw ? "Rider & Dereva" : "Rider-Driver"} />
      </div>

      <Card className="w-full max-w-sm border-slate-800 bg-slate-900 p-6 text-white">
        <h1 className="text-lg font-bold text-white">
          {isSw ? "Ingia" : "Sign In"}
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          {isSw
            ? "Bodaboda Rider au Bajaji Driver"
            : "Bodaboda Rider or Bajaji Driver"}
        </p>

        {error ? (
          <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-300">
              {isSw ? "Jina la Mtumiaji" : "Username"}
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 focus-within:border-amber-400">
              <UserRound className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isSw ? "mfano: hassan_boda" : "e.g. hassan_boda"}
                className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-300">
              {isSw ? "Nenosiri" : "Password"}
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 focus-within:border-amber-400">
              <KeyRound className="h-4 w-4 text-slate-400" />
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
            {busy
              ? isSw
                ? "Inaingia..."
                : "Signing in..."
              : isSw
                ? "Ingia"
                : "Sign In"}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-slate-400">
          {isSw
            ? "Akaunti za Rider-Driver husajiliwa na Go.boda Admin."
            : "Rider-Driver accounts are registered by Go.boda Admin."}
        </p>
      </Card>
    </div>
  );
}
