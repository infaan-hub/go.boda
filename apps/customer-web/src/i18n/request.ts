import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  getMessages,
  isSupportedLocale,
  type SupportedLocale,
} from "@goboda/i18n";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const cookieStore = await cookies();
  const raw = cookieStore.get("NEXT_LOCALE")?.value;

  const locale: SupportedLocale =
    requested && isSupportedLocale(requested)
      ? requested
      : raw && isSupportedLocale(raw)
        ? raw
        : routing.defaultLocale;

  return {
    locale,
    messages: getMessages(locale),
  };
});
