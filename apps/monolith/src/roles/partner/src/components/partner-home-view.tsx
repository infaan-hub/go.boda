"use client";

import * as React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  BellRing,
  Bike,
  CalendarClock,
  Camera,
  CarFront,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  FileCheck2,
  Flame,
  History,
  KeyRound,
  MapPin,
  MessageSquare,
  Navigation,
  PhoneCall,
  Power,
  ShieldAlert,
  ShieldCheck,
  Star,
  TrendingUp,
  User,
  XCircle,
} from "lucide-react";
import {
  Badge,
  Button,
  EditorialScrollHero,
  ScrollReveal,
  cn,
} from "@goboda/ui";
import {
  PLATFORM_FINANCE,
  TransportType,
  TripStatus,
  formatTzs,
} from "@goboda/shared-types";
import { PartnerPortalShell } from "./partner-portal-shell";
import { PartnerCompliancePanel } from "./partner-compliance-panel";
import {
  PartnerEarningsPanel,
  type EarningsLedgerRow,
} from "./partner-earnings-panel";
import { usePartnerRealtime } from "./partner-realtime-provider";
import {
  buildAppleMapsDirectionsUrl,
  buildGoogleMapsDirectionsUrl,
} from "../lib/partner-navigation";

interface DemoOffer {
  offerId?: string;
  tripId?: string;
  isLiveDb?: boolean;
  tripCode: string;
  transportType: TransportType;
  customerName: string;
  pickupLabel: string;
  pickupSnapped?: boolean;
  pickupSnapGateName?: string | null;
  dropoffLabel: string;
  pickupCoords: { lat: number; lng: number };
  dropoffCoords: { lat: number; lng: number };
  distanceKm: number;
  etaMinutes: number;
  fareTzs: number;
  paymentMethod: "CASH" | "MOBILE_MONEY" | "CARD";
  startPin: string;
}

interface QuickChatMsg {
  id: string;
  sender: "OPERATOR" | "CUSTOMER";
  text: string;
  time: string;
}

const OPERATOR_PRESETS = [
  {
    key: "ON_THE_WAY",
    sw: "Niko njiani nakuja sasa hivi!",
    en: "I am on my way right now!",
  },
  {
    key: "ARRIVED_GATE",
    sw: "Nimefika kituoni / getini, nakusubiri.",
    en: "I have arrived at the pickup gate.",
  },
  {
    key: "CALL_ME",
    sw: "Tafadhali nipigie simu tukutane haraka.",
    en: "Please call me so we can meet quickly.",
  },
] as const;

function playOfferChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [880, 1174.66];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.16);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + idx * 0.16 + 0.25
      );
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.16);
      osc.stop(ctx.currentTime + idx * 0.16 + 0.26);
    });
  } catch {
    // Ignore autoplay restriction if user has not interacted yet
  }
  try {
    if ("vibrate" in navigator) {
      navigator.vibrate([180, 90, 180]);
    }
  } catch {
    // Ignore unsupported vibration API
  }
}

