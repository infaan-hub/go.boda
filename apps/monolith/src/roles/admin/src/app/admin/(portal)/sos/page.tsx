"use client";

import { SosIncidentRoomPanel } from "@admin/components/admin-panels-safety-finance";
import { useAdminPortal } from "@admin/components/admin-portal-shell";

export default function AdminSosConsolePage() {
  const { data, refreshOverview, notify, playSosChime } = useAdminPortal();
  if (!data) return null;

  return (
    <SosIncidentRoomPanel
      sosAlerts={data.sosAlerts}
      onMutated={refreshOverview}
      onNotify={notify}
      onPlayChime={playSosChime}
    />
  );
}
