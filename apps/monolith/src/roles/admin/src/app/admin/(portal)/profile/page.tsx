"use client";

import { CircleUserRound, ShieldCheck } from "lucide-react";
import { useAdminPortal } from "@admin/components/admin-portal-shell";

export default function AdminProfilePage() {
  const { adminUser, locale } = useAdminPortal();
  const sw = locale === "sw";

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <header className="border-b border-[#17645F]/15 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#17645F]/75">
          {sw ? "AKAUNTI YA UENDESHAJI" : "OPERATIONS ACCOUNT"}
        </p>
        <h1 className="mt-1 flex items-center gap-2 font-display text-3xl uppercase text-[#17645F]">
          <CircleUserRound className="h-6 w-6" />
          {sw ? "WASIFU" : "PROFILE"}
        </h1>
      </header>

      <section className="rounded-2xl border border-[#17645F]/15 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center gap-4 border-b border-[#17645F]/10 pb-5">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#17645F] font-display text-xl uppercase text-[#F3EEE8]">
            {adminUser?.name.slice(0, 1) ?? "G"}
          </span>
          <div>
            <h2 className="font-display text-2xl uppercase text-[#17645F]">
              {adminUser?.name ?? (sw ? "Msimamizi" : "Administrator")}
            </h2>
            <p className="text-sm text-[#122927]/60">
              {sw ? "Msimamizi wa Go.boda" : "Go.boda Operations Admin"}
            </p>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#122927]/50">
              {sw ? "JINA" : "NAME"}
            </dt>
            <dd className="mt-1 font-semibold">{adminUser?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#122927]/50">
              {sw ? "SIMU" : "PHONE"}
            </dt>
            <dd className="mt-1 font-semibold">{adminUser?.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#122927]/50">
              {sw ? "NAFASI" : "ROLE"}
            </dt>
            <dd className="mt-1 flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-[#17645F]" />
              {adminUser?.role ?? "ADMIN"}
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
