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

export function PartnerLoginForm() {
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
    <VerticalAuthShell
      eyebrow="BODABODA RIDER • BAJAJI DRIVER"
      headlineTop={isSw ? "Endesha Na" : "Drive With"}
      headlineBottom="Go.Boda"
      canopySubtitle={
        isSw
          ? "Ingia kazini, pokea safari za karibu na fuatilia kipato chako."
          : "Go online, accept nearby trips & track your TZS earnings."
      }
      topRight={
        <LanguageSwitchLink
          dark
          currentLocale={locale}
          hrefSw="/partner/login?lang=sw"
          hrefEn="/partner/login?lang=en"
        />
      }
      formTitle={isSw ? "Ingia Kwenye Zamu" : "Operator Sign In"}
      formSubtitle={
        isSw
          ? "Kwa Bodaboda Rider na Bajaji Driver waliosajiliwa."
          : "For verified Bodaboda Riders & Bajaji Drivers."
      }
      error={error}
      footer={
        <p className="inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-[#17645F]/70">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[#17645F]" />
          <span>
            {isSw
              ? "Akaunti za Rider-Driver husajiliwa na Go.boda Ops."
              : "Rider-Driver accounts are onboarded by Go.boda Ops."}
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
          placeholder={isSw ? "mfano: hassan_boda" : "e.g. hassan_boda"}
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
            label={isSw ? "Ingia Kazini" : "Sign In"}
            busyLabel={isSw ? "Inaingia..." : "Signing in..."}
          />
        </div>
      </form>
    </VerticalAuthShell>
  );
}
