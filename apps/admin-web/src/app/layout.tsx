import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  isSupportedLocale,
  type SupportedLocale,
} from "@goboda/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Go.boda Admin",
  description:
    "Manage Bodaboda Riders, Bajaji Drivers, Unguja zones, tariffs, trips, and safety alerts.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
};

export default async function AdminRootLayout({
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
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
