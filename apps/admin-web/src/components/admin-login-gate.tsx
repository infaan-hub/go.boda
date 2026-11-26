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
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-10 text-white">
      <div className="mb-6 flex w-full max-w-sm items-center justify-between">
        <BrandLogo
          dark
          subtitle={isSw ? "Msimamizi" : "Admin"}
        />
        <LanguageSwitchLink
          currentLocale={locale}
          hrefSw="/admin/login?lang=sw"
          hrefEn="/admin/login?lang=en"
        />
      </div>

      <Card className="w-full max-w-sm border-slate-800 bg-slate-900 p-6 text-white">
        <h1 className="text-lg font-bold text-white">
          {isSw ? "Ingia Msimamizi" : "Admin Sign In"}
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          {isSw
            ? "Weka jina la mtumiaji na nenosiri."
            : "Enter your username and password."}
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
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 focus-within:border-teal-500">
              <UserRound className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isSw ? "Jina la mtumiaji" : "Username"}
                className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-300">
              {isSw ? "Nenosiri" : "Password"}
            </span>
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 focus-within:border-teal-500">
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
            variant="primary"
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
      </Card>
    </div>
  );
}
