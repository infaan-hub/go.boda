import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, isSupportedLocale, type SupportedLocale } from "@goboda/i18n";
import { notFound } from "next/navigation";
import "../globals.css";

export const metadata: Metadata = {
  title: "Go.boda Admin — Unguja Operations Command Center",
  description:
    "Manage Bodaboda Riders, Bajaji Drivers, Unguja zones, tariffs, live trips, SOS alerts, and payouts.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
};

export default async function AdminLocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) {
    notFound();
  }
  const messages = getMessages(locale as SupportedLocale);

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
