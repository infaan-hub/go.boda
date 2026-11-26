"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bike,
  Calculator,
  CarFront,
  CloudRain,
  Footprints,
  Loader2,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
} from "lucide-react";
import { Badge, Button, Card } from "@goboda/ui";
import { useAdminPortal } from "@/components/admin-portal-shell";

interface SimulatedTier {
  transportType: "BODABODA" | "BAJAJI";
  operatorRole: string;
  tariffUsed: {
    baseFareTzs: number;
    perKmTzs: number;
    perMinTzs: number;
    minFareTzs: number;
    commissionPct: number;
  };
  grossFareTzs: number;
  discountTzs: number;
  promoApplied: string | null;
  customerPaysTzs: number;
  commissionTzs: number;
  platformSubsidyTzs: number;
  platformNetRevenueTzs: number;
  operatorNetTzs: number;
  operatorGrossProtected: boolean;
}

interface SimulationResult {
  currency: "TZS";
  multiplierRequested: number;
  multiplierApplied: number;
  maxSurgeCap: number;
  capEnforced: boolean;
  promoStatus: string;
  route: {
    distanceMeters: number;
    distanceKm: number;
    durationMinutes: number;
    smartSnapped: boolean;
    snapGateName: string | null;
    walkMeters: number;
  };
  simulation: {
    BODABODA: SimulatedTier;
    BAJAJI: SimulatedTier;
  };
}

const PRESET_ROUTES = [
  {
    id: "st-paje",
    label: "Stone Town (Darajani) → Paje Beach",
    pickup: { lat: -6.1649, lng: 39.1936 },
    dropoff: { lat: -6.269, lng: 39.532 },
  },
  {
    id: "alley-znz",
    label: "Stone Town Alley (Smart Snap) → ZNZ Airport",
    pickup: { lat: -6.1622, lng: 39.1895 },
    dropoff: { lat: -6.222, lng: 39.2249 },
  },
  {
    id: "ferry-mwana",
    label: "Ferry Terminal → Mwanakwerekwe Market",
    pickup: { lat: -6.158, lng: 39.1885 },
    dropoff: { lat: -6.1912, lng: 39.2216 },
  },
  {
    id: "st-nungwi",
    label: "Stone Town → Nungwi Beach",
    pickup: { lat: -6.1649, lng: 39.1936 },
    dropoff: { lat: -5.7265, lng: 39.2987 },
  },
  {
    id: "fuoni-bububu",
    label: "Fuoni → Bububu Stage",
    pickup: { lat: -6.208, lng: 39.254 },
    dropoff: { lat: -6.098, lng: 39.226 },
  },
];

function fmt(n: number) {
  return `TZS ${Number(n).toLocaleString("en-TZ")}`;
}

