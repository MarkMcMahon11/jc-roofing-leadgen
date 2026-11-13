import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PowerMac Connect",
    short_name: "PowerMac",
    description: "One Connected Operation. Complete Business Intelligence.",
    start_url: "/",
    display: "standalone",
    background_color: "#060a14",
    theme_color: "#060a14",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
