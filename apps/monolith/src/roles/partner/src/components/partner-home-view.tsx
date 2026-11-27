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
  Menu,
  MessageSquare,
  Moon,
  PhoneCall,
  Power,
  ShieldAlert,
  ShieldCheck,
  Star,
  Sun,
  TrendingUp,
  User,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import {
  Badge,
  BrandLogo,
  Button,
  EditorialScrollHero,
  LanguageSwitchLink,
  ScrollReveal,
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
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  React.useEffect(() => {
    if (!sidebarOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

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

  const nightMode = sunlightMode;

  return (
    <div
      className={cn(
        "min-h-screen pb-12 transition-colors",
        nightMode ? "bg-[#0F3F3C] text-[#F3EEE8]" : "bg-[#F3EEE8] text-[#122927]"
      )}
    >
      {/* Slide-Over Deep Zanzibar Teal Sidebar Drawer (Closed by Default until 3-line toggle is tapped) */}
      <div
        aria-hidden={!sidebarOpen}
        className={cn(
          "fixed inset-0 z-50 flex transition-opacity duration-300",
          sidebarOpen
            ? "visible pointer-events-auto opacity-100"
            : "invisible pointer-events-none opacity-0"
        )}
      >
        <button
          type="button"
          tabIndex={sidebarOpen ? 0 : -1}
          aria-label="Close sidebar overlay"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-[#122927]/50 backdrop-blur-sm"
        />
        <aside
          className={cn(
            "relative z-10 flex h-full w-72 max-w-[85vw] flex-col border-r border-[#114E4A] bg-[#17645F] p-4 text-[#F3EEE8] shadow-2xl transition-transform duration-300 ease-out",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {/* Sidebar Header with Close Button Inside Sidebar */}
          <div className="flex items-center justify-between gap-2 px-1.5">
            <button
              type="button"
              onClick={() => {
                setActiveTab("shift");
                setSidebarOpen(false);
              }}
              className="text-left"
            >
              <BrandLogo dark />
            </button>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#F3EEE8]/25 bg-[#114E4A]/70 text-[#F3EEE8] transition hover:bg-[#F3EEE8] hover:text-[#17645F]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Sidebar Navigation: Shift, Earnings, Wallet, KYC, Safety */}
          <nav className="mt-7 flex-1 space-y-1.5 overflow-y-auto">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#F3EEE8]/55">
              {isBodabodaRider
                ? t("roles.bodabodaRider")
                : t("roles.bajajiDriver")}
            </p>
            {(
              [
                { id: "shift", label: t("partner.navHome"), icon: Power },
                { id: "earnings", label: t("partner.navEarnings"), icon: TrendingUp },
                { id: "wallet", label: t("partner.navWallet"), icon: Wallet },
                { id: "kyc", label: t("partner.navOnboarding"), icon: FileCheck2 },
              ] as const
            ).map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setSidebarOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-full px-3.5 py-2.5 text-left text-xs transition",
                    active
                      ? "bg-[#F3EEE8] font-bold text-[#17645F] shadow-sm"
                      : "font-medium text-[#F3EEE8]/85 hover:bg-[#114E4A] hover:text-[#F3EEE8]"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}

            <Link
              href="/partner/safety"
              onClick={() => setSidebarOpen(false)}
              className="flex w-full items-center gap-3 rounded-full px-3.5 py-2.5 text-left text-xs font-medium text-[#F3EEE8]/85 transition hover:bg-[#114E4A] hover:text-[#F3EEE8]"
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {locale === "sw" ? "Usalama" : "Safety"}
              </span>
            </Link>
          </nav>

          {/* Sidebar Footer Actions: Night/Day, SW/EN, Sign Out */}
          <div className="mt-4 space-y-2.5 border-t border-[#F3EEE8]/15 pt-4">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setSunlightMode((v) => !v)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-[#F3EEE8]/25 bg-[#114E4A]/70 px-3 py-1.5 text-xs font-bold text-[#F3EEE8] transition hover:bg-[#F3EEE8] hover:text-[#17645F]"
              >
                {nightMode ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5" />
                )}
                <span>
                  {nightMode
                    ? locale === "sw"
                      ? "Mchana"
                      : "Day"
                    : locale === "sw"
                      ? "Usiku"
                      : "Night"}
                </span>
              </button>
              <LanguageSwitchLink
                dark
                currentLocale={locale}
                hrefSw="/partner/dashboard?lang=sw"
                hrefEn="/partner/dashboard?lang=en"
              />
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-[#F3EEE8]/25 bg-transparent px-3.5 py-2 text-xs font-bold text-[#F3EEE8] transition hover:border-[#A93232] hover:bg-[#A93232] hover:text-white"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{locale === "sw" ? "Toka" : "Sign Out"}</span>
            </button>
          </div>
        </aside>
      </div>

      {/* Sticky Minimal Top Header with Three-Line Sidebar Open Button Only */}
      <header
        className={cn(
          "sticky top-0 z-20 border-b px-5 py-3 backdrop-blur",
          nightMode
            ? "border-[#F3EEE8]/15 bg-[#0F3F3C]/95"
            : "border-[#17645F]/15 bg-[#FAF7F2]/95"
        )}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
            aria-expanded={sidebarOpen}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-full border transition",
              nightMode
                ? "border-[#F3EEE8]/25 bg-[#17645F] text-[#F3EEE8] hover:bg-[#F3EEE8] hover:text-[#17645F]"
                : "border-[#17645F]/20 bg-[#F3EEE8] text-[#17645F] hover:bg-[#17645F] hover:text-[#F3EEE8]"
            )}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Editorial Bodaboda Scroll-Transition Hero on Rider-Driver Home */}
      {activeTab === "shift" ? (
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
              subtitle: locale === "sw" ? "MALIPO YA HARAKA" : "INSTANT PAYOUT",
            },
            {
              icon: <Wallet className="h-4 w-4" />,
              title: "M-PESA & TIGO",
              subtitle: locale === "sw" ? "FLOAT SALAMA" : "AUTO FLOAT",
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

        {/* EARNINGS OR WALLET TAB */}
        {activeTab === "earnings" || activeTab === "wallet" ? (
          <PartnerWalletPanel
            mode={activeTab}
            locale={locale}
            nightMode={nightMode}
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
        ) : (
          <>
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
                    "space-y-2 rounded-2xl p-3.5 text-sm",
                    nightMode ? "bg-[#0D302E]" : "bg-[#F3EEE8]"
                  )}
                >
                  <p className="font-semibold">
                    <span className="mr-2 font-black text-[#17645F]">A</span>
                    {activeTrip.pickupLabel}
                  </p>
                  <p className="font-semibold">
                    <span className="mr-2 font-black text-[#B86B2B]">B</span>
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
                    className="inline-flex items-center gap-1.5 pt-1 text-xs font-bold text-[#17645F] underline"
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
                      onClick={() => {
                        setIsOnline((v) => !v);
                        setIncomingOffer(null);
                      }}
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

            {/* Daily Earnings & Commission Float Cards */}
            <ScrollReveal delayMs={160}>
              <div className="grid grid-cols-2 gap-3">
                <div
                  className={cn(
                    "rounded-3xl border p-5 shadow-sm",
                    nightMode
                      ? "border-[#F3EEE8]/15 bg-[#123D3A]"
                      : "border-[#17645F]/15 bg-[#FAF7F2]"
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
                    {t("partner.tripsCompleted")}: {tripsToday}
                  </p>
                </div>

                <div
                  className={cn(
                    "rounded-3xl border p-5 shadow-sm",
                    nightMode
                      ? "border-[#F3EEE8]/15 bg-[#123D3A]"
                      : "border-[#17645F]/15 bg-[#FAF7F2]"
                  )}
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-70">
                    {t("partner.commissionFloat")}
                  </p>
                  <p className="mt-1.5 font-display text-3xl leading-none text-[#B86B2B]">
                    {formatTzs(floatBalanceTzs)}
                  </p>
                  <p className="mt-1.5 text-[11px] opacity-70">
                    {t("partner.floatHealthy")}
                  </p>
                </div>
              </div>
            </ScrollReveal>
          </>
        )}
      </main>
    </div>
  );
}
