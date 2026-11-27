"use client";

import { FinanceCompliancePanel } from "@admin/components/admin-panels-safety-finance";
import { useAdminPortal } from "@admin/components/admin-portal-shell";

export default function AdminFinancePage() {
  const { data } = useAdminPortal();
  if (!data) return null;

  return (
    <FinanceCompliancePanel
      finance={data.finance}
      helmetFlags={data.helmetFlags}
    />
  );
}
