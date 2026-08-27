import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ArvoOS Yönetim Merkezi",
    short_name: "ArvoOS",
    description: "Kurumunuzun mobil yönetim ve operasyon merkezi.",
    start_url: "/panel",
    display: "standalone",
    background_color: "#f3f5f2",
    theme_color: "#0d335f",
    orientation: "portrait-primary",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
