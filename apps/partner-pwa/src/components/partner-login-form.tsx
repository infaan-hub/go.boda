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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F3EEE8] px-4 py-10 text-[#122927]">
      <div className="mb-8 w-full max-w-sm">
        <BrandLogo subtitle={isSw ? "Rider & Dereva" : "Rider-Driver"} />
      </div>

      <div className="mb-6 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-[#17645F]/75">
          BODABODA RIDER • BAJAJI DRIVER
        </p>
        <h1 className="mt-1 font-display text-5xl uppercase leading-none text-[#17645F]">
          {isSw ? "ENDESHA UNGUJA" : "DRIVE UNGUJA"}
        </h1>
      </div>

      <Card className="w-full max-w-sm border-[#17645F]/15 bg-[#FAF7F2] p-6 sm:p-7">
        <h2 className="text-base font-extrabold uppercase tracking-[0.14em] text-[#17645F]">
          {isSw ? "Ingia Kwenye Zamu" : "Operator Sign In"}
        </h2>
        <p className="mt-1 text-xs text-[#17645F]/70">
          {isSw
            ? "Bodaboda Rider au Bajaji Driver"
            : "Bodaboda Rider or Bajaji Driver"}
        </p>

        {error ? (
          <div className="mt-4 rounded-2xl border border-[#A93232]/25 bg-[#A93232]/10 px-3.5 py-2.5 text-xs font-semibold text-[#A93232]">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#17645F]/80">
              {isSw ? "Jina la Mtumiaji" : "Username"}
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3.5 py-2.5 focus-within:border-[#17645F] focus-within:bg-[#FAF7F2]">
              <UserRound className="h-4 w-4 text-[#17645F]" />
              <input
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isSw ? "mfano: hassan_boda" : "e.g. hassan_boda"}
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
            {busy
              ? isSw
                ? "Inaingia..."
                : "Signing in..."
              : isSw
                ? "Ingia"
                : "Sign In"}
          </Button>
        </form>

        <p className="mt-5 text-center text-xs text-[#17645F]/75">
          {isSw
            ? "Akaunti za Rider-Driver husajiliwa na Go.boda Admin."
            : "Rider-Driver accounts are registered by Go.boda Admin."}
        </p>
      </Card>
    </div>
  );
}
