import { notFound } from "next/navigation";
import {
  AdminRidersDirectory,
  AdminUsersDirectory,
} from "@admin/components/admin-account-directories";

export default async function AdminDirectoryPage({
  params,
}: {
  params: Promise<{ directory: string }>;
}) {
  const { directory } = await params;
  if (directory === "users") return <AdminUsersDirectory />;
  if (directory === "riders") return <AdminRidersDirectory />;
  notFound();
}
