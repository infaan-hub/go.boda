"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Bike, CarFront, CheckCircle2, Clock3, Loader2, MapPin, Navigation, Route, Wallet } from "lucide-react";
import { formatTzs } from "@goboda/shared-types";
import { PartnerPortalShell } from "./partner-portal-shell";
import { usePartnerRealtime } from "./partner-realtime-provider";

type Stage = "queue" | "confirm" | "pickup" | "destination" | "finalize";
type Point = { lat: number; lng: number };

function distanceKm(a: Point, b: Point) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const arc = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

function mapUrl(current: Point | null, target: Point) {
  if (!current) return `https://www.openstreetmap.org/export/embed.html?bbox=${target.lng - 0.04}%2C${target.lat - 0.04}%2C${target.lng + 0.04}%2C${target.lat + 0.04}&layer=mapnik&marker=${target.lat}%2C${target.lng}`;
  const lngPad = Math.max(0.009, Math.abs(current.lng - target.lng) * 0.35);
  const latPad = Math.max(0.009, Math.abs(current.lat - target.lat) * 0.35);
  const west = Math.min(current.lng, target.lng) - lngPad;
  const east = Math.max(current.lng, target.lng) + lngPad;
  const south = Math.min(current.lat, target.lat) - latPad;
  const north = Math.max(current.lat, target.lat) + latPad;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${west}%2C${south}%2C${east}%2C${north}&layer=mapnik&marker=${current.lat}%2C${current.lng}`;
}

export function PartnerTripWorkflowView({ locale, stage }: { locale: "sw" | "en"; stage: Stage }) {
  const sw = locale === "sw";
  const router = useRouter();
  const { snapshot, refreshNow } = usePartnerRealtime();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [gpsError, setGpsError] = React.useState("");
  const [current, setCurrent] = React.useState<Point | null>(null);
  const nightMode = false;
  const activeTrip = snapshot?.activeTrip ?? null;
  const pendingOffers = snapshot?.pendingOffers ?? [];
  const activeTripId = activeTrip?.id ?? null;
  const isBodaboda = snapshot?.transportType === "BODABODA";
  const currentFromServer = snapshot?.profile?.lat != null && snapshot.profile.lng != null
    ? { lat: snapshot.profile.lat, lng: snapshot.profile.lng }
    : null;
  const here = current ?? currentFromServer;
  const target = stage === "pickup" || stage === "destination"
    ? activeTrip ? { lat: activeTrip.dropoffLat, lng: activeTrip.dropoffLng } : null
    : activeTrip ? { lat: activeTrip.pickupEffectiveLat, lng: activeTrip.pickupEffectiveLng } : null;
  const liveDistanceKm = here && target ? distanceKm(here, target) : null;
  const liveEtaMinutes = liveDistanceKm === null ? null : Math.max(1, Math.ceil((liveDistanceKm / 22) * 60));

  React.useEffect(() => {
    if (stage === "queue" && activeTrip) {
      sessionStorage.setItem("goboda-active-trip", activeTrip.id);
      const next = activeTrip.status === "ASSIGNED" ? "confirm"
        : activeTrip.status === "ARRIVED_AT_PICKUP" || activeTrip.status === "IN_PROGRESS" ? "pickup"
          : activeTrip.status === "COMPLETED_UNPAID" ? "destination" : null;
      if (next) router.replace(`/partner/trips/${next}/`);
    }
  }, [activeTrip?.id, activeTrip?.status, router, stage]);

  React.useEffect(() => {
    if (stage !== "destination" || activeTrip) return;
    const tripId = sessionStorage.getItem("goboda-active-trip");
    if (!tripId) return;
    let cancelled = false;
    void fetch("/api/partner/trips?range=all&status=ALL", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        const trip = (data.trips ?? []).find((row: { id: string }) => row.id === tripId);
        if (!cancelled && trip?.status === "PAID_COMPLETED") {
          router.replace(`/partner/trips/finalize/?trip=${tripId}`);
        }
      })
      .catch(() => null);
    return () => { cancelled = true; };
  }, [activeTrip, router, snapshot?.version, stage]);

  React.useEffect(() => {
    if (!activeTripId || (stage !== "confirm" && stage !== "pickup")) return;
    if (!("geolocation" in navigator)) {
      setGpsError(sw ? "GPS haipatikani kwenye kifaa hiki." : "GPS is unavailable on this device.");
      return;
    }
    let lastSent = 0;
    const watch = navigator.geolocation.watchPosition((position) => {
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      setCurrent(point);
      setGpsError("");
      if (Date.now() - lastSent < 5000) return;
      lastSent = Date.now();
      void fetch("/api/partner/trip-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "GPS_UPDATE", tripId: activeTripId, ...point,
          heading: position.coords.heading ?? 0,
          speedKmh: Math.max(0, (position.coords.speed ?? 0) * 3.6),
        }),
      }).catch(() => null);
    }, () => setGpsError(sw ? "Washa ruhusa ya GPS ili kufuatilia safari moja kwa moja." : "Allow GPS access to update the live route."), { enableHighAccuracy: true, maximumAge: 3000, timeout: 12000 });
    return () => navigator.geolocation.clearWatch(watch);
  }, [activeTripId, stage, sw]);

  async function act(action: string, values: Record<string, unknown> = {}) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/partner/trip-action", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...values }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.error || "Could not update the trip.");
      await refreshNow();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the trip.");
      return null;
    } finally { setBusy(false); }
  }

  async function accept(offerId: string) {
    const result = await act("ACCEPT_OFFER", { offerId });
    if (result?.tripId) {
      sessionStorage.setItem("goboda-active-trip", result.tripId);
      router.push("/partner/trips/confirm/");
    }
  }
  async function decline(offerId: string) {
    await act("DECLINE_OFFER", { offerId });
  }
  async function pickup() {
    if (!activeTrip) return;
    const arrived = await act("ARRIVE", { tripId: activeTrip.id });
    if (!arrived) return;
    const started = await act("START", { tripId: activeTrip.id, startPin: activeTrip.startPin });
    if (started) router.push("/partner/trips/pickup/");
  }
  async function destination() {
    if (!activeTrip) return;
    const result = await act("COMPLETE_TRIP", { tripId: activeTrip.id });
    if (result?.completed) router.push("/partner/trips/destination/");
  }
  async function confirmPayment() {
    if (!activeTrip) return;
    const action = activeTrip.paymentMethod === "CASH" ? "COMPLETE_CASH" : "CONFIRM_DIGITAL";
    const result = await act(action, { tripId: activeTrip.id });
    if (result?.completed || result?.confirmed) router.push(`/partner/trips/finalize/?trip=${activeTrip.id}`);
  }

  React.useEffect(() => {
    if (stage !== "finalize") return;
    const params = new URLSearchParams(window.location.search);
    const trip = params.get("trip");
    if (trip) {
      sessionStorage.setItem("goboda-finalized-trip", trip);
      sessionStorage.removeItem("goboda-active-trip");
    }
  }, [stage]);

  const historyUrl = "/partner/tripshistory/";
  const categoryLabel = isBodaboda ? (sw ? "Rider wa Bodaboda" : "Bodaboda Rider") : (sw ? "Dereva wa Bajaji" : "Bajaji Driver");
  const title = stage === "queue" ? (sw ? "Safari Mpya" : "New Trips")
    : stage === "confirm" ? (sw ? "Safari Imethibitishwa" : "Trip Confirmed")
      : stage === "pickup" ? (sw ? "Njiani na Abiria" : "Passenger On Board")
        : stage === "destination" ? (sw ? "Thibitisha Malipo" : "Confirm Payment")
          : (sw ? "Safari Imekamilika" : "Trip Finalized");

  return <PartnerPortalShell locale={locale} categoryLabel={categoryLabel} nightMode={nightMode} onToggleNightMode={() => {}}>
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <header className="border-b border-[#17645F]/15 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#17645F]/70">{categoryLabel}</p>
        <h1 className="mt-1 font-display text-4xl uppercase leading-none text-[#17645F]">{title}</h1>
      </header>
      {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
      {stage === "queue" ? <>
        {activeTrip ? <section className="rounded-3xl border border-[#17645F]/15 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase text-[#17645F]">{activeTrip.tripCode} · {activeTrip.status.replaceAll("_", " ")}</p>
          <p className="mt-3 text-sm">{activeTrip.pickupLabel} → {activeTrip.dropoffLabel}</p>
          <button className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#17645F] px-4 py-3 text-sm font-bold text-white" onClick={() => router.push(`/partner/trips/${activeTrip.status === "ASSIGNED" ? "confirm" : activeTrip.status === "COMPLETED_UNPAID" ? "destination" : "pickup"}/`)}>{sw ? "Endelea na safari" : "Continue trip"}<ArrowRight className="h-4 w-4" /></button>
        </section> : null}
        {pendingOffers.map((offer) => <article key={offer.offerId} className="space-y-4 rounded-3xl border border-[#17645F]/15 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><span className="font-mono text-sm font-extrabold">{offer.tripCode}</span><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">{sw ? "INASUBIRI" : "PENDING"}</span></div>
          <div className="space-y-2 text-sm"><p className="flex gap-2"><MapPin className="h-4 w-4 text-[#17645F]" />{offer.pickupLabel}</p><p className="flex gap-2"><Navigation className="h-4 w-4 text-[#B86B2B]" />{offer.dropoffLabel}</p></div>
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#F3EEE8] p-3 text-xs"><div><p className="opacity-60">{sw ? "Safari" : "Route"}</p><b>{(offer.distanceMeters / 1000).toFixed(1)} km</b></div><div><p className="opacity-60">{sw ? "Muda" : "ETA"}</p><b>{offer.etaMinutes} min</b></div><div><p className="opacity-60">{sw ? "Nauli" : "Fare"}</p><b>{formatTzs(offer.estimatedFareTzs)}</b></div></div>
          <div className="flex gap-2"><button disabled={busy} onClick={() => void accept(offer.offerId)} className="flex-1 rounded-xl bg-[#17645F] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : (sw ? "Thibitisha safari" : "Confirm trip")}</button><button disabled={busy} onClick={() => void decline(offer.offerId)} className="rounded-xl border border-rose-200 px-4 py-3 text-sm font-bold text-rose-700">{sw ? "Kataa" : "Decline"}</button></div>
        </article>)}
        {!activeTrip && pendingOffers.length === 0 ? <div className="rounded-3xl border border-dashed border-[#17645F]/25 bg-white p-8 text-center"><Route className="mx-auto h-8 w-8 text-[#17645F]" /><p className="mt-3 font-bold">{sw ? "Hakuna ombi jipya kwa sasa" : "No new trip requests right now"}</p><p className="mt-1 text-sm text-[#122927]/60">{sw ? "Ombi likifika, litaonekana hapa moja kwa moja." : "New requests appear here as soon as dispatch sends them."}</p></div> : null}
        <a href={historyUrl} className="block text-center text-sm font-bold text-[#17645F] underline">{sw ? "Tazama historia ya safari" : "View trip history"}</a>
      </> : stage === "finalize" ? <FinalizeCard locale={locale} /> : activeTrip ? <>
        <section className="rounded-3xl border border-[#17645F]/15 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase text-[#17645F]">{activeTrip.tripCode}</p><p className="mt-1 text-lg font-bold">{activeTrip.pickupLabel} → {activeTrip.dropoffLabel}</p></div>{isBodaboda ? <Bike className="h-7 w-7 text-[#17645F]" /> : <CarFront className="h-7 w-7 text-[#B86B2B]" />}</div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric icon={<Route className="h-4 w-4" />} label={stage === "confirm" ? (sw ? "Umbali hadi pickup" : "Distance to pickup") : (sw ? "Umbali hadi mwisho" : "Distance to destination")} value={liveDistanceKm == null ? `${((stage === "confirm" ? activeTrip.pickupDistanceMeters ?? activeTrip.distanceMeters : activeTrip.distanceMeters) / 1000).toFixed(1)} km` : `${liveDistanceKm.toFixed(2)} km`} />
            <Metric icon={<Clock3 className="h-4 w-4" />} label={sw ? "Muda uliokadiriwa" : "Estimated time"} value={liveEtaMinutes == null ? `${stage === "confirm" ? activeTrip.pickupEtaMinutes ?? Math.max(1, Math.ceil(activeTrip.durationSeconds / 60)) : Math.max(1, Math.ceil(activeTrip.durationSeconds / 60))} min` : `${liveEtaMinutes} min`} />
          </div>
          <p className="mt-3 text-[11px] text-[#122927]/55">{sw ? "Umbali na muda husasishwa kutoka eneo la GPS la kifaa." : "Distance and time update from this device’s live GPS position."}</p>
        </section>
        <button type="button" onClick={() => document.getElementById("partner-live-route-map")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#17645F]/20 bg-white px-4 py-3 text-sm font-bold text-[#17645F]">
          <MapPin className="h-4 w-4" />{sw ? "Tazama eneo la moja kwa moja" : "View live location"}
        </button>
        {target ? <section id="partner-live-route-map" className="overflow-hidden rounded-3xl border border-[#17645F]/15 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-2 p-4"><div><p className="text-[10px] font-bold uppercase tracking-widest text-[#17645F]">{sw ? "RAMANI YA ENEO LA MOJA KWA MOJA" : "LIVE ROUTE MAP"}</p><p className="mt-1 text-sm font-bold">{stage === "confirm" ? activeTrip.pickupLabel : activeTrip.dropoffLabel}</p></div><MapPin className="h-5 w-5 text-[#B86B2B]" /></div>
          <iframe key={`${here?.lat.toFixed(4)}-${here?.lng.toFixed(4)}-${target.lat}-${target.lng}`} title={sw ? "Ramani ya safari ya moja kwa moja" : "Live trip route map"} src={mapUrl(here, target)} className="h-72 w-full border-0" loading="lazy" referrerPolicy="no-referrer" />
          <div className="flex flex-wrap items-center justify-between gap-2 p-4 text-xs"><span>{here ? (sw ? "Eneo lako la sasa linafuatiliwa" : "Your current location is being tracked") : (sw ? "Inasubiri eneo la GPS…" : "Waiting for GPS location…")}</span>{gpsError && <span className="text-amber-800">{gpsError}</span>}<a target="_blank" rel="noreferrer" className="font-bold text-[#17645F] underline" href={`https://www.google.com/maps/dir/?api=1&origin=${here ? `${here.lat},${here.lng}` : ""}&destination=${target.lat},${target.lng}`}>{sw ? "Fungua maelekezo" : "Open directions"}</a></div>
        </section> : null}
        {stage === "confirm" ? <ActionButton busy={busy} icon={<Navigation className="h-4 w-4" />} onClick={() => void pickup()} label={sw ? "Nimefika pickup • Anza safari" : "At pickup • Start trip"} />
          : stage === "pickup" ? <>
            {activeTrip.stops.length > 0 ? <StopItinerary stops={activeTrip.stops} locale={locale} /> : null}
            <section className="rounded-2xl bg-[#17645F]/10 p-4 text-sm"><b>{sw ? "Abiria amepakiwa" : "Passenger picked up"}</b><p className="mt-1 text-[#122927]/70">{sw ? "Fuata eneo la kushukia. Umbali na muda vinabadilika kadiri GPS inavyosasishwa." : "Head to the destination. Distance and ETA update as your GPS location changes."}</p></section>
            <ActionButton busy={busy} icon={<ArrowRight className="h-4 w-4" />} onClick={() => void destination()} label={sw ? "Nimefika mwisho" : "Destination reached"} />
          </> : <>
            {activeTrip.stops.length > 0 ? <StopItinerary stops={activeTrip.stops} locale={locale} /> : null}
            <section className="rounded-3xl border border-[#17645F]/15 bg-white p-5 shadow-sm"><p className="flex items-center gap-2 text-sm font-bold"><Wallet className="h-4 w-4 text-[#17645F]" />{sw ? "Malipo ya safari" : "Trip payment"}</p><p className="mt-3 font-display text-3xl text-[#17645F]">{formatTzs(activeTrip.finalFareTzs ?? activeTrip.estimatedFareTzs)}</p><p className="mt-1 text-xs text-[#122927]/60">{activeTrip.paymentMethod} · {(activeTrip.distanceMeters / 1000).toFixed(2)} km {activeTrip.durationSeconds > 0 ? `· ${Math.ceil(activeTrip.durationSeconds / 60)} min` : ""}</p><p className="mt-3 text-xs text-[#122927]/60">{sw ? "Thibitisha kupokea malipo ili kufunga safari." : "Confirm receipt of payment to finalize the trip."}</p></section>
            <ActionButton busy={busy} icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => void confirmPayment()} label={sw ? "Nimethibitisha malipo" : "Confirm payment"} />
          </>}
      </> : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">{sw ? "Safari haiwezi kupatikana. Rudi kwenye safari mpya." : "The active trip could not be found. Return to New Trips."}<a href="/partner/trips/" className="ml-2 font-bold underline">{sw ? "Safari mpya" : "New trips"}</a></div>}
    </main>
  </PartnerPortalShell>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-2xl bg-[#F3EEE8] p-3"><p className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-[#17645F]/70">{icon}{label}</p><p className="mt-1 font-display text-2xl text-[#17645F]">{value}</p></div>;
}

