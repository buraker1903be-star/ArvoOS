import type { MetadataRoute } from "next";
import { LOCALES, PAGE_PRIORITY, ROUTES, absoluteUrl, alternatesFor, type PageId } from "@/lib/site/routes";

// Yalnızca pazarlama sayfaları (ROUTES). Panel, teklif, sözleşme, takip,
// durum, giriş ve API yolları burada ASLA yer almaz.

/** İçerik anlamlı biçimde değiştiğinde güncelleyin (her build'de değil). */
const CONTENT_UPDATED = new Date("2026-09-13T00:00:00.000Z");

const CHANGE_FREQUENCY: Partial<Record<PageId, MetadataRoute.Sitemap[number]["changeFrequency"]>> = {
  home: "weekly",
  arvoos: "weekly",
  arvolab: "weekly",
  arc: "weekly",
  privacy: "yearly",
  "distance-sales": "yearly",
  refund: "yearly",
  delivery: "yearly",
};

export default function sitemap(): MetadataRoute.Sitemap {
  return (Object.keys(ROUTES) as PageId[]).flatMap((id) =>
    LOCALES.map((locale) => ({
      url: absoluteUrl(ROUTES[id][locale]),
      lastModified: CONTENT_UPDATED,
      changeFrequency: CHANGE_FREQUENCY[id] ?? "monthly",
      priority: locale === "tr" ? PAGE_PRIORITY[id] : Math.round(PAGE_PRIORITY[id] * 0.9 * 100) / 100,
      alternates: { languages: alternatesFor(id) },
    })),
  );
}
