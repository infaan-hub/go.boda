import { redirect } from "next/navigation";

export default function AdminRootIndexPage() {
  redirect("/admin/login");
}
