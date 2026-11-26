"use client";

import * as React from "react";
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
  Footprints,
  History,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  ShieldCheck,
  Smartphone,
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
  formatTzs,
} from "@goboda/shared-types";
import {
  UngujaMap,
  type MapPoint,
  type MapVehicle,
  type RouteGeoJson,
} from "./unguja-map";

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
  {
    id: "outside-dar",
    target: "dropoff",
    labelEn: "Test Outside Unguja (Dar)",
    labelSw: "Jaribu Nje ya Unguja (Dar)",
    lat: -6.7924,
    lng: 39.2803,
    accent: "red",
  },
];

export function CustomerHomeView({ locale }: { locale: "sw" | "en" }) {
  const t = useTranslations();

  const [selectedType, setSelectedType] = React.useState<TransportType>(
    TransportType.BODABODA
  );
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>(
    PaymentMethod.CASH
  );
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
  const [requestPreviewOpen, setRequestPreviewOpen] = React.useState(false);
  const [gpsStatus, setGpsStatus] = React.useState<string | null>(null);

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

  // Fetch upfront TZS quote & Stone Town Smart Snap whenever points or promo change
  React.useEffect(() => {
    const controller = new AbortController();
    setLoadingQuote(true);
    setOutsideError(null);
    setRequestPreviewOpen(false);

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

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <BrandLogo subtitle={t("common.ungujaOnly")} />
          <div className="flex items-center gap-2">
            <Badge tone="teal" className="hidden sm:inline-flex">
              <Compass className="h-3.5 w-3.5" />
              {t("common.phaseBadge")}
            </Badge>
            <LanguageSwitchLink
              currentLocale={locale}
              hrefSw="/sw"
              hrefEn="/en"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
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
            <p className="text-xs font-medium text-teal-700">{gpsStatus}</p>
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

          {/* Quick Unguja Destination & Smart Snap Preset Chips */}
          <div className="space-y-1.5 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t("customer.quickDestinations")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_SPOTS.map((spot) => {
                const label = locale === "sw" ? spot.labelSw : spot.labelEn;
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
                <p className="font-bold">{t("customer.snappedTitle")}</p>
                <p className="mt-0.5 text-amber-900">
                  {t("customer.snappedWalkPrefix")}{" "}
                  <strong>
                    {quoteData.pickup.snapGate.walkingDistanceMeters}m (~
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
                <p className="font-bold">{t("customer.outsideUngujaTitle")}</p>
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
                {locale === "sw" ? "Inakokotoa nauli..." : "Calculating TZS fare..."}
              </span>
            ) : quoteData ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-900">
                <Route className="h-3.5 w-3.5 text-teal-700" />
                {quoteData.route.distanceKm} km • ~{quoteData.route.durationMinutes}{" "}
                min
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
                    : formatTzs(bodabodaQuote?.finalFareTzs ?? fallbackBodaFare)}
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
                    : formatTzs(bajajiQuote?.finalFareTzs ?? fallbackBajajiFare)}
                </p>
                <p className="text-xs text-slate-500">
                  {nearbySummary.nearestBajajiEtaMin
                    ? `~${nearbySummary.nearestBajajiEtaMin} min`
                    : "3–5 min"}
                </p>
              </div>
            </button>
          </div>

          {/* Promo Code + Payment Method Selector */}
          <Card className="space-y-3 p-3.5">
            <form onSubmit={handleApplyPromo} className="flex items-center gap-2">
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

            {quoteData?.promoStatus === "APPLIED" && activeQuote?.promoApplied && (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("customer.promoApplied")}: {activeQuote.promoApplied} (
                -{formatTzs(activeQuote.discountTzs)})
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
          </Card>

          <Button
            size="lg"
            variant="primary"
            disabled={Boolean(outsideError) || loadingQuote || !activeQuote}
            onClick={() => setRequestPreviewOpen(true)}
            className="w-full"
          >
            {t("customer.requestCta")} •{" "}
            {selectedType === TransportType.BODABODA ? "Go.boda" : "Go.bajaji"}
            {activeQuote ? ` • ${formatTzs(activeQuote.finalFareTzs)}` : ""}
          </Button>

          {requestPreviewOpen && activeQuote && quoteData && (
            <Card className="border-teal-300 bg-teal-50/70 p-4 text-sm text-teal-950">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
                <div className="space-y-1">
                  <p className="font-bold">{t("customer.quoteLockedTitle")}</p>
                  <p className="text-xs text-teal-900">
                    <strong>
                      {selectedType === TransportType.BODABODA
                        ? "Go.boda (Bodaboda Rider)"
                        : "Go.bajaji (Bajaji Driver)"}
                    </strong>{" "}
                    • {formatTzs(activeQuote.finalFareTzs)} •{" "}
                    {quoteData.route.distanceKm} km (~
                    {quoteData.route.durationMinutes} min) • {paymentMethod}
                  </p>
                  {snappedPickupPoint && (
                    <p className="text-xs text-teal-800">
                      Pickup Gate: <strong>{snappedPickupPoint.label}</strong>
                    </p>
                  )}
                  <p className="pt-1 text-xs text-slate-600">
                    {t("customer.quoteLockedDesc")}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </section>
      </main>

      {/* Bottom Mobile Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-2xl grid-cols-4 py-2 text-center text-[11px] font-semibold">
          <a
            href={`/${locale}`}
            className="flex flex-col items-center gap-1 text-teal-700"
          >
            <Compass className="h-5 w-5" />
            {t("customer.navHome")}
          </a>
          <a
            href={`/${locale}`}
            className="flex flex-col items-center gap-1 text-slate-500"
          >
            <Clock className="h-5 w-5" />
            {t("customer.navBook")}
          </a>
          <a
            href={`/${locale}`}
            className="flex flex-col items-center gap-1 text-slate-500"
          >
            <History className="h-5 w-5" />
            {t("customer.navHistory")}
          </a>
          <a
            href={`/${locale}`}
            className="flex flex-col items-center gap-1 text-slate-500"
          >
            <User className="h-5 w-5" />
            {t("customer.navProfile")}
          </a>
        </div>
      </nav>
    </div>
  );
}
