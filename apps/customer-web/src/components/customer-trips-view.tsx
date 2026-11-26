"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeftRight,
  Bike,
  CarFront,
  CheckCircle2,
  Compass,
  Download,
  FileText,
  History,
  Loader2,
  MapPin,
  PackageSearch,
  Printer,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  Badge,
  BrandLogo,
  Button,
  Card,
  LanguageSwitchLink,
} from "@goboda/ui";
import { formatTzs } from "@goboda/shared-types";

interface CustomerTripRow {
  id: string;
  tripCode: string;
  transportType: "BODABODA" | "BAJAJI";
  operatorTitle: string;
  status: string;
  pickupLat: number | null;
  pickupLng: number | null;
  pickupLabel: string;
  pickupSnapped: boolean;
  pickupSnapGateName: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  dropoffLabel: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
  paymentMethod: string;
  promoCode: string | null;
  grossFareTzs: number | null;
  discountTzs: number | null;
  estimatedFareTzs: number;
  finalFareTzs: number | null;
  operatorName: string | null;
  operatorPlate: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface SupportTicketRow {
  id: string;
  tripId: string | null;
  tripCode: string | null;
  category: string;
  subject: string;
  description: string;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED";
  opsReplySw: string;
  opsReplyEn: string;
  createdAt: string;
}

function buildReturnTripHref(trip: CustomerTripRow): string {
  const params = new URLSearchParams();
  if (trip.dropoffLat != null && trip.dropoffLng != null) {
    params.set("pickupLat", String(trip.dropoffLat));
    params.set("pickupLng", String(trip.dropoffLng));
  }
  params.set("pickupLabel", trip.dropoffLabel);
  if (trip.pickupLat != null && trip.pickupLng != null) {
    params.set("dropoffLat", String(trip.pickupLat));
    params.set("dropoffLng", String(trip.pickupLng));
  }
  params.set("dropoffLabel", trip.pickupLabel);
  params.set("transportType", trip.transportType);
  return `/dashboard?${params.toString()}`;
}

function buildReceiptText(trip: CustomerTripRow): string {
  const totalTzs = trip.finalFareTzs ?? trip.estimatedFareTzs;
  const grossTzs = trip.grossFareTzs ?? totalTzs;
  const discTzs = trip.discountTzs ?? 0;
  const km =
    trip.distanceMeters != null
      ? `${(trip.distanceMeters / 1000).toFixed(1)} km`
      : "—";
  const dateStr = new Date(trip.completedAt ?? trip.createdAt).toLocaleString();
  const roleLabel =
    trip.transportType === "BODABODA"
      ? "Go.boda (Bodaboda Rider)"
      : "Go.bajaji (Bajaji Driver)";

  return [
    "================================================",
    "         GO.BODA UNGUJA — DIGITAL RECEIPT       ",
    "       RISITI YA SAFARI — KISIWA CHA UNGUJA     ",
    "================================================",
    `Trip Code / Namba ya Safari : ${trip.tripCode}`,
    `Date / Tarehe               : ${dateStr}`,
    `Service / Huduma            : ${roleLabel}`,
    `Status / Hali               : ${trip.status}`,
    `Operator / Mwendeshaji      : ${trip.operatorName ?? "Assigned Operator"}`,
    `Z-Plate / Namba ya Chombo   : ${trip.operatorPlate ?? "Unguja Verified"}`,
    "------------------------------------------------",
    `Pickup / Kuchukuliwa        : ${trip.pickupLabel}`,
    trip.pickupSnapped && trip.pickupSnapGateName
      ? `Smart Snap Gate / Lango     : ${trip.pickupSnapGateName}`
      : null,
    `Dropoff / Kushushwa         : ${trip.dropoffLabel}`,
    `Distance / Umbali           : ${km}`,
    "------------------------------------------------",
    `Gross Fare / Nauli Halisi   : ${formatTzs(grossTzs)}`,
    discTzs > 0
      ? `Promo (${trip.promoCode ?? "PROMO"}) / Punguzo : -${formatTzs(discTzs)}`
      : null,
    `TOTAL PAID / JUMLA          : ${formatTzs(totalTzs)}`,
    `Payment / Malipo            : ${trip.paymentMethod}`,
    "================================================",
    "Go.boda Unguja Ops Desk: +255 770 000 112 | Emergency: 112",
    "Asante kwa kusafiri na Go.boda! / Thank you for riding with Go.boda!",
  ]
    .filter(Boolean)
    .join("\n");
}

export function CustomerTripsView({
  locale,
  customerId,
  customerName,
  customerPhone,
}: {
  locale: "sw" | "en";
  customerId: string;
  customerName: string;
  customerPhone: string;
}) {
  const sw = locale === "sw";
  const [trips, setTrips] = React.useState<CustomerTripRow[]>([]);
  const [tickets, setTickets] = React.useState<SupportTicketRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"ALL" | "BODABODA" | "BAJAJI">(
    "ALL"
  );

  // Bilingual receipt modal
  const [receiptTrip, setReceiptTrip] = React.useState<CustomerTripRow | null>(
    null
  );

  // Lost-item modal
  const [lostItemModalTrip, setLostItemModalTrip] =
    React.useState<CustomerTripRow | null>(null);
  const [showGeneralTicketModal, setShowGeneralTicketModal] =
    React.useState(false);
  const [ticketCategory, setTicketCategory] = React.useState<
    "LOST_ITEM" | "PAYMENT_DISPUTE" | "SAFETY" | "GENERAL"
  >("LOST_ITEM");
  const [ticketSubject, setTicketSubject] = React.useState("");
  const [ticketDescription, setTicketDescription] = React.useState("");
  const [submittingTicket, setSubmittingTicket] = React.useState(false);
  const [ticketFeedback, setTicketFeedback] = React.useState<{
    tone: "ok" | "err";
    text: string;
  } | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [tripsRes, ticketsRes] = await Promise.all([
        fetch(`/api/trips?customerId=${encodeURIComponent(customerId)}`, {
          cache: "no-store",
        }),
        fetch("/api/support/lost-item", { cache: "no-store" }),
      ]);
      if (tripsRes.ok) {
        const tJson = (await tripsRes.json()) as { trips?: CustomerTripRow[] };
        setTrips(tJson.trips ?? []);
      }
      if (ticketsRes.ok) {
        const sJson = (await ticketsRes.json()) as {
          tickets?: SupportTicketRow[];
        };
        setTickets(sJson.tickets ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredTrips = trips.filter((t) =>
    filter === "ALL" ? true : t.transportType === filter
  );

  const openLostItemModal = (trip: CustomerTripRow | null) => {
    setTicketFeedback(null);
    setTicketCategory("LOST_ITEM");
    setTicketSubject(
      trip
        ? sw
          ? `Kitu kilichosahaulika kwenye safari ${trip.tripCode}`
          : `Lost item on trip ${trip.tripCode}`
        : ""
    );
    setTicketDescription("");
    if (trip) {
      setLostItemModalTrip(trip);
      setShowGeneralTicketModal(false);
    } else {
      setLostItemModalTrip(null);
      setShowGeneralTicketModal(true);
    }
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingTicket(true);
    setTicketFeedback(null);
    try {
      const res = await fetch("/api/support/lost-item", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tripId: lostItemModalTrip?.id ?? null,
          tripCode: lostItemModalTrip?.tripCode ?? null,
          reporterPhone: customerPhone,
          category: ticketCategory,
          subject: ticketSubject,
          description: ticketDescription,
        }),
      });
      const json = (await res.json()) as {
        created?: boolean;
        ticket?: SupportTicketRow;
        error?: string;
      };
      if (!res.ok || !json.created) {
        setTicketFeedback({
          tone: "err",
          text: sw
            ? "Imeshindwa kutuma ripoti. Tafadhali hakikisha umejaza maelezo yote."
            : "Could not submit report. Please check all fields.",
        });
        return;
      }
      if (json.ticket) {
        setTickets((prev) => [json.ticket!, ...prev]);
      }
      setTicketFeedback({
        tone: "ok",
        text: sw
          ? "Ripoti imetumwa moja kwa moja kwa Go.boda Unguja Ops Desk! Tutakujibu kupitia WhatsApp na hapa."
          : "Report sent directly to Go.boda Unguja Ops Desk! We will respond via WhatsApp and below.",
      });
      setLostItemModalTrip(null);
      setShowGeneralTicketModal(false);
      setTicketSubject("");
      setTicketDescription("");
    } finally {
      setSubmittingTicket(false);
    }
  };

