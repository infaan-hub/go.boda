import { redirect } from "next/navigation";

export default function PartnerRegisterRedirectPage() {
  redirect("/partner/login");
}
