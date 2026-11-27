"use client";

import * as React from "react";
import { Bike, IdCard, MapPin, Phone, UserRound } from "lucide-react";
import { TransportType } from "@goboda/shared-types";
import { PartnerPortalShell } from "./partner-portal-shell";

export function PartnerProfileView({
  locale,
  partnerId,
  partnerName,
  partnerPhone,
  partnerTransportType,
  partnerPlateNumber,
  partnerKituo,
}: {
  locale: "sw" | "en";
  partnerId: string;
  partnerName: string;
  partnerPhone: string;
  partnerTransportType: TransportType;
  partnerPlateNumber?: string;
  partnerKituo?: string;
}) {
  const sw = locale === "sw";
  const [nightMode, setNightMode] = React.useState(false);
  const isBodaboda = partnerTransportType === TransportType.BODABODA;
  const roleLabel = isBodaboda
    ? sw ? "Rider wa Bodaboda" : "Bodaboda Rider"
    : sw ? "Dereva wa Bajaji" : "Bajaji Driver";
  const fields = [
    { label: sw ? "Jina kamili" : "Full name", value: partnerName, icon: UserRound },
    { label: sw ? "Namba ya simu" : "Phone number", value: partnerPhone, icon: Phone },
    { label: sw ? "Aina ya usafiri" : "Transport type", value: roleLabel, icon: Bike },
    { label: sw ? "Namba ya usajili" : "Vehicle plate", value: partnerPlateNumber || (sw ? "Haijawekwa" : "Not provided"), icon: IdCard },
    { label: sw ? "Kituo cha nyumbani" : "Home kituo", value: partnerKituo || (sw ? "Haijawekwa" : "Not assigned"), icon: MapPin },
  ];

  return (
    <PartnerPortalShell
      locale={locale}
      categoryLabel={roleLabel}
      nightMode={nightMode}
      onToggleNightMode={() => setNightMode((current) => !current)}
      showSignOut
    >
      <main className="mx-auto max-w-3xl space-y-5 px-4 pt-7 sm:px-6">
        <header className={`border-b pb-4 ${nightMode ? "border-[#F3EEE8]/15" : "border-[#17645F]/15"}`}>
          <p className={`text-[10px] font-bold uppercase tracking-[0.24em] ${nightMode ? "text-[#F3EEE8]/75" : "text-[#17645F]/75"}`}>
            {roleLabel}
          </p>
          <h1 className={`mt-1 font-display text-4xl uppercase leading-none ${nightMode ? "text-[#F3EEE8]" : "text-[#17645F]"}`}>
            {sw ? "WASIFU WANGU" : "MY PROFILE"}
          </h1>
          <p className={`mt-2 text-sm ${nightMode ? "text-[#F3EEE8]/70" : "text-[#122927]/70"}`}>
            {sw ? "Taarifa za akaunti yako ya Rider-Driver." : "Your Rider-Driver account details."}
          </p>
        </header>

        <section className={`overflow-hidden rounded-3xl border shadow-sm ${nightMode ? "border-[#F3EEE8]/15 bg-[#123D3A] text-[#F3EEE8]" : "border-[#17645F]/15 bg-[#FAF7F2] text-[#122927]"}`}>
          <div className="flex items-center gap-4 bg-[#17645F] px-5 py-6 text-[#F3EEE8] sm:px-7">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F3EEE8]/15">
              <UserRound className="h-7 w-7" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-bold">{partnerName}</h2>
              <p className="mt-1 text-sm text-[#F3EEE8]/75">{roleLabel}</p>
            </div>
          </div>
          <dl className={`divide-y px-5 sm:px-7 ${nightMode ? "divide-[#F3EEE8]/10" : "divide-[#17645F]/10"}`}>
            {fields.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 py-4">
                <Icon className={`h-4 w-4 shrink-0 ${nightMode ? "text-[#F3EEE8]" : "text-[#17645F]"}`} aria-hidden="true" />
                <dt className={`w-2/5 text-sm ${nightMode ? "text-[#F3EEE8]/60" : "text-[#122927]/60"}`}>{label}</dt>
                <dd className="min-w-0 flex-1 break-words text-right text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <p className={`px-5 pb-5 pt-1 text-xs sm:px-7 ${nightMode ? "text-[#F3EEE8]/50" : "text-[#122927]/50"}`}>
            {sw ? "Kitambulisho cha akaunti" : "Account ID"}: {partnerId}
          </p>
        </section>
      </main>
    </PartnerPortalShell>
  );
}
