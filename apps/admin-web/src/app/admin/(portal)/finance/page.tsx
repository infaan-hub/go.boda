"use client";

import { FinanceCompliancePanel } from "@/components/admin-panels-safety-finance";
import { useAdminPortal } from "@/components/admin-portal-shell";

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
