"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { KeyRound, ShieldCheck, UserRound } from "lucide-react";
import {
  LanguageSwitchLink,
  VerticalAuthInput,
  VerticalAuthShell,
  VerticalAuthSubmit,
} from "@goboda/ui";

export function CustomerLoginForm() {
  const router = useRouter();
  const locale: "sw" | "en" = useLocale() === "sw" ? "sw" : "en";
  const isSw = locale === "sw";

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
    <VerticalAuthShell
      eyebrow={isSw ? "USAFIRI WA UNGUJA" : "BODABODA • BAJAJI • UNGUJA"}
      headlineTop={isSw ? "Pata Usafiri." : "Find Your Ride."}
      headlineBottom="Go.Boda"
      canopySubtitle={
        isSw
          ? "Agiza Bodaboda na Bajaji kwa nauli ya wazi popote Unguja."
          : "Upfront TZS rides from Stone Town to Paje, Airport & Nungwi."
      }
      topRight={
        <LanguageSwitchLink
          dark
          currentLocale={locale}
          hrefSw="/login?lang=sw"
          hrefEn="/login?lang=en"
        />
      }
      formTitle={isSw ? "Ingia Mteja" : "Customer Sign In"}
      formSubtitle={
        isSw
          ? "Weka simu, jina la mtumiaji au barua pepe na nenosiri."
          : "Enter your phone, username, or email and password."
      }
      error={error}
      footer={
        <div className="space-y-2">
          <p className="text-xs font-medium text-[#17645F]/75">
            {isSw ? "Huna akaunti bado?" : "New to Go.boda?"}{" "}
            <Link
              href="/register"
              className="font-bold text-[#17645F] underline underline-offset-4 hover:text-[#114E4A]"
            >
              {isSw ? "Fungua akaunti" : "Create account"}
            </Link>
          </p>
          <p className="inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-[#17645F]/65">
            <ShieldCheck className="h-3.5 w-3.5 text-[#17645F]" />
            <span>
              {isSw
                ? "Kikao salama cha abiria Go.boda"
                : "Protected Go.boda Rider Session"}
            </span>
          </p>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <VerticalAuthInput
          label={
            isSw
              ? "Simu / Jina la Mtumiaji"
              : "Phone / Username / Email"
          }
          icon={<UserRound className="h-4 w-4" />}
          type="text"
          autoComplete="username"
          enterKeyHint="next"
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="+255770123456"
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
