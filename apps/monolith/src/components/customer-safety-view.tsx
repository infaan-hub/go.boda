"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  History,
  Loader2,
  MessageCircle,
  PhoneCall,
  Plus,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
} from "lucide-react";
import {
  Badge,
  BrandLogo,
  Button,
  Card,
  LanguageSwitchLink,
} from "@goboda/ui";

interface TrustedContactRow {
  id: string;
  contactName: string;
  contactPhone: string;
  relationship: string;
  autoShareTrips: boolean;
  createdAt: string;
}

const OPS_DESK_PHONE = "+255770000112";
const OPS_DESK_DISPLAY = "+255 770 000 112";
const DEVICE_KEY_STORAGE = "goboda_customer_safety_owner_key";

export function CustomerSafetyView({
  locale,
  customerId,
  customerName,
}: {
  locale: "sw" | "en";
  customerId?: string;
  customerName?: string;
}) {
  const sw = locale === "sw";
  const [ownerKey, setOwnerKey] = React.useState<string>(customerId ?? "");
  const [contacts, setContacts] = React.useState<TrustedContactRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{
    tone: "ok" | "err";
    text: string;
  } | null>(null);

  const [contactName, setContactName] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [relationship, setRelationship] = React.useState("Family");
  const [autoShareTrips, setAutoShareTrips] = React.useState(true);

  React.useEffect(() => {
    if (customerId) {
      setOwnerKey(customerId);
      return;
    }
    try {
      let stored = window.localStorage.getItem(DEVICE_KEY_STORAGE);
      if (!stored) {
        stored = `cust-device-${Math.random().toString(36).slice(2, 12)}`;
        window.localStorage.setItem(DEVICE_KEY_STORAGE, stored);
      }
      setOwnerKey(stored);
    } catch {
      setOwnerKey("cust-device-unguja");
    }
  }, [customerId]);

  const loadContacts = React.useCallback(async (key: string) => {
    if (!key) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/safety/trusted-contacts?ownerKey=${encodeURIComponent(key)}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const json = (await res.json()) as { contacts?: TrustedContactRow[] };
        setContacts(json.contacts ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (ownerKey) {
      void loadContacts(ownerKey);
    }
  }, [ownerKey, loadContacts]);

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerKey) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/safety/trusted-contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ownerKey,
          contactName,
          contactPhone,
          relationship,
          autoShareTrips,
        }),
      });
      const json = (await res.json()) as {
        created?: boolean;
        contact?: TrustedContactRow;
        messageEn?: string;
        messageSw?: string;
      };
      if (!res.ok || !json.created) {
        setFeedback({
          tone: "err",
          text:
            (sw ? json.messageSw : json.messageEn) ||
            (sw
              ? "Imeshindwa kuhifadhi mtu wa kuaminika."
              : "Could not save contact."),
        });
        return;
      }
      if (json.contact) {
        setContacts((prev) => [...prev, json.contact!]);
      }
      setContactName("");
      setContactPhone("");
      setFeedback({
        tone: "ok",
        text: sw ? "Mtu wa kuaminika amehifadhiwa." : "Trusted contact saved.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!ownerKey) return;
    setDeletingId(id);
    setFeedback(null);
    try {
      const res = await fetch(
        `/api/safety/trusted-contacts?id=${encodeURIComponent(id)}&ownerKey=${encodeURIComponent(ownerKey)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        setContacts((prev) => prev.filter((c) => c.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  };

  const shareOrigin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://zan-goboda.vercel.app";

  const buildWhatsAppShareUrl = (contact: TrustedContactRow) => {
    const cleanDigits = contact.contactPhone.replace(/[^\d]/g, "");
    const message = sw
      ? `Habari ${contact.contactName}, fuatilia safari yangu ya Go.boda Unguja: ${shareOrigin}/track/demo-unguja`
      : `Hi ${contact.contactName}, track my Go.boda trip on Unguja: ${shareOrigin}/track/demo-unguja`;
    return `https://wa.me/${cleanDigits}?text=${encodeURIComponent(message)}`;
  };

  const atLimit = contacts.length >= 3;

  return (
    <div className="min-h-screen bg-[#F3EEE8] pb-24 text-[#122927]">
      <header className="sticky top-0 z-30 border-b border-[#17645F]/15 bg-[#F3EEE8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3.5 sm:px-6">
          <BrandLogo subtitle={sw ? "Usalama" : "Safety"} />
          <nav className="hidden items-center gap-6 text-[11px] font-bold uppercase tracking-[0.2em] text-[#17645F]/75 md:flex">
            <Link href="/dashboard" className="hover:text-[#17645F]">
              {sw ? "Agiza" : "Book"}
            </Link>
            <Link href="/trips" className="hover:text-[#17645F]">
              {sw ? "Safari" : "Trips"}
            </Link>
            <Link href="/safety" className="text-[#17645F] underline underline-offset-4">
              {sw ? "Usalama" : "Safety"}
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitchLink
              currentLocale={locale}
              hrefSw="/safety?lang=sw"
              hrefEn="/safety?lang=en"
            />
            <Link
              href={customerId ? "/dashboard" : "/login"}
              className="rounded-full bg-[#17645F] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#F3EEE8] transition hover:bg-[#114E4A]"
            >
              {customerId
                ? sw
                  ? "Ramani"
                  : "Map"
                : sw
                  ? "Ingia"
                  : "Sign In"}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 pt-6 sm:px-6">
        <div className="border-b border-[#17645F]/15 pb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#17645F]/75">
            UNGUJA 24/7 EMERGENCY & LIVE SHARE
          </p>
          <h1 className="mt-1 font-display text-4xl uppercase leading-none text-[#17645F]">
            {sw ? "USALAMA WA SAFARI" : "SAFETY CENTER"}
          </h1>
        </div>

        {/* Emergency Contacts */}
        <Card className="border-[#A93232]/25 bg-[#FAF7F2] p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-[#A93232]" />
              <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-[#122927]">
                {sw ? "Namba za Dharura" : "Emergency Contacts"}
              </h2>
            </div>
            {customerName ? (
              <span className="text-xs font-semibold text-[#17645F]/75">
                {customerName}
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
            <a
              href="tel:112"
              className="flex items-center justify-center gap-2 rounded-full bg-[#A93232] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-white transition hover:bg-[#8A2626]"
            >
              <PhoneCall className="h-4 w-4" />
              {sw ? "Piga 112" : "Call 112"}
            </a>
            <a
              href={`tel:${OPS_DESK_PHONE}`}
              className="flex items-center justify-center gap-2 rounded-full bg-[#17645F] px-4 py-2.5 text-xs font-bold tracking-wide text-[#F3EEE8] transition hover:bg-[#114E4A]"
            >
              <PhoneCall className="h-4 w-4 text-[#E6C99E]" />
              <span>{OPS_DESK_DISPLAY}</span>
            </a>
            <a
              href={`https://wa.me/255770000112?text=${encodeURIComponent(
                sw
                  ? "Habari Go.boda, nahitaji msaada wa dharura."
                  : "Hello Go.boda Support, I need emergency assistance."
              )}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-full border border-[#17645F] bg-[#FAF7F2] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-[#17645F] transition hover:bg-[#17645F] hover:text-[#F3EEE8]"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          </div>
        </Card>

        {/* Trusted Contacts (Up to 3) */}
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-[#17645F]">
                {sw ? "Watu wa Kuaminika" : "Trusted Contacts"}
              </h2>
              <p className="mt-0.5 text-xs text-[#17645F]/75">
                {sw
                  ? "Hifadhi hadi namba 3 za WhatsApp za kushiriki safari yako."
                  : "Save up to 3 WhatsApp contacts to share your live trip location."}
              </p>
            </div>
            <Badge tone={atLimit ? "amber" : "teal"}>
              {contacts.length} / 3
            </Badge>
          </div>

          {feedback && (
            <div
              className={`flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-semibold ${
                feedback.tone === "ok"
                  ? "border-[#17645F]/30 bg-[#17645F]/10 text-[#17645F]"
                  : "border-[#A93232]/30 bg-[#A93232]/10 text-[#A93232]"
              }`}
            >
              {feedback.tone === "ok" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-[#17645F]/75">
              <Loader2 className="h-4 w-4 animate-spin text-[#17645F]" />
              {sw ? "Inapakia..." : "Loading..."}
            </div>
          ) : contacts.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[#17645F]/25 bg-[#F3EEE8]/60 p-4 text-center text-xs text-[#17645F]/75">
              {sw
                ? "Bado hujaongeza mtu wa kuaminika."
                : "No trusted contacts saved yet."}
            </p>
          ) : (
            <div className="space-y-2.5">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#17645F]/15 bg-[#F3EEE8]/65 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#17645F] text-[#F3EEE8]">
                      <UserCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#122927]">
                        {c.contactName}{" "}
                        <span className="text-xs font-normal text-[#17645F]/70">
                          ({c.relationship})
                        </span>
                      </p>
                      <p className="font-mono text-xs text-[#17645F]">
                        {c.contactPhone}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={buildWhatsAppShareUrl(c)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-[#17645F] px-3.5 py-1.5 text-xs font-bold text-[#F3EEE8] hover:bg-[#114E4A]"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Share
                    </a>
                    <button
                      type="button"
                      disabled={deletingId === c.id}
                      onClick={() => void handleDelete(c.id)}
                      className="rounded-full border border-[#A93232]/25 bg-[#FAF7F2] p-1.5 text-[#A93232] hover:bg-[#A93232]/10 disabled:opacity-50"
                      aria-label="Delete trusted contact"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={handleAddContact}
            className="space-y-3 border-t border-[#17645F]/10 pt-4"
          >
            <div className="grid gap-2.5 sm:grid-cols-3">
              <input
                type="text"
                required
                disabled={atLimit || saving}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder={sw ? "Jina" : "Name"}
                className="rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3.5 py-2 text-xs text-[#122927] disabled:opacity-50"
              />
              <input
                type="tel"
                required
                disabled={atLimit || saving}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+255 777 123 456"
                className="rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3.5 py-2 text-xs text-[#122927] disabled:opacity-50"
              />
              <select
                disabled={atLimit || saving}
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3.5 py-2 text-xs font-semibold text-[#122927] disabled:opacity-50"
              >
                <option value="Family">{sw ? "Familia" : "Family"}</option>
                <option value="Friend">{sw ? "Rafiki" : "Friend"}</option>
                <option value="Colleague">{sw ? "Mfanyakazi" : "Colleague"}</option>
                <option value="Host">{sw ? "Hoteli" : "Host / Hotel"}</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-[#17645F]/80">
                <input
                  type="checkbox"
                  checked={autoShareTrips}
                  disabled={atLimit || saving}
                  onChange={(e) => setAutoShareTrips(e.target.checked)}
                  className="h-4 w-4 rounded border-[#17645F]/30 accent-[#17645F]"
                />
                {sw ? "Shiriki safari kiotomatiki" : "Auto-share trip links"}
              </label>
              <Button
                type="submit"
                size="sm"
                variant="primary"
                disabled={atLimit || saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {atLimit
                  ? sw
                    ? "Kikomo (3)"
                    : "Limit reached"
                  : sw
                    ? "Hifadhi"
                    : "Add Contact"}
              </Button>
            </div>
          </form>
        </Card>
      </main>

      {/* Bottom Mobile Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#17645F]/15 bg-[#FAF7F2]/95 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.16em]">
          <Link
            href="/dashboard"
            className="flex flex-col items-center gap-1 text-[#17645F]/60 hover:text-[#17645F]"
          >
            <Compass className="h-5 w-5" />
            {sw ? "Agiza" : "Book"}
          </Link>
          <Link
            href="/trips"
            className="flex flex-col items-center gap-1 text-[#17645F]/60 hover:text-[#17645F]"
          >
            <History className="h-5 w-5" />
            {sw ? "Safari" : "Trips"}
          </Link>
          <Link
            href="/safety"
            className="flex flex-col items-center gap-1 text-[#17645F]"
          >
            <ShieldCheck className="h-5 w-5" />
            {sw ? "Usalama" : "Safety"}
          </Link>
        </div>
      </nav>
    </div>
  );
}
