import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  isSupportedLocale,
  type SupportedLocale,
} from "@goboda/i18n";
import { PwaInstallBanner, PwaRegistrar } from "@goboda/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "Go.boda Rider-Driver — Bodaboda Riders & Bajaji Drivers",
  description:
    "Accept nearby Unguja transport requests, complete trips, and receive fast per-trip payouts.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#f59e0b",
  width: "device-width",
  initialScale: 1,
};

export default async function PartnerRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("NEXT_LOCALE")?.value;
  const locale: SupportedLocale =
    raw && isSupportedLocale(raw) ? raw : "en";
  const messages = getMessages(locale);

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <PwaRegistrar />
          {children}
          <PwaInstallBanner
            title={messages.common.installApp}
            description={messages.common.installDesc}
            installLabel={messages.common.installAction}
            dismissLabel={messages.common.dismiss}
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
