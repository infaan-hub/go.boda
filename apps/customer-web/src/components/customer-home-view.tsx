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
  EditorialScrollHero,
  LanguageSwitchLink,
  ScrollReveal,
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
      <div className="flex h-full min-h-[260px] w-full items-center justify-center rounded-3xl bg-[#17645F] text-xs font-bold uppercase tracking-[0.16em] text-[#F3EEE8]">
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
    <div className="min-h-screen bg-[#F3EEE8] pb-24 text-[#122927]">
      {/* Editorial Minimal Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-[#17645F]/15 bg-[#F3EEE8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-8">
          <BrandLogo subtitle={t("common.ungujaOnly")} />

          <nav className="hidden items-center gap-7 text-[11px] font-bold uppercase tracking-[0.2em] text-[#17645F]/75 md:flex">
            <a
              href="#workspace"
              onClick={() => setActiveTab("book")}
              className={`transition hover:text-[#17645F] ${
                activeTab === "book"
                  ? "text-[#17645F] underline underline-offset-4"
                  : ""
              }`}
            >
              {locale === "sw" ? "Agiza" : "Book"}
            </a>
            <Link href="/trips" className="transition hover:text-[#17645F]">
              {locale === "sw" ? "Safari" : "Trips"}
            </Link>
            <Link href="/safety" className="transition hover:text-[#17645F]">
              {locale === "sw" ? "Usalama" : "Safety"}
            </Link>
            <Link href="/track" className="transition hover:text-[#17645F]">
              {locale === "sw" ? "Fuatilia" : "Track"}
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            {customerName ? (
              <span className="hidden text-[11px] font-bold uppercase tracking-[0.14em] text-[#17645F]/75 lg:inline">
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
              className="uppercase tracking-[0.14em]"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">
                {locale === "sw" ? "Toka" : "Sign Out"}
              </span>
            </Button>
          </div>
        </div>
      </header>

      {/* Editorial Bodaboda Scroll-Transition Hero */}
      {activeTab === "book" ? (
        <EditorialScrollHero
          eyebrowItems={["BODABODA", "BAJAJI", "STONE TOWN", "UNGUJA"]}
          displayWordLeft={locale === "sw" ? "SAFIRI" : "RIDE"}
          displayWordRight="UNGUJA"
          taglineLines={
            locale === "sw"
              ? ["SAFARI ZA HARAKA", "NA SALAMA KWA", "KILA MTAA UNGUJA."]
              : ["UPFRONT TZS RIDES", "ACROSS EVERY ROAD", "OF UNGUJA ISLAND."]
          }
          ctaLabel={locale === "sw" ? "AGIZA SAFARI" : "BOOK A RIDE"}
          ctaHref="#workspace"
          imageSrc="/images/bodaboda-hero.webp"
          imageAlt="Go.boda Unguja Bodaboda Rider"
          scrollHint={
            locale === "sw" ? "Shuka chini kuagiza safari" : "Scroll to book your ride"
          }
          features={[
            {
              icon: <Bike className="h-4 w-4" />,
              title: locale === "sw" ? "NAULI YA WAZI" : "UPFRONT TZS",
              subtitle: locale === "sw" ? "BILA MAJADILIANO" : "FIXED FARES",
            },
            {
              icon: <Compass className="h-4 w-4" />,
              title: "STONE TOWN",
              subtitle: "SMART SNAP",
            },
            {
              icon: <ShieldCheck className="h-4 w-4" />,
              title: locale === "sw" ? "USALAMA 24/7" : "VERIFIED SAFE",
              subtitle: locale === "sw" ? "HELMETI & SOS" : "HELMET & SOS",
            },
          ]}
        />
      ) : null}

      <main
        id="workspace"
        className="mx-auto max-w-3xl scroll-mt-20 space-y-5 px-4 pt-8 sm:px-6"
      >
        {activeTab === "history" ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-[#17645F]/15 pb-3">
              <h1 className="font-display text-3xl uppercase text-[#17645F]">
                {locale === "sw" ? "Historia ya Safari" : "My Unguja Trips"}
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
                    <span className="text-xs font-bold text-[#17645F]/70">
                      {item.tripCode} • {item.completedAt}
                    </span>
                  </div>
                  <span className="text-sm font-extrabold text-[#17645F]">
                    {formatTzs(item.fareTzs)}
                  </span>
                </div>
                <p className="text-xs font-semibold text-[#122927]">
                  {item.pickupLabel} → {item.dropoffLabel}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#17645F]/75">
                  <span>
                    {"★".repeat(item.stars)} ({item.stars}/5) •{" "}
                    {item.paymentMethod}
                  </span>
                  {item.helmetProvided !== null && (
                    <span
                      className={
                        item.helmetProvided
                          ? "font-semibold text-[#17645F]"
                          : "font-semibold text-[#A93232]"
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
            <ScrollReveal>
              <section className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#17645F]/75">
                      LIVE UNGUJA DISPATCH
                    </p>
                    <h2 className="font-display text-3xl uppercase leading-none text-[#17645F]">
                      {locale === "sw" ? "RAMANI YA UNGUJA" : "PICK YOUR ROUTE"}
                    </h2>
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#17645F]/70">
                    {nearbySummary.totalNearby}{" "}
                    {locale === "sw" ? "vyombo karibu" : "vehicles nearby"}
                  </span>
                </div>

                <div className="overflow-hidden rounded-3xl border border-[#17645F]/20 shadow-sm">
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
                </div>

                {/* Live Nearby Bodaboda Riders & Bajaji Drivers Status Bar */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center justify-between rounded-3xl border border-[#17645F]/20 bg-[#17645F] px-4 py-3 text-[#F3EEE8] shadow-sm">
                    <div>
                      <div className="flex items-center gap-1.5 text-[#F3EEE8]/80">
                        <Bike className="h-4 w-4" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
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
                    <span className="rounded-full bg-[#F3EEE8]/15 px-2.5 py-1 text-xs font-bold text-[#F3EEE8]">
                      {nearbySummary.nearestBodabodaEtaMin
                        ? `~${nearbySummary.nearestBodabodaEtaMin}m`
                        : "—"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-3xl border border-[#17645F]/20 bg-[#122927] px-4 py-3 text-[#F3EEE8] shadow-sm">
                    <div>
                      <div className="flex items-center gap-1.5 text-[#E6C99E]">
                        <CarFront className="h-4 w-4" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
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
                      <span className="rounded-full bg-[#F3EEE8]/15 px-2.5 py-1 text-xs font-bold text-[#E6C99E]">
                        {nearbySummary.nearestBajajiEtaMin
                          ? `~${nearbySummary.nearestBajajiEtaMin}m`
                          : "—"}
                      </span>
                      <button
                        type="button"
                        onClick={() => void loadNearby(pickup.lat, pickup.lng)}
                        aria-label="Refresh nearby transport"
                        className="rounded-full bg-[#F3EEE8]/10 p-1.5 text-[#F3EEE8] hover:bg-[#F3EEE8]/20"
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
            </ScrollReveal>

            {/* ACTIVE CUSTOMER TRIP EXPERIENCE (Matching Radar -> Assigned + PIN -> Live SOS/WhatsApp Share -> Receipt + Helmet Rating) */}
            {activeTrip ? (
              <ScrollReveal delayMs={60}>
                <Card className="space-y-4 border-2 border-[#17645F] bg-[#FAF7F2] p-5 shadow-md">
                  {activeTrip.status === TripStatus.SEARCHING ? (
                    <div className="space-y-3 py-4 text-center">
                      <Radar className="mx-auto h-10 w-10 animate-spin text-[#17645F]" />
                      <h2 className="font-display text-2xl uppercase text-[#17645F]">
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
                      <p className="text-xs text-[#17645F]/75">
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
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#17645F]">
                            {locale === "sw"
                              ? "Safari Imekamilika — Risiti"
                              : "Trip Completed — Digital Receipt"}
                          </p>
                          <h2 className="font-display text-3xl text-[#17645F]">
                            {formatTzs(activeTrip.fareTzs)}
                          </h2>
                        </div>
                        <Badge tone="emerald">{activeTrip.paymentMethod}</Badge>
                      </div>

                      <p className="rounded-2xl bg-[#F3EEE8] p-3 text-xs font-medium text-[#122927]">
                        {activeTrip.tripCode} • {activeTrip.operatorName} (
                        {activeTrip.operatorPlate}) • {activeTrip.pickupLabel} →{" "}
                        {activeTrip.dropoffLabel}
                      </p>

                      {/* Bodaboda Helmet Compliance Question */}
                      {activeTrip.transportType === TransportType.BODABODA && (
                        <div className="space-y-2 rounded-2xl border border-[#B86B2B]/30 bg-[#B86B2B]/10 p-3.5">
                          <p className="text-xs font-bold text-[#8E4F1B]">
                            {locale === "sw"
                              ? "Je, Rider wa Bodaboda alikupa helmeti safi?"
                              : "Did your Bodaboda Rider provide a clean passenger helmet?"}
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setHelmetProvided(true)}
                              className={`rounded-full border px-3 py-2 text-xs font-bold transition ${
                                helmetProvided
                                  ? "border-[#17645F] bg-[#17645F] text-[#F3EEE8]"
                                  : "border-[#17645F]/20 bg-[#FAF7F2] text-[#122927]"
                              }`}
                            >
                              ✓ {locale === "sw" ? "Ndiyo (Safi)" : "Yes, provided"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setHelmetProvided(false)}
                              className={`rounded-full border px-3 py-2 text-xs font-bold transition ${
                                !helmetProvided
                                  ? "border-[#A93232] bg-[#A93232] text-white"
                                  : "border-[#17645F]/20 bg-[#FAF7F2] text-[#122927]"
                              }`}
                            >
                              ✕ {locale === "sw" ? "Hapana (Ripoti)" : "No helmet (Flag)"}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 1–5 Star Rating */}
                      <div className="space-y-1.5 text-center">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#17645F]/80">
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
                        <div className="rounded-2xl border-2 border-[#A93232] bg-[#A93232]/10 p-3.5 text-xs text-[#6B1D1D]">
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
                              className="inline-flex items-center gap-1 rounded-full bg-[#A93232] px-3 py-1 font-bold text-white"
                            >
                              <PhoneCall className="h-3.5 w-3.5" />
                              Emergency 112
                            </a>
                            <a
                              href="tel:+255770000112"
                              className="inline-flex items-center gap-1 rounded-full border border-[#A93232] bg-[#FAF7F2] px-3 py-1 font-bold text-[#A93232]"
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
                            className={`flex h-12 w-12 items-center justify-center rounded-full ${
                              activeTrip.transportType === TransportType.BODABODA
                                ? "bg-[#17645F] text-[#F3EEE8]"
                                : "bg-[#B86B2B] text-[#FAF7F2]"
                            }`}
                          >
                            {activeTrip.transportType === TransportType.BODABODA ? (
                              <Bike className="h-6 w-6" />
                            ) : (
                              <CarFront className="h-6 w-6" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-extrabold text-[#122927]">
                              {activeTrip.operatorName} • ★{" "}
                              {activeTrip.operatorRating.toFixed(1)}
                            </p>
                            <p className="text-xs font-bold text-[#17645F]">
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
                        <div className="flex items-center justify-between rounded-2xl bg-[#17645F] px-4 py-3.5 text-[#F3EEE8]">
                          <div className="flex items-center gap-2.5">
                            <KeyRound className="h-5 w-5 text-[#E6C99E]" />
                            <div>
                              <p className="text-[11px] font-semibold text-[#F3EEE8]/85">
                                {locale === "sw"
                                  ? "Mpe mwendeshaji PIN hii kuanza safari"
                                  : "Share this 4-digit Start PIN to begin trip"}
                              </p>
                              <p className="text-xs text-[#F3EEE8]/70">
                                ETA ~{activeTrip.operatorEtaMin} min •{" "}
                                {formatTzs(activeTrip.fareTzs)}
                              </p>
                            </div>
                          </div>
                          <span className="rounded-full bg-[#F3EEE8] px-4 py-1.5 font-mono text-xl font-black tracking-widest text-[#17645F]">
                            {activeTrip.startPin}
                          </span>
                        </div>
                      )}

                      {/* Call, WhatsApp Live Share & Emergency SOS Action Bar */}
                      <div className="grid grid-cols-3 gap-2">
                        <a
                          href={`tel:${activeTrip.operatorPhone}`}
                          className="flex items-center justify-center gap-1.5 rounded-full border border-[#17645F]/25 bg-[#F3EEE8] px-2.5 py-2 text-xs font-bold text-[#17645F] hover:bg-[#17645F] hover:text-[#F3EEE8]"
                        >
                          <PhoneCall className="h-3.5 w-3.5" />
                          {locale === "sw" ? "Piga Simu" : "Call"}
                        </a>
                        <a
                          href={whatsappShareHref}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center gap-1.5 rounded-full bg-[#17645F] px-2.5 py-2 text-xs font-bold text-[#F3EEE8] hover:bg-[#114E4A]"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          WhatsApp
                        </a>
                        <button
                          type="button"
                          onClick={() => setSosDrawerOpen((v) => !v)}
                          className="flex items-center justify-center gap-1.5 rounded-full bg-[#A93232] px-2.5 py-2 text-xs font-extrabold text-white hover:bg-[#8A2626]"
                        >
                          <ShieldAlert className="h-3.5 w-3.5" />
                          SOS
                        </button>
                      </div>

                      {/* Direct Preview Link to Public /track/[shareToken] */}
                      <div className="flex items-center justify-between rounded-2xl bg-[#F3EEE8] px-3.5 py-2.5 text-xs">
                        <span className="truncate font-medium text-[#122927]">
                          {locale === "sw"
                            ? "Kiungo cha ufuatiliaji:"
                            : "Live share link:"}{" "}
                          <code className="font-bold text-[#17645F]">
                            {liveTrackPath}
                          </code>
                        </span>
                        <a
                          href={liveTrackPath}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex shrink-0 items-center gap-1 font-bold text-[#17645F] underline"
                        >
                          {locale === "sw" ? "Fungua" : "Open"}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>

                      {/* SOS Confirmation Drawer */}
                      {sosDrawerOpen && (
                        <div className="space-y-2.5 rounded-2xl border-2 border-[#A93232] bg-[#A93232]/10 p-3.5">
                          <div className="flex items-start gap-2 text-xs text-[#6B1D1D]">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#A93232]" />
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
                      <div className="space-y-2 border-t border-[#17645F]/10 pt-3">
                        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-[#17645F]/80">
                          <MessageSquare className="h-3.5 w-3.5 text-[#17645F]" />
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
                              className="rounded-full border border-[#17645F]/20 bg-[#F3EEE8] px-3 py-1 text-[11px] font-semibold text-[#17645F] hover:bg-[#17645F] hover:text-[#F3EEE8]"
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
                                className="flex items-center justify-between rounded-2xl bg-[#17645F]/10 px-3 py-1.5 text-xs text-[#122927]"
                              >
                                <span>{m.text}</span>
                                <span className="text-[10px] font-bold text-[#17645F]">
                                  {m.time}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Trip Stage Controls */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#17645F]/10 pt-3">
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
              </ScrollReveal>
            ) : (
              <>
                {/* Pickup & Dropoff Search + Map Pin Mode + Quick Unguja Chips */}
                <ScrollReveal delayMs={80}>
                  <Card className="relative space-y-3.5 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPinMode("pickup")}
                          className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition ${
                            pinMode === "pickup"
                              ? "bg-[#17645F] text-[#F3EEE8]"
                              : "bg-[#F3EEE8] text-[#17645F]/75 hover:bg-[#17645F]/10"
                          }`}
                        >
                          {t("customer.pinPickupMode")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPinMode("dropoff")}
                          className={`rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition ${
                            pinMode === "dropoff"
                              ? "bg-[#B86B2B] text-[#FAF7F2]"
                              : "bg-[#F3EEE8] text-[#17645F]/75 hover:bg-[#17645F]/10"
                          }`}
                        >
                          {t("customer.pinDropoffMode")}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={handleUseMyGps}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#17645F]/30 bg-[#F3EEE8] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#17645F] hover:bg-[#17645F] hover:text-[#F3EEE8]"
                      >
                        <LocateFixed className="h-3.5 w-3.5" />
                        {t("customer.useMyLocation")}
                      </button>
                    </div>

                    {gpsStatus && (
                      <p className="text-xs font-semibold text-[#17645F]">
                        {gpsStatus}
                      </p>
                    )}

                    {/* Pickup Input */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">
                        {t("customer.pickupLabel")}
                      </label>
                      <div className="flex items-center gap-2.5 rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3.5 py-2.5 focus-within:border-[#17645F] focus-within:bg-[#FAF7F2]">
                        <Navigation className="h-4 w-4 shrink-0 text-[#17645F]" />
                        <input
                          type="text"
                          value={pickupQuery}
                          onFocus={() => {
                            setActiveField("pickup");
                            setPinMode("pickup");
                          }}
                          onChange={(e) => setPickupQuery(e.target.value)}
                          placeholder={t("customer.pickupPlaceholder")}
                          className="w-full bg-transparent text-sm font-medium text-[#122927] placeholder:text-[#17645F]/40 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Dropoff Input */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">
                        {t("customer.dropoffLabel")}
                      </label>
                      <div className="flex items-center gap-2.5 rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3.5 py-2.5 focus-within:border-[#B86B2B] focus-within:bg-[#FAF7F2]">
                        <MapPin className="h-4 w-4 shrink-0 text-[#B86B2B]" />
                        <input
                          type="text"
                          value={dropoffQuery}
                          onFocus={() => {
                            setActiveField("dropoff");
                            setPinMode("dropoff");
                          }}
                          onChange={(e) => setDropoffQuery(e.target.value)}
                          placeholder={t("customer.whereToPlaceholder")}
                          className="w-full bg-transparent text-sm font-medium text-[#122927] placeholder:text-[#17645F]/40 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Bilingual Unguja Landmark Autocomplete Results */}
                    {activeField && (
                      <div className="rounded-2xl border border-[#17645F]/20 bg-[#FAF7F2] p-2 shadow-lg">
                        <div className="flex items-center justify-between px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">
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
                            className="text-[#17645F]/60 hover:text-[#17645F]"
                          >
                            ✕
                          </button>
                        </div>
                        {searchResults.length === 0 && !searching ? (
                          <p className="px-2.5 py-2 text-xs text-[#17645F]/75">
                            {locale === "sw"
                              ? "Hakuna kituo kilichopatikana. Gusa ramani kuweka pini."
                              : "No landmark matched. Tap directly on the Unguja map to drop a pin."}
                          </p>
                        ) : (
                          <ul className="max-h-48 divide-y divide-[#17645F]/10 overflow-y-auto">
                            {searchResults.map((item) => (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  onClick={() => handleSelectLandmark(item)}
                                  className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left hover:bg-[#17645F]/10"
                                >
                                  <div className="min-w-0 pr-2">
                                    <p className="truncate text-sm font-semibold text-[#122927]">
                                      {locale === "sw" ? item.nameSw : item.nameEn}
                                    </p>
                                    <p className="truncate text-[11px] text-[#17645F]/70">
                                      {item.area} • {item.category}
                                    </p>
                                  </div>
                                  {item.isKituo && (
                                    <span className="shrink-0 rounded-full bg-[#17645F]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#17645F]">
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
                        className="w-full rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3.5 py-2 text-xs text-[#122927] placeholder:text-[#17645F]/45 focus:border-[#17645F] focus:bg-[#FAF7F2] focus:outline-none"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {PICKUP_NOTE_CHIPS.map((chip) => {
                          const text = locale === "sw" ? chip.sw : chip.en;
                          return (
                            <button
                              key={chip.en}
                              type="button"
                              onClick={() => setPickupNote(text)}
                              className="rounded-full border border-[#17645F]/20 bg-[#F3EEE8] px-3 py-0.5 text-[11px] font-semibold text-[#17645F] hover:bg-[#17645F] hover:text-[#F3EEE8]"
                            >
                              + {text}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Quick Unguja Destination & Smart Snap Preset Chips */}
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#17645F]/75">
                        {t("customer.quickDestinations")}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {PRESET_SPOTS.map((spot) => {
                          const label =
                            locale === "sw" ? spot.labelSw : spot.labelEn;
                          const toneClass =
                            spot.accent === "teal"
                              ? "border-[#17645F]/35 bg-[#17645F]/10 text-[#17645F] hover:bg-[#17645F] hover:text-[#F3EEE8]"
                              : spot.accent === "red"
                                ? "border-[#A93232]/30 bg-[#A93232]/10 text-[#A93232] hover:bg-[#A93232]/20"
                                : "border-[#17645F]/20 bg-[#F3EEE8] text-[#122927] hover:border-[#17645F] hover:text-[#17645F]";
                          return (
                            <button
                              key={spot.id}
                              type="button"
                              onClick={() => handlePresetClick(spot)}
                              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${toneClass}`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Stone Town Smart Snap Active Banner */}
                    {quoteData?.pickup.snapped && quoteData.pickup.snapGate ? (
                      <div className="flex items-start gap-2.5 rounded-2xl border border-[#B86B2B]/35 bg-[#B86B2B]/10 px-3.5 py-2.5 text-xs text-[#703C12]">
                        <Footprints className="mt-0.5 h-4 w-4 shrink-0 text-[#B86B2B]" />
                        <div>
                          <p className="font-bold">
                            {t("customer.snappedTitle")}
                          </p>
                          <p className="mt-0.5">
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
                      <div className="flex items-start gap-2 rounded-2xl bg-[#F3EEE8] px-3.5 py-2.5 text-xs text-[#17645F]">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#17645F]" />
                        <span>{t("customer.stoneTownNotice")}</span>
                      </div>
                    )}

                    {/* Unguja-Only Geofence Error Banner */}
                    {outsideError && (
                      <div className="flex items-start gap-2.5 rounded-2xl border border-[#A93232]/35 bg-[#A93232]/10 px-3.5 py-2.5 text-xs text-[#6B1D1D]">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#A93232]" />
                        <div>
                          <p className="font-bold">
                            {t("customer.outsideUngujaTitle")}
                          </p>
                          <p className="mt-0.5">{outsideError}</p>
                        </div>
                      </div>
                    )}
                  </Card>
                </ScrollReveal>

                {/* Upfront TZS Fare Selection: Go.boda (Rider) vs Go.bajaji (Driver) */}
                <ScrollReveal delayMs={140}>
                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-[#17645F]">
                        {t("customer.nearbyHeading")}
                      </h2>
                      {loadingQuote ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#17645F]">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {locale === "sw"
                            ? "Inakokotoa nauli..."
                            : "Calculating TZS fare..."}
                        </span>
                      ) : quoteData ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#17645F]/10 px-3 py-1 text-xs font-bold text-[#17645F]">
                          <Route className="h-3.5 w-3.5 text-[#17645F]" />
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
                        className={`flex items-center justify-between rounded-3xl border-2 p-4 text-left transition disabled:opacity-50 ${
                          selectedType === TransportType.BODABODA
                            ? "border-[#17645F] bg-[#17645F]/10 shadow-sm"
                            : "border-[#17645F]/15 bg-[#FAF7F2] hover:border-[#17645F]/40"
                        }`}
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#17645F] text-[#F3EEE8]">
                            <Bike className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-[#122927]">
                                {t("customer.bodabodaName")}
                              </p>
                              <span className="rounded-full bg-[#17645F]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#17645F]">
                                Rider
                              </span>
                            </div>
                            <p className="text-xs text-[#17645F]/75">
                              {t("customer.bodabodaMeta")}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {bodabodaQuote && bodabodaQuote.discountTzs > 0 && (
                            <p className="text-[11px] text-[#17645F]/50 line-through">
                              {formatTzs(bodabodaQuote.grossFareTzs)}
                            </p>
                          )}
                          <p className="text-base font-extrabold text-[#17645F]">
                            {outsideError
                              ? "—"
                              : formatTzs(
                                  bodabodaQuote?.finalFareTzs ?? fallbackBodaFare
                                )}
                          </p>
                          <p className="text-xs text-[#17645F]/70">
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
                        className={`flex items-center justify-between rounded-3xl border-2 p-4 text-left transition disabled:opacity-50 ${
                          selectedType === TransportType.BAJAJI
                            ? "border-[#17645F] bg-[#17645F]/10 shadow-sm"
                            : "border-[#17645F]/15 bg-[#FAF7F2] hover:border-[#17645F]/40"
                        }`}
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#B86B2B] text-[#FAF7F2]">
                            <CarFront className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-[#122927]">
                                {t("customer.bajajiName")}
                              </p>
                              <span className="rounded-full bg-[#B86B2B]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#8E4F1B]">
                                Driver
                              </span>
                            </div>
                            <p className="text-xs text-[#17645F]/75">
                              {t("customer.bajajiMeta")}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {bajajiQuote && bajajiQuote.discountTzs > 0 && (
                            <p className="text-[11px] text-[#17645F]/50 line-through">
                              {formatTzs(bajajiQuote.grossFareTzs)}
                            </p>
                          )}
                          <p className="text-base font-extrabold text-[#122927]">
                            {outsideError
                              ? "—"
                              : formatTzs(
                                  bajajiQuote?.finalFareTzs ?? fallbackBajajiFare
                                )}
                          </p>
                          <p className="text-xs text-[#17645F]/70">
                            {nearbySummary.nearestBajajiEtaMin
                              ? `~${nearbySummary.nearestBajajiEtaMin} min`
                              : "3–5 min"}
                          </p>
                        </div>
                      </button>
                    </div>

                    {/* Promo Code + Payment Method + Cash Change Helper */}
                    <Card className="space-y-3 p-4">
                      <form
                        onSubmit={handleApplyPromo}
                        className="flex items-center gap-2"
                      >
                        <div className="flex flex-1 items-center gap-2 rounded-full border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3.5 py-2">
                          <Tag className="h-4 w-4 shrink-0 text-[#17645F]" />
                          <input
                            type="text"
                            value={promoInput}
                            onChange={(e) => setPromoInput(e.target.value)}
                            placeholder={t("customer.promoPlaceholder")}
                            className="w-full bg-transparent text-xs font-semibold uppercase tracking-wide text-[#122927] placeholder:normal-case placeholder:font-normal placeholder:text-[#17645F]/45 focus:outline-none"
                          />
                        </div>
                        <Button type="submit" variant="secondary" size="sm">
                          {t("customer.promoApply")}
                        </Button>
                      </form>

                      {quoteData?.promoStatus === "APPLIED" &&
                        activeQuote?.promoApplied && (
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-[#17645F]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {t("customer.promoApplied")}:{" "}
                            {activeQuote.promoApplied} (-
                            {formatTzs(activeQuote.discountTzs)})
                          </p>
                        )}
                      {quoteData?.promoStatus === "INVALID" && (
                        <p className="text-xs font-semibold text-[#A93232]">
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
                              className={`flex items-center justify-center gap-1.5 rounded-full border px-2.5 py-2 text-xs font-bold transition ${
                                active
                                  ? "border-[#17645F] bg-[#17645F] text-[#F3EEE8]"
                                  : "border-[#17645F]/20 bg-[#F3EEE8] text-[#17645F] hover:border-[#17645F]"
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
                          <span className="font-semibold text-[#17645F]/75">
                            {locale === "sw" ? "Chenji ya Pesa:" : "Cash Note:"}
                          </span>
                          {["Exact TZS", "TZS 10,000 note", "TZS 20,000 note"].map(
                            (opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => setCashChangeNote(opt)}
                                className={`rounded-full px-3 py-0.5 font-semibold transition ${
                                  cashChangeNote === opt
                                    ? "bg-[#17645F] text-[#F3EEE8]"
                                    : "bg-[#F3EEE8] text-[#17645F] hover:bg-[#17645F]/15"
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
                      className="w-full uppercase tracking-[0.14em]"
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
                </ScrollReveal>
              </>
            )}
          </>
        )}
      </main>

      {/* Bottom Mobile Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#17645F]/15 bg-[#FAF7F2]/95 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.16em]">
          <button
            type="button"
            onClick={() => setActiveTab("book")}
            className={`flex flex-col items-center gap-1 ${
              activeTab === "book" ? "text-[#17645F]" : "text-[#17645F]/55"
            }`}
          >
            <Compass className="h-5 w-5" />
            {t("customer.navHome")}
          </button>
          <Link
            href="/trips"
            className="flex flex-col items-center gap-1 text-[#17645F]/55 hover:text-[#17645F]"
          >
            <History className="h-5 w-5" />
            {locale === "sw" ? "Safari" : "Trips"}
          </Link>
          <Link
            href="/safety"
            className="flex flex-col items-center gap-1 text-[#17645F]/55 hover:text-[#17645F]"
          >
            <ShieldCheck className="h-5 w-5" />
            {locale === "sw" ? "Usalama" : "Safety"}
          </Link>
        </div>
      </nav>
    </div>
  );
}
