"use client";

import * as React from "react";
import { useAdminPortal } from "./admin-portal-shell";

type UserRole = "CUSTOMER" | "BODABODA_RIDER" | "BAJAJI_DRIVER" | "ADMIN";
interface UserRow {
  id: string; name: string; phone: string | null; email: string | null;
  username: string | null; role: UserRole; status: string; createdAt: string;
}
interface RiderRow {
  id: string; userId: string; name: string; phone: string | null; email: string | null;
  username: string | null; transportType: "BODABODA" | "BAJAJI"; plateNumber: string | null;
  homeKituo: string | null; kycStatus: string; accountStatus: string; isOnline: boolean;
}

const panel = "rounded-2xl border border-[#17645F]/15 bg-white p-4 shadow-sm";
const input = "w-full rounded-xl border border-[#17645F]/20 bg-white px-3 py-2 text-sm text-[#122927] outline-none focus:border-[#17645F]";
const primary = "rounded-xl bg-[#17645F] px-3 py-2 text-xs font-bold text-white disabled:opacity-50";
const secondary = "rounded-xl border border-[#17645F]/20 px-3 py-2 text-xs font-bold text-[#17645F] disabled:opacity-50";
const danger = "rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 disabled:opacity-50";

function DirectoryHeader({ title, subtitle, count, onRefresh, busy }: { title: string; subtitle: string; count: number; onRefresh: () => void; busy: boolean }) {
  return <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#17645F]/15 pb-4">
    <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#17645F]/70">{subtitle}</p><h1 className="mt-1 font-display text-3xl uppercase text-[#17645F]">{title}</h1></div>
    <div className="flex items-center gap-2"><span className="rounded-full bg-[#17645F]/10 px-3 py-1 text-xs font-bold text-[#17645F]">{count}</span><button className={secondary} onClick={onRefresh} disabled={busy}>Refresh</button></div>
  </header>;
}

