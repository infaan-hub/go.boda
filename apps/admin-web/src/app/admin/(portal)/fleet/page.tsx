import { redirect } from "next/navigation";

export default function AdminFleetIndexPage() {
  redirect("/admin/fleet/telemetry");
}
