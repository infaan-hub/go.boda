import { enMessages } from "./messages/en.js";
import { swMessages } from "./messages/sw.js";

export const SUPPORTED_LOCALES = ["sw", "en"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = "sw";

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function getMessages(locale: SupportedLocale) {
  return locale === "sw" ? swMessages : enMessages;
}

export { enMessages, swMessages };
