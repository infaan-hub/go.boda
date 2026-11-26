"use client";

import { TripsMonitorPanel } from "@/components/admin-panels-ops";
import { useAdminPortal } from "@/components/admin-portal-shell";

export default function AdminTripsPage() {
  const { data } = useAdminPortal();
  if (!data) return null;

  return <TripsMonitorPanel trips={data.trips} />;
}