export default function AdminPricingSimulatorPage() {
  const { data: overview, notify } = useAdminPortal();
  const [routeId, setRouteId] = React.useState(PRESET_ROUTES[0]!.id);
  const [pickupLat, setPickupLat] = React.useState(PRESET_ROUTES[0]!.pickup.lat);
  const [pickupLng, setPickupLng] = React.useState(PRESET_ROUTES[0]!.pickup.lng);
  const [dropoffLat, setDropoffLat] = React.useState(PRESET_ROUTES[0]!.dropoff.lat);
  const [dropoffLng, setDropoffLng] = React.useState(PRESET_ROUTES[0]!.dropoff.lng);
  const [multiplier, setMultiplier] = React.useState(1.15);
  const [promoCode, setPromoCode] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<SimulationResult | null>(null);

  const runSimulation = React.useCallback(
    async (opts?: {
      pLat?: number;
      pLng?: number;
      dLat?: number;
      dLng?: number;
      mult?: number;
      promo?: string;
    }) => {
      setRunning(true);
      setErrorMsg(null);
      try {
        const res = await fetch("/api/ops/pricing/simulate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pickup: { lat: opts?.pLat ?? pickupLat, lng: opts?.pLng ?? pickupLng },
            dropoff: { lat: opts?.dLat ?? dropoffLat, lng: opts?.dLng ?? dropoffLng },
            multiplier: opts?.mult ?? multiplier,
            promoCode: (opts?.promo ?? promoCode).trim() || undefined,
          }),
        });
        const json = (await res.json()) as SimulationResult & {
          error?: string;
          message?: string;
        };
        if (!res.ok) {
          setResult(null);
          setErrorMsg(json.message || json.error || "Simulation failed");
          return;
        }
        setResult(json);
        if (json.capEnforced) {
          notify(
            "emerald",
            `Requested ${json.multiplierRequested}x capped automatically at Unguja max ${json.maxSurgeCap}x.`
          );
        }
      } finally {
        setRunning(false);
      }
    },
    [pickupLat, pickupLng, dropoffLat, dropoffLng, multiplier, promoCode, notify]
  );

  React.useEffect(() => {
    void runSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectPreset = (id: string) => {
    const preset = PRESET_ROUTES.find((r) => r.id === id);
    if (!preset) return;
    setRouteId(id);
    setPickupLat(preset.pickup.lat);
    setPickupLng(preset.pickup.lng);
    setDropoffLat(preset.dropoff.lat);
    setDropoffLng(preset.dropoff.lng);
    void runSimulation({
      pLat: preset.pickup.lat,
      pLng: preset.pickup.lng,
      dLat: preset.dropoff.lat,
      dLng: preset.dropoff.lng,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <Calculator className="h-5 w-5 text-teal-700" />
            Upfront TZS Fare &amp; Surge Simulator
          </h2>
          <p className="text-xs text-slate-500">
            Dry-run any Unguja route with Rain/Night multipliers (strictly capped at 1.25x) &amp; promo codes before publishing tariff edits.
          </p>
        </div>
        <Link
          href="/admin/zones"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Edit Live Tariffs
        </Link>
      </div>

      {/* Controls */}
      <Card className="space-y-4 p-5">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">
              Unguja Route Preset
            </label>
            <select
              value={routeId}
              onChange={(e) => handleSelectPreset(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900"
            >
              {PRESET_ROUTES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1">
                <CloudRain className="h-3.5 w-3.5 text-teal-700" />
                Rain / Night Multiplier
              </span>
              <span className="font-mono text-teal-800">
                {multiplier.toFixed(2)}x (cap 1.25x)
              </span>
            </div>
            <input
              type="range"
              min="1.0"
              max="1.5"
              step="0.05"
              value={multiplier}
              onChange={(e) => setMultiplier(Number(e.target.value))}
              className="w-full accent-teal-700"
            />
            <div className="flex justify-between text-[10px] font-semibold text-slate-400">
              <span>1.00x Standard</span>
              <span>1.25x Max Cap</span>
              <span>1.50x (Test Cap)</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1 text-xs font-bold text-slate-700">
              <Tag className="h-3.5 w-3.5 text-amber-600" />
              Promo Code (Optional)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                placeholder="e.g. KARIBU"
                className="h-10 flex-1 rounded-xl border border-slate-300 px-3 font-mono text-xs font-bold uppercase text-slate-900"
              />
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={running}
                onClick={() => void runSimulation()}
              >
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Simulate
              </Button>
            </div>
            {(overview?.promos?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {overview!.promos.slice(0, 4).map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => {
                      setPromoCode(p.code);
                      void runSimulation({ promo: p.code });
                    }}
                    className="rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-800 hover:bg-amber-100"
                  >
                    {p.code}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fine-Grained Coordinates */}
        <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-4">
          <label className="text-[11px] font-semibold text-slate-500">
            Pickup Lat
            <input
              type="number"
              step="0.0001"
              value={pickupLat}
              onChange={(e) => setPickupLat(Number(e.target.value))}
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 font-mono text-xs font-bold text-slate-900"
            />
          </label>
          <label className="text-[11px] font-semibold text-slate-500">
            Pickup Lng
            <input
              type="number"
              step="0.0001"
              value={pickupLng}
              onChange={(e) => setPickupLng(Number(e.target.value))}
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 font-mono text-xs font-bold text-slate-900"
            />
          </label>
          <label className="text-[11px] font-semibold text-slate-500">
            Dropoff Lat
            <input
              type="number"
              step="0.0001"
              value={dropoffLat}
              onChange={(e) => setDropoffLat(Number(e.target.value))}
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 font-mono text-xs font-bold text-slate-900"
            />
          </label>
          <label className="text-[11px] font-semibold text-slate-500">
            Dropoff Lng
            <input
              type="number"
              step="0.0001"
              value={dropoffLng}
              onChange={(e) => setDropoffLng(Number(e.target.value))}
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 font-mono text-xs font-bold text-slate-900"
            />
          </label>
        </div>
      </Card>

      {errorMsg && (
        <Card className="flex items-center gap-2 border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {errorMsg}
        </Card>
      )}

      {result && (
        <>
          {/* Route & Policy Summary */}
          <div className="grid gap-4 sm:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs font-semibold text-slate-500">Est. Route Distance</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">
                {result.route.distanceKm} km
              </p>
              <p className="text-[11px] text-slate-500">
                ~{result.route.durationMinutes} min travel
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-semibold text-slate-500">Multiplier Applied</p>
              <p className="mt-1 text-2xl font-extrabold text-teal-800">
                {result.multiplierApplied.toFixed(2)}x
              </p>
              <p className="text-[11px] text-slate-500">
                {result.capEnforced
                  ? `Requested ${result.multiplierRequested}x capped at 1.25x`
                  : "Within Unguja 1.25x policy"}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-semibold text-slate-500">Stone Town Smart Snap</p>
              <p className="mt-1 flex items-center gap-1.5 text-base font-extrabold text-slate-900">
                <Footprints className="h-4 w-4 text-teal-700" />
                {result.route.smartSnapped
                  ? result.route.snapGateName
                  : "Direct Pickup"}
              </p>
              <p className="text-[11px] text-slate-500">
                {result.route.smartSnapped
                  ? `${result.route.walkMeters}m perimeter walk`
                  : "Outside pedestrian alleys"}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-semibold text-slate-500">Promo Evaluation</p>
              <p className="mt-1 text-lg font-extrabold text-amber-700">
                {result.promoStatus}
              </p>
              <p className="text-[11px] text-emerald-700">
                Operator net always gross-protected
              </p>
            </Card>
          </div>

          {/* Side-by-Side Tier Cards */}
          <div className="grid gap-4 lg:grid-cols-2">
            {(["BODABODA", "BAJAJI"] as const).map((tierKey) => {
              const tier = result.simulation[tierKey];
              const isBoda = tierKey === "BODABODA";
              return (
                <Card key={tierKey} className="space-y-4 p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isBoda ? (
                        <Bike className="h-5 w-5 text-teal-700" />
                      ) : (
                        <CarFront className="h-5 w-5 text-amber-600" />
                      )}
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900">
                          {isBoda ? "Go.boda" : "Go.bajaji"} — {tier.operatorRole}
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Base {fmt(tier.tariffUsed.baseFareTzs)} •{" "}
                          {fmt(tier.tariffUsed.perKmTzs)}/km •{" "}
                          {fmt(tier.tariffUsed.perMinTzs)}/min
                        </p>
                      </div>
                    </div>
                    <Badge tone={isBoda ? "teal" : "amber"}>
                      {tier.tariffUsed.commissionPct}% comm.
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 text-xs">
                    <div>
                      <p className="text-slate-500">Gross Fare (Rounded 500 TZS)</p>
                      <p className="mt-0.5 text-base font-extrabold text-slate-900">
                        {fmt(tier.grossFareTzs)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Customer Pays Upfront</p>
                      <p className="mt-0.5 text-base font-extrabold text-teal-800">
                        {fmt(tier.customerPaysTzs)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Platform Promo Subsidy</p>
                      <p className="mt-0.5 font-bold text-amber-700">
                        {tier.platformSubsidyTzs > 0
                          ? `-${fmt(tier.platformSubsidyTzs)} (${tier.promoApplied})`
                          : "TZS 0"}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">Platform Net Revenue</p>
                      <p className="mt-0.5 font-bold text-slate-700">
                        {fmt(tier.platformNetRevenueTzs)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs">
                    <span className="flex items-center gap-1.5 font-bold text-emerald-900">
                      <ShieldCheck className="h-4 w-4" />
                      Guaranteed {tier.operatorRole} Net (88% of Gross)
                    </span>
                    <span className="font-mono text-sm font-extrabold text-emerald-800">
                      {fmt(tier.operatorNetTzs)}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
