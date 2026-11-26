"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bike,
  CarFront,
  CheckCircle2,
  Loader2,
  MessageCircle,
  PhoneCall,
  Plus,
  Power,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Trash2,
  UserCheck,
} from "lucide-react";
import {
  Badge,
  BrandLogo,
  Button,
  LanguageSwitchLink,
  cn,
} from "@goboda/ui";

interface TrustedContactRow {
  id: string;
  ownerRole: "BODABODA_RIDER" | "BAJAJI_DRIVER";
  contactName: string;
  contactPhone: string;
  relationship: string;
  autoShareTrips: boolean;
  createdAt: string;
}

const OPS_DESK_PHONE = "+255770000112";
const OPS_DESK_DISPLAY = "+255 770 000 112";
const PARTNER_KEY_STORAGE = "goboda_partner_safety_owner_key";

export function PartnerSafetyView({
  locale,
  partnerId,
  partnerName,
  partnerRole,
  partnerPlateNumber,
}: {
  locale: "sw" | "en";
  partnerId?: string;
  partnerName?: string;
  partnerRole?: "BODABODA_RIDER" | "BAJAJI_DRIVER";
  partnerPlateNumber?: string;
}) {
  const sw = locale === "sw";
  const [sunlightMode, setSunlightMode] = React.useState(false);
  const [role, setRole] = React.useState<"BODABODA_RIDER" | "BAJAJI_DRIVER">(
    partnerRole ?? "BODABODA_RIDER"
  );
  const [ownerKey, setOwnerKey] = React.useState<string>(partnerId ?? "");
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
    if (partnerId) {
      setOwnerKey(partnerId);
      return;
    }
    try {
      let stored = window.localStorage.getItem(PARTNER_KEY_STORAGE);
      if (!stored) {
        stored = `partner-device-${Math.random().toString(36).slice(2, 12)}`;
        window.localStorage.setItem(PARTNER_KEY_STORAGE, stored);
      }
      setOwnerKey(stored);
    } catch {
      setOwnerKey("partner-device-unguja");
    }
  }, [partnerId]);

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
          ownerRole: role,
          contactName,
          contactPhone,
          relationship,
          autoShareTrips,
        }),
      });
      const json = (await res.json()) as {
        created?: boolean;
        contact?: TrustedContactRow;
        messageSw?: string;
        messageEn?: string;
      };
      if (!res.ok || !json.created) {
        setFeedback({
          tone: "err",
          text:
            (sw ? json.messageSw : json.messageEn) ||
            (sw ? "Imeshindwa kuhifadhi." : "Could not save contact."),
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

  const buildWhatsAppShareUrl = (contact: TrustedContactRow) => {
    const cleanDigits = contact.contactPhone.replace(/[^\d]/g, "");
    const plate = partnerPlateNumber ? ` (${partnerPlateNumber})` : "";
    const roleLabel =
      role === "BODABODA_RIDER" ? "Bodaboda Rider" : "Bajaji Driver";
    const message = sw
      ? `Habari ${contact.contactName}, niko kazini Go.boda (${roleLabel}${plate}). Kwa dharura piga ${OPS_DESK_DISPLAY} au 112.`
      : `Hi ${contact.contactName}, I am on shift with Go.boda (${roleLabel}${plate}). In an emergency call ${OPS_DESK_DISPLAY} or 112.`;
    return `https://wa.me/${cleanDigits}?text=${encodeURIComponent(message)}`;
  };

  const isBodaboda = role === "BODABODA_RIDER";
  const atLimit = contacts.length >= 3;

  return (
    <div
      className={cn(
        "min-h-screen pb-24 transition-colors",
        sunlightMode ? "bg-white text-slate-950" : "bg-slate-950 text-white"
      )}
    >
      <header
        className={cn(
          "sticky top-0 z-30 border-b backdrop-blur",
          sunlightMode
            ? "border-slate-300 bg-white"
            : "border-slate-800 bg-slate-950/95"
        )}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <BrandLogo
            dark={!sunlightMode}
            subtitle={sw ? "Usalama" : "Safety"}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSunlightMode((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
                sunlightMode
                  ? "border-slate-900 bg-amber-400 text-slate-950"
                  : "border-slate-700 bg-slate-900 text-amber-400"
              )}
            >
              <Sun className="h-3.5 w-3.5" />
              {sw ? "Jua" : "Sun"}
            </button>
            <LanguageSwitchLink
              currentLocale={locale}
              hrefSw="/safety?lang=sw"
              hrefEn="/safety?lang=en"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 pt-4">
        {/* Emergency Contacts */}
        <section
          className={cn(
            "rounded-2xl border p-5",
            sunlightMode
              ? "border-rose-300 bg-white text-slate-950"
              : "border-rose-500/40 bg-slate-900 text-white"
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-500" />
              <h1 className="text-base font-bold">
                {sw ? "Namba za Dharura" : "Emergency Contacts"}
              </h1>
            </div>
            {partnerName ? (
              <span className="text-xs opacity-75">
                {partnerName}
                {partnerPlateNumber ? ` • ${partnerPlateNumber}` : ""}
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
              className="flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-700"
            >
              <PhoneCall className="h-4 w-4 text-amber-400" />
              <span>{OPS_DESK_DISPLAY}</span>
            </a>
            <a
              href={`https://wa.me/255770000112?text=${encodeURIComponent(
                sw
                  ? `Msaada wa dharura (${partnerName ?? ""} ${partnerPlateNumber ?? ""})`
                  : `Emergency assistance needed (${partnerName ?? ""} ${partnerPlateNumber ?? ""})`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          </div>
        </section>

        {!partnerRole && (
          <div
            className={cn(
              "grid grid-cols-2 gap-2 rounded-xl border p-1",
              sunlightMode
                ? "border-slate-300 bg-slate-100"
                : "border-slate-800 bg-slate-900"
            )}
          >
            <button
              type="button"
              onClick={() => setRole("BODABODA_RIDER")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition",
                isBodaboda
                  ? "bg-teal-600 text-white"
                  : sunlightMode
                    ? "text-slate-700"
                    : "text-slate-400"
              )}
            >
              <Bike className="h-4 w-4" />
              {sw ? "Rider wa Bodaboda" : "Bodaboda Rider"}
            </button>
            <button
              type="button"
              onClick={() => setRole("BAJAJI_DRIVER")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition",
                !isBodaboda
                  ? "bg-amber-500 text-slate-950"
                  : sunlightMode
                    ? "text-slate-700"
                    : "text-slate-400"
              )}
            >
              <CarFront className="h-4 w-4" />
              {sw ? "Dereva wa Bajaji" : "Bajaji Driver"}
            </button>
          </div>
        )}

        {/* Trusted Contacts (Up to 3) */}
        <section
          className={cn(
            "space-y-4 rounded-2xl border p-5",
            sunlightMode
              ? "border-slate-300 bg-white text-slate-950"
              : "border-slate-800 bg-slate-900 text-white"
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold">
                {sw ? "Watu wa Kuaminika" : "Trusted Contacts"}
              </h2>
              <p className="mt-0.5 text-xs opacity-70">
                {sw
                  ? "Hifadhi hadi namba 3 za dharura (familia au kiongozi wa kituo)."
                  : "Save up to 3 emergency contacts (family or stage leader)."}
              </p>
            </div>
            <Badge tone={atLimit ? "amber" : "teal"}>
              {contacts.length} / 3
            </Badge>
          </div>

          {feedback && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium",
                feedback.tone === "ok"
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                  : "border-rose-500/40 bg-rose-500/15 text-rose-400"
              )}
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
            <div className="flex items-center gap-2 py-4 text-xs opacity-75">
              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
              {sw ? "Inapakia..." : "Loading..."}
            </div>
          ) : contacts.length === 0 ? (
            <p
              className={cn(
                "rounded-xl border border-dashed p-4 text-center text-xs opacity-75",
                sunlightMode ? "border-slate-300" : "border-slate-700"
              )}
            >
              {sw ? "Hakuna watu waliohifadhiwa." : "No contacts saved yet."}
            </p>
          ) : (
            <div className="space-y-2.5">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3",
                    sunlightMode
                      ? "border-slate-200 bg-slate-50"
                      : "border-slate-800 bg-slate-950"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
                      <UserCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">
                        {c.contactName}{" "}
                        <span className="text-xs font-normal opacity-70">
                          ({c.relationship})
                        </span>
                      </p>
                      <p className="font-mono text-xs opacity-75">
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
                      className="rounded-lg border border-rose-500/40 p-1.5 text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
                      aria-label="Delete contact"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddContact} className="space-y-3 pt-1">
            <div className="grid gap-2.5 sm:grid-cols-3">
              <input
                type="text"
                required
                disabled={atLimit || saving}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder={sw ? "Jina kamili" : "Full name"}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs",
                  sunlightMode
                    ? "border-slate-300 bg-slate-50 text-slate-950"
                    : "border-slate-700 bg-slate-950 text-white"
                )}
              />
              <input
                type="tel"
                required
                disabled={atLimit || saving}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+255 777 000 000"
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs",
                  sunlightMode
                    ? "border-slate-300 bg-slate-50 text-slate-950"
                    : "border-slate-700 bg-slate-950 text-white"
                )}
              />
              <select
                disabled={atLimit || saving}
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-medium",
                  sunlightMode
                    ? "border-slate-300 bg-slate-50 text-slate-950"
                    : "border-slate-700 bg-slate-950 text-white"
                )}
              >
                <option value="Family">{sw ? "Familia" : "Family"}</option>
                <option value="Kituo Leader">
                  {sw ? "Kiongozi wa Kituo" : "Kituo Leader"}
                </option>
                <option value="Vehicle Owner">
                  {sw ? "Mmiliki wa Chombo" : "Vehicle Owner"}
                </option>
                <option value="Friend">{sw ? "Rafiki" : "Friend"}</option>
              </select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs opacity-80">
                <input
                  type="checkbox"
                  checked={autoShareTrips}
                  disabled={atLimit || saving}
                  onChange={(e) => setAutoShareTrips(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                {sw ? "Washa tahadhari ya SOS" : "Notify on SOS"}
              </label>
              <Button
                type="submit"
                size="sm"
                variant="amber"
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
        </section>
      </main>

      {/* Bottom Navigation */}
      <nav
        className={cn(
          "fixed bottom-0 left-0 right-0 z-30 border-t",
          sunlightMode
            ? "border-slate-300 bg-white"
            : "border-slate-800 bg-slate-950"
        )}
      >
        <div className="mx-auto grid max-w-2xl grid-cols-2 py-2.5 text-center text-xs font-semibold">
          <Link
            href={partnerId ? "/partner/dashboard" : "/partner/login"}
            className="flex items-center justify-center gap-2 text-slate-400 hover:text-amber-400"
          >
            <Power className="h-4 w-4" />
            {partnerId
              ? sw
                ? "Zamu"
                : "Shift"
              : sw
                ? "Ingia"
                : "Sign In"}
          </Link>
          <Link
            href="/safety"
            className="flex items-center justify-center gap-2 text-amber-400"
          >
            <ShieldCheck className="h-4 w-4" />
            {sw ? "Usalama" : "Safety"}
          </Link>
        </div>
      </nav>
    </div>
  );
}
