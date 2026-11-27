"use client";

import * as React from "react";
import Link from "next/link";
import { Bike, CarFront, Heart, Loader2, MapPin, Save, Star, Trash2 } from "lucide-react";
import { Badge, Button, Card, cn } from "@goboda/ui";
import { PaymentMethod, TransportType } from "@goboda/shared-types";
import { CustomerPortalShell } from "./customer-portal-shell";

interface Profile {
  id: string;
  phone: string;
  name: string;
  displayName: string;
  email: string;
  defaultTransport: string;
  defaultPaymentMethod: string;
  preferredLanguage: string;
  avatarUrl: string | null;
}

interface Favorite {
  id: string;
  operatorId: string;
  transportType: string;
  operatorName: string;
  operatorPlate: string;
  rating: number;
  createdAt: string;
}

interface SavedPlace {
  id: string;
  label: string;
  kind: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}

export function CustomerProfileView({
  locale,
  customerId,
  customerName,
  customerPhone,
}: {
  locale: "sw" | "en";
  customerId: string;
  customerName?: string;
  customerPhone?: string;
}) {
  const sw = locale === "sw";
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [favorites, setFavorites] = React.useState<Favorite[]>([]);
  const [places, setPlaces] = React.useState<SavedPlace[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [defaultTransport, setDefaultTransport] = React.useState("BODABODA");
  const [defaultPayment, setDefaultPayment] = React.useState("CASH");
  const [preferredLang, setPreferredLang] = React.useState(locale);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, fRes, plRes] = await Promise.all([
        fetch("/api/customer/profile", { cache: "no-store" }),
        fetch("/api/customer/favorites", { cache: "no-store" }),
        fetch("/api/customer/places", { cache: "no-store" }),
      ]);
      if (pRes.ok) {
        const j = await pRes.json();
        setProfile(j.profile);
        setDisplayName(j.profile.displayName ?? "");
        setEmail(j.profile.email ?? "");
        setDefaultTransport(j.profile.defaultTransport ?? "BODABODA");
        setDefaultPayment(j.profile.defaultPaymentMethod ?? "CASH");
        setPreferredLang((j.profile.preferredLanguage === "en" ? "en" : "sw"));
      }
      if (fRes.ok) {
        const j = await fRes.json();
        setFavorites(j.favorites ?? []);
      }
      if (plRes.ok) {
        const j = await plRes.json();
        setPlaces(j.places ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [locale]);

  React.useEffect(() => { void load(); }, [load]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await fetch("/api/customer/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName,
          email,
          defaultTransport,
          defaultPaymentMethod: defaultPayment,
          preferredLanguage: preferredLang,
        }),
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const removeFavorite = async (operatorId: string) => {
    await fetch(`/api/customer/favorites?operatorId=${operatorId}`, { method: "DELETE" });
    await load();
  };

  const removePlace = async (id: string) => {
    await fetch(`/api/customer/places/${id}`, { method: "DELETE" });
    await load();
  };

  if (loading) {
    return (
      <CustomerPortalShell locale={locale} customerName={customerName} showSignOut={Boolean(customerName)}>
        <main className="mx-auto max-w-3xl px-4 pt-8 sm:px-6">
          <p className="text-sm text-[#17645F]/70">{sw ? "Inapakia..." : "Loading..."}</p>
        </main>
      </CustomerPortalShell>
    );
  }

  return (
    <CustomerPortalShell locale={locale} customerName={customerName} showSignOut={Boolean(customerName)}>
      <main className="mx-auto max-w-3xl space-y-5 px-4 pt-8 sm:px-6">
        <h1 className="font-display text-3xl uppercase text-[#17645F]">
          {sw ? "Wasifu" : "Profile"}
        </h1>

        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-[#17645F]/75">
            {sw ? "Maelezo ya Wasifu" : "Profile Details"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">{sw ? "Jina" : "Name"}</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 w-full rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3.5 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">{sw ? "Simu" : "Phone"}</label>
              <input value={profile?.phone ?? customerPhone ?? ""} disabled className="mt-1 w-full rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/40 px-3.5 py-2 text-sm text-[#17645F]/60" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">{sw ? "Barua Pepe" : "Email"}</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3.5 py-2 text-sm" />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">{sw ? "Usafiri wa Kawaida" : "Default Transport"}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                { id: "BODABODA", label: "Go.boda", icon: Bike },
                { id: "BAJAJI", label: "Go.bajaji", icon: CarFront },
              ].map((t) => {
                const Icon = t.icon;
                const active = defaultTransport === t.id;
                return (
                  <button key={t.id} onClick={() => setDefaultTransport(t.id)} className={cn("flex items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-bold", active ? "border-[#17645F] bg-[#17645F] text-white" : "border-[#17645F]/20 bg-[#F3EEE8] text-[#17645F]")}>
                    <Icon className="h-4 w-4" /> {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">{sw ? "Malipo ya Kawaida" : "Default Payment"}</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                { id: "CASH", label: sw ? "Pesa" : "Cash" },
                { id: "MOBILE_MONEY", label: sw ? "M-Pesa" : "Mobile Money" },
                { id: "CARD", label: sw ? "Kadi" : "Card" },
              ].map((p) => {
                const active = defaultPayment === p.id;
                return (
                  <button key={p.id} onClick={() => setDefaultPayment(p.id)} className={cn("rounded-full border px-3 py-2 text-xs font-bold", active ? "border-[#17645F] bg-[#17645F] text-white" : "border-[#17645F]/20 bg-[#F3EEE8] text-[#17645F]")}>
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">{sw ? "Lugha" : "Language"}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[
                { id: "sw", label: "Kiswahili" },
                { id: "en", label: "English" },
              ].map((l) => {
                const active = preferredLang === l.id;
                return (
                  <button key={l.id} onClick={() => setPreferredLang(l.id === "en" ? "en" : "sw")} className={cn("rounded-full border px-3 py-2 text-xs font-bold", active ? "border-[#17645F] bg-[#17645F] text-white" : "border-[#17645F]/20 bg-[#F3EEE8] text-[#17645F]")}>
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Button variant="primary" onClick={saveProfile} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {sw ? "Hifadhi" : "Save"}
          </Button>
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-[#17645F]/75">
            {sw ? "Maeneo Yaliyohifadhiwa" : "Saved Places"}
          </h2>
          {places.length === 0 ? (
            <p className="text-xs text-[#17645F]/70">{sw ? "Hakuna maeneo yaliyohifadhiwa bado." : "No saved places yet."}</p>
          ) : (
            <div className="space-y-2">
              {places.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-2xl bg-[#F3EEE8] px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-[#17645F]" />
                    <span className="text-sm font-semibold text-[#122927]">{p.label}</span>
                    <Badge tone="teal">{p.kind}</Badge>
                  </div>
                  <button onClick={() => removePlace(p.id)} className="text-[#A93232] hover:text-[#8A2626]">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="space-y-3 p-5">
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-[#17645F]/75">
            {sw ? "Riders/Drivers Wapendwa (5★)" : "Favorite Operators (5★)"}
          </h2>
          {favorites.length === 0 ? (
            <p className="text-xs text-[#17645F]/70">{sw ? "Hakuna wapendwa bado." : "No favorites yet."}</p>
          ) : (
            <div className="space-y-2">
              {favorites.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-2xl bg-[#F3EEE8] px-3.5 py-2.5">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 fill-[#B86B2B] text-[#B86B2B]" />
                    <span className="text-sm font-semibold text-[#122927]">{f.operatorName || f.operatorId}</span>
                    <span className="text-xs text-[#17645F]/70">{f.operatorPlate}</span>
                    <Badge tone={f.transportType === "BODABODA" ? "teal" : "amber"}>{f.transportType}</Badge>
                  </div>
                  <button onClick={() => removeFavorite(f.operatorId)} className="text-[#A93232] hover:text-[#8A2626]">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>
    </CustomerPortalShell>
  );
}
