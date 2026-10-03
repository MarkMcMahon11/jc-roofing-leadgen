import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          // Only this site and JC Roofing's own website may embed the quote form.
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://www.jcroofingdumfries.com; base-uri 'self'; form-action 'self'; object-src 'none'" },
        ],
      },
      {
        // the owner dashboard must never be shown inside another site (the quote form may be)
        source: "/admin/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" }],
      },
    ];
  },
};

export default nextConfig;
