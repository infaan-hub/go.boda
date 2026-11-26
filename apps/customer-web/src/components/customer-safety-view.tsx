"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  HardHat,
  History,
  KeyRound,
  Loader2,
  MapPin,
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
        error?: string;
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
              : "Could not save Trusted Contact."),
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
        text: sw
          ? "Mtu wa kuaminika amehifadhiwa kwa kushiriki safari za moja kwa moja (/track)!"
          : "Trusted Contact saved for 1-tap zero-PII /track live trip sharing!",
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
      : "https://go-boda-customer-web.vercel.app";

  const buildWhatsAppShareUrl = (contact: TrustedContactRow) => {
    const cleanDigits = contact.contactPhone.replace(/[^\d]/g, "");
    const message = sw
      ? `Habari ${contact.contactName}, ninatumia Go.boda hapa Unguja. Fuatilia safari yangu moja kwa moja hapa (bila taarifa binafsi): ${shareOrigin}/track/demo-unguja`
      : `Hi ${contact.contactName}, I'm riding with Go.boda on Unguja Island. Track my live trip securely (zero-PII): ${shareOrigin}/track/demo-unguja`;
    return `https://wa.me/${cleanDigits}?text=${encodeURIComponent(message)}`;
  };

  const atLimit = contacts.length >= 3;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <BrandLogo
            subtitle={sw ? "Kituo cha Usalama Unguja" : "Unguja Safety Center"}
          />
          <div className="flex items-center gap-2">
            <LanguageSwitchLink
              currentLocale={locale}
              hrefSw="/safety?lang=sw"
              hrefEn="/safety?lang=en"
            />
            <Link
              href={customerId ? "/dashboard" : "/login"}
              className="rounded-full bg-teal-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-800"
            >
              {customerId
                ? sw
                  ? "Rudi Ramani"
                  : "Back to Map"
                : sw
                  ? "Ingia"
                  : "Sign In"}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-4">
        {/* Direct Emergency Dials (112 + Go.boda Ops Desk) */}
        <section className="rounded-3xl border border-rose-200 bg-gradient-to-br from-rose-600 to-rose-700 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-6 w-6" />
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-rose-100">
                  {sw
                    ? "Msaada wa Dharura 24/7 — Unguja"
                    : "24/7 Emergency Response — Unguja"}
                </p>
                <h1 className="text-lg font-extrabold">
                  {sw
                    ? "Simu za Haraka za Dharura"
                    : "Direct Emergency & Ops Desk Dials"}
                </h1>
              </div>
            </div>
            {customerName && (
              <Badge tone="amber">{customerName}</Badge>
            )}
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
            <a
              href="tel:112"
              className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-extrabold text-rose-700 shadow transition hover:bg-rose-50"
            >
              <PhoneCall className="h-4 w-4" />
              {sw ? "Piga 112 (Dharura)" : "Call 112 Emergency"}
            </a>
            <a
              href={`tel:${OPS_DESK_PHONE}`}
              className="flex items-center justify-center gap-2 rounded-2xl bg-slate-950/90 px-4 py-3 text-xs font-extrabold text-white shadow transition hover:bg-slate-950"
            >
              <PhoneCall className="h-4 w-4 text-amber-400" />
              <span>Ops: {OPS_DESK_DISPLAY}</span>
            </a>
            <a
              href={`https://wa.me/255770000112?text=${encodeURIComponent(
                sw
                  ? "Habari Go.boda Unguja Ops Desk, nahitaji msaada wa usalama sasa hivi."
                  : "Hello Go.boda Unguja Ops Desk, I need immediate safety assistance."
              )}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-xs font-extrabold text-white shadow transition hover:bg-emerald-600"
            >
              <MessageCircle className="h-4 w-4" />
              {sw ? "WhatsApp Ops Desk" : "WhatsApp Ops Desk"}
            </a>
          </div>
        </section>

        {/* Trusted Contacts (Up to 3) */}
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-teal-700">
                {sw
                  ? "Kushiriki Safari Moja kwa Moja (/track)"
                  : "1-Tap Zero-PII Live Trip Share (/track)"}
              </p>
              <h2 className="text-lg font-extrabold text-slate-900">
                {sw
                  ? "Watu Wako wa Kuaminika (Hadi 3)"
                  : "Your Trusted Contacts (Up to 3)"}
              </h2>
            </div>
            <Badge tone={atLimit ? "amber" : "teal"}>
              {contacts.length} / 3 {sw ? "Wamehifadhiwa" : "Saved"}
            </Badge>
          </div>

          <p className="text-xs text-slate-600">
            {sw
              ? "Hifadhi hadi namba 3 za WhatsApp za familia au marafiki. Unapoanza safari ya Go.boda au Go.bajaji, unaweza kuwatumia kiungo cha /track/:token bila kuonyesha namba zako za siri."
              : "Save up to 3 family or friend WhatsApp contacts. During any Go.boda or Go.bajaji trip, share a zero-PII /track/:token live map link in 1 tap."}
          </p>

          {feedback && (
            <div
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
                feedback.tone === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-rose-200 bg-rose-50 text-rose-800"
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

          {/* Saved Contact Cards */}
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-teal-700" />
              {sw ? "Inapakia watu wa kuaminika..." : "Loading trusted contacts..."}
            </div>
          ) : contacts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
              {sw
                ? "Bado hujaongeza mtu wa kuaminika. Ongeza mmoja hapa chini."
                : "No Trusted Contacts saved yet. Add your first emergency contact below."}
            </div>
          ) : (
            <div className="space-y-2.5">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-teal-800">
                      <UserCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-slate-900">
                        {c.contactName}{" "}
                        <span className="text-xs font-semibold text-slate-500">
                          ({c.relationship})
                        </span>
                      </p>
                      <p className="font-mono text-xs text-slate-600">
                        {c.contactPhone} •{" "}
                        {c.autoShareTrips
                          ? sw
                            ? "Tuma /track kiotomatiki ✓"
                            : "Auto-share /track ✓"
                          : sw
                            ? "Kushiriki kwa hiari"
                            : "Manual share"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={buildWhatsAppShareUrl(c)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                    <button
                      type="button"
                      disabled={deletingId === c.id}
                      onClick={() => void handleDelete(c.id)}
                      className="rounded-xl border border-rose-200 bg-white p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      aria-label="Delete trusted contact"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Trusted Contact Form */}
          <form
            onSubmit={handleAddContact}
            className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
          >
            <p className="text-xs font-extrabold text-slate-800">
              {sw ? "Ongeza Mtu wa Kuaminika" : "Add Trusted Contact"}
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                type="text"
                required
                disabled={atLimit || saving}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder={sw ? "Jina (mf. Fatma Juma)" : "Name (e.g. Fatma Juma)"}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 disabled:bg-slate-100"
              />
              <input
                type="tel"
                required
                disabled={atLimit || saving}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+255 777 123 456"
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 disabled:bg-slate-100"
              />
              <select
                disabled={atLimit || saving}
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 disabled:bg-slate-100"
              >
                <option value="Family">{sw ? "Familia" : "Family"}</option>
                <option value="Friend">{sw ? "Rafiki" : "Friend"}</option>
                <option value="Colleague">{sw ? "Mfanyakazi Mwenzangu" : "Colleague"}</option>
                <option value="Host">{sw ? "Mwenyeji / Hoteli" : "Host / Hotel"}</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={autoShareTrips}
                  disabled={atLimit || saving}
                  onChange={(e) => setAutoShareTrips(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700"
                />
                {sw
                  ? "Pendekeza kushiriki /track kiotomatiki kwa kila safari"
                  : "Enable 1-tap auto-share prompt on every trip"}
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
                    ? "Kikomo cha 3 Kimefikiwa"
                    : "Max 3 Saved"
                  : sw
                    ? "Hifadhi Mtu"
                    : "Save Contact"}
              </Button>
            </div>
          </form>
        </Card>

        {/* Unguja Ride Safety Checklist */}
        <Card className="space-y-3 p-5">
          <h2 className="text-base font-extrabold text-slate-900">
            {sw
              ? "Viwango vya Usalama vya Go.boda Unguja"
              : "Go.boda Unguja Safety Standards"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-teal-100 bg-teal-50/70 p-3.5 text-xs">
              <KeyRound className="h-5 w-5 text-teal-700" />
              <p className="mt-2 font-extrabold text-slate-900">
                {sw ? "PIN ya Namba 4" : "4-Digit Start PIN"}
              </p>
              <p className="mt-1 text-slate-600">
                {sw
                  ? "Safari haianzi bila Rider au Dereva kuingiza PIN yako na kuthibitisha namba Z."
                  : "Trips only start once your Bodaboda Rider or Bajaji Driver enters your unique PIN."}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3.5 text-xs">
              <HardHat className="h-5 w-5 text-amber-600" />
              <p className="mt-2 font-extrabold text-slate-900">
                {sw ? "Helmeti 2 Safi za Bodaboda" : "2x Clean Bodaboda Helmets"}
              </p>
              <p className="mt-1 text-slate-600">
                {sw
                  ? "Kila Bodaboda Rider anahakikiwa kuwa na helmeti 2 safi. Ripoti ukikosa helmeti."
                  : "Every Bodaboda Rider is verified for 2 clean helmets; repeat misses trigger auto-review."}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3.5 text-xs">
              <ShieldCheck className="h-5 w-5 text-emerald-700" />
              <p className="mt-2 font-extrabold text-slate-900">
                {sw ? "Viungo vya /track Bila Siri" : "Zero-PII /track Links"}
              </p>
              <p className="mt-1 text-slate-600">
                {sw
                  ? "Kiungo cha ufuatiliaji kinaonyesha njia ya Unguja na namba Z tu — hakuna namba ya simu."
                  : "Shared live tracking shows only route progress & Z-plate — never exposing phone numbers."}
              </p>
            </div>
          </div>
        </Card>
      </main>

      {/* Bottom Mobile Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-2xl grid-cols-4 py-2 text-center text-[11px] font-semibold">
          <Link
            href="/dashboard"
            className="flex flex-col items-center gap-1 text-slate-500 hover:text-teal-700"
          >
            <Compass className="h-5 w-5" />
            {sw ? "Agiza" : "Book"}
          </Link>
          <Link
            href="/trips"
            className="flex flex-col items-center gap-1 text-slate-500 hover:text-teal-700"
          >
            <History className="h-5 w-5" />
            {sw ? "Safari" : "Trips"}
          </Link>
          <Link
            href="/safety"
            className="flex flex-col items-center gap-1 text-teal-700"
          >
            <ShieldCheck className="h-5 w-5" />
            {sw ? "Usalama" : "Safety"}
          </Link>
          <a
            href="/track/demo-unguja"
            className="flex flex-col items-center gap-1 text-slate-500 hover:text-teal-700"
          >
            <MapPin className="h-5 w-5" />
            {sw ? "Fuatilia" : "Live Track"}
          </a>
        </div>
      </nav>
    </div>
  );
}
