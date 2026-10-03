import type { Metadata } from "next";

export const metadata: Metadata = { title: "Project map" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
