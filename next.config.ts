import type { NextConfig } from "next";
import { LEGACY_REDIRECTS, MARKETING_HOSTS } from "./lib/site/routes";
import { PRIVATE_PATH_PREFIXES } from "./lib/site/host-rules";

// Next, host değerini `^(?:...)$` olarak tam eşleştirir.
const MARKETING_HOST_PATTERN = MARKETING_HOSTS.map((host) => host.replace(/\./g, "\\.")).join("|");
const NOINDEX = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  // Eski ArvoOS kurumsal sayfaları → yeni ürün sayfaları (kalıcı).
  // Eski sayfaların İngilizcesi yoktu; yalnızca TR yolları yönlendirilir.
  async redirects() {
    return LEGACY_REDIRECTS.map(({ from, to }) => ({ source: from, destination: to, permanent: true }));
  },
  async headers() {
    return [
      // Panel hostu, kurum alan adları ve önizlemeler hiçbir zaman dizine girmez.
      { source: "/:path*", missing: [{ type: "host", value: MARKETING_HOST_PATTERN }], headers: NOINDEX },
      // Panel, müşteri belgeleri ve oturum yolları her hostta noindex.
      ...PRIVATE_PATH_PREFIXES.map((prefix) => ({ source: `${prefix}/:path*`, headers: NOINDEX })),
    ];
  },
};

export default nextConfig;
