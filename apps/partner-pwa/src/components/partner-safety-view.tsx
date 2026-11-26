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
  const nightMode = sunlightMode;

  return (
    <div
      className={cn(
        "min-h-screen pb-24 transition-colors",
        nightMode ? "bg-[#0F3F3C] text-[#F3EEE8]" : "bg-[#F3EEE8] text-[#122927]"
      )}
    >
      <header
        className={cn(
          "sticky top-0 z-30 border-b backdrop-blur",
          nightMode
            ? "border-[#F3EEE8]/15 bg-[#0F3F3C]/95"
            : "border-[#17645F]/15 bg-[#F3EEE8]/95"
        )}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3.5 sm:px-6">
          <BrandLogo
            dark={nightMode}
            subtitle={sw ? "Usalama" : "Safety"}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSunlightMode((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em]",
                nightMode
                  ? "border-[#F3EEE8]/30 bg-[#17645F] text-[#F3EEE8]"
                  : "border-[#17645F]/30 bg-[#FAF7F2] text-[#17645F]"
              )}
            >
              <Sun className="h-3.5 w-3.5" />
              {nightMode ? (sw ? "Mchana" : "Day") : sw ? "Usiku" : "Night"}
            </button>
            <LanguageSwitchLink
              currentLocale={locale}
              hrefSw="/safety?lang=sw"
              hrefEn="/safety?lang=en"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 pt-6 sm:px-6">
        <div
          className={cn(
            "border-b pb-4",
            nightMode ? "border-[#F3EEE8]/15" : "border-[#17645F]/15"
          )}
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] opacity-75">
            OPERATOR SHIFT PROTECTION • UNGUJA
          </p>
          <h1
            className={cn(
              "mt-1 font-display text-4xl uppercase leading-none",
              nightMode ? "text-[#F3EEE8]" : "text-[#17645F]"
            )}
          >
            {sw ? "USALAMA WA ZAMU" : "OPERATOR SAFETY"}
          </h1>
        </div>

        {/* Emergency Contacts */}
        <section
          className={cn(
            "rounded-3xl border p-5 shadow-sm",
            nightMode
              ? "border-[#A93232]/50 bg-[#123D3A] text-[#F3EEE8]"
              : "border-[#A93232]/25 bg-[#FAF7F2] text-[#122927]"
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-[#A93232]" />
              <h2 className="text-sm font-extrabold uppercase tracking-[0.14em]">
                {sw ? "Namba za Dharura" : "Emergency Contacts"}
              </h2>
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
              className="flex items-center justify-center gap-2 rounded-full bg-[#A93232] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] text-white hover:bg-[#8A2626]"
            >
              <PhoneCall className="h-4 w-4" />
              {sw ? "Piga 112" : "Call 112"}
            </a>
            <a
              href={`tel:${OPS_DESK_PHONE}`}
              className="flex items-center justify-center gap-2 rounded-full bg-[#17645F] px-4 py-2.5 text-xs font-bold text-[#F3EEE8] hover:bg-[#114E4A]"
            >
              <PhoneCall className="h-4 w-4 text-[#E6C99E]" />
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
              className={cn(
                "flex items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-xs font-bold uppercase tracking-[0.12em] transition",
                nightMode
                  ? "border-[#F3EEE8]/40 bg-transparent text-[#F3EEE8] hover:bg-[#F3EEE8] hover:text-[#17645F]"
                  : "border-[#17645F] bg-[#FAF7F2] text-[#17645F] hover:bg-[#17645F] hover:text-[#F3EEE8]"
              )}
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          </div>
        </section>

        {!partnerRole && (
          <div
            className={cn(
              "grid grid-cols-2 gap-2 rounded-full border p-1.5",
              nightMode
                ? "border-[#F3EEE8]/15 bg-[#123D3A]"
                : "border-[#17645F]/15 bg-[#FAF7F2]"
            )}
          >
            <button
              type="button"
              onClick={() => setRole("BODABODA_RIDER")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-full py-2 text-xs font-bold transition",
                isBodaboda
                  ? "bg-[#17645F] text-[#F3EEE8]"
                  : "opacity-75 hover:opacity-100"
              )}
            >
              <Bike className="h-4 w-4" />
              {sw ? "Rider wa Bodaboda" : "Bodaboda Rider"}
            </button>
            <button
              type="button"
              onClick={() => setRole("BAJAJI_DRIVER")}
              className={cn(
                "flex items-center justify-center gap-2 rounded-full py-2 text-xs font-bold transition",
                !isBodaboda
                  ? "bg-[#B86B2B] text-[#FAF7F2]"
                  : "opacity-75 hover:opacity-100"
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
            "space-y-4 rounded-3xl border p-5 shadow-sm",
            nightMode
              ? "border-[#F3EEE8]/15 bg-[#123D3A] text-[#F3EEE8]"
              : "border-[#17645F]/15 bg-[#FAF7F2] text-[#122927]"
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-[0.14em]">
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
                "flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-semibold",
                feedback.tone === "ok"
                  ? "border-[#17645F]/35 bg-[#17645F]/15 text-[#17645F]"
                  : "border-[#A93232]/35 bg-[#A93232]/10 text-[#A93232]"
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
              <Loader2 className="h-4 w-4 animate-spin text-[#17645F]" />
              {sw ? "Inapakia..." : "Loading..."}
            </div>
          ) : contacts.length === 0 ? (
            <p
              className={cn(
                "rounded-2xl border border-dashed p-4 text-center text-xs opacity-75",
                nightMode ? "border-[#F3EEE8]/25" : "border-[#17645F]/25"
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
                    "flex flex-wrap items-center justify-between gap-2 rounded-2xl border p-3",
                    nightMode
                      ? "border-[#F3EEE8]/15 bg-[#0D302E]"
                      : "border-[#17645F]/15 bg-[#F3EEE8]/70"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#17645F] text-[#F3EEE8]">
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
                      className="inline-flex items-center gap-1 rounded-full bg-[#17645F] px-3.5 py-1.5 text-xs font-bold text-[#F3EEE8] hover:bg-[#114E4A]"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Share
                    </a>
                    <button
                      type="button"
                      disabled={deletingId === c.id}
                      onClick={() => void handleDelete(c.id)}
                      className="rounded-full border border-[#A93232]/30 p-1.5 text-[#A93232] hover:bg-[#A93232]/10 disabled:opacity-50"
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
                  "rounded-2xl border px-3.5 py-2 text-xs",
                  nightMode
                    ? "border-[#F3EEE8]/20 bg-[#0D302E] text-[#F3EEE8]"
                    : "border-[#17645F]/20 bg-[#F3EEE8]/70 text-[#122927]"
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
                  "rounded-2xl border px-3.5 py-2 text-xs",
                  nightMode
                    ? "border-[#F3EEE8]/20 bg-[#0D302E] text-[#F3EEE8]"
                    : "border-[#17645F]/20 bg-[#F3EEE8]/70 text-[#122927]"
                )}
              />
              <select
                disabled={atLimit || saving}
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className={cn(
                  "rounded-2xl border px-3.5 py-2 text-xs font-semibold",
                  nightMode
                    ? "border-[#F3EEE8]/20 bg-[#0D302E] text-[#F3EEE8]"
                    : "border-[#17645F]/20 bg-[#F3EEE8]/70 text-[#122927]"
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
                  className="h-4 w-4 rounded accent-[#17645F]"
                />
                {sw ? "Washa tahadhari ya SOS" : "Notify on SOS"}
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
        </section>
      </main>

      {/* Bottom Navigation */}
      <nav
        className={cn(
          "fixed bottom-0 left-0 right-0 z-30 border-t backdrop-blur",
          nightMode
            ? "border-[#F3EEE8]/15 bg-[#0F3F3C]/95"
            : "border-[#17645F]/15 bg-[#FAF7F2]/95"
        )}
      >
        <div className="mx-auto grid max-w-2xl grid-cols-2 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.16em]">
          <Link
            href={partnerId ? "/partner/dashboard" : "/partner/login"}
            className="flex items-center justify-center gap-2 opacity-65 hover:opacity-100"
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
            className={cn(
              "flex items-center justify-center gap-2",
              nightMode ? "text-[#E6C99E]" : "text-[#17645F]"
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            {sw ? "Usalama" : "Safety"}
          </Link>
        </div>
      </nav>
    </div>
  );
}
