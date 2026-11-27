import { AdminPortalShell } from "@admin/components/admin-portal-shell";

export default function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminPortalShell>{children}</AdminPortalShell>;
}
