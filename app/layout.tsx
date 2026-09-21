import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "JC Roofing Dumfries – Instant Roof Quote",
  description: "Trusted, local roofers in Dumfries & Galloway. Get a roof price in 2 minutes and book a free inspection.",
  icons: { icon: "/logo.png" },
  // Previews must not appear in Google. Set ALLOW_INDEXING=1 on the live site.
  robots: process.env.ALLOW_INDEXING === "1" ? { index: true, follow: true } : { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