function StopItinerary({ stops, locale }: { stops: Array<{ id: string; order: number; label: string; isPickup: boolean; isDropoff: boolean }>; locale: "sw" | "en" }) {
  return <section className="rounded-2xl border border-[#17645F]/15 bg-white p-4">
    <h2 className="text-xs font-bold uppercase tracking-wider text-[#17645F]">{locale === "sw" ? "Vituo vya safari" : "Trip stops"}</h2>
    <ol className="mt-3 space-y-2">
      {stops.map((stop) => <li key={stop.id} className="flex items-start gap-3 text-sm">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#17645F]/10 text-xs font-bold text-[#17645F]">{stop.order}</span>
        <span>{stop.label}<span className="ml-2 text-[10px] font-bold uppercase text-[#17645F]/65">{stop.isPickup ? (locale === "sw" ? "Pickup" : "Pickup") : stop.isDropoff ? (locale === "sw" ? "Mwisho" : "Destination") : (locale === "sw" ? "Kituo" : "Stop")}</span></span>
      </li>)}
    </ol>
  </section>;
}

function ActionButton({ busy, icon, onClick, label }: { busy: boolean; icon: React.ReactNode; onClick: () => void; label: string }) {
  return <button disabled={busy} onClick={onClick} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#17645F] px-5 py-4 text-sm font-extrabold text-white shadow-sm disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}{label}</button>;
}

