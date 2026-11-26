"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { KeyRound, UserRound } from "lucide-react";
import { BrandLogo, Button, Card, LanguageSwitchLink } from "@goboda/ui";

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

  const [username, setUsername] = React.useState("");
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F3EEE8] px-4 py-10 text-[#122927]">
      <div className="mb-8 flex w-full max-w-sm items-center justify-between">
        <BrandLogo subtitle={isSw ? "Msimamizi" : "Admin"} />
        <LanguageSwitchLink
          currentLocale={locale}
          hrefSw="/admin/login?lang=sw"
          hrefEn="/admin/login?lang=en"
        />
      </div>

      <div className="mb-6 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-[#17645F]/75">
          ZANZIBAR OPERATIONS CONSOLE
        </p>
        <h1 className="mt-1 font-display text-5xl uppercase leading-none text-[#17645F]">
          {isSw ? "ONGOZA UNGUJA" : "RUN UNGUJA"}
        </h1>
      </div>

      <Card className="w-full max-w-sm border-[#17645F]/15 bg-[#FAF7F2] p-6 sm:p-7">
        <h2 className="text-base font-extrabold uppercase tracking-[0.14em] text-[#17645F]">
          {isSw ? "Ingia Msimamizi" : "Admin Sign In"}
        </h2>
        <p className="mt-1 text-xs text-[#17645F]/70">
          {isSw
            ? "Weka jina la mtumiaji na nenosiri."
            : "Enter your username and password."}
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
                placeholder={isSw ? "Jina la mtumiaji" : "Username"}
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
      </Card>
    </div>
  );
}
