"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bike,
  CarFront,
  CheckCircle2,
  HardHat,
  KeyRound,
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
          ? "Mtu wa kuaminika wa dharura amehifadhiwa kwenye mfumo wa Go.boda!"
          : "Emergency Trusted Contact saved to your Go.boda safety profile!",
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
      ? `Habari ${contact.contactName}, niko kazini kwenye Go.boda Unguja kama ${roleLabel}${plate}. Kama kutatokea dharura wasiliana na Ops Desk: ${OPS_DESK_DISPLAY} au 112.`
      : `Hi ${contact.contactName}, I am on shift with Go.boda Unguja as a ${roleLabel}${plate}. In any emergency contact Ops Desk: ${OPS_DESK_DISPLAY} or 112.`;
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
            subtitle={sw ? "Usalama wa Mwendeshaji" : "Operator Safety Profile"}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSunlightMode((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold",
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
        {/* Emergency Direct Dials */}
        <section className="rounded-3xl border border-rose-500/40 bg-gradient-to-br from-rose-600 to-rose-800 p-5 text-white shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="h-6 w-6" />
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-rose-100">
                  {sw
                    ? "Msaada wa Haraka — Kisiwa cha Unguja"
                    : "Rapid Emergency Support — Unguja Island"}
                </p>
                <h1 className="text-lg font-extrabold">
                  {sw
                    ? "Simu za Dharura za Rider & Dereva"
                    : "Rider & Driver Emergency Dials"}
                </h1>
              </div>
            </div>
            {partnerName && (
              <Badge tone="amber">
                {partnerName}
                {partnerPlateNumber ? ` • ${partnerPlateNumber}` : ""}
              </Badge>
            )}
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
            <a
              href="tel:112"
              className="flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-extrabold text-rose-700 shadow hover:bg-rose-50"
            >
              <PhoneCall className="h-4 w-4" />
              {sw ? "Piga 112 (Dharura)" : "Call 112 Emergency"}
            </a>
            <a
              href={`tel:${OPS_DESK_PHONE}`}
              className="flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-xs font-extrabold text-white shadow hover:bg-slate-900"
            >
              <PhoneCall className="h-4 w-4 text-amber-400" />
              <span>Ops: {OPS_DESK_DISPLAY}</span>
            </a>
            <a
              href={`https://wa.me/255770000112?text=${encodeURIComponent(
                sw
                  ? `SOS Mwendeshaji (${partnerName ?? "Partner"} ${partnerPlateNumber ?? ""}): Nahitaji msaada wa dharura hapa Unguja.`
                  : `Operator SOS (${partnerName ?? "Partner"} ${partnerPlateNumber ?? ""}): Requesting urgent assistance on Unguja.`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-xs font-extrabold text-white shadow hover:bg-emerald-600"
            >
              <MessageCircle className="h-4 w-4" />
              {sw ? "WhatsApp Ops Desk" : "WhatsApp Ops Desk"}
            </a>
          </div>
        </section>

        {/* Operator Role Selector (when not locked by session) */}
        <div
          className={cn(
            "grid grid-cols-2 gap-2 rounded-2xl border p-1.5",
            sunlightMode
              ? "border-slate-300 bg-slate-100"
              : "border-slate-800 bg-slate-900"
          )}
        >
          <button
            type="button"
            disabled={Boolean(partnerRole)}
            onClick={() => setRole("BODABODA_RIDER")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition",
              isBodaboda
                ? "bg-teal-600 text-white shadow"
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
            disabled={Boolean(partnerRole)}
            onClick={() => setRole("BAJAJI_DRIVER")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition",
              !isBodaboda
                ? "bg-amber-500 text-slate-950 shadow"
                : sunlightMode
                  ? "text-slate-700"
                  : "text-slate-400"
            )}
          >
            <CarFront className="h-4 w-4" />
            {sw ? "Dereva wa Bajaji" : "Bajaji Driver"}
          </button>
        </div>

        {/* Trusted Contacts (Up to 3) */}
        <section
          className={cn(
            "space-y-4 rounded-3xl border p-5",
            sunlightMode
              ? "border-slate-300 bg-white text-slate-950"
              : "border-slate-800 bg-slate-900 text-white"
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-amber-400">
                {sw
                  ? "Familia / Kiongozi wa Kituo (Hadi 3)"
                  : "Family / Kituo Stage Leaders (Up to 3)"}
              </p>
              <h2 className="text-lg font-extrabold">
                {sw
                  ? "Watu Wako wa Kuaminika wa Dharura"
                  : "Your Trusted Emergency Contacts"}
              </h2>
            </div>
            <Badge tone={atLimit ? "amber" : "teal"}>
              {contacts.length} / 3
            </Badge>
          </div>

          {feedback && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold",
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
              {sw ? "Inapakia..." : "Loading contacts..."}
            </div>
          ) : contacts.length === 0 ? (
            <div
              className={cn(
                "rounded-2xl border border-dashed p-4 text-center text-xs opacity-75",
                sunlightMode ? "border-slate-300" : "border-slate-700"
              )}
            >
              {sw
                ? "Hifadhi hadi namba 3 za WhatsApp za familia au kiongozi wa kituo chako."
                : "Save up to 3 WhatsApp contacts (family or your home Kituo leader) for shift safety."}
            </div>
          ) : (
            <div className="space-y-2.5">
              {contacts.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3.5",
                    sunlightMode
                      ? "border-slate-200 bg-slate-50"
                      : "border-slate-800 bg-slate-950"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
                      <UserCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-extrabold">
                        {c.contactName}{" "}
                        <span className="text-xs font-semibold opacity-70">
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
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      WhatsApp
                    </a>
                    <button
                      type="button"
                      disabled={deletingId === c.id}
                      onClick={() => void handleDelete(c.id)}
                      className="rounded-xl border border-rose-500/40 p-1.5 text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
                      aria-label="Delete contact"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Form */}
          <form onSubmit={handleAddContact} className="space-y-3 pt-1">
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                type="text"
                required
                disabled={atLimit || saving}
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder={sw ? "Jina kamili" : "Full name"}
                className={cn(
                  "rounded-xl border px-3 py-2 text-xs font-medium",
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
                  "rounded-xl border px-3 py-2 text-xs font-medium",
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
                  "rounded-xl border px-3 py-2 text-xs font-semibold",
                  sunlightMode
                    ? "border-slate-300 bg-slate-50 text-slate-950"
                    : "border-slate-700 bg-slate-950 text-white"
                )}
              >
                <option value="Family">{sw ? "Familia" : "Family"}</option>
                <option value="Kituo Leader">
                  {sw ? "Kiongozi wa Kituo" : "Kituo Stage Leader"}
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
                {sw
                  ? "Washa tahadhari ya SOS kwao"
                  : "Include in SOS alert escalation"}
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
                    ? "Wote 3 Wamehifadhiwa"
                    : "Max 3 Saved"
                  : sw
                    ? "Hifadhi Mtu"
                    : "Save Contact"}
              </Button>
            </div>
          </form>
        </section>

        {/* Role-Specific Shift Safety Checklist */}
        <section
          className={cn(
            "space-y-3 rounded-3xl border p-5",
            sunlightMode
              ? "border-slate-300 bg-white text-slate-950"
              : "border-slate-800 bg-slate-900 text-white"
          )}
        >
          <h2 className="text-base font-extrabold">
            {isBodaboda
              ? sw
                ? "Orodha ya Usalama wa Bodaboda Rider"
                : "Bodaboda Rider Pre-Shift Safety Checklist"
              : sw
                ? "Orodha ya Usalama wa Dereva wa Bajaji"
                : "Bajaji Driver Pre-Shift Safety Checklist"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div
              className={cn(
                "rounded-2xl border p-3.5 text-xs",
                sunlightMode
                  ? "border-teal-200 bg-teal-50"
                  : "border-teal-500/30 bg-teal-950/40"
              )}
            >
              <HardHat className="h-5 w-5 text-amber-400" />
              <p className="mt-2 font-extrabold">
                {isBodaboda
                  ? sw
                    ? "Helmeti 2 Safi (Lazima)"
                    : "2x Clean Helmets (Mandatory)"
                  : sw
                    ? "Upeo wa Abiria 3 Tu"
                    : "Max 3 Passengers Enforced"}
              </p>
              <p className="mt-1 opacity-80">
                {isBodaboda
                  ? sw
                    ? "Mpe kila mteja helmeti safi ili kulinda alama yako na kupata beji ya Verified Safe Rider."
                    : "Provide a clean passenger helmet on every trip to earn your Verified Safe Rider badge."
                  : sw
                    ? "Usipakie zaidi ya abiria 3; hakikisha taa na breki zinafanya kazi vizuri."
                    : "Never exceed 3 passengers; verify headlights, indicators, and brakes before going online."}
              </p>
            </div>
            <div
              className={cn(
                "rounded-2xl border p-3.5 text-xs",
                sunlightMode
                  ? "border-amber-200 bg-amber-50"
                  : "border-amber-500/30 bg-amber-950/30"
              )}
            >
              <KeyRound className="h-5 w-5 text-amber-400" />
              <p className="mt-2 font-extrabold">
                {sw
                  ? "Thibitisha PIN ya Namba 4 Kabla ya Kuondoka"
                  : "Verify 4-Digit Start PIN Before Departing"}
              </p>
              <p className="mt-1 opacity-80">
                {sw
                  ? "Daima pokea PIN kutoka kwa mteja na fuata mipaka ya Stone Town Smart Snap."
                  : "Always confirm the Customer's 4-digit Start PIN and meet at Stone Town Smart Snap gates."}
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Bottom Partner Navigation */}
      <nav
        className={cn(
          "fixed bottom-0 left-0 right-0 z-30 border-t",
          sunlightMode
            ? "border-slate-300 bg-white"
            : "border-slate-800 bg-slate-950"
        )}
      >
        <div className="mx-auto grid max-w-2xl grid-cols-2 py-2.5 text-center text-xs font-bold">
          <Link
            href={partnerId ? "/partner/dashboard" : "/partner/login"}
            className="flex items-center justify-center gap-2 text-slate-400 hover:text-amber-400"
          >
            <Power className="h-4 w-4" />
            {partnerId
              ? sw
                ? "Rudi Kwenye Zamu"
                : "Back to Shift Dashboard"
              : sw
                ? "Ingia Partner"
                : "Partner Sign In"}
          </Link>
          <Link
            href="/safety"
            className="flex items-center justify-center gap-2 text-amber-400"
          >
            <ShieldCheck className="h-4 w-4" />
            {sw ? "Usalama & Dharura" : "Safety & Emergency"}
          </Link>
        </div>
      </nav>
    </div>
  );
}
