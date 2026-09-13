// arvo-os.com sayfa metadata'sı: canonical, hreflang, Open Graph ve Twitter
// kartı tek yardımcıdan üretilir. Her pazarlama sayfası bunu kullanır.
import type { Metadata } from "next";
import { ROUTES, absoluteUrl, alternatesFor, type Locale, type PageId } from "./routes";

const OG_LOCALE: Record<Locale, string> = { tr: "tr_TR", en: "en_US" };

export function siteMetadata({
  id,
  locale,
  title,
  description,
  absoluteTitle = false,
}: {
  id: PageId;
  locale: Locale;
  title: string;
  description: string;
  /** true: başlık "%s | Arvo" şablonuna girmez (ana sayfa gibi). */
  absoluteTitle?: boolean;
}): Metadata {
  const url = absoluteUrl(ROUTES[id][locale]);
  const fullTitle = absoluteTitle ? title : `${title} | Arvo`;
  const image = { url: `/og/${locale}/${id}`, width: 1200, height: 630, alt: fullTitle };
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: url, languages: alternatesFor(id), types: { "text/markdown": "/llms.txt" } },
    openGraph: {
      type: "website",
      siteName: "Arvo",
      locale: OG_LOCALE[locale],
      alternateLocale: OG_LOCALE[locale === "tr" ? "en" : "tr"],
      url,
      title: fullTitle,
      description,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [image.url] },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  };
}
