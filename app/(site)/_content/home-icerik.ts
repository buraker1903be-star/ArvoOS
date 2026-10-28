// Dil başına ana sayfa içeriği. Ana sayfanın "global" bölümü (rozetler,
// "her yerde çalışır" şeridi, başlangıç fiyatı yazımı) ürün ve ücretler
// sayfalarında da gösteriliyor (28.10.2026); metin ana sayfada TEK
// yerde duruyor, öteki sayfalar oradan okuyor — iki kopya olsaydı biri
// değişince diğeri eski kalırdı.
import type { Locale } from "@/lib/site/routes";
import { ICERIK_AR } from "./ar";
import { ICERIK_DE } from "./de";
import { ICERIK_ES } from "./es";
import { ICERIK_FR } from "./fr";
import { HOME_TR, type HomeContent } from "./home";
import { HOME_EN } from "./home-en";

export const HOME_ICERIGI: Record<Locale, HomeContent> = {
  tr: HOME_TR, en: HOME_EN, de: ICERIK_DE.home, es: ICERIK_ES.home, fr: ICERIK_FR.home, ar: ICERIK_AR.home,
};
