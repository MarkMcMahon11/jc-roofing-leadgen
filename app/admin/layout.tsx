import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Owner page – JC Roofing",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
