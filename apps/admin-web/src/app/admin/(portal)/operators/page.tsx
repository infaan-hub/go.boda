"use client";

import { OperatorsKycPanel } from "@/components/admin-panels-ops";
import { useAdminPortal } from "@/components/admin-portal-shell";

export default function AdminOperatorsKycPage() {
  const { data, refreshOverview, notify } = useAdminPortal();
  if (!data) return null;

  return (
    <OperatorsKycPanel
      operators={data.operators}
      onMutated={refreshOverview}
      onNotify={notify}
    />
  );
}
