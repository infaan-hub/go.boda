import "@partner/app/globals.css";
import { PwaInstallBanner, PwaRegistrar } from "@goboda/ui";
import { cookies } from "next/headers";
import { getMessages, isSupportedLocale } from "@goboda/i18n";

export const metadata = {
  title: "Go.boda Rider-Driver",
  manifest: "/partner/manifest.webmanifest",
};

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const localeCookie = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale = typeof localeCookie === "string" && isSupportedLocale(localeCookie) ? localeCookie : "en";
  const messages = getMessages(locale);
  return <><PwaRegistrar swPath="/partner/sw.js" />{children}<PwaInstallBanner title={messages.common.installApp} description={messages.common.installDesc} installLabel={messages.common.installAction} dismissLabel={messages.common.dismiss} /></>;
}
