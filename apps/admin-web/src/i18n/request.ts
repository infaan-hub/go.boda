import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  getMessages,
  isSupportedLocale,
  type SupportedLocale,
} from "@goboda/i18n";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get("NEXT_LOCALE")?.value;
  const locale: SupportedLocale =
    raw && isSupportedLocale(raw) ? raw : "en";

  return {
    locale,
    messages: getMessages(locale),
  };
});
