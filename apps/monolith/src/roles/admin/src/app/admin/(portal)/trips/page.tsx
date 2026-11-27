"use client";

import { TripsMonitorPanel } from "@admin/components/admin-panels-ops";
import { useAdminPortal } from "@admin/components/admin-portal-shell";

export default function AdminTripsPage() {
  const { data } = useAdminPortal();
  if (!data) return null;

  return <TripsMonitorPanel trips={data.trips} />;
}