function PartnerHomeContent({
  page = "shift",
  locale,
  nightMode,
  partnerName,
  partnerTransportType,
  partnerPlateNumber,
  partnerKituo,
}: {
  page?: "shift" | "earnings" | "kyc";
  locale: "sw" | "en";
  nightMode: boolean;
  partnerName?: string;
  partnerTransportType?: TransportType;
  partnerPlateNumber?: string;
  partnerKituo?: string;
}) {
  const t = useTranslations();
  const { snapshot, refreshNow } = usePartnerRealtime();
  const [operatorType, setOperatorType] = React.useState<TransportType>(
    partnerTransportType ?? TransportType.BODABODA
  );
  const [isOnline, setIsOnline] = React.useState(false);
  const [availabilityBusy, setAvailabilityBusy] = React.useState(false);

  // Shift & Earnings Counters (hydrated live via WebSocket / SSE snapshot)
  const [todayNetTzs, setTodayNetTzs] = React.useState(0);
  const [tripsToday, setTripsToday] = React.useState(0);
  const [earningsLedger, setEarningsLedger] = React.useState<
    EarningsLedgerRow[]
  >([]);

  // Phase 3 & 4 Dispatch, Trip Lifecycle, SOS & Customer Rating state
  const [incomingOffer, setIncomingOffer] = React.useState<DemoOffer | null>(
    null
  );
  const [offerSecondsLeft, setOfferSecondsLeft] = React.useState(20);
  const [statusNotice, setStatusNotice] = React.useState<string | null>(null);

  const [activeTrip, setActiveTrip] = React.useState<DemoOffer | null>(null);
  const [tripStatus, setTripStatus] = React.useState<TripStatus | null>(null);
  const [waitSeconds, setWaitSeconds] = React.useState(0);
  const [pinInput, setPinInput] = React.useState("");
  const [pinError, setPinError] = React.useState<string | null>(null);
  const [chatLog, setChatLog] = React.useState<QuickChatMsg[]>([]);
  const [sosDrawerOpen, setSosDrawerOpen] = React.useState(false);
  const [sosCode, setSosCode] = React.useState<string | null>(null);
  const [customerRating, setCustomerRating] = React.useState(5);

  // Multi-step Mobile Camera KYC Onboarding state
  const [kycName, setKycName] = React.useState(partnerName ?? "Hassan Ali");
  const [kycPlate, setKycPlate] = React.useState(
    partnerPlateNumber ?? "Z 104 AAB"
  );
  const [kycKituo, setKycKituo] = React.useState(
    partnerKituo ?? "Darajani / Creek Road Stage"
  );
  const [kycLicense, setKycLicense] = React.useState("ZN-A-48219");
  const [kycPayoutPhone, setKycPayoutPhone] = React.useState("+255770123456");
  const [kycDocs, setKycDocs] = React.useState<Record<string, string>>({});
  const [kycSubmitted, setKycSubmitted] = React.useState(false);

  // Keep screen awake while online
  React.useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;

    async function syncWakeLock() {
      if (
        !isOnline ||
        typeof navigator === "undefined" ||
        !("wakeLock" in navigator)
      ) {
        return;
      }
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Ignore wake lock errors on unsupported devices
      }
    }

    void syncWakeLock();
    return () => {
      sentinel?.release().catch(() => {});
    };
  }, [isOnline]);

  // 20-second dispatch offer countdown
  React.useEffect(() => {
    if (!incomingOffer) return;
    if (offerSecondsLeft <= 0) {
      setIncomingOffer(null);
      setStatusNotice(t("partner.offerExpired"));
      return;
    }
    const timer = setTimeout(() => {
      setOfferSecondsLeft((s) => s - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [incomingOffer, offerSecondsLeft, t]);

  // 5-minute free arrival wait timer
  React.useEffect(() => {
    if (tripStatus !== TripStatus.ARRIVED_AT_PICKUP) return;
    const interval = setInterval(() => {
      setWaitSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [tripStatus]);

  // Live WebSocket / SSE hydration (zero refresh needed for offers, active trips, shift status & earnings)
  const lastLiveOfferIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!snapshot) return;

    if (snapshot.profile) {
      setIsOnline(snapshot.profile.isOnline);
    }

    setTodayNetTzs(snapshot.todayStats.todayNetTzs);
    setTripsToday(snapshot.todayStats.tripsToday);
    setEarningsLedger(snapshot.todayStats.recentEarnings);

    // Sync live active trip from Neon Postgres
    if (snapshot.activeTrip) {
      const live = snapshot.activeTrip;
      setActiveTrip({
        tripId: live.id,
        isLiveDb: true,
        tripCode: live.tripCode,
        transportType:
          live.transportType === "BAJAJI"
            ? TransportType.BAJAJI
            : TransportType.BODABODA,
        customerName: locale === "sw" ? "Abiria wa Go.Boda" : "Go.Boda Passenger",
        pickupLabel: live.pickupLabel,
        pickupSnapped: live.pickupSnapped,
        pickupSnapGateName: live.pickupSnapGateName,
        dropoffLabel: live.dropoffLabel,
        pickupCoords: {
          lat: live.pickupEffectiveLat,
          lng: live.pickupEffectiveLng,
        },
        dropoffCoords: {
          lat: live.dropoffLat,
          lng: live.dropoffLng,
        },
        distanceKm: Number((live.distanceMeters / 1000).toFixed(1)),
        etaMinutes: 2,
        fareTzs: live.finalFareTzs ?? live.estimatedFareTzs,
        paymentMethod: live.paymentMethod,
        startPin: live.startPin,
      });
      setTripStatus(live.status as TripStatus);
      setIncomingOffer(null);
      return;
    }

    // If a live DB trip just completed remotely, clear local live trip
    setActiveTrip((prev) => (prev?.isLiveDb ? null : prev));

    // Sync incoming live pending offer from dispatch.offers (category-isolated)
    const liveOffer = snapshot.pendingOffers[0];
    if (liveOffer && lastLiveOfferIdRef.current !== liveOffer.offerId) {
      lastLiveOfferIdRef.current = liveOffer.offerId;
      const secsLeft = Math.max(
        3,
        Math.min(
          PLATFORM_FINANCE.DISPATCH_OFFER_TTL_SECONDS,
          Math.ceil((new Date(liveOffer.expiresAt).getTime() - Date.now()) / 1000)
        )
      );
      setIncomingOffer({
        offerId: liveOffer.offerId,
        tripId: liveOffer.tripId,
        isLiveDb: true,
        tripCode: liveOffer.tripCode,
        transportType:
          liveOffer.transportType === "BAJAJI"
            ? TransportType.BAJAJI
            : TransportType.BODABODA,
        customerName: locale === "sw" ? "Abiria wa Karibu" : "Nearby Passenger",
        pickupLabel: liveOffer.pickupLabel,
        pickupSnapped: liveOffer.pickupSnapped,
        pickupSnapGateName: liveOffer.pickupSnapGateName,
        dropoffLabel: liveOffer.dropoffLabel,
        pickupCoords: { lat: liveOffer.pickupLat, lng: liveOffer.pickupLng },
        dropoffCoords: { lat: liveOffer.dropoffLat, lng: liveOffer.dropoffLng },
        distanceKm: Number((liveOffer.distanceMeters / 1000).toFixed(1)),
        etaMinutes: liveOffer.etaMinutes,
        fareTzs: liveOffer.estimatedFareTzs,
        paymentMethod: liveOffer.paymentMethod,
        startPin: liveOffer.startPin,
      });
      setOfferSecondsLeft(secsLeft);
      playOfferChime();
    } else if (!liveOffer) {
      lastLiveOfferIdRef.current = null;
      setIncomingOffer((prev) => (prev?.isLiveDb ? null : prev));
    }
  }, [snapshot, locale]);

  const hasAssignedCategory = Boolean(partnerTransportType);
  const activeOperatorType = partnerTransportType ?? operatorType;
  const isBodabodaRider = activeOperatorType === TransportType.BODABODA;

  const requiredKycDocs = isBodabodaRider
    ? [
        { key: "NATIONAL_ID", labelSw: "Kitambulisho (NIDA / ZanID)", labelEn: "National ID (NIDA / ZanID)" },
        { key: "LICENSE", labelSw: "Leseni ya Pikipiki (Class A)", labelEn: "Motorcycle License (Class A)" },
        { key: "VEHICLE_PHOTO", labelSw: "Picha ya Pikipiki + Namba Z", labelEn: "Bodaboda Photo + Z-Plate" },
        { key: "HELMETS", labelSw: "Picha ya Helmeti 2 Safi (Lazima)", labelEn: "2 Clean Helmets Photo (Required)" },
      ]
    : [
        { key: "NATIONAL_ID", labelSw: "Kitambulisho (NIDA / ZanID)", labelEn: "National ID (NIDA / ZanID)" },
        { key: "LICENSE", labelSw: "Leseni ya Udereva wa Bajaji", labelEn: "Bajaji Driver License" },
        { key: "VEHICLE_PHOTO", labelSw: "Picha ya Bajaji + Namba Z", labelEn: "Bajaji 3-Wheeler + Z-Plate" },
        { key: "INSURANCE", labelSw: "Bima Halali ya Chombo", labelEn: "Valid Vehicle Insurance" },
      ];

  const triggerDemoOffer = () => {
    setStatusNotice(null);
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const offer: DemoOffer = isBodabodaRider
      ? {
          tripCode: `GB-${Math.floor(10000 + Math.random() * 90000)}`,
          transportType: TransportType.BODABODA,
          customerName: "Amina Juma",
          pickupLabel:
            locale === "sw"
              ? "Kituo cha Forodhani Edge (Smart Snap)"
              : "Forodhani Gardens Edge (Smart Snap)",
          dropoffLabel:
            locale === "sw"
              ? "Soko la Mwanakwerekwe"
              : "Mwanakwerekwe Market",
          pickupCoords: { lat: -6.1613, lng: 39.1885 },
          dropoffCoords: { lat: -6.1912, lng: 39.2216 },
          distanceKm: 5.4,
          etaMinutes: 2,
          fareTzs: 4500,
          paymentMethod: "CASH",
          startPin: pin,
        }
      : {
          tripCode: `GB-${Math.floor(10000 + Math.random() * 90000)}`,
          transportType: TransportType.BAJAJI,
          customerName: "Juma Bakari",
          pickupLabel:
            locale === "sw"
              ? "Kituo cha Darajani, Stone Town"
              : "Darajani Market Perimeter, Stone Town",
          dropoffLabel:
            locale === "sw"
              ? "Uwanja wa Ndege wa Karume (ZNZ)"
              : "Abeid Amani Karume Airport (ZNZ)",
          pickupCoords: { lat: -6.1649, lng: 39.1936 },
          dropoffCoords: { lat: -6.222, lng: 39.2249 },
          distanceKm: 7.8,
          etaMinutes: 3,
          fareTzs: 10500,
          paymentMethod: "MOBILE_MONEY",
          startPin: pin,
        };

    setIncomingOffer(offer);
    setOfferSecondsLeft(PLATFORM_FINANCE.DISPATCH_OFFER_TTL_SECONDS);
    playOfferChime();
  };

  const handleToggleOnline = async () => {
    const nextOnline = !isOnline;
    setAvailabilityBusy(true);
    setStatusNotice(null);
    setIncomingOffer(null);
    try {
      let lat = -6.1649;
      let lng = 39.1936;
      if (nextOnline && typeof navigator !== "undefined" && "geolocation" in navigator) {
        const pos = await new Promise<GeolocationPosition | null>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (p) => resolve(p),
            () => resolve(null),
            { timeout: 2500, maximumAge: 30000 }
          );
        });
        if (pos) {
          const candLat = pos.coords.latitude;
          const candLng = pos.coords.longitude;
          if (candLat >= -6.5 && candLat <= -5.7 && candLng >= 39.1 && candLng <= 39.6) {
            lat = candLat;
            lng = candLng;
          }
        }
      }

      const res = await fetch("/api/partner/availability", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isOnline: nextOnline, lat, lng }),
      });

      if (res.ok) {
        setIsOnline(nextOnline);
        await refreshNow();
      } else {
        const errJson = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        if (res.status === 401) {
          setIsOnline(nextOnline);
        } else {
          setStatusNotice(
            errJson?.message ||
              (locale === "sw"
                ? "Haiwezekani kubadili hali ya mtandaoni sasa."
                : "Could not update online availability.")
          );
        }
      }
    } catch {
      setIsOnline(nextOnline);
    } finally {
      setAvailabilityBusy(false);
    }
  };

  const handleAcceptOffer = async () => {
    if (!incomingOffer) return;
    if (incomingOffer.isLiveDb && incomingOffer.offerId) {
      const res = await fetch("/api/partner/trip-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "ACCEPT_OFFER",
          offerId: incomingOffer.offerId,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        setStatusNotice(
          err?.message ||
            (locale === "sw"
              ? "Ombi hili limechukuliwa tayari."
              : "This offer is no longer available.")
        );
        setIncomingOffer(null);
        await refreshNow();
        return;
      }
      await refreshNow();
    }
    setActiveTrip(incomingOffer);
    setTripStatus(TripStatus.ASSIGNED);
    setIncomingOffer(null);
    setWaitSeconds(0);
    setPinInput("");
    setPinError(null);
    setChatLog([]);
    setSosCode(null);
    setSosDrawerOpen(false);
    setCustomerRating(5);
  };

  const handleDeclineOffer = async () => {
    const current = incomingOffer;
    setIncomingOffer(null);
    if (current?.isLiveDb && current.offerId) {
      await fetch("/api/partner/trip-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "DECLINE_OFFER",
          offerId: current.offerId,
        }),
      }).catch(() => null);
      await refreshNow();
    }
    setStatusNotice(
      locale === "sw"
        ? "Ombi limekataliwa — limeelekezwa kwa mwendeshaji anayefuata."
        : "Offer declined — auto-requeued to next nearby operator."
    );
  };

  const handleMarkArrived = async () => {
    if (activeTrip?.isLiveDb && activeTrip.tripId) {
      await fetch("/api/partner/trip-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "ARRIVE", tripId: activeTrip.tripId }),
      }).catch(() => null);
      await refreshNow();
    }
    setTripStatus(TripStatus.ARRIVED_AT_PICKUP);
    setWaitSeconds(0);
  };

  const handleVerifyPinAndStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip) return;
    if (activeTrip.isLiveDb && activeTrip.tripId) {
      const res = await fetch("/api/partner/trip-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "START",
          tripId: activeTrip.tripId,
          startPin: pinInput.trim(),
        }),
      });
      if (!res.ok) {
        setPinError(t("partner.pinInvalid"));
        return;
      }
      setPinError(null);
      setTripStatus(TripStatus.IN_PROGRESS);
      await refreshNow();
      return;
    }
    if (pinInput.trim() !== activeTrip.startPin) {
      setPinError(t("partner.pinInvalid"));
      return;
    }
    setPinError(null);
    setTripStatus(TripStatus.IN_PROGRESS);
  };

  const handleTriggerSos = () => {
    const code = `SOS-${Math.floor(10000 + Math.random() * 90000)}`;
    setSosCode(code);
    setTripStatus(TripStatus.SOS_ACTIVE);
    setSosDrawerOpen(false);
  };

  const handleCompleteTrip = () => {
    setTripStatus(TripStatus.COMPLETED_UNPAID);
  };

  const handleConfirmPaymentAndFinish = async () => {
    if (!activeTrip) return;
    if (activeTrip.isLiveDb && activeTrip.tripId) {
      await fetch("/api/partner/trip-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "COMPLETE_CASH",
          tripId: activeTrip.tripId,
        }),
      }).catch(() => null);
      await refreshNow();
    }
    const commission = Math.round(
      (activeTrip.fareTzs * PLATFORM_FINANCE.DEFAULT_COMMISSION_PCT) / 100
    );
    const net = activeTrip.fareTzs - commission;
    setTodayNetTzs((v) => v + net);
    setTripsToday((v) => v + 1);
    const nowTime = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    setEarningsLedger((prev) => [
      {
        id: `trip-${Date.now()}`,
        label: `Trip ${activeTrip.tripCode} • ${activeTrip.paymentMethod} Net (88%)`,
        channel: activeTrip.paymentMethod,
        deltaTzs: net,
        time: nowTime,
      },
      ...prev,
    ]);
    setActiveTrip(null);
    setTripStatus(null);
    setSosCode(null);
    setStatusNotice(
      locale === "sw"
        ? `Malipo yamethibitishwa (${customerRating}★)! Mapato halisi +${formatTzs(net)}`
        : `Payment settled (${customerRating}★ Customer rating)! Net earnings +${formatTzs(net)}`
    );
  };

  const sendQuickPreset = (preset: (typeof OPERATOR_PRESETS)[number]) => {
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    setChatLog((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${preset.key}`,
        sender: "OPERATOR",
        text: locale === "sw" ? preset.sw : preset.en,
        time,
      },
    ]);
  };

  const handleDocFile = (key: string, file?: File) => {
    if (!file) return;
    setKycDocs((prev) => ({ ...prev, [key]: file.name }));
  };

  const handleSubmitKyc = (e: React.FormEvent) => {
    e.preventDefault();
    setKycSubmitted(true);
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const commissionTzs = activeTrip
    ? Math.round(
        (activeTrip.fareTzs * PLATFORM_FINANCE.DEFAULT_COMMISSION_PCT) / 100
      )
    : 0;
  const operatorNetTzs = activeTrip ? activeTrip.fareTzs - commissionTzs : 0;

  return (
    <>
      {/* Editorial Bodaboda Scroll-Transition Hero on Shift Page */}
      {page === "shift" ? (
        <EditorialScrollHero
          eyebrowItems={
            hasAssignedCategory
              ? [
                  isBodabodaRider ? "BODABODA RIDER" : "BAJAJI DRIVER",
                  ...(partnerPlateNumber ? [partnerPlateNumber] : []),
                  "88% NET PAYOUT",
                  "UNGUJA",
                ]
              : [
                  "BODABODA RIDER",
                  "BAJAJI DRIVER",
                  "88% NET PAYOUT",
                  "UNGUJA",
                ]
          }
          displayWordLeft={locale === "sw" ? "Endesha Na" : "Drive With"}
          displayWordRight="Go.Boda"
          taglineLines={
            locale === "sw"
              ? isBodabodaRider
                ? ["POKEA SAFARI ZA BODABODA", "NA MALIPO YA PAPO", "HAPO KWA SIMU."]
                : ["POKEA SAFARI ZA BAJAJI", "NA MALIPO YA PAPO", "HAPO KWA SIMU."]
              : isBodabodaRider
                ? ["ACCEPT BODABODA TRIPS", "AND KEEP 88% NET", "ON EVERY UNGUJA RIDE."]
                : ["ACCEPT BAJAJI TRIPS", "AND KEEP 88% NET", "ON EVERY UNGUJA RIDE."]
          }
          ctaLabel={
            isOnline
              ? locale === "sw"
                ? "ZAMU IKO HEWANI"
                : "VIEW LIVE SHIFT"
              : locale === "sw"
                ? "ANZA ZAMU"
                : "START SHIFT"
          }
          ctaHref="#workspace"
          imageSrc="/partner/images/bodaboda-hero.webp"
          imageAlt={
            isBodabodaRider
              ? "Go.boda Zanzibar Bodaboda Rider"
              : "Go.boda Zanzibar Bajaji Driver"
          }
          scrollHint={
            locale === "sw" ? "Shuka chini kuanza zamu" : "Scroll to shift console"
          }
          features={[
            {
              icon: <TrendingUp className="h-4 w-4" />,
              title: "88% NET FARE",
              subtitle: locale === "sw" ? "MAPATO YA HARAKA" : "UPFRONT TZS",
            },
            {
              icon: <MapPin className="h-4 w-4" />,
              title: "UNGUJA VITUO",
              subtitle: locale === "sw" ? "SAFARI ZA KARIBU" : "NEARBY DISPATCH",
            },
            {
              icon: <ShieldCheck className="h-4 w-4" />,
              title: "24/7 OPS DESK",
              subtitle: locale === "sw" ? "USALAMA WA ZAMU" : "SHIFT SOS",
            },
          ]}
        />
      ) : null}

      <main
        id="workspace"
        className="mx-auto max-w-3xl scroll-mt-20 space-y-5 px-4 pt-8 sm:px-6"
      >
        {/* Assigned Operator Category Badge (locked when signed in; switcher only in unassigned preview) */}
        <ScrollReveal>
          {hasAssignedCategory ? (
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-full border px-4 py-2.5 shadow-sm",
                nightMode
                  ? "border-[#F3EEE8]/15 bg-[#123D3A] text-[#F3EEE8]"
                  : "border-[#17645F]/15 bg-[#FAF7F2] text-[#122927]"
              )}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.12em] shadow-sm",
                    isBodabodaRider
                      ? "bg-[#17645F] text-[#F3EEE8]"
                      : "bg-[#B86B2B] text-[#FAF7F2]"
                  )}
                >
                  {isBodabodaRider ? (
                    <Bike className="h-4 w-4" />
                  ) : (
                    <CarFront className="h-4 w-4" />
                  )}
                  {isBodabodaRider
                    ? t("roles.bodabodaRider")
                    : t("roles.bajajiDriver")}
                </span>
                {partnerName ? (
                  <span className="text-xs font-bold truncate">
                    {partnerName}
                  </span>
                ) : null}
              </div>
              {partnerPlateNumber ? (
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 font-mono text-[11px] font-bold",
                    nightMode
                      ? "border-[#F3EEE8]/25 bg-[#0F3F3C] text-[#E6C99E]"
                      : "border-[#17645F]/20 bg-[#F3EEE8] text-[#17645F]"
                  )}
                >
                  {partnerPlateNumber}
                </span>
              ) : null}
            </div>
          ) : (
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
                disabled={Boolean(activeTrip)}
                onClick={() => {
                  setOperatorType(TransportType.BODABODA);
                  setKycSubmitted(false);
                }}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-full py-2.5 text-xs font-bold uppercase tracking-[0.12em] transition disabled:opacity-50",
                  isBodabodaRider
                    ? "bg-[#17645F] text-[#F3EEE8] shadow-sm"
                    : nightMode
                      ? "text-[#F3EEE8]/70"
                      : "text-[#17645F]/70 hover:text-[#17645F]"
                )}
              >
                <Bike className="h-4 w-4" />
                {t("roles.bodabodaRider")}
              </button>
              <button
                type="button"
                disabled={Boolean(activeTrip)}
                onClick={() => {
                  setOperatorType(TransportType.BAJAJI);
                  setKycSubmitted(false);
                }}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-full py-2.5 text-xs font-bold uppercase tracking-[0.12em] transition disabled:opacity-50",
                  !isBodabodaRider
                    ? "bg-[#B86B2B] text-[#FAF7F2] shadow-sm"
                    : nightMode
                      ? "text-[#F3EEE8]/70"
                      : "text-[#17645F]/70 hover:text-[#17645F]"
                )}
              >
                <CarFront className="h-4 w-4" />
                {t("roles.bajajiDriver")}
              </button>
            </div>
          )}
        </ScrollReveal>

        {/* EARNINGS PAGE */}
        {page === "earnings" ? (
          <PartnerEarningsPanel
            locale={locale}
            nightMode={nightMode}
            isBodabodaRider={isBodabodaRider}
            todayNetTzs={todayNetTzs}
            tripsToday={tripsToday}
            ledger={earningsLedger}
          />
        ) : page === "kyc" ? (
          <div className="space-y-5">
            <PartnerCompliancePanel locale={locale} nightMode={nightMode} />
            <form
              onSubmit={handleSubmitKyc}
              className={cn(
                "space-y-4 rounded-3xl border p-6 shadow-sm",
                nightMode
                  ? "border-[#F3EEE8]/15 bg-[#123D3A] text-[#F3EEE8]"
                  : "border-[#17645F]/15 bg-[#FAF7F2] text-[#122927]"
              )}
            >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#B86B2B]">
                  {isBodabodaRider
                    ? locale === "sw"
                      ? "Usajili wa Rider wa Bodaboda"
                      : "Bodaboda Rider KYC Onboarding"
                    : locale === "sw"
                      ? "Usajili wa Dereva wa Bajaji"
                      : "Bajaji Driver KYC Onboarding"}
                </p>
                <h1
                  className={cn(
                    "mt-1 font-display text-3xl uppercase leading-none",
                    nightMode ? "text-[#F3EEE8]" : "text-[#17645F]"
                  )}
                >
                  {locale === "sw"
                    ? "Thibitisha Chombo na Nyaraka"
                    : "Verify Vehicle & Documents"}
                </h1>
              </div>
              <Badge tone={kycSubmitted ? "amber" : "teal"}>
                {kycSubmitted ? "Submitted" : "KYC"}
              </Badge>
            </div>

            {kycSubmitted ? (
              <div className="space-y-3 rounded-2xl border border-[#17645F]/30 bg-[#17645F]/10 p-4 text-sm">
                <p className="font-extrabold text-[#17645F]">
                  {locale === "sw"
                    ? "Maombi ya KYC Yametumwa kwa Uhakiki!"
                    : "KYC Package Submitted for Operations Review!"}
                </p>
                <p className="text-xs opacity-85">
                  {kycName} • {kycPlate} • {kycKituo} •{" "}
                  {Object.keys(kycDocs).length}/{requiredKycDocs.length} photos
                  attached.
                </p>
                <Link
                  href="/partner/shift"
                  className="inline-flex items-center rounded-full border border-[#17645F]/45 bg-[#FAF7F2]/80 px-4 py-2 text-xs font-semibold text-[#17645F] transition hover:bg-[#17645F] hover:text-[#F3EEE8]"
                >
                  {locale === "sw" ? "Rudi Kwenye Zamu" : "Back to Shift"}
                </Link>
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      label: locale === "sw" ? "Jina Kamili" : "Full Name",
                      value: kycName,
                      set: setKycName,
                    },
                    {
                      label:
                        locale === "sw"
                          ? "Namba ya Zanzibar (Z...)"
                          : "Zanzibar Z-Plate",
                      value: kycPlate,
                      set: setKycPlate,
                    },
                    {
                      label: locale === "sw" ? "Kituo Chako" : "Home Kituo",
                      value: kycKituo,
                      set: setKycKituo,
                    },
                    {
                      label: locale === "sw" ? "Namba ya Leseni" : "License No.",
                      value: kycLicense,
                      set: setKycLicense,
                    },
                    {
                      label:
                        locale === "sw"
                          ? "Namba ya Malipo (Mobile Money)"
                          : "Payout Mobile Number",
                      value: kycPayoutPhone,
                      set: setKycPayoutPhone,
                    },
                  ].map((field) => (
                    <div key={field.label} className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-75">
                        {field.label}
                      </label>
                      <input
                        type="text"
                        required
                        value={field.value}
                        onChange={(e) => field.set(e.target.value)}
                        className={cn(
                          "w-full rounded-2xl border px-3.5 py-2.5 text-sm font-medium focus:outline-none",
                          nightMode
                            ? "border-[#F3EEE8]/20 bg-[#0D302E] text-[#F3EEE8] focus:border-[#E6C99E]"
                            : "border-[#17645F]/20 bg-[#F3EEE8]/70 text-[#122927] focus:border-[#17645F] focus:bg-[#FAF7F2]"
                        )}
                      />
                    </div>
                  ))}
                </div>

                {/* Document Photos */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-80">
                    {locale === "sw"
                      ? "Picha za Nyaraka"
                      : "Required Document Photos"}
                  </p>
                  <div className="grid gap-2">
                    {requiredKycDocs.map((doc) => {
                      const uploaded = kycDocs[doc.key];
                      return (
                        <label
                          key={doc.key}
                          className={cn(
                            "flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3 text-xs font-semibold transition",
                            uploaded
                              ? "border-[#17645F] bg-[#17645F]/15"
                              : nightMode
                                ? "border-[#F3EEE8]/20 bg-[#0D302E] hover:border-[#E6C99E]"
                                : "border-[#17645F]/20 bg-[#F3EEE8]/70 hover:border-[#17645F]"
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <Camera className="h-4 w-4 text-[#B86B2B]" />
                            <span>
                              {locale === "sw" ? doc.labelSw : doc.labelEn}
                              {uploaded ? ` (${uploaded})` : ""}
                            </span>
                          </span>
                          <span className="rounded-full bg-[#17645F]/15 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#17645F]">
                            {uploaded ? "✓" : locale === "sw" ? "Piga Picha" : "Capture"}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) =>
                              handleDocFile(doc.key, e.target.files?.[0])
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  variant="primary"
                  className="w-full font-extrabold uppercase tracking-[0.14em]"
                >
                  <FileCheck2 className="h-5 w-5" />
                  {locale === "sw"
                    ? "Tuma Nyaraka za Uhakiki"
                    : "Submit KYC for Approval"}
                </Button>
              </>
            )}
            </form>
          </div>
        ) : (
          <>
            {/* Urgent License / Insurance Expiry Banner on Shift */}
            {snapshot && snapshot.compliance.urgentCount > 0 ? (
              <Link
                href="/partner/kyc"
                className={cn(
                  "flex items-center justify-between gap-3 rounded-3xl border px-4 py-3 text-xs font-bold transition hover:opacity-95",
                  snapshot.compliance.licenseBucket === "EXPIRED" ||
                    snapshot.compliance.insuranceBucket === "EXPIRED" ||
                    snapshot.compliance.licenseBucket === "7D" ||
                    snapshot.compliance.insuranceBucket === "7D"
                    ? "border-[#A93232]/50 bg-[#A93232] text-white"
                    : "border-[#B86B2B]/50 bg-[#B86B2B]/15 text-[#703C12]"
                )}
              >
                <span className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 shrink-0" />
                  <span>
                    {locale === "sw"
                      ? `Tahadhari: Nyaraka ${snapshot.compliance.urgentCount} zinakaribia au zimeisha muda. Sasisha kwenye KYC.`
                      : `Compliance Alert: ${snapshot.compliance.urgentCount} document(s) expired or renewing soon. Tap to update KYC.`}
                  </span>
                </span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              </Link>
            ) : null}

            {/* Status Toast */}
            {statusNotice && (
              <div
                className={cn(
                  "flex items-center justify-between rounded-2xl border px-4 py-3 text-xs font-bold",
                  nightMode
                    ? "border-[#E6C99E]/40 bg-[#123D3A] text-[#F3EEE8]"
                    : "border-[#17645F]/30 bg-[#17645F]/10 text-[#17645F]"
                )}
              >
                <span>{statusNotice}</span>
                <button
                  type="button"
                  onClick={() => setStatusNotice(null)}
                  className="ml-2 opacity-70 hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Incoming Dispatch Offer */}
            {incomingOffer && (
              <div className="rounded-3xl border-2 border-[#17645F] bg-[#17645F] p-5 text-[#F3EEE8] shadow-xl">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[#E6C99E]">
                    <BellRing className="h-5 w-5 animate-bounce" />
                    <span className="text-xs font-extrabold uppercase tracking-[0.16em]">
                      {t("partner.incomingOfferTitle")}
                    </span>
                  </div>
                  <span className="rounded-full bg-[#F3EEE8] px-3.5 py-1 text-sm font-black text-[#17645F]">
                    {offerSecondsLeft}s
                  </span>
                </div>

                {/* Countdown progress bar */}
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#F3EEE8]/20">
                  <div
                    className="h-full bg-[#E6C99E] transition-all duration-1000"
                    style={{
                      width: `${
                        (offerSecondsLeft /
                          PLATFORM_FINANCE.DISPATCH_OFFER_TTL_SECONDS) *
                        100
                      }%`,
                    }}
                  />
                </div>

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-xs text-[#F3EEE8]/75">
                      {incomingOffer.tripCode} • {incomingOffer.distanceKm} km •
                      ~{incomingOffer.etaMinutes} min pickup
                    </p>
                    <p className="mt-1 font-display text-4xl leading-none text-[#F3EEE8]">
                      {formatTzs(incomingOffer.fareTzs)}
                    </p>
                  </div>
                  <Badge tone="amber">{incomingOffer.paymentMethod}</Badge>
                </div>

                <div className="mt-4 space-y-2 rounded-2xl bg-[#0F3F3C]/70 p-3.5 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#F3EEE8] text-[10px] font-black text-[#17645F]">
                      A
                    </span>
                    <p className="font-semibold">{incomingOffer.pickupLabel}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#B86B2B] text-[10px] font-black text-white">
                      B
                    </span>
                    <p className="font-semibold">
                      {incomingOffer.dropoffLabel}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2.5">
                  <Button
                    type="button"
                    variant="danger"
                    size="lg"
                    onClick={handleDeclineOffer}
                    className="col-span-1 font-extrabold"
                  >
                    <XCircle className="h-5 w-5" />
                    {t("partner.declineOffer")}
                  </Button>
                  <Button
                    type="button"
                    variant="amber"
                    size="lg"
                    onClick={handleAcceptOffer}
                    className="col-span-2 text-base font-black uppercase tracking-[0.1em]"
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    {t("partner.acceptOffer")}
                  </Button>
                </div>
              </div>
            )}

            {/* ACTIVE TRIP LIFECYCLE WORKFLOW */}
            {activeTrip && tripStatus && (
              <div
                className={cn(
                  "space-y-4 rounded-3xl border-2 p-5 shadow-md",
                  nightMode
                    ? "border-[#E6C99E]/50 bg-[#123D3A] text-[#F3EEE8]"
                    : "border-[#17645F] bg-[#FAF7F2] text-[#122927]"
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#17645F]">
                      {activeTrip.tripCode} • {activeTrip.customerName}
                    </p>
                    <p className="text-lg font-extrabold">
                      {formatTzs(activeTrip.fareTzs)} ({activeTrip.paymentMethod})
                    </p>
                  </div>
                  <Badge tone={sosCode ? "rose" : "teal"}>{tripStatus}</Badge>
                </div>

                {sosCode && (
                  <div className="rounded-2xl border-2 border-[#A93232] bg-[#A93232]/15 p-3.5 text-xs">
                    <p className="font-black uppercase text-[#A93232]">
                      SOS ACTIVE — {sosCode}
                    </p>
                    <p className="mt-0.5">
                      Go.boda Zanzibar Operations received your live GPS alert.
                    </p>
                    <a
                      href="tel:112"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#A93232] px-3.5 py-1 font-bold text-white"
                    >
                      <PhoneCall className="h-3.5 w-3.5" />
                      Call 112 Emergency
                    </a>
                  </div>
                )}

                <div
                  className={cn(
                    "space-y-3 rounded-2xl p-3.5 text-sm",
                    nightMode ? "bg-[#0D302E]" : "bg-[#F3EEE8]"
                  )}
                >
                  <div className="space-y-1.5">
                    <p className="font-semibold">
                      <span className="mr-2 font-black text-[#17645F]">A</span>
                      {activeTrip.pickupLabel}
                      {activeTrip.pickupSnapped ? (
                        <span className="ml-2 rounded-full bg-[#B86B2B]/15 px-2 py-0.5 text-[10px] font-bold uppercase text-[#B86B2B]">
                          Smart-Snap
                          {activeTrip.pickupSnapGateName
                            ? ` • ${activeTrip.pickupSnapGateName}`
                            : ""}
                        </span>
                      ) : null}
                    </p>
                    <p className="font-semibold">
                      <span className="mr-2 font-black text-[#B86B2B]">B</span>
                      {activeTrip.dropoffLabel}
                    </p>
                  </div>

                  {/* One-Tap Turn-by-Turn Navigation (Google Maps + Apple Maps) */}
                  {(() => {
                    const headingToDropoff =
                      tripStatus === TripStatus.IN_PROGRESS ||
                      tripStatus === TripStatus.SOS_ACTIVE;
                    const navCoords = headingToDropoff
                      ? activeTrip.dropoffCoords
                      : activeTrip.pickupCoords;
                    const navLabel = headingToDropoff
                      ? activeTrip.dropoffLabel
                      : activeTrip.pickupLabel;
                    return (
                      <div className="space-y-2 border-t border-current/10 pt-2.5">
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] opacity-70">
                          {headingToDropoff
                            ? locale === "sw"
                              ? "ELEKEO LA KUSHUSHA (DROPOFF)"
                              : "TURN-BY-TURN TO DROPOFF"
                            : locale === "sw"
                              ? "ELEKEO LA KUCHUKUA ABIRIA (PICKUP)"
                              : "TURN-BY-TURN TO PICKUP"}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <a
                            href={buildGoogleMapsDirectionsUrl(
                              navCoords.lat,
                              navCoords.lng
                            )}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#17645F] px-3.5 py-2 text-xs font-bold uppercase tracking-[0.1em] text-[#F3EEE8] transition hover:bg-[#114E4A]"
                          >
                            <Navigation className="h-3.5 w-3.5" />
                            Google Maps
                            <ExternalLink className="h-3 w-3 opacity-80" />
                          </a>
                          <a
                            href={buildAppleMapsDirectionsUrl(
                              navCoords.lat,
                              navCoords.lng,
                              navLabel
                            )}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(
                              "inline-flex items-center justify-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold uppercase tracking-[0.1em] transition",
                              nightMode
                                ? "border-[#F3EEE8]/35 text-[#F3EEE8] hover:bg-[#F3EEE8] hover:text-[#17645F]"
                                : "border-[#17645F]/35 bg-[#FAF7F2] text-[#17645F] hover:bg-[#17645F] hover:text-[#F3EEE8]"
                            )}
                          >
                            <Compass className="h-3.5 w-3.5" />
                            Apple Maps
                          </a>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Step 1: ASSIGNED -> Mark Arrived */}
                {tripStatus === TripStatus.ASSIGNED && (
                  <Button
                    type="button"
                    size="lg"
                    variant="primary"
                    onClick={handleMarkArrived}
                    className="w-full text-base font-extrabold"
                  >
                    <MapPin className="h-5 w-5" />
                    {t("partner.arrivedCta")}
                  </Button>
                )}

                {/* Step 2: ARRIVED_AT_PICKUP -> 5-Minute Wait Timer + 4-Digit Start PIN */}
                {tripStatus === TripStatus.ARRIVED_AT_PICKUP && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-2xl border border-[#B86B2B]/35 bg-[#B86B2B]/10 px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-xs font-bold">
                        <Clock className="h-4 w-4 text-[#B86B2B]" />
                        {t("partner.waitTimerLabel")}
                      </span>
                      <span className="font-mono text-base font-black text-[#B86B2B]">
                        {formatTimer(waitSeconds)}
                      </span>
                    </div>

                    <form
                      onSubmit={handleVerifyPinAndStart}
                      className="space-y-2.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <label className="font-bold">
                          {t("partner.pinPrompt")}
                        </label>
                        <span className="rounded-full bg-[#17645F]/15 px-2.5 py-0.5 font-mono font-bold text-[#17645F]">
                          {t("partner.pinDemoHint")}: {activeTrip.startPin}
                        </span>
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={pinInput}
                        onChange={(e) =>
                          setPinInput(
                            e.target.value.replace(/\D/g, "").slice(0, 4)
                          )
                        }
                        placeholder="• • • •"
                        className={cn(
                          "w-full rounded-2xl border-2 px-4 py-3 text-center font-mono text-2xl font-black tracking-[0.6em] focus:outline-none",
                          nightMode
                            ? "border-[#F3EEE8]/30 bg-[#0D302E] text-[#F3EEE8]"
                            : "border-[#17645F]/35 bg-[#F3EEE8] text-[#17645F] focus:border-[#17645F]"
                        )}
                      />
                      {pinError && (
                        <p className="text-xs font-bold text-[#A93232]">
                          {pinError}
                        </p>
                      )}
                      <Button
                        type="submit"
                        size="lg"
                        variant="primary"
                        className="w-full text-base font-extrabold"
                      >
                        <KeyRound className="h-5 w-5" />
                        {t("partner.startTripCta")}
                      </Button>
                    </form>
                  </div>
                )}

                {/* Step 3: IN_PROGRESS / SOS_ACTIVE -> Emergency SOS + Complete Trip */}
                {(tripStatus === TripStatus.IN_PROGRESS ||
                  tripStatus === TripStatus.SOS_ACTIVE) && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        type="button"
                        size="lg"
                        variant="danger"
                        onClick={() => setSosDrawerOpen((v) => !v)}
                        className="col-span-1 font-extrabold"
                      >
                        <AlertTriangle className="h-5 w-5" />
                        SOS
                      </Button>
                      <Button
                        type="button"
                        size="lg"
                        variant="amber"
                        onClick={handleCompleteTrip}
                        className="col-span-2 text-base font-extrabold"
                      >
                        <CheckCircle2 className="h-5 w-5" />
                        {t("partner.completeTripCta")}
                      </Button>
                    </div>

                    {sosDrawerOpen && (
                      <div className="space-y-2 rounded-2xl border-2 border-[#A93232] bg-[#A93232]/15 p-3.5 text-xs">
                        <p className="font-extrabold text-[#A93232]">
                          {locale === "sw"
                            ? "Thibitisha Dharura (SOS)"
                            : "Confirm Operator Emergency SOS"}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setSosDrawerOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            onClick={handleTriggerSos}
                          >
                            Send SOS Alert
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 4: COMPLETED_UNPAID -> Receipt + Customer Rating */}
                {tripStatus === TripStatus.COMPLETED_UNPAID && (
                  <div className="space-y-3 rounded-2xl border border-[#17645F]/30 bg-[#17645F]/10 p-4">
                    <p className="text-sm font-extrabold text-[#17645F]">
                      {t("partner.receiptTitle")}
                    </p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span>Gross Trip Fare</span>
                        <span className="font-bold">
                          {formatTzs(activeTrip.fareTzs)}
                        </span>
                      </div>
                      <div className="flex justify-between opacity-80">
                        <span>
                          Platform Commission (
                          {PLATFORM_FINANCE.DEFAULT_COMMISSION_PCT}%)
                        </span>
                        <span>-{formatTzs(commissionTzs)}</span>
                      </div>
                      <div className="flex justify-between border-t border-current/15 pt-1.5 text-sm font-black text-[#17645F]">
                        <span>
                          {isBodabodaRider
                            ? "Rider Net Earnings"
                            : "Driver Net Earnings"}
                        </span>
                        <span>{formatTzs(operatorNetTzs)}</span>
                      </div>
                    </div>

                    {/* Rate Customer */}
                    <div className="space-y-1 border-t border-current/10 pt-2 text-center">
                      <p className="text-xs font-bold opacity-80">
                        {locale === "sw"
                          ? `Kadiria Mteja (${activeTrip.customerName})`
                          : `Rate Customer (${activeTrip.customerName})`}
                      </p>
                      <div className="flex justify-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setCustomerRating(s)}
                            className="p-0.5"
                          >
                            <Star
                              className={`h-6 w-6 ${
                                s <= customerRating
                                  ? "fill-[#B86B2B] text-[#B86B2B]"
                                  : "text-[#17645F]/25"
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>

                    <Button
                      type="button"
                      size="lg"
                      variant="primary"
                      onClick={handleConfirmPaymentAndFinish}
                      className="w-full font-extrabold"
                    >
                      {locale === "sw"
                        ? `Thibitisha Malipo (${activeTrip.paymentMethod})`
                        : `Confirm Payment Settled (${activeTrip.paymentMethod})`}
                    </Button>
                  </div>
                )}

                {/* Bilingual Quick-Chat Presets during ASSIGNED / ARRIVED */}
                {(tripStatus === TripStatus.ASSIGNED ||
                  tripStatus === TripStatus.ARRIVED_AT_PICKUP) && (
                  <div className="space-y-2 border-t border-current/10 pt-3">
                    <p className="flex items-center gap-1.5 text-xs font-bold opacity-80">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {t("partner.quickChatTitle")}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {OPERATOR_PRESETS.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => sendQuickPreset(p)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-[11px] font-semibold transition",
                            nightMode
                              ? "border-[#F3EEE8]/25 bg-[#0D302E] text-[#F3EEE8] hover:bg-[#17645F]"
                              : "border-[#17645F]/20 bg-[#F3EEE8] text-[#17645F] hover:bg-[#17645F] hover:text-[#F3EEE8]"
                          )}
                        >
                          {locale === "sw" ? p.sw : p.en}
                        </button>
                      ))}
                    </div>
                    {chatLog.length > 0 && (
                      <div className="space-y-1 pt-1">
                        {chatLog.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between rounded-2xl bg-[#17645F]/15 px-3 py-1.5 text-xs"
                          >
                            <span>{m.text}</span>
                            <span className="ml-2 text-[10px] opacity-60">
                              {m.time}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Big Shift Online/Offline Card */}
            {!activeTrip && (
              <ScrollReveal delayMs={70}>
                <div
                  className={cn(
                    "rounded-3xl border-2 p-7 text-center transition shadow-sm",
                    isOnline
                      ? "border-[#17645F] bg-[#17645F] text-[#F3EEE8]"
                      : nightMode
                        ? "border-[#F3EEE8]/20 bg-[#123D3A] text-[#F3EEE8]"
                        : "border-[#17645F]/20 bg-[#FAF7F2] text-[#122927]"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Badge tone={isOnline ? "emerald" : "slate"}>
                      {isOnline
                        ? t("partner.onlineLabel")
                        : t("partner.offlineLabel")}
                    </Badge>
                  </div>

                  <p className="mt-3 font-display text-3xl uppercase tracking-wide">
                    {isOnline
                      ? locale === "sw"
                        ? "UKO HEWANI UNGUJA"
                        : "LIVE ON UNGUJA DISPATCH"
                      : locale === "sw"
                        ? "TAYARI KWA ZAMU?"
                        : "READY TO GO ONLINE?"}
                  </p>

                  <div className="mt-5 flex flex-col items-center gap-3">
                    <Button
                      size="lg"
                      variant={isOnline ? "danger" : "primary"}
                      disabled={availabilityBusy}
                      onClick={() => void handleToggleOnline()}
                      className="w-full max-w-xs text-base font-extrabold uppercase tracking-[0.14em]"
                    >
                      <Power className="h-5 w-5" />
                      {isOnline ? t("partner.goOffline") : t("partner.goOnline")}
                    </Button>

                    {isOnline && !incomingOffer && (
                      <Button
                        type="button"
                        size="md"
                        variant="outline"
                        onClick={triggerDemoOffer}
                        className="w-full max-w-xs border-[#F3EEE8]/50 bg-[#F3EEE8]/10 text-[#F3EEE8] hover:bg-[#F3EEE8] hover:text-[#17645F]"
                      >
                        <BellRing className="h-4 w-4 text-[#E6C99E]" />
                        {t("partner.simulateOffer")}
                      </Button>
                    )}
                  </div>

                  <p
                    className={cn(
                      "mt-4 inline-flex items-center gap-1.5 text-xs font-medium",
                      isOnline ? "text-[#F3EEE8]/85" : "opacity-75"
                    )}
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    {t("partner.kituoLabel")}: {kycKituo || t("partner.kituoSample")}
                  </p>
                </div>
              </ScrollReveal>
            )}

            {/* Role-Specific Safety Reminder */}
            <ScrollReveal delayMs={120}>
              <div
                className={cn(
                  "flex items-start gap-3 rounded-3xl border p-4 text-xs font-semibold leading-relaxed",
                  nightMode
                    ? "border-[#E6C99E]/30 bg-[#123D3A] text-[#E6C99E]"
                    : "border-[#B86B2B]/30 bg-[#B86B2B]/10 text-[#703C12]"
                )}
              >
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#B86B2B]" />
                <span>
                  {isBodabodaRider
                    ? t("partner.helmetReminder")
                    : t("partner.bajajiReminder")}
                </span>
              </div>
            </ScrollReveal>

            {/* Daily Earnings & Trips Summary Cards */}
            <ScrollReveal delayMs={160}>
              <div className="grid grid-cols-2 gap-3">
                <Link
                  href="/partner/earnings"
                  className={cn(
                    "block rounded-3xl border p-5 shadow-sm transition hover:-translate-y-0.5",
                    nightMode
                      ? "border-[#F3EEE8]/15 bg-[#123D3A] hover:border-[#F3EEE8]/40"
                      : "border-[#17645F]/15 bg-[#FAF7F2] hover:border-[#17645F]/45"
                  )}
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-70">
                    {t("partner.todayEarnings")}
                  </p>
                  <p
                    className={cn(
                      "mt-1.5 font-display text-3xl leading-none",
                      nightMode ? "text-[#A7DBD7]" : "text-[#17645F]"
                    )}
                  >
                    {formatTzs(todayNetTzs)}
                  </p>
                  <p className="mt-1.5 text-xs opacity-70">
                    {locale === "sw" ? "88% mapato halisi" : "88% net earnings"}
                  </p>
                </Link>

                <Link
                  href="/partner/tripshistory/"
                  className={cn(
                    "block rounded-3xl border p-5 shadow-sm transition hover:-translate-y-0.5",
                    nightMode
                      ? "border-[#F3EEE8]/15 bg-[#123D3A] hover:border-[#F3EEE8]/40"
                      : "border-[#17645F]/15 bg-[#FAF7F2] hover:border-[#17645F]/45"
                  )}
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-70">
                    {t("partner.tripsCompleted")}
                  </p>
                  <p className="mt-1.5 font-display text-3xl leading-none text-[#B86B2B]">
                    {tripsToday}
                  </p>
                  <p className="mt-1.5 text-[11px] opacity-70">
                    {locale === "sw" ? "Tazama historia ya safari" : "View trip history"}
                  </p>
                </Link>
              </div>
            </ScrollReveal>

            {/* Quick Shortcuts: Live Unguja Hotspots & Trip History */}
            <ScrollReveal delayMs={190}>
              <div className="grid grid-cols-2 gap-3">
                <Link
                  href="/partner/hotspots"
                  className={cn(
                    "flex items-center gap-3 rounded-3xl border p-4 shadow-sm transition hover:-translate-y-0.5",
                    nightMode
                      ? "border-[#F3EEE8]/15 bg-[#123D3A] hover:border-[#F3EEE8]/40"
                      : "border-[#17645F]/15 bg-[#FAF7F2] hover:border-[#17645F]/45"
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#B86B2B]/15 text-[#B86B2B]">
                    <Flame className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-extrabold uppercase tracking-[0.1em]">
                      {locale === "sw" ? "Vituo Moto" : "Demand Hotspots"}
                    </p>
                    <p className="truncate text-[11px] opacity-70">
                      {locale === "sw" ? "Foleni ya Unguja" : "Live kituo queue"}
                    </p>
                  </div>
                </Link>

                <Link
                  href="/partner/tripshistory/"
                  className={cn(
                    "flex items-center gap-3 rounded-3xl border p-4 shadow-sm transition hover:-translate-y-0.5",
                    nightMode
                      ? "border-[#F3EEE8]/15 bg-[#123D3A] hover:border-[#F3EEE8]/40"
                      : "border-[#17645F]/15 bg-[#FAF7F2] hover:border-[#17645F]/45"
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#17645F]/15 text-[#17645F]">
                    <History className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-extrabold uppercase tracking-[0.1em]">
                      {locale === "sw" ? "Historia Safari" : "Trip History"}
                    </p>
                    <p className="truncate text-[11px] opacity-70">
                      {locale === "sw" ? "Risiti na viwango" : "Receipts & stars"}
                    </p>
                  </div>
                </Link>
              </div>
            </ScrollReveal>
          </>
        )}
      </main>
    </>
  );
}

export function PartnerHomeView(props: {
  page?: "shift" | "earnings" | "kyc";
  locale: "sw" | "en";
  partnerName?: string;
  partnerTransportType?: TransportType;
  partnerPlateNumber?: string;
  partnerKituo?: string;
}) {
  const t = useTranslations();
  const [sunlightMode, setSunlightMode] = React.useState(false);
  const isBodabodaRider =
    (props.partnerTransportType ?? TransportType.BODABODA) ===
    TransportType.BODABODA;
  const categoryLabel = isBodabodaRider
    ? t("roles.bodabodaRider")
    : t("roles.bajajiDriver");

  return (
    <PartnerPortalShell
      locale={props.locale}
      categoryLabel={categoryLabel}
      nightMode={sunlightMode}
      onToggleNightMode={() => setSunlightMode((v) => !v)}
    >
      <PartnerHomeContent {...props} nightMode={sunlightMode} />
    </PartnerPortalShell>
  );
}
