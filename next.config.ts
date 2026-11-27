import type { NextConfig } from "next";
import { LEGACY_REDIRECTS, MARKETING_HOSTS } from "./lib/site/routes";
import { PRIVATE_PATH_PREFIXES } from "./lib/site/host-rules";

// Next, host değerini `^(?:...)$` olarak tam eşleştirir.
const MARKETING_HOST_PATTERN = MARKETING_HOSTS.map((host) => host.replace(/\./g, "\\.")).join("|");
const NOINDEX = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

/*
  YEREL ÖNİZLEME (27.11.2026). `npm run onizleme` Supabase modüllerini
  sahte istemciyle değiştirir (scripts/onizleme/): bu depoda `.env` yok
  ve konsolun her rotası `isPlatformOwner` arkasında, yani Yönetim
  Merkezi geliştirme makinesinde hiç açılamıyordu.

  Bayrak açıkken ÜRETİM DERLEMESİ DURUR: sahte istemcinin canlıya
  çıkması her sorgunun "başarılı" görünüp hiçbir şey yazmaması demek.
*/
const ONIZLEME = process.env.ARVOOS_ONIZLEME === "1";
/*
  İZOLE ÜRETİM DENEMESİ (27.11.2026). Bazı hatalar yalnızca üretim
  derlemesinde görünüyor: geliştirme sunucusunun kendi Router'ı,
  Suspense davranışı ve ölü kod ayıklaması farklı. Yönlendirme
  hatasının üretimde de olup olmadığını görmek için önizlemeyi
  derleyip koşturmak gerekti.

  İKİ ayrı bayrak ARANIYOR ve ikincisinin adı ne işe yaradığını
  söylüyor: Vercel'de ne biri ne öteki tanımlı. Bayrak açıkken
  önizleme şeridi de ekranda duruyor, yani böyle bir derleme
  yanlışlıkla canlıya çıksa bile her sayfada "SİMÜLASYON" yazıyor.
*/
const URETIM_DENEMESI = process.env.ARVOOS_ONIZLEME_URETIM_DENEMESI === "1";
if (ONIZLEME && process.env.NODE_ENV === "production" && !URETIM_DENEMESI) {
  throw new Error(
    "ARVOOS_ONIZLEME üretim derlemesinde açık olamaz. " +
    "Yalnızca izole denemede ARVOOS_ONIZLEME_URETIM_DENEMESI=1 ile açılır.",
  );
}

const nextConfig: NextConfig = {
  ...(ONIZLEME
    ? {
        turbopack: {
          resolveAlias: {
            "@/lib/supabase/server": "./scripts/onizleme/server.ts",
            "@/lib/supabase/client": "./scripts/onizleme/client.ts",
            "@/lib/supabase/admin": "./scripts/onizleme/admin.ts",
            /* Ara katman oturumu çerezden çözüyor; önizlemede her panel
               isteği /login'e inerdi. */
            "@/lib/supabase/proxy": "./scripts/onizleme/proxy.ts",
            /* Konsol kabuğu yönetim host'una bağlı; önizlemede
               localhost da yönetim host'u sayılıyor. */
            "@/lib/site/host-rules": "./scripts/onizleme/host-rules.ts",
          },
        },
      }
    : {}),
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
