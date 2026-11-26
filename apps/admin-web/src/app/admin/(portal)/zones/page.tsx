"use client";

import { ZonesTariffsPanel } from "@/components/admin-panels-ops";
import { useAdminPortal } from "@/components/admin-portal-shell";

export default function AdminZonesTariffsPage() {
  const { data, refreshOverview, notify } = useAdminPortal();
  if (!data) return null;

  return (
    <ZonesTariffsPanel
      tariffs={data.tariffs}
      promos={data.promos}
      landmarks={data.landmarks}
      onMutated={refreshOverview}
      onNotify={notify}
    />
  );
}