export function AdminUsersDirectory() {
  const { adminUser, notify } = useAdminPortal();
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [editing, setEditing] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");

  const load = React.useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/ops/admin-tools/users", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not load users.");
      setUsers(data.users ?? []);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load users."); }
    finally { setBusy(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  async function save(event: React.FormEvent<HTMLFormElement>, user: UserRow) {
    event.preventDefault(); setBusy(true);
    const fields = new FormData(event.currentTarget);
    const payload = Object.fromEntries(fields.entries()) as Record<string, string | null>;
    if (payload.phone === "") payload.phone = null;
    if (payload.email === "") payload.email = null;
    if (payload.username === "") payload.username = null;
    try {
      const response = await fetch(`/api/ops/admin-tools/users/${user.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not update user.");
      setEditing(null); await load(); notify("emerald", "User account updated.");
    } catch (err) { notify("rose", err instanceof Error ? err.message : "Could not update user."); setBusy(false); }
  }
  async function remove(user: UserRow) {
    if (!window.confirm(`Delete ${user.name}'s account? This blocks sign-in and preserves linked trip and payment history.`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/ops/admin-tools/users/${user.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not delete account.");
      await load(); notify("emerald", "Account disabled and removed from active access.");
    } catch (err) { notify("rose", err instanceof Error ? err.message : "Could not delete account."); setBusy(false); }
  }

  const filtered = users.filter((u) => `${u.name} ${u.phone ?? ""} ${u.email ?? ""} ${u.username ?? ""} ${u.role}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
    <DirectoryHeader title="Users" subtitle="Accounts and access roles" count={users.length} onRefresh={() => void load()} busy={busy} />
    <input className={`${input} max-w-md`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, email, username, or role" aria-label="Search users" />
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <div className="space-y-3">{filtered.map((user) => <section className={panel} key={user.id}>
      {editing === user.id ? <form onSubmit={(e) => void save(e, user)} className="grid gap-3 md:grid-cols-3">
        <label className="text-xs font-semibold">Name<input name="name" defaultValue={user.name} required className={input} /></label>
        <label className="text-xs font-semibold">Phone<input name="phone" defaultValue={user.phone ?? ""} className={input} /></label>
        <label className="text-xs font-semibold">Email<input name="email" type="email" defaultValue={user.email ?? ""} className={input} /></label>
        <label className="text-xs font-semibold">Username<input name="username" defaultValue={user.username ?? ""} className={input} /></label>
        <label className="text-xs font-semibold">Role<select name="role" defaultValue={user.role} className={input}>{["CUSTOMER", "BODABODA_RIDER", "BAJAJI_DRIVER", "ADMIN"].map((role) => <option key={role}>{role}</option>)}</select></label>
        <div className="flex items-end gap-2"><button className={primary} disabled={busy}>Save</button><button type="button" className={secondary} onClick={() => setEditing(null)}>Cancel</button></div>
      </form> : <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><h2 className="font-bold text-[#17645F]">{user.name}</h2><p className="mt-1 break-all text-xs text-[#122927]/65">{user.phone || "No phone"} · {user.email || user.username || "No email or username"}</p><p className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase"><span className="rounded-full bg-[#17645F]/10 px-2 py-1 text-[#17645F]">{user.role}</span><span className={`rounded-full px-2 py-1 ${user.status === "SUSPENDED" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>{user.status || "ACTIVE"}</span></p></div>
        <div className="flex gap-2"><button className={secondary} onClick={() => setEditing(user.id)}>Edit</button><button className={danger} disabled={busy || user.id === adminUser?.id} onClick={() => void remove(user)}>{user.status === "SUSPENDED" ? "Delete / disable" : "Delete account"}</button></div>
      </div>}
    </section>)}{!busy && filtered.length === 0 && <div className={panel}><p className="text-sm text-[#122927]/60">No matching users.</p></div>}</div>
  </main>;
}

export function AdminRidersDirectory() {
  const { notify } = useAdminPortal();
  const [riders, setRiders] = React.useState<RiderRow[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [editing, setEditing] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const load = React.useCallback(async () => {
    setBusy(true); setError("");
    try { const response = await fetch("/api/ops/admin-tools/riders", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.message || "Could not load Rider-Drivers."); setRiders(data.riders ?? []); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load Rider-Drivers."); }
    finally { setBusy(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);
  async function update(event: React.FormEvent<HTMLFormElement>, rider: RiderRow) {
    event.preventDefault(); setBusy(true); const fields = new FormData(event.currentTarget); const payload = Object.fromEntries(fields.entries());
    try { const response = await fetch(`/api/ops/admin-tools/riders/${rider.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const data = await response.json(); if (!response.ok) throw new Error(data.message || "Could not update account."); setEditing(null); await load(); notify("emerald", "Rider-Driver account updated."); }
    catch (err) { notify("rose", err instanceof Error ? err.message : "Could not update account."); setBusy(false); }
  }
  async function setStatus(rider: RiderRow, status: "ACTIVE" | "SUSPENDED") {
    if (status === "SUSPENDED" && !window.confirm(`Suspend ${rider.name}'s account and disable dispatch access?`)) return;
    setBusy(true);
    try { const response = await fetch(`/api/ops/admin-tools/riders/${rider.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) }); const data = await response.json(); if (!response.ok) throw new Error(data.message || "Could not change status."); await load(); notify("emerald", status === "SUSPENDED" ? "Rider-Driver suspended." : "Rider-Driver reactivated."); }
    catch (err) { notify("rose", err instanceof Error ? err.message : "Could not change status."); setBusy(false); }
  }
  async function remove(rider: RiderRow) {
    if (!window.confirm(`Delete ${rider.name}'s account? This blocks sign-in and dispatch while preserving trip and payment history.`)) return;
    setBusy(true);
    try { const response = await fetch(`/api/ops/admin-tools/riders/${rider.id}`, { method: "DELETE" }); const data = await response.json(); if (!response.ok) throw new Error(data.message || "Could not delete account."); await load(); notify("emerald", "Rider-Driver account disabled."); }
    catch (err) { notify("rose", err instanceof Error ? err.message : "Could not delete account."); setBusy(false); }
  }
  const filtered = riders.filter((r) => `${r.name} ${r.phone ?? ""} ${r.plateNumber ?? ""} ${r.homeKituo ?? ""} ${r.transportType}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
    <DirectoryHeader title="Rider-Drivers" subtitle="Fleet accounts and access" count={riders.length} onRefresh={() => void load()} busy={busy} />
    <input className={`${input} max-w-md`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, plate, kituo, or vehicle" aria-label="Search Rider-Drivers" />
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <div className="space-y-3">{filtered.map((rider) => <section className={panel} key={rider.id}>
      {editing === rider.id ? <form onSubmit={(e) => void update(e, rider)} className="grid gap-3 md:grid-cols-3">
        <label className="text-xs font-semibold">Full name<input name="fullName" defaultValue={rider.name} required className={input} /></label>
        <label className="text-xs font-semibold">Phone<input name="phone" defaultValue={rider.phone ?? ""} required className={input} /></label>
        <label className="text-xs font-semibold">Rider / Driver<select name="transportType" defaultValue={rider.transportType} className={input}><option value="BODABODA">Bodaboda Rider</option><option value="BAJAJI">Bajaji Driver</option></select></label>
        <label className="text-xs font-semibold">Vehicle plate<input name="plateNumber" defaultValue={rider.plateNumber ?? ""} className={input} /></label>
        <label className="text-xs font-semibold">Home kituo<input name="homeKituo" defaultValue={rider.homeKituo ?? ""} className={input} /></label>
        <div className="flex items-end gap-2"><button className={primary} disabled={busy}>Save</button><button type="button" className={secondary} onClick={() => setEditing(null)}>Cancel</button></div>
      </form> : <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0"><h2 className="font-bold text-[#17645F]">{rider.name}</h2><p className="mt-1 text-xs text-[#122927]/65">{rider.transportType === "BAJAJI" ? "Bajaji Driver" : "Bodaboda Rider"} · {rider.phone || "No phone"} · {rider.plateNumber || "No plate"} · {rider.homeKituo || "No kituo"}</p><p className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase"><span className="rounded-full bg-[#17645F]/10 px-2 py-1 text-[#17645F]">KYC {rider.kycStatus}</span><span className={`rounded-full px-2 py-1 ${rider.accountStatus === "SUSPENDED" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>{rider.accountStatus || "ACTIVE"}{rider.isOnline ? " · ONLINE" : ""}</span></p></div>
        <div className="flex flex-wrap gap-2"><button className={secondary} onClick={() => setEditing(rider.id)}>Edit</button><button className={secondary} disabled={busy} onClick={() => void setStatus(rider, rider.accountStatus === "SUSPENDED" ? "ACTIVE" : "SUSPENDED")}>{rider.accountStatus === "SUSPENDED" ? "Reactivate" : "Suspend"}</button><button className={danger} disabled={busy} onClick={() => void remove(rider)}>{rider.accountStatus === "SUSPENDED" ? "Delete / disable" : "Delete account"}</button></div>
      </div>}
    </section>)}{!busy && filtered.length === 0 && <div className={panel}><p className="text-sm text-[#122927]/60">No matching Rider-Drivers.</p></div>}</div>
  </main>;
}
