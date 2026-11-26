"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Banknote,
  Bike,
  CarFront,
  CheckCircle2,
  Clock,
  Compass,
  CreditCard,
  ExternalLink,
  Footprints,
  History,
  KeyRound,
  Loader2,
  LocateFixed,
  LogOut,
  MapPin,
  MessageSquare,
  Navigation,
  PhoneCall,
  Radar,
  RefreshCw,
  Route,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Star,
  Tag,
  User,
} from "lucide-react";
import {
  Badge,
  BrandLogo,
  Button,
  Card,
  LanguageSwitchLink,
} from "@goboda/ui";
import {
  DEFAULT_TARIFFS_TZS,
  PaymentMethod,
  TransportType,
  TripStatus,
  formatTzs,
} from "@goboda/shared-types";
import type { MapPoint, MapVehicle, RouteGeoJson } from "./unguja-map";

const UngujaMap = dynamic(
  () => import("./unguja-map").then((m) => m.UngujaMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[260px] w-full items-center justify-center rounded-2xl bg-slate-900/90 text-xs font-semibold text-teal-200">
        Loading Unguja Map...
      </div>
    ),
  }
);

interface NearbySummary {
  totalNearby: number;
  bodabodaCount: number;
  bajajiCount: number;
  nearestBodabodaEtaMin: number | null;
  nearestBajajiEtaMin: number | null;
}

interface LandmarkItem {
  id: string;
  nameSw: string;
  nameEn: string;
  category: string;
  area: string;
  isKituo: boolean;
  lat: number;
  lng: number;
}

interface ResolvedPoint {
  inUnguja: boolean;
  inStoneTownPedestrian: boolean;
  snapped: boolean;
  original: { lat: number; lng: number };
  effective: { lat: number; lng: number };
  snapGate: {
    id: string;
    nameSw: string;
    nameEn: string;
    walkingDistanceMeters: number;
    walkingMinutes: number;
  } | null;
}

interface TierQuote {
  transportType: "BODABODA" | "BAJAJI";
  operatorRole: "RIDER" | "DRIVER";
  currency: "TZS";
  grossFareTzs: number;
  discountTzs: number;
  promoApplied: string | null;
  finalFareTzs: number;
  maxPassengers: number;
}

interface QuoteResponse {
  pickup: ResolvedPoint;
  dropoff: ResolvedPoint;
  promoStatus: "NONE" | "APPLIED" | "INVALID";
  route: {
    distanceMeters: number;
    distanceKm: number;
    durationSeconds: number;
    durationMinutes: number;
    source: "osrm" | "haversine-fallback";
    geometry: RouteGeoJson | null;
  };
  quotes: {
    BODABODA: TierQuote;
    BAJAJI: TierQuote;
  };
}

interface ActiveCustomerTrip {
  tripCode: string;
  status: TripStatus;
  transportType: TransportType;
  operatorName: string;
  operatorPlate: string;
  operatorPhone: string;
  operatorRating: number;
  operatorEtaMin: number;
  startPin: string;
  fareTzs: number;
  paymentMethod: PaymentMethod;
  pickupLabel: string;
  dropoffLabel: string;
  pickupNote: string;
  cashChangeNote: string;
  distanceKm: number;
  shareToken: string;
  sosTriggered: boolean;
  sosAlertCode: string | null;
}

interface HistoryEntry {
  tripCode: string;
  transportType: TransportType;
  pickupLabel: string;
  dropoffLabel: string;
  fareTzs: number;
  paymentMethod: PaymentMethod;
  stars: number;
  helmetProvided: boolean | null;
  completedAt: string;
}

interface PresetSpot {
  id: string;
  target: "pickup" | "dropoff";
  labelEn: string;
  labelSw: string;
  lat: number;
  lng: number;
  accent?: "teal" | "amber" | "red";
}

const PRESET_SPOTS: PresetSpot[] = [
  {
    id: "stone-town-alley",
    target: "pickup",
    labelEn: "Stone Town Alley (Smart Snap)",
    labelSw: "Kichochoro Stone Town (Smart Snap)",
    lat: -6.1622,
    lng: 39.1895,
    accent: "teal",
  },
  {
    id: "znz-airport",
    target: "dropoff",
    labelEn: "ZNZ Airport",
    labelSw: "Uwanja wa Ndege (ZNZ)",
    lat: -6.222,
    lng: 39.2249,
  },
  {
    id: "ferry-terminal",
    target: "dropoff",
    labelEn: "Ferry Terminal",
    labelSw: "Bandari ya Feri",
    lat: -6.158,
    lng: 39.1885,
  },
  {
    id: "mwanakwerekwe",
    target: "dropoff",
    labelEn: "Mwanakwerekwe",
    labelSw: "Mwanakwerekwe",
    lat: -6.1912,
    lng: 39.2216,
  },
  {
    id: "paje-beach",
    target: "dropoff",
    labelEn: "Paje Beach",
    labelSw: "Pwani ya Paje",
    lat: -6.269,
    lng: 39.532,
  },
  {
    id: "nungwi",
    target: "dropoff",
    labelEn: "Nungwi",
    labelSw: "Nungwi",
    lat: -5.7265,
    lng: 39.2987,
  },
];

const PICKUP_NOTE_CHIPS = [
  { sw: "Niko getini kuu", en: "At main gate" },
  { sw: "Nimevaa shati jeupe", en: "Wearing white shirt" },
  { sw: "Nina begi dogo", en: "Have small luggage" },
] as const;

const CUSTOMER_CHAT_PRESETS = [
  {
    key: "WAIT_2_MIN",
    sw: "Subiri dakika 2, natoka sasa.",
    en: "Please wait 2 min, coming out now.",
  },
  {
    key: "STONE_TOWN_WALK",
    sw: "Natembea kuja barabarani.",
    en: "Walking out to the perimeter road.",
  },
  {
    key: "EXTRA_HELMET",
    sw: "Tafadhali hakikisha una helmeti safi.",
    en: "Please make sure you have a clean helmet.",
  },
] as const;

