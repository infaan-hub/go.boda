"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { AtSign, KeyRound, Mail, Smartphone, UserRound } from "lucide-react";
import {
  VerticalAuthInput,
  VerticalAuthShell,
  VerticalAuthSubmit,
} from "@goboda/ui";

export function CustomerRegisterForm() {
  const router = useRouter();
  const isSw = useLocale() === "sw";

  const [name, setName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(
        isSw
          ? "Nenosiri lazima liwe na angalau herufi 8."
          : "Password must be at least 8 characters."
      );
      return;
    }
    if (password !== confirm) {
      setError(isSw ? "Manenosiri hayafanani." : "Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/customer/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          username,
          email,
          phone,
          password,
          language: isSw ? "sw" : "en",
        }),
      });
      const json = (await res.json()) as {
        registered?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !json.registered) {
        setError(
          json.message ||
            json.error ||
            (isSw ? "Usajili umeshindikana." : "Registration failed.")
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
      compactCanopy
      eyebrow="STONE TOWN • PAJE • NUNGWI"
      headlineTop={isSw ? "FUNGUA" : "JOIN"}
      headlineBottom={isSw ? "AKAUNTI" : "GO.BODA"}
      canopySubtitle={
        isSw
          ? "Sajili akaunti yako ya mteja uanze safari za Unguja."
          : "Book verified Bodaboda & Bajaji rides across Unguja."
      }
      topRight={
        <Link
          href="/login"
          className="inline-flex items-center rounded-full border border-[#F3EEE8]/30 bg-[#0D3C38]/55 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#F3EEE8] backdrop-blur-sm transition hover:bg-[#F3EEE8] hover:text-[#17645F]"
        >
          {isSw ? "Ingia" : "Sign In"}
        </Link>
      }
      formTitle={isSw ? "Usajili wa Mteja" : "Create Account"}
      formSubtitle={
        isSw
          ? "Jaza taarifa zako chache hapa chini."
          : "Fill in your details below to get moving."
      }
      error={error}
      footer={
        <p className="text-xs font-medium text-[#17645F]/75">
          {isSw ? "Tayari una akaunti?" : "Already have an account?"}{" "}
          <Link
            href="/login"
            className="font-bold text-[#17645F] underline underline-offset-4 hover:text-[#114E4A]"
          >
            {isSw ? "Ingia hapa" : "Sign in"}
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <VerticalAuthInput
          label={isSw ? "Jina Kamili" : "Full Name"}
          icon={<UserRound className="h-4 w-4" />}
          type="text"
          autoComplete="name"
          enterKeyHint="next"
          required
          minLength={2}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Amina Juma"
        />

        <VerticalAuthInput
          label={isSw ? "Jina la Mtumiaji" : "Username"}
          icon={<AtSign className="h-4 w-4" />}
          type="text"
          autoComplete="username"
          enterKeyHint="next"
          required
          minLength={3}
          maxLength={40}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="amina_juma"
        />

        <VerticalAuthInput
          label={isSw ? "Barua Pepe" : "Email"}
          icon={<Mail className="h-4 w-4" />}
          type="email"
          autoComplete="email"
          inputMode="email"
          enterKeyHint="next"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="amina@example.com"
        />

        <VerticalAuthInput
          label={isSw ? "Namba ya Simu" : "Phone Number"}
          icon={<Smartphone className="h-4 w-4" />}
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          enterKeyHint="next"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+255770123456"
        />

        <VerticalAuthInput
          label={isSw ? "Nenosiri" : "Password"}
          icon={<KeyRound className="h-4 w-4" />}
          type="password"
          autoComplete="new-password"
          enterKeyHint="next"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={isSw ? "Angalau herufi 8" : "At least 8 characters"}
        />

        <VerticalAuthInput
          label={isSw ? "Rudia Nenosiri" : "Confirm Password"}
          icon={<KeyRound className="h-4 w-4" />}
          type="password"
          autoComplete="new-password"
          enterKeyHint="done"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
        />

        <div className="pt-2">
          <VerticalAuthSubmit
            busy={busy}
            label={isSw ? "Sajili na Ingia" : "Create Account"}
            busyLabel={isSw ? "Inasajili..." : "Creating account..."}
          />
        </div>
      </form>
    </VerticalAuthShell>
  );
}
