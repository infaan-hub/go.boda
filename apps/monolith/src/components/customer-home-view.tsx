"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Banknote,
  Bike,
  CarFront,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  PhoneCall,
  Radar,
  RefreshCw,
  Route,
  ShieldCheck,
  Star,
  Tag,
  User,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EditorialScrollHero,
  ScrollReveal,
} from "@goboda/ui";
import {
  DEFAULT_TARIFFS_TZS,
  PaymentMethod,
  TransportType,
  TripStatus,
  formatTzs,
} from "@goboda/shared-types";
import { CustomerPortalShell } from "./customer-portal-shell";
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

async function resolveUngujaPointName(
  point: { lat: number; lng: number },
  locale: "sw" | "en",
  fallback: string
) {
  try {
    const params = new URLSearchParams({ lat: String(point.lat), lng: String(point.lng) });
    const response = await fetch(`/api/unguja/reverse-geocode?${params}`, { cache: "no-store" });
    if (!response.ok) return fallback;
    const data = (await response.json()) as {
      location?: { nameSw: string; nameEn: string; area: string; distanceMeters: number };
    };
    const location = data.location;
    if (!location) return fallback;
    const name = locale === "sw" ? location.nameSw : location.nameEn;
    const nearbyPrefix = location.distanceMeters > 250
      ? locale === "sw" ? "Karibu na " : "Near "
      : "";
    const area = location.area && location.area !== "Unguja" && !name.toLowerCase().includes(location.area.toLowerCase())
      ? ` · ${location.area}`
      : "";
    return `${nearbyPrefix}${name}${area}`;
  } catch {
    return fallback;
  }
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
  id: string;
  tripCode: string;
  status: TripStatus;
  transportType: TransportType;
  operatorId: string | null;
  operatorName: string | null;
  operatorPlate: string | null;
  operatorPhone: string | null;
  operatorRating: number | null;
  operatorEtaMin: number | null;
  fareTzs: number;
  paymentMethod: PaymentMethod;
  pickupLabel: string;
  dropoffLabel: string;
  pickupNote: string;
  cashChangeNote: string;
  distanceKm: number;
  shareToken: string | null;
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

export function CustomerHomeView({
  locale,
  customerName,
}: {
  locale: "sw" | "en";
  customerName?: string;
}) {
  const t = useTranslations();

  const [activeTab, setActiveTab] = React.useState<"book" | "history">("book");
  const [selectedType, setSelectedType] = React.useState<TransportType>(
    TransportType.BODABODA
  );
  const paymentMethod = PaymentMethod.CASH;
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
  const gpsLookupId = React.useRef(0);
  const mapLookupId = React.useRef(0);
  const nearbyLookupId = React.useRef(0);

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
  const [tripRequestError, setTripRequestError] = React.useState<string | null>(null);
  const [requestingTrip, setRequestingTrip] = React.useState(false);

  // Phase 4 Full Customer Trip Flow, Quick-Chat, SOS, Live Share & Rating state
  const [activeTrip, setActiveTrip] = React.useState<ActiveCustomerTrip | null>(
    null
  );
  const [ratingStars, setRatingStars] = React.useState(5);
  const [helmetProvided, setHelmetProvided] = React.useState<boolean>(true);
  const shareLinkRequestedForTrip = React.useRef<string | null>(null);
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

  React.useEffect(() => {
    let stopped = false;
    void fetch("/api/trips", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          trips?: Array<{
            id: string;
            tripCode: string;
            status: TripStatus;
            transportType: TransportType;
            pickupLabel: string;
            dropoffLabel: string;
            distanceMeters: number;
            paymentMethod: PaymentMethod;
            estimatedFareTzs: number;
            finalFareTzs: number | null;
          }>;
        };
      })
      .then((data) => {
        if (stopped || !data?.trips) return;
        const trip = data.trips.find((candidate) =>
          [
            TripStatus.SEARCHING,
            TripStatus.OFFERED_TO_OPERATOR,
            TripStatus.NO_OPERATOR_FOUND,
            TripStatus.ASSIGNED,
            TripStatus.ARRIVED_AT_PICKUP,
            TripStatus.IN_PROGRESS,
            TripStatus.SOS_ACTIVE,
            TripStatus.COMPLETED_UNPAID,
          ].some((status) => status === candidate.status)
        );
        if (!trip) return;
        setActiveTrip((current) =>
          current ?? {
            id: trip.id,
            tripCode: trip.tripCode,
            status: trip.status,
            transportType: trip.transportType,
            operatorId: null,
            operatorName: null,
            operatorPlate: null,
            operatorPhone: null,
            operatorRating: null,
            operatorEtaMin: null,
            fareTzs: Number(trip.finalFareTzs ?? trip.estimatedFareTzs),
            paymentMethod: trip.paymentMethod,
            pickupLabel: trip.pickupLabel,
            dropoffLabel: trip.dropoffLabel,
            pickupNote: "",
            cashChangeNote: "",
            distanceKm: Number(trip.distanceMeters) / 1000,
            shareToken: null,
            sosTriggered: trip.status === TripStatus.SOS_ACTIVE,
            sosAlertCode: null,
          }
        );
      })
      .catch(() => null);
    return () => {
      stopped = true;
    };
  }, []);

  // Fetch nearby Bodabodas & Bajajis from BFF -> location-service / Neon PostGIS
  const loadNearby = React.useCallback(async (lat: number, lng: number) => {
    const requestId = ++nearbyLookupId.current;
    try {
      const res = await fetch(
        `/api/unguja/nearby?lat=${lat}&lng=${lng}&radiusKm=8`,
        { cache: "no-store" }
      );
      if (requestId !== nearbyLookupId.current) return;
      if (res.ok) {
        const json = (await res.json()) as {
          summary: NearbySummary;
          vehicles: MapVehicle[];
        };
        setVehicles(json.vehicles ?? []);
        setNearbySummary(json.summary);
      } else {
        setVehicles([]);
        setNearbySummary({
          totalNearby: 0,
          bodabodaCount: 0,
          bajajiCount: 0,
          nearestBodabodaEtaMin: null,
          nearestBajajiEtaMin: null,
        });
      }
    } catch {
      if (requestId !== nearbyLookupId.current) return;
      setVehicles([]);
      setNearbySummary({
        totalNearby: 0,
        bodabodaCount: 0,
        bajajiCount: 0,
        nearestBodabodaEtaMin: null,
        nearestBajajiEtaMin: null,
      });
    } finally {
      if (requestId === nearbyLookupId.current) setLoadingNearby(false);
    }
  }, []);

  React.useEffect(() => {
    setLoadingNearby(true);
    setVehicles([]);
    setNearbySummary({
      totalNearby: 0,
      bodabodaCount: 0,
      bajajiCount: 0,
      nearestBodabodaEtaMin: null,
      nearestBajajiEtaMin: null,
    });
    void loadNearby(pickup.lat, pickup.lng);
  }, [pickup.lat, pickup.lng, loadNearby]);

  React.useEffect(() => {
    const refresh = () => void loadNearby(pickup.lat, pickup.lng);
    const interval = window.setInterval(refresh, 20_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
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

  // Fetch an upfront TZS quote for the exact selected points.
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
          `/api/unguja/landmarks?q=${encodeURIComponent(query)}&limit=12`
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
    gpsLookupId.current += 1;
    mapLookupId.current += 1;
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
      gpsLookupId.current += 1;
      const requestId = ++mapLookupId.current;
      const label = locale === "sw" ? "Eneo lililochaguliwa kwenye ramani" : "Selected map location";
      if (pinMode === "pickup") {
        setPickup({ ...coords, label });
        setPickupQuery(label);
      } else {
        setDropoff({ ...coords, label });
        setDropoffQuery(label);
      }
      setActiveField(null);
      void resolveUngujaPointName(coords, locale, label).then((resolvedLabel) => {
        if (requestId !== mapLookupId.current) return;
        if (pinMode === "pickup") {
          setPickup((point) => point.lat === coords.lat && point.lng === coords.lng ? { ...point, label: resolvedLabel } : point);
          setPickupQuery((value) => value === label ? resolvedLabel : value);
        } else {
          setDropoff((point) => point.lat === coords.lat && point.lng === coords.lng ? { ...point, label: resolvedLabel } : point);
          setDropoffQuery((value) => value === label ? resolvedLabel : value);
        }
      });
    },
    [pinMode, locale]
  );

  const handleUseMyGps = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsStatus(
        locale === "sw"
          ? "GPS haipatikani kwenye kivinjari hiki."
          : "Geolocation is not supported in this browser."
      );
      return;
    }
    const requestId = ++gpsLookupId.current;
    mapLookupId.current += 1;
    setGpsStatus(locale === "sw" ? "Inatafuta GPS yako..." : "Locating GPS...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const fallbackLabel = locale === "sw" ? "Eneo langu la sasa" : "My current location";
        setPickup({ lat, lng, label: fallbackLabel });
        setPickupQuery(fallbackLabel);
        setActiveField(null);
        setGpsStatus(locale === "sw" ? "Inatafuta jina la eneo..." : "Finding the place name...");
        void resolveUngujaPointName({ lat, lng }, locale, fallbackLabel).then((label) => {
          if (requestId !== gpsLookupId.current) return;
          setPickup((point) => point.lat === lat && point.lng === lng ? { ...point, label } : point);
          setPickupQuery((value) => value === fallbackLabel ? label : value);
          setGpsStatus(null);
        });
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

  const bodabodaQuote = quoteData?.quotes.BODABODA;
  const bajajiQuote = quoteData?.quotes.BAJAJI;
  const activeQuote =
    selectedType === TransportType.BODABODA ? bodabodaQuote : bajajiQuote;

  const fallbackBodaFare = DEFAULT_TARIFFS_TZS.BODABODA.minFareTzs;
  const fallbackBajajiFare = DEFAULT_TARIFFS_TZS.BAJAJI.minFareTzs;

  const handleRequestTransport = async () => {
    if (!activeQuote || !quoteData || requestingTrip) return;
    setRequestingTrip(true);
    setTripRequestError(null);
    try {
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transportType: selectedType,
          pickup: { lat: pickup.lat, lng: pickup.lng },
          pickupLabel: pickup.label,
          pickupNote,
          dropoff: { lat: dropoff.lat, lng: dropoff.lng },
          dropoffLabel: dropoff.label,
          paymentMethod,
          promoCode: appliedPromoCode || undefined,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        trip?: {
          id: string;
          tripCode: string;
          status: TripStatus;
          transportType: TransportType;
          pickupLabel: string;
          dropoffLabel: string;
          distanceMeters: number;
          estimatedFareTzs: number;
          paymentMethod: PaymentMethod;
        };
      };
      if (!response.ok || !result.trip) {
        throw new Error(result.error ?? "TRIP_REQUEST_FAILED");
      }

      setRatingStars(5);
      setHelmetProvided(true);
      setActiveTrip({
        id: result.trip.id,
        tripCode: result.trip.tripCode,
        status: result.trip.status,
        transportType: result.trip.transportType,
        operatorId: null,
        operatorName: null,
        operatorPlate: null,
        operatorPhone: null,
        operatorRating: null,
        operatorEtaMin: null,
        fareTzs: Number(result.trip.estimatedFareTzs),
        paymentMethod: result.trip.paymentMethod,
        pickupLabel: result.trip.pickupLabel,
        dropoffLabel: result.trip.dropoffLabel,
        pickupNote,
        cashChangeNote,
        distanceKm: Number(result.trip.distanceMeters) / 1000,
        shareToken: null,
        sosTriggered: false,
        sosAlertCode: null,
      });
    } catch (error) {
      setTripRequestError(
        error instanceof Error
          ? error.message
          : locale === "sw"
            ? "Ombi la safari halikufaulu. Jaribu tena."
            : "Could not request a trip. Please try again."
      );
    } finally {
      setRequestingTrip(false);
    }
  };

  const handleCancelTrip = async () => {
    if (!activeTrip) return;
    const response = await fetch(
      `/api/trips/${encodeURIComponent(activeTrip.id)}/cancel`,
      { method: "POST" }
    );
    if (response.ok) {
      setActiveTrip(null);
      shareLinkRequestedForTrip.current = null;
    } else {
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      setTripRequestError(result.error ?? "TRIP_CANCEL_FAILED");
    }
  };

  const activeTripId = activeTrip?.id ?? null;
  const activeTripStatus = activeTrip?.status;
  const activeOperatorId = activeTrip?.operatorId ?? null;
  const activeShareToken = activeTrip?.shareToken ?? null;

  React.useEffect(() => {
    if (!activeTripId) return;
    let stopped = false;
    const refreshTrip = async () => {
      try {
        const response = await fetch(
          `/api/trips/${encodeURIComponent(activeTripId)}`,
          { cache: "no-store" }
        );
        if (!response.ok) return;
        const result = (await response.json()) as {
          trip: {
            status: TripStatus;
            operatorId: string | null;
            operatorName: string | null;
            operatorPlate: string | null;
            operatorPhone: string | null;
            operatorRating: number | string | null;
            operatorEtaMin: number | null;
            distanceMeters: number;
            estimatedFareTzs: number;
            finalFareTzs: number | null;
          };
          activeSos?: { alertCode?: string } | null;
        };
        if (stopped || !result.trip) return;
        if (result.trip.status === TripStatus.CANCELLED_BY_CUSTOMER) {
          setActiveTrip(null);
          shareLinkRequestedForTrip.current = null;
          return;
        }
        setActiveTrip((current) =>
          !current || current.id !== activeTripId
            ? current
            : {
                ...current,
                status: result.trip.status,
                operatorId: result.trip.operatorId,
                operatorName: result.trip.operatorName,
                operatorPlate: result.trip.operatorPlate,
                operatorPhone: result.trip.operatorPhone,
                operatorRating:
                  result.trip.operatorRating == null
                    ? null
                    : Number(result.trip.operatorRating),
                operatorEtaMin: result.trip.operatorEtaMin,
                distanceKm: Number(result.trip.distanceMeters) / 1000,
                fareTzs: Number(
                  result.trip.finalFareTzs ?? result.trip.estimatedFareTzs
                ),
                sosTriggered:
                  result.trip.status === TripStatus.SOS_ACTIVE ||
                  Boolean(result.activeSos),
                sosAlertCode: result.activeSos?.alertCode ?? null,
              }
        );
      } catch {
        // Keep the most recent server-confirmed state while connectivity recovers.
      }
    };
    void refreshTrip();
    const interval = window.setInterval(() => void refreshTrip(), 3000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [activeTripId]);

  React.useEffect(() => {
    if (
      !activeTripId ||
      !(
        activeTripStatus === TripStatus.SEARCHING ||
        activeTripStatus === TripStatus.OFFERED_TO_OPERATOR ||
        activeTripStatus === TripStatus.NO_OPERATOR_FOUND
      )
    ) {
      return;
    }
    const interval = window.setInterval(() => {
      void fetch(`/api/trips/${encodeURIComponent(activeTripId)}/dispatch`, {
        method: "POST",
      });
    }, 35_000);
    return () => window.clearInterval(interval);
  }, [activeTripId, activeTripStatus]);

  React.useEffect(() => {
    if (
      !activeTripId ||
      !activeOperatorId ||
      activeShareToken ||
      !(
        activeTripStatus === TripStatus.ASSIGNED ||
        activeTripStatus === TripStatus.ARRIVED_AT_PICKUP ||
        activeTripStatus === TripStatus.IN_PROGRESS ||
        activeTripStatus === TripStatus.SOS_ACTIVE
      ) ||
      shareLinkRequestedForTrip.current === activeTripId
    ) {
      return;
    }
    shareLinkRequestedForTrip.current = activeTripId;
    let stopped = false;
    void fetch(`/api/trips/${encodeURIComponent(activeTripId)}/share`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("SHARE_LINK_FAILED");
        return (await response.json()) as { shareToken: string };
      })
      .then(({ shareToken }) => {
        if (stopped) return;
        setActiveTrip((current) =>
          current?.id === activeTripId ? { ...current, shareToken } : current
        );
      })
      .catch(() => {
        shareLinkRequestedForTrip.current = null;
      });
    return () => {
      stopped = true;
    };
  }, [
    activeTripId,
    activeOperatorId,
    activeShareToken,
    activeTripStatus,
    locale,
  ]);

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

  const liveTrackPath = activeTrip?.shareToken
    ? `/track/${activeTrip.shareToken}`
    : null;

  return (
    <CustomerPortalShell
      locale={locale}
      customerName={customerName}
      showSignOut={Boolean(customerName)}
      onBookClick={() => setActiveTab("book")}
    >
      {/* Editorial Bodaboda Scroll-Transition Hero */}
      {activeTab === "book" ? (
        <EditorialScrollHero
          eyebrowItems={["BODABODA", "BAJAJI", "STONE TOWN", "UNGUJA"]}
          displayWordLeft={locale === "sw" ? "Pata Usafiri." : "Find Your Ride."}
          displayWordRight="Go."
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
              subtitle: locale === "sw" ? "UNGUJA YOTE" : "ANY UNGUJA PICKUP",
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
                    snappedPickup={null}
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

            {/* Live trip request and operator confirmation */}
            {activeTrip ? (
              <ScrollReveal delayMs={60}>
                <Card className="space-y-4 border-2 border-[#17645F] bg-[#FAF7F2] p-5 shadow-md">
                  {activeTrip.status === TripStatus.SEARCHING ||
                  activeTrip.status === TripStatus.OFFERED_TO_OPERATOR ||
                  activeTrip.status === TripStatus.NO_OPERATOR_FOUND ? (
                    <div className="space-y-3 py-4 text-center">
                      <Radar className="mx-auto h-10 w-10 animate-spin text-[#17645F]" />
                      <h2 className="font-display text-2xl uppercase text-[#17645F]">
                        {locale === "sw"
                          ? `Inatafuta ${
                              activeTrip.transportType === TransportType.BODABODA
                                ? "Rider wa Bodaboda"
                                : "Dereva wa Bajaji"
                            } aliye karibu...`
                          : "Finding a real online operator who can take your trip..."}
                      </h2>
                      <p className="text-xs text-[#17645F]/75">
                        {activeTrip.tripCode} • {locale === "sw" ? "Inasubiri mwendeshaji akubali ombi" : "Waiting for an online operator to accept"}
                      </p>
                      <div className="grid grid-cols-2 gap-3 text-left">
                        <div className="rounded-2xl bg-[#F3EEE8] p-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#17645F]/70">{locale === "sw" ? "Umbali wa safari" : "Trip distance"}</p>
                          <p className="mt-1 text-lg font-extrabold text-[#122927]">{activeTrip.distanceKm.toFixed(1)} km</p>
                        </div>
                        <div className="rounded-2xl bg-[#F3EEE8] p-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#17645F]/70">{locale === "sw" ? "Nauli" : "Fare"}</p>
                          <p className="mt-1 text-lg font-extrabold text-[#122927]">{formatTzs(activeTrip.fareTzs)}</p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleCancelTrip()}
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

                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className={activeTrip.transportType === TransportType.BODABODA ? "flex h-12 w-12 items-center justify-center rounded-full bg-[#17645F] text-[#F3EEE8]" : "flex h-12 w-12 items-center justify-center rounded-full bg-[#B86B2B] text-[#FAF7F2]"}>
                              {activeTrip.transportType === TransportType.BODABODA ? <Bike className="h-6 w-6" /> : <CarFront className="h-6 w-6" />}
                            </div>
                            <div>
                              <p className="text-sm font-extrabold text-[#122927]">
                                {activeTrip.operatorName ?? (locale === "sw" ? "Mwendeshaji amethibitishwa" : "Operator confirmed")}
                                {activeTrip.operatorRating != null && activeTrip.operatorRating > 0 ? " • ★ " + activeTrip.operatorRating.toFixed(1) : ""}
                              </p>
                              <p className="text-xs font-bold text-[#17645F]">
                                {activeTrip.transportType === TransportType.BODABODA ? "Bodaboda Rider" : "Bajaji Driver"}
                                {activeTrip.operatorPlate ? " • " + activeTrip.operatorPlate : ""}
                              </p>
                            </div>
                          </div>
                          <Badge tone={activeTrip.sosTriggered ? "rose" : "emerald"}>{activeTrip.status}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-2xl bg-[#F3EEE8] p-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#17645F]/70">{locale === "sw" ? "Umbali wa safari" : "Trip distance"}</p>
                            <p className="mt-1 text-lg font-extrabold text-[#122927]">{activeTrip.distanceKm.toFixed(1)} km</p>
                          </div>
                          <div className="rounded-2xl bg-[#F3EEE8] p-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#17645F]/70">{locale === "sw" ? "Nauli" : "Fare"}</p>
                            <p className="mt-1 text-lg font-extrabold text-[#122927]">{formatTzs(activeTrip.fareTzs)}</p>
                          </div>
                        </div>
                        {liveTrackPath ? (
                          <a href={liveTrackPath} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#17645F] px-4 py-3 text-sm font-bold text-[#F3EEE8] hover:bg-[#114E4A]">
                            <Navigation className="h-4 w-4" />
                            {locale === "sw" ? "Fungua eneo la moja kwa moja" : "View live location"}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <p className="text-center text-xs text-[#17645F]/70">
                            {locale === "sw" ? "Inaandaa kiungo salama cha eneo la moja kwa moja…" : "Preparing secure live location link…"}
                          </p>
                        )}
                        {(activeTrip.status === TripStatus.ASSIGNED ||
                          activeTrip.status === TripStatus.ARRIVED_AT_PICKUP) && (
                          <Button type="button" variant="outline" size="sm" onClick={() => void handleCancelTrip()} className="w-full">
                            {locale === "sw" ? "Ghairi Safari" : "Cancel Trip"}
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </Card>
              </ScrollReveal>
            ) : (
              <>
                {/* Pickup and dropoff search with map pin selection */}
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
                          onChange={(e) => {
                            gpsLookupId.current += 1;
                            mapLookupId.current += 1;
                            setPickupQuery(e.target.value);
                          }}
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
                          onChange={(e) => {
                            mapLookupId.current += 1;
                            setDropoffQuery(e.target.value);
                          }}
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
                                ? "Inatafuta mitaa na maeneo Unguja..."
                                : "Searching Unguja streets and places..."
                              : locale === "sw"
                                ? "Mitaa, shehia na maeneo ya Unguja"
                                : "Unguja streets, wards & places"}
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
                              ? "Hakuna jina linalolingana. Chagua eneo lolote kwenye ramani kuweka pini."
                              : "No named place matched. Choose any point on the Unguja map to set a pin."}
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
                      <p className="px-2.5 pt-2 text-[10px] text-[#17645F]/60">
                        {locale === "sw" ? "Data ya ramani: " : "Map data: "}
                        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
                          © OpenStreetMap contributors
                        </a>
                        {" · "}
                        <a href="https://www.nbs.go.tz/index.php/statistics/topic/gis" target="_blank" rel="noreferrer" className="underline">
                          2022 NBS
                        </a>
                      </p>
                      </div>
                    )}

                    {/* Optional pickup note */}
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={pickupNote}
                        onChange={(e) => setPickupNote(e.target.value)}
                        placeholder={
                          locale === "sw"
                            ? "Maelezo ya ziada ya kuchukuliwa (hiari)..."
                            : "Optional pickup instructions..."
                        }
                        className="w-full rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3.5 py-2 text-xs text-[#122927] placeholder:text-[#17645F]/45 focus:border-[#17645F] focus:bg-[#FAF7F2] focus:outline-none"
                      />
                    </div>

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
                              : locale === "sw" ? "Hakuna aliye karibu" : "No nearby rider"}
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
                              : locale === "sw" ? "Hakuna aliye karibu" : "No nearby driver"}
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

                      <div className="pt-1">
                        <div className="flex w-fit items-center gap-1.5 rounded-full border border-[#17645F] bg-[#17645F] px-4 py-2 text-xs font-bold text-[#F3EEE8]">
                          <Banknote className="h-3.5 w-3.5 shrink-0" />
                          <span>{t("customer.payCash")}</span>
                        </div>
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
                        requestingTrip || Boolean(outsideError) || loadingQuote || !activeQuote ||
                        pickupQuery.trim() !== pickup.label ||
                        dropoffQuery.trim() !== dropoff.label
                      }
                      onClick={handleRequestTransport}
                      className="w-full uppercase tracking-[0.14em]"
                    >
                      {requestingTrip
                        ? locale === "sw" ? "Inatuma ombi..." : "Requesting trip..."
                        : <>
                            {t("customer.requestCta")} •{" "}
                            {selectedType === TransportType.BODABODA ? "Go.boda" : "Go.bajaji"}
                            {activeQuote ? ` • ${formatTzs(activeQuote.finalFareTzs)}` : ""}
                          </>}
                    </Button>
                    {tripRequestError && (
                      <p role="alert" className="rounded-xl bg-[#A93232]/10 px-3 py-2 text-xs font-semibold text-[#8A2626]">
                        {tripRequestError}
                      </p>
                    )}
                  </section>
                </ScrollReveal>
              </>
            )}
          </>
        )}
      </main>
    </CustomerPortalShell>
  );
}
