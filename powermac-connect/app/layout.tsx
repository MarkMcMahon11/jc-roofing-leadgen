import type { Metadata, Viewport } from "next";
import { Exo_2, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex-sans", display: "swap" });
const exo = Exo_2({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-exo", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "PowerMac Connect", template: "%s · PowerMac Connect" },
  description: "One Connected Operation. Complete Business Intelligence.",
  robots: { index: false, follow: false },
  applicationName: "PowerMac Connect",
};

export const viewport: Viewport = {
  themeColor: "#020302",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${sans.variable} ${mono.variable} ${exo.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
