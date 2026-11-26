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
      : "https://go-boda-customer-web.vercel.app";

  const buildWhatsAppShareUrl = (contact: TrustedContactRow) => {
    const cleanDigits = contact.contactPhone.replace(/[^\d]/g, "");
    const message = sw
      ? `Habari ${contact.contactName}, fuatilia safari yangu ya Go.boda Unguja: ${shareOrigin}/track/demo-unguja`
      : `Hi ${contact.contactName}, track my Go.boda trip on Unguja: ${shareOrigin}/track/demo-unguja`;
    return `https://wa.me/${cleanDigits}?text=${encodeURIComponent(message)}`;
  };

  const atLimit = contacts.length >= 3;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <BrandLogo subtitle={sw ? "Usalama" : "Safety"} />
          <div className="flex items-center gap-2">
            <LanguageSwitchLink
              currentLocale={locale}
              hrefSw="/safety?lang=sw"
              hrefEn="/safety?lang=en"
            />
            <Link
              href={customerId ? "/dashboard" : "/login"}
              className="rounded-full bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
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

      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-4">
        {/* Emergency Contacts */}
        <Card className="border-rose-200 bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
              <h1 className="text-base font-bold text-slate-900">
                {sw ? "Namba za Dharura" : "Emergency Contacts"}
              </h1>
            </div>
            {customerName ? (
              <span className="text-xs font-medium text-slate-500">
                {customerName}
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
            <a
              href="tel:112"
              className="flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-rose-700"
            >
              <PhoneCall className="h-4 w-4" />
              {sw ? "Piga 112" : "Call 112"}
            </a>
            <a
              href={`tel:${OPS_DESK_PHONE}`}
              className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
            >
              <PhoneCall className="h-4 w-4 text-amber-400" />
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
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
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
              <h2 className="text-base font-bold text-slate-900">
                {sw ? "Watu wa Kuaminika" : "Trusted Contacts"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
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
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium ${
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

          {loading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-teal-700" />
              {sw ? "Inapakia..." : "Loading..."}
            </div>
          ) : contacts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
              {sw
                ? "Bado hujaongeza mtu wa kuaminika."
                : "No trusted contacts saved yet."}
            </p>
          ) : (
            <div className="space-y-2.5">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-teal-800">
                      <UserCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {c.contactName}{" "}
                        <span className="text-xs font-normal text-slate-500">
                          ({c.relationship})
                        </span>
                      </p>
                      <p className="font-mono text-xs text-slate-600">
                        {c.contactPhone}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={buildWhatsAppShareUrl(c)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Share
                    </a>
                    <button
                      type="button"
                      disabled={deletingId === c.id}
                      onClick={() => void handleDelete(c.id)}
                      className="rounded-lg border border-rose-200 bg-white p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
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
            className="space-y-3 border-t border-slate-100 pt-4"
          >
            <div className="grid gap-2.5 sm:grid-cols-3">
              <input
                type="text"
                required
                disabled={atLimit || saving}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder={sw ? "Jina" : "Name"}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 disabled:bg-slate-100"
              />
              <input
                type="tel"
                required
                disabled={atLimit || saving}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+255 777 123 456"
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 disabled:bg-slate-100"
              />
              <select
                disabled={atLimit || saving}
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 disabled:bg-slate-100"
              >
                <option value="Family">{sw ? "Familia" : "Family"}</option>
                <option value="Friend">{sw ? "Rafiki" : "Friend"}</option>
                <option value="Colleague">{sw ? "Mfanyakazi" : "Colleague"}</option>
                <option value="Host">{sw ? "Hoteli" : "Host / Hotel"}</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={autoShareTrips}
                  disabled={atLimit || saving}
                  onChange={(e) => setAutoShareTrips(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700"
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
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-2xl grid-cols-3 py-2 text-center text-[11px] font-semibold">
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
        </div>
      </nav>
    </div>
  );
}
