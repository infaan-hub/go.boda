import { redirect } from "next/navigation";

export default function AdminDispatchIndexPage() {
  redirect("/admin/dispatch/queue");
}
