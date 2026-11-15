import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PowerMac Connect",
    short_name: "PowerMac",
    description: "One Connected Operation. Complete Business Intelligence.",
    start_url: "/",
    display: "standalone",
    background_color: "#020302",
    theme_color: "#020302",
    icons: [{ src: "/brand/pmj-icon.png", sizes: "256x256", type: "image/png" }],
  };
}
