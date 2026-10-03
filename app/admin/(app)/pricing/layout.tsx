import type { Metadata } from "next";

export const metadata: Metadata = { title: "Quote prices" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