  const handleDownloadReceipt = (trip: CustomerTripRow) => {
    const content = buildReceiptText(trip);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `goboda-receipt-${trip.tripCode}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F3EEE8] pb-24 text-[#122927]">
      <header className="sticky top-0 z-30 border-b border-[#17645F]/15 bg-[#F3EEE8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3.5 sm:px-6">
          <BrandLogo
            subtitle={sw ? "Historia & Risiti za TZS" : "Trips & TZS Receipts"}
          />
          <nav className="hidden items-center gap-6 text-[11px] font-bold uppercase tracking-[0.2em] text-[#17645F]/75 md:flex">
            <Link href="/dashboard" className="hover:text-[#17645F]">
              {sw ? "Agiza" : "Book"}
            </Link>
            <Link href="/trips" className="text-[#17645F] underline underline-offset-4">
              {sw ? "Safari" : "Trips"}
            </Link>
            <Link href="/safety" className="hover:text-[#17645F]">
              {sw ? "Usalama" : "Safety"}
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <LanguageSwitchLink
              currentLocale={locale}
              hrefSw="/trips?lang=sw"
              hrefEn="/trips?lang=en"
            />
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 rounded-full bg-[#17645F] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#F3EEE8] transition hover:bg-[#114E4A]"
            >
              {sw ? "Agiza Safari" : "Book Trip"}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 pt-6 sm:px-6">
        {/* Page Heading + General Lost Item CTA */}
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#17645F]/15 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#17645F]/75">
              {customerName} • {customerPhone}
            </p>
            <h1 className="mt-1 font-display text-4xl uppercase leading-none text-[#17645F]">
              {sw ? "SAFARI & RISITI" : "MY TRIPS & RECEIPTS"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void loadData()}
              disabled={loading}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              {sw ? "Sasisha" : "Refresh"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="amber"
              onClick={() => openLostItemModal(null)}
            >
              <PackageSearch className="h-3.5 w-3.5" />
              {sw ? "Ripoti Kitu Kilichopotea" : "Report Lost Item"}
            </Button>
          </div>
        </div>

        {ticketFeedback && (
          <div
            className={`flex items-start gap-2 rounded-2xl border p-3.5 text-xs font-semibold ${
              ticketFeedback.tone === "ok"
                ? "border-[#17645F]/30 bg-[#17645F]/10 text-[#17645F]"
                : "border-[#A93232]/30 bg-[#A93232]/10 text-[#A93232]"
            }`}
          >
            {ticketFeedback.tone === "ok" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{ticketFeedback.text}</span>
          </div>
        )}

        {/* Filter Chips */}
        <div className="flex items-center gap-2">
          {(
            [
              { id: "ALL", labelSw: "Zote", labelEn: "All Trips" },
              { id: "BODABODA", labelSw: "Go.boda", labelEn: "Go.boda (Rider)" },
              { id: "BAJAJI", labelSw: "Go.bajaji", labelEn: "Go.bajaji (Driver)" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] transition ${
                filter === f.id
                  ? "bg-[#17645F] text-[#F3EEE8] shadow-sm"
                  : "border border-[#17645F]/20 bg-[#FAF7F2] text-[#17645F]/80 hover:bg-[#17645F]/10"
              }`}
            >
              {sw ? f.labelSw : f.labelEn}
            </button>
          ))}
        </div>

        {/* Trip Cards */}
        {loading ? (
          <Card className="flex items-center justify-center gap-2 p-8 text-sm font-semibold text-[#17645F]/75">
            <Loader2 className="h-4 w-4 animate-spin text-[#17645F]" />
            {sw ? "Inapakia safari zako..." : "Loading your Unguja trips..."}
          </Card>
        ) : filteredTrips.length === 0 ? (
          <Card className="space-y-3 p-6 text-center">
            <p className="text-sm font-bold text-[#122927]">
              {sw
                ? "Bado huna safari zilizorekodiwa kwenye akaunti hii."
                : "No recorded trips on this account yet."}
            </p>
            <p className="text-xs text-[#17645F]/75">
              {sw
                ? "Agiza Bodaboda au Bajaji popote Unguja na risiti zako za TZS zitaonekana hapa moja kwa moja."
                : "Book a Bodaboda Rider or Bajaji Driver anywhere on Unguja and your digital TZS receipts will appear here automatically."}
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#17645F] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-[#F3EEE8] hover:bg-[#114E4A]"
            >
              <Compass className="h-4 w-4" />
              {sw ? "Agiza Safari Yako ya Kwanza" : "Book Your First Trip"}
            </Link>
          </Card>
        ) : (
          <section className="space-y-3">
            {filteredTrips.map((trip) => {
              const isBoda = trip.transportType === "BODABODA";
              const totalTzs = trip.finalFareTzs ?? trip.estimatedFareTzs;
              const dateLabel = new Date(
                trip.completedAt ?? trip.createdAt
              ).toLocaleString();
              return (
                <Card key={trip.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={isBoda ? "teal" : "amber"}>
                        {isBoda ? (
                          <Bike className="h-3.5 w-3.5" />
                        ) : (
                          <CarFront className="h-3.5 w-3.5" />
                        )}
                        {isBoda ? "Go.boda (Rider)" : "Go.bajaji (Driver)"}
                      </Badge>
                      <span className="font-mono text-xs font-bold text-[#17645F]/75">
                        {trip.tripCode}
                      </span>
                      <Badge
                        tone={
                          trip.status === "COMPLETED"
                            ? "emerald"
                            : trip.status.includes("CANCEL")
                              ? "rose"
                              : "slate"
                        }
                      >
                        {trip.status}
                      </Badge>
                    </div>
                    <span className="text-base font-extrabold text-[#17645F]">
                      {formatTzs(totalTzs)}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-[#122927]">
                    <p className="flex items-start gap-1.5 font-semibold">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#17645F]" />
                      <span>
                        {trip.pickupLabel} → {trip.dropoffLabel}
                      </span>
                    </p>
                    <p className="text-[11px] text-[#17645F]/70">
                      {dateLabel} • {trip.paymentMethod}
                      {trip.operatorName ? ` • ${trip.operatorName}` : ""}
                      {trip.operatorPlate ? ` (${trip.operatorPlate})` : ""}
                      {trip.pickupSnapped
                        ? " • Stone Town Smart Snap ✓"
                        : ""}
                    </p>
                  </div>

                  {/* 1-Tap Receipt, Return Trip & Lost Item Actions */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-[#17645F]/10 pt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setReceiptTrip(trip)}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {sw ? "Risiti SW/EN" : "SW/EN Receipt"}
                    </Button>
                    <Link
                      href={buildReturnTripHref(trip)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#17645F]/10 px-3.5 py-1.5 text-xs font-bold text-[#17645F] transition hover:bg-[#17645F]/20"
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      {sw ? "Agiza Safari ya Kurudi" : "Book Return Trip"}
                    </Link>
                    <button
                      type="button"
                      onClick={() => openLostItemModal(trip)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#B86B2B]/15 px-3.5 py-1.5 text-xs font-bold text-[#8E4F1B] transition hover:bg-[#B86B2B]/25"
                    >
                      <PackageSearch className="h-3.5 w-3.5" />
                      {sw ? "Kitu Kilichopotea" : "Lost Item"}
                    </button>
                  </div>
                </Card>
              );
            })}
          </section>
        )}

        {/* Customer's Lost-Item & Support Tickets (Synced with /admin/support/inbox) */}
        <section className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl uppercase tracking-wide text-[#17645F]">
              {sw
                ? "Ripoti za Vitu Vilivyopotea"
                : "Lost-Item & Support Tickets"}
            </h2>
            <Badge tone="teal">{tickets.length}</Badge>
          </div>

          {tickets.length === 0 ? (
            <Card className="p-4 text-xs text-[#17645F]/75">
              {sw
                ? "Huna ripoti ya kitu kilichopotea kwa sasa. Ukisahau chochote kwenye Bodaboda au Bajaji, tumia kitufe cha 'Ripoti Kitu Kilichopotea' hapo juu."
                : "No open lost-item or support tickets. If you left an item on a Bodaboda or Bajaji, use 'Report Lost Item' above."}
            </Card>
          ) : (
            <div className="space-y-2.5">
              {tickets.map((tk) => (
                <Card key={tk.id} className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          tk.status === "RESOLVED"
                            ? "emerald"
                            : tk.status === "IN_REVIEW"
                              ? "amber"
                              : "rose"
                        }
                      >
                        {tk.status}
                      </Badge>
                      <span className="text-xs font-bold text-[#17645F]">
                        {tk.category}
                        {tk.tripCode ? ` • ${tk.tripCode}` : ""}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#17645F]/60">
                      {new Date(tk.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-[#122927]">
                    {tk.subject}
                  </p>
                  <p className="text-xs text-[#122927]/80">{tk.description}</p>
                  {(tk.opsReplySw || tk.opsReplyEn) && (
                    <div className="rounded-2xl border border-[#17645F]/20 bg-[#17645F]/10 p-3 text-xs text-[#122927]">
                      <p className="font-bold text-[#17645F]">
                        {sw ? "Jibu la Go.boda Ops Desk:" : "Go.boda Ops Desk Reply:"}
                      </p>
                      <p className="mt-1">
                        {sw
                          ? tk.opsReplySw || tk.opsReplyEn
                          : tk.opsReplyEn || tk.opsReplySw}
                      </p>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Bilingual SW/EN Digital TZS Receipt Modal */}
      {receiptTrip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#122927]/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-[#17645F]/20 bg-[#FAF7F2] p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#17645F]/15 pb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#17645F]">
                  Go.boda Unguja • Digital TZS Receipt / Risiti
                </p>
                <h2 className="font-display text-2xl text-[#17645F]">
                  {receiptTrip.tripCode}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setReceiptTrip(null)}
                className="rounded-full p-1.5 text-[#17645F]/60 hover:bg-[#17645F]/10 hover:text-[#17645F]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <pre className="mt-3 max-h-80 overflow-auto rounded-2xl bg-[#122927] p-3.5 font-mono text-[11px] leading-relaxed text-[#F3EEE8]">
              {buildReceiptText(receiptTrip)}
            </pre>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                {sw ? "Chapisha / PDF" : "Print / PDF"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => handleDownloadReceipt(receiptTrip)}
              >
                <Download className="h-4 w-4" />
                {sw ? "Pakua Risiti (.txt)" : "Download Receipt"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Lost-Item / Support Ticket Modal */}
      {(lostItemModalTrip || showGeneralTicketModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#122927]/65 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSubmitTicket}
            className="w-full max-w-md space-y-3.5 rounded-3xl border border-[#17645F]/20 bg-[#FAF7F2] p-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#17645F]/15 pb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#B86B2B]">
                  {sw ? "Go.boda Msaada — Unguja" : "Go.boda Unguja Support"}
                </p>
                <h2 className="text-base font-extrabold text-[#17645F]">
                  {lostItemModalTrip
                    ? `${sw ? "Ripoti kwa Safari" : "Report for Trip"} ${lostItemModalTrip.tripCode}`
                    : sw
                      ? "Ripoti Kitu Kilichopotea / Msaada"
                      : "Report Lost Item / Support"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLostItemModalTrip(null);
                  setShowGeneralTicketModal(false);
                }}
                className="rounded-full p-1.5 text-[#17645F]/60 hover:bg-[#17645F]/10 hover:text-[#17645F]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#17645F]/80">
                {sw ? "Aina ya Ripoti" : "Category"}
              </label>
              <select
                value={ticketCategory}
                onChange={(e) =>
                  setTicketCategory(
                    e.target.value as
                      | "LOST_ITEM"
                      | "PAYMENT_DISPUTE"
                      | "SAFETY"
                      | "GENERAL"
                  )
                }
                className="w-full rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3 py-2 text-sm font-semibold text-[#122927]"
              >
                <option value="LOST_ITEM">
                  {sw ? "Kitu Kilichosahaulika (Lost Item)" : "Lost Item"}
                </option>
                <option value="PAYMENT_DISPUTE">
                  {sw ? "Mgogoro wa Malipo (Payment Dispute)" : "Payment Dispute"}
                </option>
                <option value="SAFETY">
                  {sw ? "Usalama / Helmeti (Safety)" : "Safety / Helmet Issue"}
                </option>
                <option value="GENERAL">
                  {sw ? "Msaada Mwingine (General)" : "General Support"}
                </option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#17645F]/80">
                {sw ? "Kichwa cha Habari" : "Subject"}
              </label>
              <input
                type="text"
                required
                minLength={3}
                value={ticketSubject}
                onChange={(e) => setTicketSubject(e.target.value)}
                placeholder={
                  sw
                    ? "Mfano: Nimesahau simu / begi kwenye Bajaji"
                    : "e.g., Left sunglasses / backpack in Bajaji"
                }
                className="w-full rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3 py-2 text-sm text-[#122927]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#17645F]/80">
                {sw
                  ? "Maelezo ya Kitu na Mahali"
                  : "Item Details & Pickup/Dropoff Notes"}
              </label>
              <textarea
                required
                minLength={5}
                rows={4}
                value={ticketDescription}
                onChange={(e) => setTicketDescription(e.target.value)}
                placeholder={
                  sw
                    ? "Eleza rangi ya kitu, muda wa safari, na kituo ulichoshukia..."
                    : "Describe item color, approximate time, and dropoff location..."
                }
                className="w-full rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3 py-2 text-sm text-[#122927]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setLostItemModalTrip(null);
                  setShowGeneralTicketModal(false);
                }}
              >
                {sw ? "Ghairi" : "Cancel"}
              </Button>
              <Button
                type="submit"
                size="sm"
                variant="primary"
                disabled={submittingTicket}
              >
                {submittingTicket ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {sw ? "Tuma kwa Ops Desk" : "Submit to Ops Desk"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Bottom Mobile Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#17645F]/15 bg-[#FAF7F2]/95 backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-[0.16em]">
          <Link
            href="/dashboard"
            className="flex flex-col items-center gap-1 text-[#17645F]/60 hover:text-[#17645F]"
          >
            <Compass className="h-5 w-5" />
            {sw ? "Agiza" : "Book"}
          </Link>
          <Link
            href="/trips"
            className="flex flex-col items-center gap-1 text-[#17645F]"
          >
            <History className="h-5 w-5" />
            {sw ? "Safari" : "Trips"}
          </Link>
          <Link
            href="/safety"
            className="flex flex-col items-center gap-1 text-[#17645F]/60 hover:text-[#17645F]"
          >
            <ShieldCheck className="h-5 w-5" />
            {sw ? "Usalama" : "Safety"}
          </Link>
        </div>
      </nav>
    </div>
  );
}
