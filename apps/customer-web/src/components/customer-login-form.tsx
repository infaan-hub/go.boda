"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { KeyRound, UserRound } from "lucide-react";
import {
  VerticalAuthInput,
  VerticalAuthShell,
  VerticalAuthSubmit,
} from "@goboda/ui";

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
    <VerticalAuthShell
      eyebrow="BODABODA • BAJAJI • UNGUJA"
      headlineTop={isSw ? "INGIA" : "RIDE"}
      headlineBottom={isSw ? "GO.BODA" : "UNGUJA"}
      canopySubtitle={
        isSw
          ? "Agiza Bodaboda na Bajaji kwa nauli ya wazi popote Unguja."
          : "Upfront TZS rides from Stone Town to Paje, Airport & Nungwi."
      }
      topRight={
        <Link
          href="/register"
          className="inline-flex items-center rounded-full border border-[#F3EEE8]/30 bg-[#0D3C38]/55 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#F3EEE8] backdrop-blur-sm transition hover:bg-[#F3EEE8] hover:text-[#17645F]"
        >
          {isSw ? "Sajili" : "Sign Up"}
        </Link>
      }
      formTitle={isSw ? "Karibu Tena" : "Welcome Back"}
      formSubtitle={
        isSw
          ? "Ingia kwa simu, jina la mtumiaji au barua pepe."
          : "Sign in with your phone, username, or email."
      }
      error={error}
      footer={
        <p className="text-xs font-medium text-[#17645F]/75">
          {isSw ? "Huna akaunti bado?" : "New to Go.boda?"}{" "}
          <Link
            href="/register"
            className="font-bold text-[#17645F] underline underline-offset-4 hover:text-[#114E4A]"
          >
            {isSw ? "Fungua akaunti" : "Create account"}
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <VerticalAuthInput
          label={
            isSw
              ? "Simu / Jina / Barua Pepe"
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
            label={isSw ? "Ingia Sasa" : "Sign In"}
            busyLabel={isSw ? "Inathibitisha..." : "Signing in..."}
          />
        </div>
      </form>
    </VerticalAuthShell>
  );
}