function FinalizeCard({ locale }: { locale: "sw" | "en" }) {
  const sw = locale === "sw";
  const [trip, setTrip] = React.useState<{ tripCode?: string; pickupLabel?: string; dropoffLabel?: string; finalFareTzs?: number; estimatedFareTzs?: number } | null>(null);
  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("trip") || sessionStorage.getItem("goboda-finalized-trip");
    if (!id) return;
    void fetch("/api/partner/trips?range=all&status=ALL", { cache: "no-store" }).then((r) => r.json()).then((data) => setTrip((data.trips ?? []).find((row: { id: string }) => row.id === id) ?? null)).catch(() => null);
  }, []);
  return <section className="rounded-3xl border border-emerald-200 bg-white p-7 text-center shadow-sm"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-7 w-7" /></span><h2 className="mt-4 font-display text-3xl uppercase text-[#17645F]">{sw ? "SAFARI IMEKAMILIKA" : "TRIP FINALIZED"}</h2>{trip ? <><p className="mt-2 text-sm font-bold">{trip.tripCode}</p><p className="mt-1 text-sm text-[#122927]/70">{trip.pickupLabel} → {trip.dropoffLabel}</p><p className="mt-3 font-display text-2xl text-[#17645F]">{formatTzs(trip.finalFareTzs ?? trip.estimatedFareTzs ?? 0)}</p></> : null}<a href="/partner/tripshistory/" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#17645F] px-4 py-3 text-sm font-bold text-white">{sw ? "Historia ya safari" : "View trip history"}<ArrowRight className="h-4 w-4" /></a></section>;
}