export function CustomerHomeView({
  locale,
  customerName,
}: {
  locale: "sw" | "en";
  customerName?: string;
}) {
  const t = useTranslations();
  const router = useRouter();

  const [activeTab, setActiveTab] = React.useState<"book" | "history">("book");
  const [selectedType, setSelectedType] = React.useState<TransportType>(
    TransportType.BODABODA
  );
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>(
    PaymentMethod.CASH
  );
  const [cashChangeNote, setCashChangeNote] = React.useState("Exact TZS");
  const [pickupNote, setPickupNote] = React.useState("");
  const [pinMode, setPinMode] = React.useState<"pickup" | "dropoff">("dropoff");

  const [pickup, setPickup] = React.useState<MapPoint>({
    lat: -6.1649,
    lng: 39.1936,
    label:
      locale === "sw"
        ? "Kituo cha Darajani, Stone Town"
        : "Darajani Market Perimeter, Stone Town",
  });
  const [dropoff, setDropoff] = React.useState<MapPoint>({
    lat: -6.222,
    lng: 39.2249,
    label:
      locale === "sw"
        ? "Uwanja wa Ndege wa Karume (ZNZ)"
        : "Abeid Amani Karume Airport (ZNZ)",
  });

  // Search autocomplete state
  const [activeField, setActiveField] = React.useState<
    "pickup" | "dropoff" | null
  >(null);
  const [pickupQuery, setPickupQuery] = React.useState(pickup.label);
  const [dropoffQuery, setDropoffQuery] = React.useState(dropoff.label);
  const [searchResults, setSearchResults] = React.useState<LandmarkItem[]>([]);
  const [searching, setSearching] = React.useState(false);

  // Live nearby fleet state
  const [vehicles, setVehicles] = React.useState<MapVehicle[]>([]);
  const [nearbySummary, setNearbySummary] = React.useState<NearbySummary>({
    totalNearby: 0,
    bodabodaCount: 0,
    bajajiCount: 0,
    nearestBodabodaEtaMin: null,
    nearestBajajiEtaMin: null,
  });
  const [loadingNearby, setLoadingNearby] = React.useState(true);

  // Live upfront TZS quote state
  const [promoInput, setPromoInput] = React.useState("");
  const [appliedPromoCode, setAppliedPromoCode] = React.useState("");
  const [quoteData, setQuoteData] = React.useState<QuoteResponse | null>(null);
  const [loadingQuote, setLoadingQuote] = React.useState(true);
  const [outsideError, setOutsideError] = React.useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = React.useState<string | null>(null);

  // Phase 4 Full Customer Trip Flow, Quick-Chat, SOS, Live Share & Rating state
  const [activeTrip, setActiveTrip] = React.useState<ActiveCustomerTrip | null>(
    null
  );
  const [sosDrawerOpen, setSosDrawerOpen] = React.useState(false);
  const [chatMessages, setChatMessages] = React.useState<
    Array<{ id: string; text: string; time: string }>
  >([]);
  const [ratingStars, setRatingStars] = React.useState(5);
  const [helmetProvided, setHelmetProvided] = React.useState<boolean>(true);
  const [tripHistory, setTripHistory] = React.useState<HistoryEntry[]>([
    {
      tripCode: "GB-51029",
      transportType: TransportType.BODABODA,
      pickupLabel: "Forodhani Gardens Edge, Stone Town",
      dropoffLabel: "Mwanakwerekwe Market",
      fareTzs: 4500,
      paymentMethod: PaymentMethod.CASH,
      stars: 5,
      helmetProvided: true,
      completedAt: "Yesterday",
    },
  ]);

  // Fetch nearby Bodabodas & Bajajis from BFF -> location-service / Neon PostGIS
  const loadNearby = React.useCallback(async (lat: number, lng: number) => {
    setLoadingNearby(true);
    try {
      const res = await fetch(
        `/api/unguja/nearby?lat=${lat}&lng=${lng}&radiusKm=8`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const json = (await res.json()) as {
          summary: NearbySummary;
          vehicles: MapVehicle[];
        };
        setVehicles(json.vehicles ?? []);
        setNearbySummary(json.summary);
      }
    } catch {
      // Keep last known vehicles if transiently offline
    } finally {
      setLoadingNearby(false);
    }
  }, []);

  React.useEffect(() => {
    void loadNearby(pickup.lat, pickup.lng);
  }, [pickup.lat, pickup.lng, loadNearby]);

  // Support 1-tap "Book Return Trip" query parameters from /trips
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const pLat = Number(params.get("pickupLat"));
    const pLng = Number(params.get("pickupLng"));
    const pLabel = params.get("pickupLabel");
    const dLat = Number(params.get("dropoffLat"));
    const dLng = Number(params.get("dropoffLng"));
    const dLabel = params.get("dropoffLabel");
    const tType = params.get("transportType");

    if (
      Number.isFinite(pLat) &&
      Number.isFinite(pLng) &&
      pLat !== 0 &&
      pLng !== 0 &&
      pLabel
    ) {
      setPickup({ lat: pLat, lng: pLng, label: pLabel });
      setPickupQuery(pLabel);
    }
    if (
      Number.isFinite(dLat) &&
      Number.isFinite(dLng) &&
      dLat !== 0 &&
      dLng !== 0 &&
      dLabel
    ) {
      setDropoff({ lat: dLat, lng: dLng, label: dLabel });
      setDropoffQuery(dLabel);
    }
    if (tType === TransportType.BODABODA || tType === TransportType.BAJAJI) {
      setSelectedType(tType);
    }
  }, []);

  // Fetch upfront TZS quote & Stone Town Smart Snap whenever points or promo change
  React.useEffect(() => {
    const controller = new AbortController();
    setLoadingQuote(true);
    setOutsideError(null);

    fetch("/api/unguja/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        pickup: { lat: pickup.lat, lng: pickup.lng },
        dropoff: { lat: dropoff.lat, lng: dropoff.lng },
        promoCode: appliedPromoCode || undefined,
      }),
    })
      .then(async (res) => {
        const data = (await res.json()) as QuoteResponse & {
          error?: string;
          messageEn?: string;
          messageSw?: string;
        };
        if (res.status === 422 && data.error === "OUTSIDE_UNGUJA_SERVICE_AREA") {
          setQuoteData(null);
          setOutsideError(
            locale === "sw"
              ? data.messageSw ||
                  "Mahali pa kuchukuliwa na kushushwa lazima pawe ndani ya Kisiwa cha Unguja."
              : data.messageEn ||
                  "Both pickup and dropoff must be inside Unguja Island, Zanzibar."
          );
          return;
        }
        if (res.ok) {
          setQuoteData(data);
        }
      })
      .catch(() => {
        // Ignore aborted requests
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingQuote(false);
        }
      });

    return () => controller.abort();
  }, [pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, appliedPromoCode, locale]);

  // Auto-transition SEARCHING -> ASSIGNED after 1.5s radar match
  React.useEffect(() => {
    if (!activeTrip || activeTrip.status !== TripStatus.SEARCHING) return;
    const timer = setTimeout(() => {
      setActiveTrip((prev) =>
        prev ? { ...prev, status: TripStatus.ASSIGNED } : null
      );
    }, 1500);
    return () => clearTimeout(timer);
  }, [activeTrip]);

  // Debounced bilingual Unguja landmark search
  React.useEffect(() => {
    if (!activeField) {
      setSearchResults([]);
      return;
    }
    const query = activeField === "pickup" ? pickupQuery : dropoffQuery;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/unguja/landmarks?q=${encodeURIComponent(query)}&limit=8`
        );
        if (res.ok) {
          const data = (await res.json()) as { landmarks?: LandmarkItem[] };
          setSearchResults(data.landmarks ?? []);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [activeField, pickupQuery, dropoffQuery]);

  const handleSelectLandmark = (item: LandmarkItem) => {
    const label = locale === "sw" ? item.nameSw : item.nameEn;
    if (activeField === "pickup") {
      setPickup({ lat: item.lat, lng: item.lng, label });
      setPickupQuery(label);
    } else if (activeField === "dropoff") {
      setDropoff({ lat: item.lat, lng: item.lng, label });
      setDropoffQuery(label);
    }
    setActiveField(null);
    setSearchResults([]);
  };

  const handleMapSelect = React.useCallback(
    (coords: { lat: number; lng: number }) => {
      const label = `${
        locale === "sw" ? "Pini ya Ramani" : "Map Pin"
      } (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
      if (pinMode === "pickup") {
        setPickup({ ...coords, label });
        setPickupQuery(label);
      } else {
        setDropoff({ ...coords, label });
        setDropoffQuery(label);
      }
      setActiveField(null);
    },
    [pinMode, locale]
  );

  const handlePresetClick = (spot: PresetSpot) => {
    const label = locale === "sw" ? spot.labelSw : spot.labelEn;
    if (spot.target === "pickup") {
      setPickup({ lat: spot.lat, lng: spot.lng, label });
      setPickupQuery(label);
    } else {
      setDropoff({ lat: spot.lat, lng: spot.lng, label });
      setDropoffQuery(label);
    }
    setActiveField(null);
  };

  const handleUseMyGps = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsStatus(
        locale === "sw"
          ? "GPS haipatikani kwenye kivinjari hiki."
          : "Geolocation is not supported in this browser."
      );
      return;
    }
    setGpsStatus(locale === "sw" ? "Inatafuta GPS yako..." : "Locating GPS...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const label =
          locale === "sw"
            ? `GPS Yangu (${lat.toFixed(4)}, ${lng.toFixed(4)})`
            : `My GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        setPickup({ lat, lng, label });
        setPickupQuery(label);
        setGpsStatus(null);
      },
      () => {
        setGpsStatus(
          locale === "sw"
            ? "Ruhusu GPS au gusa ramani kuchagua mahali."
            : "Allow GPS permission or tap the map to drop your pin."
        );
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const handleApplyPromo = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedPromoCode(promoInput.trim().toUpperCase());
  };

  const snappedPickupPoint: MapPoint | null =
    quoteData?.pickup.snapped && quoteData.pickup.snapGate
      ? {
          lat: quoteData.pickup.effective.lat,
          lng: quoteData.pickup.effective.lng,
          label:
            locale === "sw"
              ? quoteData.pickup.snapGate.nameSw
              : quoteData.pickup.snapGate.nameEn,
        }
      : null;

  const bodabodaQuote = quoteData?.quotes.BODABODA;
  const bajajiQuote = quoteData?.quotes.BAJAJI;
  const activeQuote =
    selectedType === TransportType.BODABODA ? bodabodaQuote : bajajiQuote;

  const fallbackBodaFare = DEFAULT_TARIFFS_TZS.BODABODA.minFareTzs;
  const fallbackBajajiFare = DEFAULT_TARIFFS_TZS.BAJAJI.minFareTzs;

  const handleRequestTransport = () => {
    if (!activeQuote || !quoteData) return;
    const matched = vehicles.find((v) => v.transportType === selectedType);
    const isBoda = selectedType === TransportType.BODABODA;
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    const tripCode = `GB-${Math.floor(10000 + Math.random() * 90000)}`;
    setChatMessages([]);
    setSosDrawerOpen(false);
    setRatingStars(5);
    setHelmetProvided(true);

    setActiveTrip({
      tripCode,
      status: TripStatus.SEARCHING,
      transportType: selectedType,
      operatorName: isBoda ? "Hassan Ali" : "Khamis Bakari",
      operatorPlate: isBoda ? "Z 104 AAB" : "Z 612 BBA",
      operatorPhone: "+255770123456",
      operatorRating: matched?.ratingAvg ?? 4.9,
      operatorEtaMin: matched?.etaMinutes ?? (isBoda ? 2 : 3),
      startPin: pin,
      fareTzs: activeQuote.finalFareTzs,
      paymentMethod,
      pickupLabel: snappedPickupPoint ? snappedPickupPoint.label : pickup.label,
      dropoffLabel: dropoff.label,
      pickupNote,
      cashChangeNote:
        paymentMethod === PaymentMethod.CASH ? cashChangeNote : "",
      distanceKm: quoteData.route.distanceKm,
      shareToken: isBoda ? "demo-unguja" : "demo-bajaji",
      sosTriggered: false,
      sosAlertCode: null,
    });
  };

  const handleSendChat = (preset: (typeof CUSTOMER_CHAT_PRESETS)[number]) => {
    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    setChatMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${preset.key}`,
        text: locale === "sw" ? preset.sw : preset.en,
        time,
      },
    ]);
  };

  const handleConfirmSos = () => {
    const code = `SOS-${Math.floor(10000 + Math.random() * 90000)}`;
    setActiveTrip((prev) =>
      prev
        ? {
            ...prev,
            status: TripStatus.SOS_ACTIVE,
            sosTriggered: true,
            sosAlertCode: code,
          }
        : null
    );
    setSosDrawerOpen(false);
  };

  const handleSubmitRating = () => {
    if (!activeTrip) return;
    setTripHistory((prev) => [
      {
        tripCode: activeTrip.tripCode,
        transportType: activeTrip.transportType,
        pickupLabel: activeTrip.pickupLabel,
        dropoffLabel: activeTrip.dropoffLabel,
        fareTzs: activeTrip.fareTzs,
        paymentMethod: activeTrip.paymentMethod,
        stars: ratingStars,
        helmetProvided:
          activeTrip.transportType === TransportType.BODABODA
            ? helmetProvided
            : null,
        completedAt: locale === "sw" ? "Sasa hivi" : "Just now",
      },
      ...prev,
    ]);
    setActiveTrip(null);
    setActiveTab("history");
  };

  const handleSignOut = async () => {
    await fetch("/api/customer/auth/logout", { method: "POST" }).catch(
      () => null
    );
    router.replace("/login");
    router.refresh();
  };

  const shareOrigin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://go-boda-customer-web.vercel.app";
  const liveTrackPath = activeTrip ? `/track/${activeTrip.shareToken}` : "/track/demo-unguja";
  const whatsappShareHref = activeTrip
    ? `https://wa.me/?text=${encodeURIComponent(
        locale === "sw"
          ? `Fuatilia safari yangu ya Go.boda (${activeTrip.tripCode}, ${activeTrip.operatorPlate}) kutoka ${activeTrip.pickupLabel} kwenda ${activeTrip.dropoffLabel}: ${shareOrigin}${liveTrackPath}`
          : `Track my live Go.boda Unguja trip (${activeTrip.tripCode}, ${activeTrip.operatorPlate}) from ${activeTrip.pickupLabel} to ${activeTrip.dropoffLabel}: ${shareOrigin}${liveTrackPath}`
      )}`
    : "#";

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <BrandLogo subtitle={t("common.ungujaOnly")} />
          <div className="flex items-center gap-2">
            {customerName ? (
              <span className="hidden text-xs font-semibold text-slate-600 sm:inline">
                {locale === "sw" ? "Habari" : "Hi"}, {customerName}
              </span>
            ) : null}
            <LanguageSwitchLink
              currentLocale={locale}
              hrefSw="/dashboard?lang=sw"
              hrefEn="/dashboard?lang=en"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleSignOut}
            >
              <LogOut className="h-3.5 w-3.5" />
              {locale === "sw" ? "Toka" : "Sign out"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        {activeTab === "history" ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-extrabold text-slate-900">
                {locale === "sw" ? "Historia ya Safari Zangu" : "My Unguja Trips"}
              </h1>
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => setActiveTab("book")}
              >
                {locale === "sw" ? "Agiza Safari Mpya" : "Book New Trip"}
              </Button>
            </div>
            {tripHistory.map((item) => (
              <Card key={item.tripCode} className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={
                        item.transportType === TransportType.BODABODA
                          ? "teal"
                          : "amber"
                      }
                    >
                      {item.transportType === TransportType.BODABODA
                        ? "Go.boda (Rider)"
                        : "Go.bajaji (Driver)"}
                    </Badge>
                    <span className="text-xs font-bold text-slate-500">
                      {item.tripCode} • {item.completedAt}
                    </span>
                  </div>
                  <span className="text-sm font-extrabold text-teal-800">
                    {formatTzs(item.fareTzs)}
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-800">
                  {item.pickupLabel} → {item.dropoffLabel}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                  <span>
                    {"★".repeat(item.stars)} ({item.stars}/5) •{" "}
                    {item.paymentMethod}
                  </span>
                  {item.helmetProvided !== null && (
                    <span
                      className={
                        item.helmetProvided
                          ? "font-semibold text-emerald-700"
                          : "font-semibold text-rose-600"
                      }
                    >
                      {item.helmetProvided
                        ? locale === "sw"
                          ? "Helmeti ilitolewa ✓"
                          : "Clean helmet verified ✓"
                        : locale === "sw"
                          ? "Hakuna helmeti (Imeripotiwa)"
                          : "No helmet (Flagged)"}
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </section>
        ) : (
          <>
            {/* Live Interactive Unguja MapLibre GL Map */}
            <section className="space-y-2.5">
              <UngujaMap
                locale={locale}
                vehicles={vehicles}
                pickup={pickup}
                snappedPickup={snappedPickupPoint}
                dropoff={dropoff}
                routeGeometry={quoteData?.route.geometry ?? null}
                pinMode={pinMode}
                onMapSelect={handleMapSelect}
              />

              {/* Live Nearby Bodaboda Riders & Bajaji Drivers Status Bar */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex items-center justify-between rounded-2xl border border-teal-200 bg-teal-950 px-3.5 py-2.5 text-white shadow-sm">
                  <div>
                    <div className="flex items-center gap-1.5 text-teal-200">
                      <Bike className="h-4 w-4" />
                      <span className="text-[11px] font-semibold">
                        {t("roles.bodabodaRider")}s
                      </span>
                    </div>
                    <p className="mt-0.5 text-base font-extrabold">
                      {loadingNearby
                        ? "..."
                        : `${nearbySummary.bodabodaCount} ${
                            locale === "sw" ? "karibu" : "nearby"
                          }`}
                    </p>
                  </div>
                  <span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-bold text-amber-300">
                    {nearbySummary.nearestBodabodaEtaMin
                      ? `~${nearbySummary.nearestBodabodaEtaMin}m`
                      : "—"}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-slate-900 px-3.5 py-2.5 text-white shadow-sm">
                  <div>
                    <div className="flex items-center gap-1.5 text-amber-300">
                      <CarFront className="h-4 w-4" />
                      <span className="text-[11px] font-semibold">
                        {t("roles.bajajiDriver")}s
                      </span>
                    </div>
                    <p className="mt-0.5 text-base font-extrabold">
                      {loadingNearby
                        ? "..."
                        : `${nearbySummary.bajajiCount} ${
                            locale === "sw" ? "karibu" : "nearby"
                          }`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-bold text-emerald-300">
                      {nearbySummary.nearestBajajiEtaMin
                        ? `~${nearbySummary.nearestBajajiEtaMin}m`
                        : "—"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void loadNearby(pickup.lat, pickup.lng)}
                      aria-label="Refresh nearby transport"
                      className="rounded-lg bg-white/10 p-1.5 text-slate-200 hover:bg-white/20"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${
                          loadingNearby ? "animate-spin" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* ACTIVE CUSTOMER TRIP EXPERIENCE (Matching Radar -> Assigned + PIN -> Live SOS/WhatsApp Share -> Receipt + Helmet Rating) */}
            {activeTrip ? (
              <Card className="space-y-4 border-2 border-teal-600 p-4 shadow-md">
                {activeTrip.status === TripStatus.SEARCHING ? (
                  <div className="space-y-3 py-4 text-center">
                    <Radar className="mx-auto h-10 w-10 animate-spin text-teal-700" />
                    <h2 className="text-lg font-extrabold text-slate-900">
                      {locale === "sw"
                        ? `Inatafuta ${
                            activeTrip.transportType === TransportType.BODABODA
                              ? "Rider wa Bodaboda"
                              : "Dereva wa Bajaji"
                          } aliye karibu...`
                        : `Matching nearby verified ${
                            activeTrip.transportType === TransportType.BODABODA
                              ? "Bodaboda Rider"
                              : "Bajaji Driver"
                          }...`}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {activeTrip.tripCode} • {formatTzs(activeTrip.fareTzs)} •{" "}
                      {activeTrip.paymentMethod}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setActiveTrip(null)}
                    >
                      {locale === "sw" ? "Ghairi Ombi" : "Cancel Request"}
                    </Button>
                  </div>
                ) : activeTrip.status === TripStatus.COMPLETED_UNPAID ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase text-emerald-700">
                          {locale === "sw"
                            ? "Safari Imekamilika — Risiti"
                            : "Trip Completed — Digital Receipt"}
                        </p>
                        <h2 className="text-2xl font-black text-slate-900">
                          {formatTzs(activeTrip.fareTzs)}
                        </h2>
                      </div>
                      <Badge tone="emerald">{activeTrip.paymentMethod}</Badge>
                    </div>

                    <p className="rounded-xl bg-slate-50 p-3 text-xs font-medium text-slate-700">
                      {activeTrip.tripCode} • {activeTrip.operatorName} (
                      {activeTrip.operatorPlate}) • {activeTrip.pickupLabel} →{" "}
                      {activeTrip.dropoffLabel}
                    </p>

                    {/* Bodaboda Helmet Compliance Question */}
                    {activeTrip.transportType === TransportType.BODABODA && (
                      <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-bold text-amber-950">
                          {locale === "sw"
                            ? "Je, Rider wa Bodaboda alikupa helmeti safi?"
                            : "Did your Bodaboda Rider provide a clean passenger helmet?"}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setHelmetProvided(true)}
                            className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                              helmetProvided
                                ? "border-emerald-700 bg-emerald-600 text-white"
                                : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            ✓ {locale === "sw" ? "Ndiyo (Safi)" : "Yes, provided"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setHelmetProvided(false)}
                            className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                              !helmetProvided
                                ? "border-rose-700 bg-rose-600 text-white"
                                : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            ✕ {locale === "sw" ? "Hapana (Ripoti)" : "No helmet (Flag)"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 1–5 Star Rating */}
                    <div className="space-y-1.5 text-center">
                      <p className="text-xs font-bold text-slate-600">
                        {locale === "sw"
                          ? "Kadiria Safari Yako"
                          : "Rate Your Operator"}
                      </p>
                      <div className="flex justify-center gap-2">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setRatingStars(s)}
                            className="p-1"
                          >
                            <Star
                              className={`h-7 w-7 ${
                                s <= ratingStars
                                  ? "fill-amber-400 text-amber-500"
                                  : "text-slate-300"
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
                      onClick={handleSubmitRating}
                      className="w-full"
                    >
                      <CheckCircle2 className="h-5 w-5" />
                      {locale === "sw"
                        ? "Wasilisha Maoni na Maliza"
                        : "Submit Rating & Finish"}
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* SOS Active Alert Banner */}
                    {activeTrip.sosTriggered && (
                      <div className="rounded-xl border-2 border-rose-500 bg-rose-50 p-3 text-xs text-rose-950">
                        <p className="font-black uppercase">
                          SOS ACTIVE — {activeTrip.sosAlertCode}
                        </p>
                        <p className="mt-0.5">
                          {locale === "sw"
                            ? "Eneo lako la GPS limetumwa kwa timu ya Operesheni Zanzibar."
                            : "Live Unguja GPS alert dispatched to Go.boda Zanzibar Operations."}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <a
                            href="tel:112"
                            className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-3 py-1 font-bold text-white"
                          >
                            <PhoneCall className="h-3.5 w-3.5" />
                            Emergency 112
                          </a>
                          <a
                            href="tel:+255770000112"
                            className="inline-flex items-center gap-1 rounded-full border border-rose-400 bg-white px-3 py-1 font-bold text-rose-800"
                          >
                            Ops Desk
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Assigned Bodaboda Rider / Bajaji Driver Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                            activeTrip.transportType === TransportType.BODABODA
                              ? "bg-teal-700 text-white"
                              : "bg-amber-500 text-slate-950"
                          }`}
                        >
                          {activeTrip.transportType === TransportType.BODABODA ? (
                            <Bike className="h-6 w-6" />
                          ) : (
                            <CarFront className="h-6 w-6" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-extrabold text-slate-900">
                            {activeTrip.operatorName} • ★{" "}
                            {activeTrip.operatorRating.toFixed(1)}
                          </p>
                          <p className="text-xs font-bold text-teal-800">
                            {activeTrip.transportType === TransportType.BODABODA
                              ? "Bodaboda Rider"
                              : "Bajaji Driver"}{" "}
                            •{" "}
                            <span className="font-mono">
                              {activeTrip.operatorPlate}
                            </span>
                          </p>
                        </div>
                      </div>
                      <Badge
                        tone={activeTrip.sosTriggered ? "rose" : "emerald"}
                      >
                        {activeTrip.status}
                      </Badge>
                    </div>

                    {/* Prominent 4-Digit Start PIN Card */}
                    {activeTrip.status === TripStatus.ASSIGNED && (
                      <div className="flex items-center justify-between rounded-2xl bg-teal-950 px-4 py-3 text-white">
                        <div className="flex items-center gap-2">
                          <KeyRound className="h-5 w-5 text-amber-300" />
                          <div>
                            <p className="text-[11px] font-semibold text-teal-200">
                              {locale === "sw"
                                ? "Mpe mwendeshaji PIN hii kuanza safari"
                                : "Share this 4-digit Start PIN to begin trip"}
                            </p>
                            <p className="text-xs text-teal-100/80">
                              ETA ~{activeTrip.operatorEtaMin} min •{" "}
                              {formatTzs(activeTrip.fareTzs)}
                            </p>
                          </div>
                        </div>
                        <span className="rounded-xl bg-amber-400 px-3 py-1.5 font-mono text-xl font-black tracking-widest text-slate-950">
                          {activeTrip.startPin}
                        </span>
                      </div>
                    )}

                    {/* Call, WhatsApp Live Share & Emergency SOS Action Bar */}
                    <div className="grid grid-cols-3 gap-2">
                      <a
                        href={`tel:${activeTrip.operatorPhone}`}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50"
                      >
                        <PhoneCall className="h-3.5 w-3.5 text-teal-700" />
                        {locale === "sw" ? "Piga Simu" : "Call"}
                      </a>
                      <a
                        href={whatsappShareHref}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100"
                      >
                        <Share2 className="h-3.5 w-3.5 text-emerald-700" />
                        WhatsApp
                      </a>
                      <button
                        type="button"
                        onClick={() => setSosDrawerOpen((v) => !v)}
                        className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-rose-600 px-2.5 py-2 text-xs font-extrabold text-white hover:bg-rose-700"
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        SOS
                      </button>
                    </div>

                    {/* Direct Preview Link to Public /track/[shareToken] */}
                    <div className="flex items-center justify-between rounded-xl bg-slate-100 px-3 py-2 text-xs">
                      <span className="truncate font-medium text-slate-700">
                        {locale === "sw"
                          ? "Kiungo cha ufuatiliaji:"
                          : "Live share link:"}{" "}
                        <code className="font-bold text-teal-800">
                          {liveTrackPath}
                        </code>
                      </span>
                      <a
                        href={liveTrackPath}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 font-bold text-teal-700 underline"
                      >
                        {locale === "sw" ? "Fungua" : "Open"}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>

                    {/* SOS Confirmation Drawer */}
                    {sosDrawerOpen && (
                      <div className="space-y-2.5 rounded-2xl border-2 border-rose-500 bg-rose-50 p-3.5">
                        <div className="flex items-start gap-2 text-xs text-rose-950">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                          <div>
                            <p className="font-extrabold">
                              {locale === "sw"
                                ? "Thibitisha Tahadhari ya Dharura (SOS)"
                                : "Confirm Emergency SOS Alert"}
                            </p>
                            <p className="mt-0.5">
                              {locale === "sw"
                                ? "Hii itatuma GPS yako ya sasa, namba ya chombo na safari kwa timu ya Operesheni mara moja."
                                : "Sends your live Unguja GPS, vehicle Z-Plate, and trip details immediately to Go.boda Operations."}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setSosDrawerOpen(false)}
                          >
                            {locale === "sw" ? "Funga" : "Cancel"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            onClick={handleConfirmSos}
                          >
                            {locale === "sw"
                              ? "Tuma SOS Sasa"
                              : "Trigger SOS Now"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Bilingual Quick-Chat Presets */}
                    <div className="space-y-2 border-t border-slate-100 pt-3">
                      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                        <MessageSquare className="h-3.5 w-3.5 text-teal-700" />
                        {locale === "sw"
                          ? "Ujumbe wa Haraka kwa Mwendeshaji"
                          : "Quick-Chat with Operator"}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {CUSTOMER_CHAT_PRESETS.map((p) => (
                          <button
                            key={p.key}
                            type="button"
                            onClick={() => handleSendChat(p)}
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:border-teal-400 hover:bg-teal-50"
                          >
                            {locale === "sw" ? p.sw : p.en}
                          </button>
                        ))}
                      </div>
                      {chatMessages.length > 0 && (
                        <div className="space-y-1">
                          {chatMessages.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center justify-between rounded-xl bg-teal-50 px-3 py-1.5 text-xs text-teal-950"
                            >
                              <span>{m.text}</span>
                              <span className="text-[10px] text-teal-700">
                                {m.time}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Interactive Stage Advance Controls for Walkthroughs */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      {activeTrip.status === TripStatus.ASSIGNED ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setActiveTrip(null)}
                          >
                            {locale === "sw" ? "Ghairi Safari" : "Cancel Trip"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="primary"
                            onClick={() =>
                              setActiveTrip((p) =>
                                p ? { ...p, status: TripStatus.IN_PROGRESS } : null
                              )
                            }
                          >
                            {locale === "sw"
                              ? "PIN Imethibitishwa → Safari Imeanza"
                              : "PIN Verified → Start Trip"}
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          size="md"
                          variant="amber"
                          className="w-full font-extrabold"
                          onClick={() =>
                            setActiveTrip((p) =>
                              p
                                ? { ...p, status: TripStatus.COMPLETED_UNPAID }
                                : null
                            )
                          }
                        >
                          {locale === "sw"
                            ? "Fika Unakoenda → Risiti na Tathmini"
                            : "Arrive at Dropoff → Receipt & Helmet Check"}
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </Card>
            ) : (
              <>
                {/* Pickup & Dropoff Search + Map Pin Mode + Quick Unguja Chips */}
                <Card className="relative space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPinMode("pickup")}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          pinMode === "pickup"
                            ? "bg-teal-700 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {t("customer.pinPickupMode")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPinMode("dropoff")}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                          pinMode === "dropoff"
                            ? "bg-amber-500 text-slate-950"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {t("customer.pinDropoffMode")}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleUseMyGps}
                      className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                    >
                      <LocateFixed className="h-3.5 w-3.5" />
                      {t("customer.useMyLocation")}
                    </button>
                  </div>

                  {gpsStatus && (
                    <p className="text-xs font-medium text-teal-700">
                      {gpsStatus}
                    </p>
                  )}

                  {/* Pickup Input */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {t("customer.pickupLabel")}
                    </label>
                    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus-within:border-teal-600 focus-within:bg-white">
                      <Navigation className="h-4 w-4 shrink-0 text-teal-700" />
                      <input
                        type="text"
                        value={pickupQuery}
                        onFocus={() => {
                          setActiveField("pickup");
                          setPinMode("pickup");
                        }}
                        onChange={(e) => setPickupQuery(e.target.value)}
                        placeholder={t("customer.pickupPlaceholder")}
                        className="w-full bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Dropoff Input */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {t("customer.dropoffLabel")}
                    </label>
                    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus-within:border-amber-500 focus-within:bg-white">
                      <MapPin className="h-4 w-4 shrink-0 text-amber-600" />
                      <input
                        type="text"
                        value={dropoffQuery}
                        onFocus={() => {
                          setActiveField("dropoff");
                          setPinMode("dropoff");
                        }}
                        onChange={(e) => setDropoffQuery(e.target.value)}
                        placeholder={t("customer.whereToPlaceholder")}
                        className="w-full bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Bilingual Unguja Landmark Autocomplete Results */}
                  {activeField && (
                    <div className="rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                      <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-slate-500">
                        <span>
                          {searching
                            ? locale === "sw"
                              ? "Inatafuta vituo Unguja..."
                              : "Searching Unguja landmarks..."
                            : locale === "sw"
                              ? "Vituo na Maeneo ya Unguja"
                              : "Unguja Landmarks & Vituo"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveField(null)}
                          className="text-slate-400 hover:text-slate-700"
                        >
                          ✕
                        </button>
                      </div>
                      {searchResults.length === 0 && !searching ? (
                        <p className="px-2.5 py-2 text-xs text-slate-500">
                          {locale === "sw"
                            ? "Hakuna kituo kilichopatikana. Gusa ramani kuweka pini."
                            : "No landmark matched. Tap directly on the Unguja map to drop a pin."}
                        </p>
                      ) : (
                        <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto">
                          {searchResults.map((item) => (
                            <li key={item.id}>
                              <button
                                type="button"
                                onClick={() => handleSelectLandmark(item)}
                                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-teal-50"
                              >
                                <div className="min-w-0 pr-2">
                                  <p className="truncate text-sm font-semibold text-slate-900">
                                    {locale === "sw" ? item.nameSw : item.nameEn}
                                  </p>
                                  <p className="truncate text-[11px] text-slate-500">
                                    {item.area} • {item.category}
                                  </p>
                                </div>
                                {item.isKituo && (
                                  <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                                    Kituo
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Pickup Note & Quick Chips */}
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={pickupNote}
                      onChange={(e) => setPickupNote(e.target.value)}
                      placeholder={
                        locale === "sw"
                          ? "Maelezo ya kukutana (mf. Niko mbele ya geti)..."
                          : "Optional pickup note (e.g. At main gate)..."
                      }
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {PICKUP_NOTE_CHIPS.map((chip) => {
                        const text = locale === "sw" ? chip.sw : chip.en;
                        return (
                          <button
                            key={chip.en}
                            type="button"
                            onClick={() => setPickupNote(text)}
                            className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:border-teal-400 hover:text-teal-800"
                          >
                            + {text}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Quick Unguja Destination & Smart Snap Preset Chips */}
                  <div className="space-y-1.5 pt-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {t("customer.quickDestinations")}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {PRESET_SPOTS.map((spot) => {
                        const label =
                          locale === "sw" ? spot.labelSw : spot.labelEn;
                        const toneClass =
                          spot.accent === "teal"
                            ? "border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100"
                            : spot.accent === "red"
                              ? "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";
                        return (
                          <button
                            key={spot.id}
                            type="button"
                            onClick={() => handlePresetClick(spot)}
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${toneClass}`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Stone Town Smart Snap Active Banner */}
                  {quoteData?.pickup.snapped && quoteData.pickup.snapGate ? (
                    <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-950">
                      <Footprints className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                      <div>
                        <p className="font-bold">
                          {t("customer.snappedTitle")}
                        </p>
                        <p className="mt-0.5 text-amber-900">
                          {t("customer.snappedWalkPrefix")}{" "}
                          <strong>
                            {quoteData.pickup.snapGate.walkingDistanceMeters}m
                            (~
                            {quoteData.pickup.snapGate.walkingMinutes} min)
                          </strong>{" "}
                          {t("customer.snappedWalkSuffix")}:{" "}
                          <strong>
                            {locale === "sw"
                              ? quoteData.pickup.snapGate.nameSw
                              : quoteData.pickup.snapGate.nameEn}
                          </strong>
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-700">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                      <span>{t("customer.stoneTownNotice")}</span>
                    </div>
                  )}

                  {/* Unguja-Only Geofence Error Banner */}
                  {outsideError && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-xs text-rose-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                      <div>
                        <p className="font-bold">
                          {t("customer.outsideUngujaTitle")}
                        </p>
                        <p className="mt-0.5">{outsideError}</p>
                      </div>
                    </div>
                  )}
                </Card>

                {/* Upfront TZS Fare Selection: Go.boda (Rider) vs Go.bajaji (Driver) */}
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">
                      {t("customer.nearbyHeading")}
                    </h2>
                    {loadingQuote ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {locale === "sw"
                          ? "Inakokotoa nauli..."
                          : "Calculating TZS fare..."}
                      </span>
                    ) : quoteData ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-900">
                        <Route className="h-3.5 w-3.5 text-teal-700" />
                        {quoteData.route.distanceKm} km • ~
                        {quoteData.route.durationMinutes} min
                      </span>
                    ) : null}
                  </div>

                  <div className="grid gap-3">
                    {/* Go.boda — Bodaboda Rider */}
                    <button
                      type="button"
                      disabled={Boolean(outsideError)}
                      onClick={() => setSelectedType(TransportType.BODABODA)}
                      className={`flex items-center justify-between rounded-2xl border-2 p-4 text-left transition disabled:opacity-50 ${
                        selectedType === TransportType.BODABODA
                          ? "border-teal-700 bg-teal-50/70 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
                          <Bike className="h-6 w-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-slate-900">
                              {t("customer.bodabodaName")}
                            </p>
                            <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-900">
                              Rider
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">
                            {t("customer.bodabodaMeta")}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {bodabodaQuote && bodabodaQuote.discountTzs > 0 && (
                          <p className="text-[11px] text-slate-400 line-through">
                            {formatTzs(bodabodaQuote.grossFareTzs)}
                          </p>
                        )}
                        <p className="text-base font-extrabold text-teal-800">
                          {outsideError
                            ? "—"
                            : formatTzs(
                                bodabodaQuote?.finalFareTzs ?? fallbackBodaFare
                              )}
                        </p>
                        <p className="text-xs text-slate-500">
                          {nearbySummary.nearestBodabodaEtaMin
                            ? `~${nearbySummary.nearestBodabodaEtaMin} min`
                            : "2–4 min"}
                        </p>
                      </div>
                    </button>

                    {/* Go.bajaji — Bajaji Driver */}
                    <button
                      type="button"
                      disabled={Boolean(outsideError)}
                      onClick={() => setSelectedType(TransportType.BAJAJI)}
                      className={`flex items-center justify-between rounded-2xl border-2 p-4 text-left transition disabled:opacity-50 ${
                        selectedType === TransportType.BAJAJI
                          ? "border-teal-700 bg-teal-50/70 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-slate-950">
                          <CarFront className="h-6 w-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-slate-900">
                              {t("customer.bajajiName")}
                            </p>
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                              Driver
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">
                            {t("customer.bajajiMeta")}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        {bajajiQuote && bajajiQuote.discountTzs > 0 && (
                          <p className="text-[11px] text-slate-400 line-through">
                            {formatTzs(bajajiQuote.grossFareTzs)}
                          </p>
                        )}
                        <p className="text-base font-extrabold text-slate-900">
                          {outsideError
                            ? "—"
                            : formatTzs(
                                bajajiQuote?.finalFareTzs ?? fallbackBajajiFare
                              )}
                        </p>
                        <p className="text-xs text-slate-500">
                          {nearbySummary.nearestBajajiEtaMin
                            ? `~${nearbySummary.nearestBajajiEtaMin} min`
                            : "3–5 min"}
                        </p>
                      </div>
                    </button>
                  </div>

                  {/* Promo Code + Payment Method + Cash Change Helper */}
                  <Card className="space-y-3 p-3.5">
                    <form
                      onSubmit={handleApplyPromo}
                      className="flex items-center gap-2"
                    >
                      <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <Tag className="h-4 w-4 shrink-0 text-teal-700" />
                        <input
                          type="text"
                          value={promoInput}
                          onChange={(e) => setPromoInput(e.target.value)}
                          placeholder={t("customer.promoPlaceholder")}
                          className="w-full bg-transparent text-xs font-semibold uppercase tracking-wide text-slate-900 placeholder:normal-case placeholder:font-normal placeholder:text-slate-400 focus:outline-none"
                        />
                      </div>
                      <Button type="submit" variant="secondary" size="sm">
                        {t("customer.promoApply")}
                      </Button>
                    </form>

                    {quoteData?.promoStatus === "APPLIED" &&
                      activeQuote?.promoApplied && (
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t("customer.promoApplied")}:{" "}
                          {activeQuote.promoApplied} (-
                          {formatTzs(activeQuote.discountTzs)})
                        </p>
                      )}
                    {quoteData?.promoStatus === "INVALID" && (
                      <p className="text-xs font-semibold text-rose-600">
                        {t("customer.promoInvalid")}
                      </p>
                    )}

                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {[
                        {
                          id: PaymentMethod.CASH,
                          label: t("customer.payCash"),
                          icon: Banknote,
                        },
                        {
                          id: PaymentMethod.MOBILE_MONEY,
                          label: t("customer.payMobileMoney"),
                          icon: Smartphone,
                        },
                        {
                          id: PaymentMethod.CARD,
                          label: t("customer.payCard"),
                          icon: CreditCard,
                        },
                      ].map((pm) => {
                        const Icon = pm.icon;
                        const active = paymentMethod === pm.id;
                        return (
                          <button
                            key={pm.id}
                            type="button"
                            onClick={() => setPaymentMethod(pm.id)}
                            className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                              active
                                ? "border-teal-700 bg-teal-50 text-teal-900"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{pm.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    {paymentMethod === PaymentMethod.CASH && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                        <span className="font-semibold text-slate-500">
                          {locale === "sw" ? "Chenji ya Pesa:" : "Cash Note:"}
                        </span>
                        {["Exact TZS", "TZS 10,000 note", "TZS 20,000 note"].map(
                          (opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setCashChangeNote(opt)}
                              className={`rounded-full px-2.5 py-0.5 font-semibold ${
                                cashChangeNote === opt
                                  ? "bg-teal-700 text-white"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              {opt}
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </Card>

                  <Button
                    size="lg"
                    variant="primary"
                    disabled={
                      Boolean(outsideError) || loadingQuote || !activeQuote
                    }
                    onClick={handleRequestTransport}
                    className="w-full"
                  >
                    {t("customer.requestCta")} •{" "}
                    {selectedType === TransportType.BODABODA
                      ? "Go.boda"
                      : "Go.bajaji"}
                    {activeQuote
                      ? ` • ${formatTzs(activeQuote.finalFareTzs)}`
                      : ""}
                  </Button>
                </section>
              </>
            )}
          </>
        )}
      </main>

      {/* Bottom Mobile Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-2xl grid-cols-3 py-2 text-center text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("book")}
            className={`flex flex-col items-center gap-1 ${
              activeTab === "book" ? "text-teal-700" : "text-slate-500"
            }`}
          >
            <Compass className="h-5 w-5" />
            {t("customer.navHome")}
          </button>
          <Link
            href="/trips"
            className="flex flex-col items-center gap-1 text-slate-500 hover:text-teal-700"
          >
            <History className="h-5 w-5" />
            {locale === "sw" ? "Safari" : "Trips"}
          </Link>
          <Link
            href="/safety"
            className="flex flex-col items-center gap-1 text-slate-500 hover:text-teal-700"
          >
            <ShieldCheck className="h-5 w-5" />
            {locale === "sw" ? "Usalama" : "Safety"}
          </Link>
        </div>
      </nav>
    </div>
  );
}
