import "@admin/app/globals.css";

export const metadata = {
  title: "Go.boda Admin",
  manifest: "/admin/manifest.webmanifest",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
