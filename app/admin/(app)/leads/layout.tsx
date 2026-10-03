import type { Metadata } from "next";

export const metadata: Metadata = { title: "Leads and quotes" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
