"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  BellRing,
  Bike,
  Camera,
  CarFront,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  KeyRound,
  LogOut,
  MapPin,
  MessageSquare,
  PhoneCall,
  Power,
  ShieldAlert,
  ShieldCheck,
  Star,
  Sun,
  TrendingUp,
  User,
  Wallet,
  XCircle,
} from "lucide-react";
import {
  Badge,
  BrandLogo,
  Button,
  LanguageSwitchLink,
  cn,
} from "@goboda/ui";
import {
  PLATFORM_FINANCE,
  TransportType,
  TripStatus,
  formatTzs,
} from "@goboda/shared-types";
import {
  PartnerWalletPanel,
  type WalletLedgerRow,
} from "./partner-wallet-panel";

interface DemoOffer {
  tripCode: string;
  transportType: TransportType;
  customerName: string;
  pickupLabel: string;
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

export function PartnerHomeView({
  locale,
  partnerName,
  partnerTransportType,
  partnerPlateNumber,
  partnerKituo,
}: {
  locale: "sw" | "en";
  partnerName?: string;
  partnerTransportType?: TransportType;
  partnerPlateNumber?: string;
  partnerKituo?: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<
    "shift" | "earnings" | "wallet" | "kyc"
  >("shift");
  const [operatorType, setOperatorType] = React.useState<TransportType>(
    partnerTransportType ?? TransportType.BODABODA
  );
  const [isOnline, setIsOnline] = React.useState(false);
  const [sunlightMode, setSunlightMode] = React.useState(false);
  const [wakeLockActive, setWakeLockActive] = React.useState(false);

  // Shift & Wallet ACID Preview Counters
  const [todayNetTzs, setTodayNetTzs] = React.useState(24500);
  const [withdrawableEarningsTzs, setWithdrawableEarningsTzs] =
    React.useState(18400);
  const [tripsToday, setTripsToday] = React.useState(7);
  const [floatBalanceTzs, setFloatBalanceTzs] = React.useState(6200);
  const [walletLedger, setWalletLedger] = React.useState<WalletLedgerRow[]>([
    {
      id: "l-1",
      label: "Trip GB-76640 • Darajani → ZNZ Airport (Net 88%)",
      channel: "MOBILE_MONEY",
      deltaTzs: 9240,
      time: "14:22",
    },
    {
      id: "l-2",
      label: "Trip GB-76511 • Cash 12% Commission Debit",
      channel: "CASH",
      deltaTzs: -540,
      time: "13:05",
    },
    {
      id: "l-3",
      label: "Commission Float Top-Up (M-Pesa)",
      channel: "TOPUP",
      deltaTzs: 5000,
      time: "09:15",
    },
  ]);

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

  // Engage Screen Wake Lock while online so outdoor Rider/Driver screens stay awake
  React.useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    async function syncWakeLock() {
      if (
        !isOnline ||
        typeof navigator === "undefined" ||
        !("wakeLock" in navigator)
      ) {
        setWakeLockActive(false);
        return;
      }
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (!cancelled) setWakeLockActive(true);
      } catch {
        if (!cancelled) setWakeLockActive(false);
      }
    }

    void syncWakeLock();
    return () => {
      cancelled = true;
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

  const isBodabodaRider = operatorType === TransportType.BODABODA;

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

  const handleAcceptOffer = () => {
    if (!incomingOffer) return;
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

  const handleDeclineOffer = () => {
    setIncomingOffer(null);
    setStatusNotice(
      locale === "sw"
        ? "Ombi limekataliwa — limeelekezwa kwa mwendeshaji anayefuata."
        : "Offer declined — auto-requeued to next nearby operator."
    );
  };

  const handleMarkArrived = () => {
    setTripStatus(TripStatus.ARRIVED_AT_PICKUP);
    setWaitSeconds(0);
  };

  const handleVerifyPinAndStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip) return;
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

  const handleConfirmPaymentAndFinish = () => {
    if (!activeTrip) return;
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
    if (activeTrip.paymentMethod === "CASH") {
      setFloatBalanceTzs((v) => v - commission);
      setWalletLedger((prev) => [
        {
          id: `cash-${Date.now()}`,
          label: `Trip ${activeTrip.tripCode} • Cash 12% Commission`,
          channel: "CASH",
          deltaTzs: -commission,
          time: nowTime,
        },
        ...prev,
      ]);
    } else {
      // Digital payment auto-offsets negative float before crediting withdrawable earnings
      const offset =
        floatBalanceTzs < 0 ? Math.min(Math.abs(floatBalanceTzs), net) : 0;
      const credit = net - offset;
      if (offset > 0) setFloatBalanceTzs((v) => v + offset);
      if (credit > 0) setWithdrawableEarningsTzs((v) => v + credit);
      setWalletLedger((prev) => [
        {
          id: `dig-${Date.now()}`,
          label: `Trip ${activeTrip.tripCode} • ${activeTrip.paymentMethod} Net (88%)`,
          channel: activeTrip.paymentMethod,
          deltaTzs: credit,
          time: nowTime,
        },
        ...prev,
      ]);
    }
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

  const handleSignOut = async () => {
    await fetch("/api/partner/auth", { method: "DELETE" }).catch(() => null);
    router.replace("/partner/login");
    router.refresh();
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
            subtitle={
              isBodabodaRider
                ? t("roles.bodabodaRider")
                : t("roles.bajajiDriver")
            }
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSunlightMode((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold",
                sunlightMode
                  ? "border-slate-900 bg-amber-400 text-slate-950"
                  : "border-slate-700 bg-slate-900 text-amber-400"
              )}
            >
              <Sun className="h-3.5 w-3.5" />
              {t("partner.sunlightMode")}
            </button>
            <LanguageSwitchLink
              currentLocale={locale}
              hrefSw="/partner/dashboard?lang=sw"
              hrefEn="/partner/dashboard?lang=en"
            />
            <button
              type="button"
              onClick={handleSignOut}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold",
                sunlightMode
                  ? "border-slate-300 bg-white text-slate-700"
                  : "border-slate-700 bg-slate-900 text-slate-300"
              )}
            >
              <LogOut className="h-3.5 w-3.5" />
              {locale === "sw" ? "Toka" : "Sign out"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        {/* Adaptive Role Switcher Preview (Bodaboda Rider vs Bajaji Driver) */}
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
            disabled={Boolean(activeTrip)}
            onClick={() => {
              setOperatorType(TransportType.BODABODA);
              setKycSubmitted(false);
            }}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition disabled:opacity-50",
              isBodabodaRider
                ? "bg-teal-600 text-white shadow"
                : sunlightMode
                  ? "text-slate-700"
                  : "text-slate-400"
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
              "flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition disabled:opacity-50",
              !isBodabodaRider
                ? "bg-amber-500 text-slate-950 shadow"
                : sunlightMode
                  ? "text-slate-700"
                  : "text-slate-400"
            )}
          >
            <CarFront className="h-4 w-4" />
            {t("roles.bajajiDriver")}
          </button>
        </div>

        {/* EARNINGS OR WALLET TAB */}
        {activeTab === "earnings" || activeTab === "wallet" ? (
          <PartnerWalletPanel
            mode={activeTab}
            locale={locale}
            sunlightMode={sunlightMode}
            isBodabodaRider={isBodabodaRider}
            withdrawableEarningsTzs={withdrawableEarningsTzs}
            todayNetTzs={todayNetTzs}
            tripsToday={tripsToday}
            floatBalanceTzs={floatBalanceTzs}
            payoutPhone={kycPayoutPhone}
            ledger={walletLedger}
            onFloatTopup={(amt, ch) => {
              setFloatBalanceTzs((v) => v + amt);
              setWalletLedger((prev) => [
                {
                  id: `topup-${Date.now()}`,
                  label: `Float Top-Up (${ch})`,
                  channel: "TOPUP",
                  deltaTzs: amt,
                  time: new Date().toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                },
                ...prev,
              ]);
            }}
            onWithdrawEarnings={(amt, ch) => {
              setWithdrawableEarningsTzs((v) => Math.max(0, v - amt));
              setWalletLedger((prev) => [
                {
                  id: `payout-${Date.now()}`,
                  label: `Instant Payout (${ch} → ${kycPayoutPhone})`,
                  channel: "PAYOUT",
                  deltaTzs: -amt,
                  time: new Date().toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                },
                ...prev,
              ]);
            }}
          />
        ) : activeTab === "kyc" ? (
          <form
            onSubmit={handleSubmitKyc}
            className={cn(
              "space-y-4 rounded-3xl border p-5",
              sunlightMode
                ? "border-slate-300 bg-white text-slate-950"
                : "border-slate-800 bg-slate-900 text-white"
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-amber-500">
                  {isBodabodaRider
                    ? locale === "sw"
                      ? "Usajili wa Rider wa Bodaboda"
                      : "Bodaboda Rider KYC Onboarding"
                    : locale === "sw"
                      ? "Usajili wa Dereva wa Bajaji"
                      : "Bajaji Driver KYC Onboarding"}
                </p>
                <h1 className="text-lg font-extrabold">
                  {locale === "sw"
                    ? "Thibitisha Chombo na Nyaraka (Unguja)"
                    : "Verify Vehicle & Documents (Unguja)"}
                </h1>
              </div>
              <Badge tone={kycSubmitted ? "amber" : "teal"}>
                {kycSubmitted ? "PENDING_VERIFICATION" : "STEP 1–2"}
              </Badge>
            </div>

            {kycSubmitted ? (
              <div className="space-y-3 rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-4 text-sm">
                <p className="font-extrabold text-emerald-400">
                  {locale === "sw"
                    ? "Maombi ya KYC Yametumwa kwa Uhakiki!"
                    : "KYC Package Submitted for Operations Review!"}
                </p>
                <p className="text-xs opacity-90">
                  {kycName} • {kycPlate} • {kycKituo} •{" "}
                  {Object.keys(kycDocs).length}/{requiredKycDocs.length} photos
                  attached.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveTab("shift")}
                >
                  {locale === "sw" ? "Rudi Kwenye Zamu" : "Back to Shift"}
                </Button>
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
                      <label className="text-[11px] font-bold opacity-75">
                        {field.label}
                      </label>
                      <input
                        type="text"
                        required
                        value={field.value}
                        onChange={(e) => field.set(e.target.value)}
                        className={cn(
                          "w-full rounded-xl border px-3 py-2 text-sm font-medium focus:outline-none",
                          sunlightMode
                            ? "border-slate-300 bg-slate-50 text-slate-950"
                            : "border-slate-700 bg-slate-950 text-white focus:border-amber-400"
                        )}
                      />
                    </div>
                  ))}
                </div>

                {/* Mobile Camera Document Uploads */}
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wide opacity-80">
                    {locale === "sw"
                      ? "Picha za Kamera (R2 Presigned Upload)"
                      : "Mobile Camera Document Checklist"}
                  </p>
                  <div className="grid gap-2">
                    {requiredKycDocs.map((doc) => {
                      const uploaded = kycDocs[doc.key];
                      return (
                        <label
                          key={doc.key}
                          className={cn(
                            "flex cursor-pointer items-center justify-between rounded-2xl border px-3.5 py-3 text-xs font-semibold transition",
                            uploaded
                              ? "border-emerald-500 bg-emerald-500/10"
                              : sunlightMode
                                ? "border-slate-300 bg-slate-50 hover:bg-slate-100"
                                : "border-slate-700 bg-slate-950 hover:border-amber-400"
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <Camera className="h-4 w-4 text-amber-500" />
                            <span>
                              {locale === "sw" ? doc.labelSw : doc.labelEn}
                              {uploaded ? ` (${uploaded})` : ""}
                            </span>
                          </span>
                          <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-500">
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
                  variant="amber"
                  className="w-full font-extrabold"
                >
                  <FileCheck2 className="h-5 w-5" />
                  {locale === "sw"
                    ? "Tuma Nyaraka za Uhakiki"
                    : "Submit KYC for Approval"}
                </Button>
              </>
            )}
          </form>
        ) : (
          <>
            {/* Status Toast */}
            {statusNotice && (
              <div
                className={cn(
                  "flex items-center justify-between rounded-2xl border px-4 py-3 text-xs font-bold",
                  sunlightMode
                    ? "border-teal-600 bg-teal-50 text-teal-950"
                    : "border-teal-500/40 bg-teal-950/60 text-teal-200"
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

            {/* INCOMING 20-SECOND DISPATCH OFFER CARD */}
            {incomingOffer && (
              <div className="rounded-3xl border-2 border-amber-400 bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950 p-5 text-white shadow-xl">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-amber-400">
                    <BellRing className="h-5 w-5 animate-bounce" />
                    <span className="text-sm font-extrabold uppercase tracking-wide">
                      {t("partner.incomingOfferTitle")}
                    </span>
                  </div>
                  <span className="rounded-full bg-amber-400 px-3 py-1 text-sm font-black text-slate-950">
                    {offerSecondsLeft}s
                  </span>
                </div>

                {/* Countdown progress bar */}
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-amber-400 transition-all duration-1000"
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
                    <p className="text-xs text-slate-400">
                      {incomingOffer.tripCode} • {incomingOffer.distanceKm} km •
                      ~{incomingOffer.etaMinutes} min pickup
                    </p>
                    <p className="mt-1 text-3xl font-black text-emerald-400">
                      {formatTzs(incomingOffer.fareTzs)}
                    </p>
                  </div>
                  <Badge tone="amber">{incomingOffer.paymentMethod}</Badge>
                </div>

                <div className="mt-4 space-y-2 rounded-2xl bg-white/5 p-3.5 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[10px] font-black">
                      A
                    </span>
                    <p className="font-semibold">{incomingOffer.pickupLabel}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-black text-slate-950">
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
                    className="col-span-2 text-lg font-black"
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
                  "space-y-4 rounded-3xl border-2 p-5",
                  sunlightMode
                    ? "border-teal-700 bg-teal-50 text-slate-950"
                    : "border-teal-500 bg-slate-900 text-white"
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-teal-500">
                      {activeTrip.tripCode} • {activeTrip.customerName}
                    </p>
                    <p className="text-lg font-extrabold">
                      {formatTzs(activeTrip.fareTzs)} ({activeTrip.paymentMethod})
                    </p>
                  </div>
                  <Badge tone={sosCode ? "rose" : "teal"}>{tripStatus}</Badge>
                </div>

                {sosCode && (
                  <div className="rounded-2xl border-2 border-rose-500 bg-rose-950/70 p-3 text-xs text-rose-100">
                    <p className="font-black uppercase text-rose-300">
                      SOS ACTIVE — {sosCode}
                    </p>
                    <p className="mt-0.5">
                      Go.boda Zanzibar Operations received your live GPS alert.
                    </p>
                    <a
                      href="tel:112"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1 font-bold text-white"
                    >
                      <PhoneCall className="h-3.5 w-3.5" />
                      Call 112 Emergency
                    </a>
                  </div>
                )}

                <div
                  className={cn(
                    "space-y-2 rounded-2xl p-3.5 text-sm",
                    sunlightMode ? "bg-white" : "bg-slate-950/70"
                  )}
                >
                  <p className="font-semibold">
                    <span className="mr-2 font-black text-teal-600">A</span>
                    {activeTrip.pickupLabel}
                  </p>
                  <p className="font-semibold">
                    <span className="mr-2 font-black text-amber-500">B</span>
                    {activeTrip.dropoffLabel}
                  </p>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${
                      tripStatus === TripStatus.IN_PROGRESS ||
                      tripStatus === TripStatus.SOS_ACTIVE
                        ? `${activeTrip.dropoffCoords.lat},${activeTrip.dropoffCoords.lng}`
                        : `${activeTrip.pickupCoords.lat},${activeTrip.pickupCoords.lng}`
                    }`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 pt-1 text-xs font-bold text-teal-500 underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {locale === "sw"
                      ? "Fungua Ramani (Google Maps)"
                      : "Open Turn-by-Turn Navigation"}
                  </a>
                </div>

                {/* Step 1: ASSIGNED -> Mark Arrived */}
                {tripStatus === TripStatus.ASSIGNED && (
                  <Button
                    type="button"
                    size="lg"
                    variant="amber"
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
                    <div
                      className={cn(
                        "flex items-center justify-between rounded-2xl border px-4 py-3",
                        sunlightMode
                          ? "border-amber-500 bg-amber-50"
                          : "border-amber-500/40 bg-amber-500/10"
                      )}
                    >
                      <span className="inline-flex items-center gap-2 text-xs font-bold">
                        <Clock className="h-4 w-4 text-amber-500" />
                        {t("partner.waitTimerLabel")}
                      </span>
                      <span className="font-mono text-base font-black text-amber-500">
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
                        <span className="rounded bg-teal-600/20 px-2 py-0.5 font-mono font-bold text-teal-400">
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
                          sunlightMode
                            ? "border-slate-900 bg-white text-slate-950"
                            : "border-slate-700 bg-slate-950 text-white focus:border-teal-500"
                        )}
                      />
                      {pinError && (
                        <p className="text-xs font-bold text-rose-500">
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
                      <div className="space-y-2 rounded-2xl border-2 border-rose-500 bg-rose-950/60 p-3.5 text-xs text-rose-100">
                        <p className="font-extrabold">
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
                  <div
                    className={cn(
                      "space-y-3 rounded-2xl border p-4",
                      sunlightMode
                        ? "border-emerald-600 bg-emerald-50"
                        : "border-emerald-500/40 bg-emerald-950/50"
                    )}
                  >
                    <p className="text-sm font-extrabold text-emerald-500">
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
                      <div className="flex justify-between border-t border-current/15 pt-1.5 text-sm font-black text-emerald-500">
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
                                  ? "fill-amber-400 text-amber-400"
                                  : "text-slate-500"
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
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                            sunlightMode
                              ? "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"
                              : "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
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
                            className="flex items-center justify-between rounded-xl bg-teal-700/20 px-3 py-1.5 text-xs"
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
              <div
                className={cn(
                  "rounded-3xl border-2 p-6 text-center transition",
                  isOnline
                    ? "border-emerald-500 bg-emerald-950/70 text-white"
                    : sunlightMode
                      ? "border-slate-900 bg-slate-50 text-slate-950"
                      : "border-slate-800 bg-slate-900 text-white"
                )}
              >
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Badge tone={isOnline ? "emerald" : "slate"}>
                    {isOnline
                      ? t("partner.onlineLabel")
                      : t("partner.offlineLabel")}
                  </Badge>
                  <Badge tone={wakeLockActive ? "amber" : "slate"}>
                    {wakeLockActive
                      ? t("partner.wakeLockActive")
                      : t("partner.wakeLockInactive")}
                  </Badge>
                </div>

                <div className="mt-5 flex flex-col items-center gap-3">
                  <Button
                    size="lg"
                    variant={isOnline ? "danger" : "amber"}
                    onClick={() => {
                      setIsOnline((v) => !v);
                      setIncomingOffer(null);
                    }}
                    className="w-full max-w-xs text-lg font-extrabold"
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
                      className="w-full max-w-xs border-emerald-400/50 bg-white/10 text-white hover:bg-white/20"
                    >
                      <BellRing className="h-4 w-4 text-amber-300" />
                      {t("partner.simulateOffer")}
                    </Button>
                  )}
                </div>

                <p
                  className={cn(
                    "mt-4 inline-flex items-center gap-1.5 text-xs font-medium",
                    isOnline
                      ? "text-emerald-200"
                      : sunlightMode
                        ? "text-slate-700"
                        : "text-slate-400"
                  )}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  {t("partner.kituoLabel")}: {t("partner.kituoSample")}
                </p>
              </div>
            )}

            {/* Role-Specific Safety Reminder */}
            <div
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-4 text-sm font-medium",
                sunlightMode
                  ? "border-amber-600 bg-amber-100 text-slate-950"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-200"
              )}
            >
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <span>
                {isBodabodaRider
                  ? t("partner.helmetReminder")
                  : t("partner.bajajiReminder")}
              </span>
            </div>

            {/* Daily Earnings & Commission Float Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div
                className={cn(
                  "rounded-2xl border p-4",
                  sunlightMode
                    ? "border-slate-300 bg-white"
                    : "border-slate-800 bg-slate-900"
                )}
              >
                <p className="text-xs font-semibold text-slate-400">
                  {t("partner.todayEarnings")}
                </p>
                <p className="mt-1.5 text-2xl font-extrabold text-emerald-500">
                  {formatTzs(todayNetTzs)}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {t("partner.tripsCompleted")}: {tripsToday}
                </p>
              </div>

              <div
                className={cn(
                  "rounded-2xl border p-4",
                  sunlightMode
                    ? "border-slate-300 bg-white"
                    : "border-slate-800 bg-slate-900"
                )}
              >
                <p className="text-xs font-semibold text-slate-400">
                  {t("partner.commissionFloat")}
                </p>
                <p className="mt-1.5 text-2xl font-extrabold text-amber-500">
                  {formatTzs(floatBalanceTzs)}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {t("partner.floatHealthy")}
                </p>
              </div>
            </div>
          </>
        )}
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
        <div className="mx-auto grid max-w-2xl grid-cols-5 py-2 text-center text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("shift")}
            className={cn(
              "flex flex-col items-center gap-1",
              activeTab === "shift" ? "text-amber-500" : "text-slate-400"
            )}
          >
            <Power className="h-5 w-5" />
            {t("partner.navHome")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("earnings")}
            className={cn(
              "flex flex-col items-center gap-1",
              activeTab === "earnings" ? "text-amber-500" : "text-slate-400"
            )}
          >
            <TrendingUp className="h-5 w-5" />
            {t("partner.navEarnings")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("wallet")}
            className={cn(
              "flex flex-col items-center gap-1",
              activeTab === "wallet" ? "text-amber-500" : "text-slate-400"
            )}
          >
            <Wallet className="h-5 w-5" />
            {t("partner.navWallet")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("kyc")}
            className={cn(
              "flex flex-col items-center gap-1",
              activeTab === "kyc" ? "text-amber-500" : "text-slate-400"
            )}
          >
            <FileCheck2 className="h-5 w-5" />
            {t("partner.navOnboarding")}
          </button>
          <Link
            href="/safety"
            className="flex flex-col items-center gap-1 text-slate-400 hover:text-amber-500"
          >
            <ShieldCheck className="h-5 w-5" />
            {locale === "sw" ? "Usalama" : "Safety"}
          </Link>
        </div>
      </nav>
    </div>
  );
}
