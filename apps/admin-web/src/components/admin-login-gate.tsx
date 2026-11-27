"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { KeyRound, ShieldCheck, UserRound } from "lucide-react";
import {
  LanguageSwitchLink,
  VerticalAuthInput,
  VerticalAuthShell,
  VerticalAuthSubmit,
} from "@goboda/ui";

export interface AuthenticatedAdmin {
  id: string;
  phone: string;
  name: string;
  role: "ADMIN";
}

export function AdminLoginGate() {
  const router = useRouter();
  const locale: "sw" | "en" = useLocale() === "sw" ? "sw" : "en";
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
    <VerticalAuthShell
      eyebrow={isSw ? "USIMAMIZI WA UNGUJA" : "ZANZIBAR OPERATIONS"}
      headlineTop="Every Ride"
      headlineBottom="Go.Boda"
      canopySubtitle={
        isSw
          ? "Simamia Bodaboda, Bajaji, KYC na usalama Unguja nzima."
          : "Live fleet control, KYC verification & safety across Unguja."
      }
      topRight={
        <LanguageSwitchLink
          dark
          currentLocale={locale}
          hrefSw="/admin/login?lang=sw"
          hrefEn="/admin/login?lang=en"
        />
      }
      formTitle={isSw ? "Ingia Msimamizi" : "Admin Sign In"}
      formSubtitle={
        isSw
          ? "Weka jina la mtumiaji na nenosiri kuendelea."
          : "Enter your username and password to continue."
      }
      error={error}
      footer={
        <p className="inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-[#17645F]/70">
          <ShieldCheck className="h-3.5 w-3.5 text-[#17645F]" />
          <span>
            {isSw
              ? "Kikao salama cha Go.boda Operations"
              : "Protected Go.boda Operations Session"}
          </span>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <VerticalAuthInput
          label={isSw ? "Jina la Mtumiaji" : "Username"}
          icon={<UserRound className="h-4 w-4" />}
          type="text"
          autoComplete="username"
          enterKeyHint="next"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={isSw ? "Weka jina la mtumiaji" : "Enter your username"}
        />

        <VerticalAuthInput
          label={isSw ? "Nenosiri" : "Password"}
          icon={<KeyRound className="h-4 w-4" />}
          type="password"
          autoComplete="current-password"
          enterKeyHint="done"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />

        <div className="pt-2">
          <VerticalAuthSubmit
            busy={busy}
            label={isSw ? "Ingia" : "Sign In"}
            busyLabel={isSw ? "Inaingia..." : "Signing in..."}
          />
        </div>
      </form>
    </VerticalAuthShell>
  );
}
