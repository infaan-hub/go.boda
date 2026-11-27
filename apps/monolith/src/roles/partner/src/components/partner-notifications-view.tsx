"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  BellOff,
  BellRing,
  CheckCheck,
  ExternalLink,
  Loader2,
  Radio,
  ShieldAlert,
} from "lucide-react";
import { Badge, Button, cn } from "@goboda/ui";
import { TransportType } from "@goboda/shared-types";
import { PartnerPortalShell } from "./partner-portal-shell";
import { usePartnerRealtime } from "./partner-realtime-provider";

function PartnerNotificationsContent({
  locale,
  nightMode,
  isBodabodaRider,
}: {
  locale: "sw" | "en";
  nightMode: boolean;
  isBodabodaRider: boolean;
}) {
  const sw = locale === "sw";
  const {
    snapshot,
    transport,
    refreshNow,
    pushPermission,
    pushSubscribed,
    pushBusy,
    pushError,
    vapidConfigured,
    enableWebPush,
    disableWebPush,
  } = usePartnerRealtime();

  const [filter, setFilter] = React.useState<"ALL" | "UNREAD" | "OPS" | "TRIPS">(
    "ALL"
  );
  const [markingAll, setMarkingAll] = React.useState(false);

  const notifications = snapshot?.notifications ?? [];
  const unreadCount = snapshot?.unreadCount ?? 0;

  const filtered = React.useMemo(() => {
    return notifications.filter((n) => {
      if (filter === "UNREAD") return !n.read;
      if (filter === "OPS") return n.eventSubject.startsWith("ops.");
      if (filter === "TRIPS") {
        return (
          n.eventSubject.includes("trip") ||
          n.eventSubject.includes("dispatch") ||
          n.eventSubject.includes("compliance")
        );
      }
      return true;
    });
  }, [notifications, filter]);

  const handleMarkRead = async (id?: string) => {
    if (!id) setMarkingAll(true);
    try {
      await fetch("/api/partner/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          id ? { action: "MARK_READ", id } : { action: "MARK_READ", all: true }
        ),
      });
      await refreshNow();
    } finally {
      setMarkingAll(false);
    }
  };

  const cardTone = nightMode
    ? "border-[#F3EEE8]/15 bg-[#123D3A] text-[#F3EEE8]"
    : "border-[#17645F]/15 bg-[#FAF7F2] text-[#122927]";

  const isLive = transport === "websocket" || transport === "sse";

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 pt-6 sm:px-6">
      <div
        className={cn(
          "flex flex-wrap items-end justify-between gap-3 border-b pb-4",
          nightMode ? "border-[#F3EEE8]/15" : "border-[#17645F]/15"
        )}
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] opacity-75">
            {isBodabodaRider
              ? sw
                ? "ARIFA ZA PAPO HAPO • BODABODA"
                : "INSTANT LIVE ALERTS • BODABODA"
              : sw
                ? "ARIFA ZA PAPO HAPO • BAJAJI"
                : "INSTANT LIVE ALERTS • BAJAJI"}
          </p>
          <h1
            className={cn(
              "mt-1 font-display text-4xl uppercase leading-none",
              nightMode ? "text-[#F3EEE8]" : "text-[#17645F]"
            )}
          >
            {sw ? "ARIFA & WEB PUSH" : "NOTIFICATIONS"}
          </h1>
        </div>
        {unreadCount > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={markingAll}
            onClick={() => void handleMarkRead()}
            className={cn(
              nightMode
                ? "border-[#F3EEE8]/30 text-[#F3EEE8] hover:bg-[#F3EEE8] hover:text-[#17645F]"
                : ""
            )}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            {sw ? "Soma Zote" : "Mark All Read"}
          </Button>
        ) : null}
      </div>

      {/* Instant Web Push & Live WebSocket Control Card */}
      <section className={cn("space-y-4 rounded-3xl border p-5 shadow-sm", cardTone)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={isLive ? "emerald" : "amber"}>
                <Radio className={cn("h-3 w-3", isLive && "animate-pulse")} />
                {transport === "websocket"
                  ? "WebSocket Live"
                  : transport === "sse"
                    ? "Live Stream Active"
                    : sw
                      ? "Inaunganisha..."
                      : "Connecting..."}
              </Badge>
              <Badge tone={pushSubscribed ? "teal" : "slate"}>
                <BellRing className="h-3 w-3" />
                {pushSubscribed
                  ? vapidConfigured
                    ? sw
                      ? "Web Push Imewashwa"
                      : "Web Push Active"
                    : sw
                      ? "Arifa za Papo Hapo Zimewashwa"
                      : "Instant Alerts Active"
                  : sw
                    ? "Web Push Imezimwa"
                    : "Web Push Off"}
              </Badge>
            </div>
            <h2 className="text-sm font-extrabold uppercase tracking-[0.12em]">
              {sw
                ? "Pata Maombi ya Safari na Taarifa Bila Ku-refresh"
                : "Instant Trip Offers & Ops Alerts — Zero Refresh"}
            </h2>
            <p className="text-xs opacity-75">
              {sw
                ? "Kila ombi la safari, tangazo la Go.Boda Ops, na kikumbusho cha leseni/bima hufika papo hapo kupitia WebSocket + Web Push."
                : "Every nearby trip request, Ops broadcast, and license/insurance renewal reminder arrives instantaneously over WebSocket + Web Push."}
            </p>
          </div>
        </div>

        {pushError ? (
          <div className="flex items-center gap-2 rounded-2xl border border-[#A93232]/35 bg-[#A93232]/10 px-3.5 py-2.5 text-xs font-semibold text-[#A93232]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{pushError}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2.5">
          {pushSubscribed ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pushBusy}
              onClick={() => void disableWebPush()}
              className={cn(
                nightMode
                  ? "border-[#F3EEE8]/30 text-[#F3EEE8] hover:bg-[#F3EEE8] hover:text-[#17645F]"
                  : ""
              )}
            >
              {pushBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <BellOff className="h-3.5 w-3.5" />
              )}
              {sw ? "Zima Web Push" : "Disable Web Push"}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={pushBusy || pushPermission === "unsupported"}
              onClick={() => void enableWebPush()}
            >
              {pushBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Bell className="h-3.5 w-3.5" />
              )}
              {sw ? "Washa Web Push Papo Hapo" : "Enable Instant Web Push"}
            </Button>
          )}

        </div>
      </section>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { key: "ALL", label: `${sw ? "Zote" : "All"} (${notifications.length})` },
            { key: "UNREAD", label: `${sw ? "Hazijasomwa" : "Unread"} (${unreadCount})` },
            { key: "OPS", label: sw ? "Go.Boda Ops" : "Ops Broadcasts" },
            { key: "TRIPS", label: sw ? "Safari & KYC" : "Trips & KYC" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-bold transition",
              filter === tab.key
                ? "border-[#17645F] bg-[#17645F] text-[#F3EEE8]"
                : nightMode
                  ? "border-[#F3EEE8]/20 bg-[#123D3A] text-[#F3EEE8]/80"
                  : "border-[#17645F]/20 bg-[#FAF7F2] text-[#17645F]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Live Feed */}
      {!snapshot ? (
        <div className={cn("flex items-center gap-2 rounded-3xl border p-6 text-xs", cardTone)}>
          <Loader2 className="h-4 w-4 animate-spin text-[#17645F]" />
          {sw ? "Inapakia arifa za moja kwa moja..." : "Syncing live notifications..."}
        </div>
      ) : filtered.length === 0 ? (
        <div className={cn("rounded-3xl border p-8 text-center space-y-2", cardTone)}>
          <Bell className="mx-auto h-7 w-7 opacity-40" />
          <p className="font-display text-2xl uppercase">
            {sw ? "HAKUNA ARIFA MPYA" : "YOU ARE ALL CAUGHT UP"}
          </p>
          <p className="text-xs opacity-75">
            {sw
              ? "Arifa mpya za safari, matangazo ya Ops na KYC zitajitokeza hapa papo hapo."
              : "Incoming trip alerts, Ops broadcasts, and expiry notices appear here live without refreshing."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => {
            const title = sw ? n.titleSw || n.title : n.titleEn || n.title;
            const body = sw ? n.bodySw || n.body : n.bodyEn || n.body;
            const dt = new Date(n.createdAt);

            return (
              <article
                key={n.id}
                className={cn(
                  "space-y-2.5 rounded-3xl border p-4 shadow-sm transition",
                  cardTone,
                  !n.read &&
                    (n.severity === "URGENT"
                      ? "border-[#A93232]/50 ring-1 ring-[#A93232]/25"
                      : "border-[#17645F]/45 ring-1 ring-[#17645F]/20")
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        n.severity === "URGENT"
                          ? "bg-[#A93232] text-white"
                          : n.severity === "SUCCESS"
                            ? "bg-[#17645F] text-[#F3EEE8]"
                            : "bg-[#B86B2B] text-[#FAF7F2]"
                      )}
                    >
                      {n.severity === "URGENT" ? (
                        <ShieldAlert className="h-4 w-4" />
                      ) : (
                        <BellRing className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-extrabold">{title}</h3>
                        {!n.read ? (
                          <span className="h-2 w-2 rounded-full bg-[#B86B2B]" />
                        ) : null}
                      </div>
                      <p className="mt-1 whitespace-pre-line text-xs leading-relaxed opacity-85">
                        {body}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold opacity-65">
                    {dt.toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}{" "}
                    {dt.toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-current/10 pt-2.5 text-[11px]">
                  <span className="font-mono uppercase opacity-60">
                    {n.channel} • {n.eventSubject}
                  </span>
                  <div className="flex items-center gap-2">
                    {n.url && n.url !== "/partner/notifications" ? (
                      <Link
                        href={n.url}
                        className="inline-flex items-center gap-1 rounded-full bg-[#17645F]/15 px-3 py-1 font-bold text-[#17645F] hover:bg-[#17645F] hover:text-[#F3EEE8]"
                      >
                        {sw ? "Fungua" : "Open"}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    ) : null}
                    {!n.read ? (
                      <button
                        type="button"
                        onClick={() => void handleMarkRead(n.id)}
                        className="rounded-full border border-current/25 px-3 py-1 font-bold opacity-80 hover:opacity-100"
                      >
                        {sw ? "Imesomwa" : "Mark Read"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

export function PartnerNotificationsView({
  locale,
  partnerTransportType,
}: {
  locale: "sw" | "en";
  partnerTransportType: TransportType;
}) {
  const [nightMode, setNightMode] = React.useState(false);
  const isBodabodaRider = partnerTransportType === TransportType.BODABODA;
  const categoryLabel = isBodabodaRider
    ? locale === "sw"
      ? "Rider wa Bodaboda"
      : "Bodaboda Rider"
    : locale === "sw"
      ? "Dereva wa Bajaji"
      : "Bajaji Driver";

  return (
    <PartnerPortalShell
      locale={locale}
      categoryLabel={categoryLabel}
      nightMode={nightMode}
      onToggleNightMode={() => setNightMode((v) => !v)}
      showSignOut
    >
      <PartnerNotificationsContent
        locale={locale}
        nightMode={nightMode}
        isBodabodaRider={isBodabodaRider}
      />
    </PartnerPortalShell>
  );
}
