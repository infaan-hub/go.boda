"use client";

import * as React from "react";
import { Bell, BellOff, Loader2, Send } from "lucide-react";
import { useAdminPortal } from "./admin-portal-shell";

function decodeVapidKey(key: string) {
  const padding = "=".repeat((4 - (key.length % 4)) % 4);
  const base64 = (key + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

export function AdminWebPushControls() {
  const { locale, notify } = useAdminPortal();
  const sw = locale === "sw";
  const [configured, setConfigured] = React.useState(false);
  const [subscribed, setSubscribed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const refresh = React.useCallback(async () => {
    try {
      const response = await fetch("/api/ops/admin-tools/push", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load Web Push settings.");
      setConfigured(Boolean(data.configured && data.vapidPublicKey));
      const registration = await navigator.serviceWorker?.getRegistration("/");
      setSubscribed(Boolean(await registration?.pushManager.getSubscription()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Web Push settings.");
    }
  }, []);
  React.useEffect(() => { void refresh(); }, [refresh]);

  async function enable() {
    setBusy(true); setError("");
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser does not support Web Push.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications in the browser to enable Web Push.");
      const keyResponse = await fetch("/api/ops/admin-tools/push", { cache: "no-store" });
      const config = await keyResponse.json();
      if (!keyResponse.ok) throw new Error(config.message || "Could not load Web Push configuration.");
      if (!config.vapidPublicKey) throw new Error("Web Push is not configured on this deployment.");
      setConfigured(Boolean(config.configured));
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeVapidKey(config.vapidPublicKey) });
      const json = subscription.toJSON();
      const response = await fetch("/api/ops/admin-tools/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent.slice(0, 280) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not save this device subscription.");
      setSubscribed(true); notify("emerald", "Web Push enabled for this Admin device.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not enable Web Push."); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setError("");
    try {
      const registration = await navigator.serviceWorker?.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint;
      const response = await fetch("/api/ops/admin-tools/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not disable Web Push.");
      await subscription?.unsubscribe();
      setSubscribed(false); notify("emerald", "Web Push disabled for this Admin device.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not disable Web Push."); }
    finally { setBusy(false); }
  }

  async function testAllDevices() {
    if (!window.confirm(sw ? "Tuma arifa ya majaribio ya Web Push kwa vifaa vyote vilivyojisajili?" : "Send an instant Web Push test to every subscribed device?")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/ops/admin-tools/push/test", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Could not send the Web Push test.");
      notify("emerald", `Push test: ${result.push.delivered} delivered of ${result.push.attempted} devices.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not send the Web Push test."); }
    finally { setBusy(false); }
  }

  return <section className="space-y-3 rounded-2xl border border-[#17645F]/15 bg-white p-4 shadow-sm">
    <div><h2 className="font-bold text-[#17645F]">{sw ? "Udhibiti wa Web Push" : "Web Push controls"}</h2><p className="mt-1 text-xs text-[#122927]/65">{sw ? "Washa au zima arifa kwenye kifaa hiki cha Admin. Jaribio hutumwa kwa vifaa vyote vilivyojisajili." : "Enable or disable alerts on this Admin device. The test goes to all subscribed devices."}</p></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
    {!configured && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{sw ? "VAPID haijasanidiwa kwenye deployment hii." : "VAPID keys are not configured on this deployment."}</p>}
    <div className="flex flex-wrap gap-2">
      {subscribed ? <button className="inline-flex items-center gap-2 rounded-xl border border-[#17645F]/20 px-3 py-2 text-xs font-bold text-[#17645F]" onClick={() => void disable()} disabled={busy}><BellOff className="h-4 w-4" />{sw ? "Zima kwenye kifaa hiki" : "Disable on this device"}</button> : <button className="inline-flex items-center gap-2 rounded-xl bg-[#17645F] px-3 py-2 text-xs font-bold text-white disabled:opacity-50" onClick={() => void enable()} disabled={busy || !configured}><Bell className="h-4 w-4" />{sw ? "Washa kwenye kifaa hiki" : "Enable on this device"}</button>}
      <button className="inline-flex items-center gap-2 rounded-xl border border-[#B86B2B]/35 bg-[#B86B2B]/10 px-3 py-2 text-xs font-bold text-[#8E4F1E] disabled:opacity-50" onClick={() => void testAllDevices()} disabled={busy}><Send className="h-4 w-4" />{sw ? "Jaribu vifaa vyote" : "Test all devices"}</button>
      {busy && <Loader2 className="h-4 w-4 animate-spin self-center text-[#17645F]" aria-label="Working" />}
    </div>
  </section>;
}
