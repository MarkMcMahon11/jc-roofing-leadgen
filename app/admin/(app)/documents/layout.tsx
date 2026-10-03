import type { Metadata } from "next";

export const metadata: Metadata = { title: "Documents and deadlines" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
