import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, isSupportedLocale, type SupportedLocale } from "@goboda/i18n";
import { PwaInstallBanner, PwaRegistrar } from "@goboda/ui";
import { notFound } from "next/navigation";
import "../globals.css";

export const metadata: Metadata = {
  title: "Go.boda — Unguja Bodaboda & Bajaji",
  description:
    "Request nearby Bodaboda and Bajaji transport anywhere on Unguja Island, Zanzibar.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
};

export default async function CustomerLocaleLayout({
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
