import type { Metadata, Viewport } from "next";
import { Anton, Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import {
  getMessages,
  isSupportedLocale,
  type SupportedLocale,
} from "@goboda/i18n";
import "./globals.css";

const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Go.boda Admin",
  description:
    "Manage Bodaboda Riders, Bajaji Drivers, Unguja zones, tariffs, trips, and safety alerts.",
  manifest: "/admin/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#17645F",
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
    <html lang={locale} className={`${anton.variable} ${jakarta.variable}`}>
      <body className="bg-[#F3EEE8] font-sans text-[#122927] antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
