import "@partner/app/globals.css";
import { PwaRegistrar } from "@goboda/ui";

export const metadata = {
  title: "Go.boda Rider-Driver",
  manifest: "/partner/manifest.webmanifest",
};

export default function PartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <PwaRegistrar swPath="/partner/sw.js" />
      {children}
    </>
  );
}
