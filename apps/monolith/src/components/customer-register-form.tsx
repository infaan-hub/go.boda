"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import {
  AtSign,
  KeyRound,
  Mail,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import {
  LanguageSwitchLink,
  VerticalAuthInput,
  VerticalAuthShell,
  VerticalAuthSubmit,
} from "@goboda/ui";

export function CustomerRegisterForm() {
  const router = useRouter();
  const locale: "sw" | "en" = useLocale() === "sw" ? "sw" : "en";
  const isSw = locale === "sw";

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
      eyebrow={isSw ? "USAFIRI WA UNGUJA" : "BODABODA • BAJAJI • UNGUJA"}
      headlineTop={isSw ? "Anza Safari." : "Find Your Ride."}
      headlineBottom="Go.Boda"
      canopySubtitle={
        isSw
          ? "Fungua akaunti uagize Bodaboda na Bajaji salama Unguja."
          : "Create your account to book verified rides across Unguja."
      }
      topRight={
        <LanguageSwitchLink
          dark
          currentLocale={locale}
          hrefSw="/register?lang=sw"
          hrefEn="/register?lang=en"
        />
      }
      formTitle={isSw ? "Usajili wa Mteja" : "Create Account"}
      formSubtitle={
        isSw
          ? "Jaza taarifa zako hapa chini kuendelea."
          : "Enter your details below to get moving."
      }
      error={error}
      footer={
        <div className="space-y-2">
          <p className="text-xs font-medium text-[#17645F]/75">
            {isSw ? "Tayari una akaunti?" : "Already have an account?"}{" "}
            <Link
              href="/login"
              className="font-bold text-[#17645F] underline underline-offset-4 hover:text-[#114E4A]"
            >
              {isSw ? "Ingia hapa" : "Sign in"}
            </Link>
          </p>
          <p className="inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-[#17645F]/65">
            <ShieldCheck className="h-3.5 w-3.5 text-[#17645F]" />
            <span>
              {isSw
                ? "Usajili salama wa abiria Go.boda"
                : "Protected Go.boda Rider Registration"}
            </span>
          </p>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
            label={isSw ? "Fungua Akaunti" : "Create Account"}
            busyLabel={isSw ? "Inasajili..." : "Creating account..."}
          />
        </div>
      </form>
    </VerticalAuthShell>
  );
}
