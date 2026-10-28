import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ICERIK_DE } from "@/app/(site)/_content/de";
import { ICERIK_ES } from "@/app/(site)/_content/es";
import { ICERIK_FR } from "@/app/(site)/_content/fr";
import { ICERIK_AR } from "@/app/(site)/_content/ar";
import type { SayfaIcerikleri } from "@/app/(site)/_content/sayfalar";
import { HOME_EN } from "@/app/(site)/_content/home-en";
import { ARVOOS_EN } from "@/app/(site)/_content/arvoos-en";
import { MODULES_EN } from "@/app/(site)/_content/arvoos-modules-en";
import { INDUSTRIES_EN, PLANS_EN, SOLUTIONS_EN } from "@/app/(site)/_content/arvoos-more-en";
import { PRICING_EN } from "@/app/(site)/_content/pricing-en";
import { ARVOLAB_EN } from "@/app/(site)/_content/arvolab-en";
import { RANDEVU_EN } from "@/app/(site)/_content/randevu-en";
import { SERVICES_EN, WEB_DESIGN_EN } from "@/app/(site)/_content/services-en";
import { SEO_GEO_EN } from "@/app/(site)/_content/seo-geo-en";
import { CUSTOM_SOFTWARE_EN } from "@/app/(site)/_content/custom-software-en";
import { ABOUT_EN } from "@/app/(site)/_content/about-en";
import { CONTACT_EN } from "@/app/(site)/_content/contact-en";
import { PRIVACY_EN } from "@/app/(site)/_content/privacy-en";
import { DELIVERY_EN, DISTANCE_SALES_EN, REFUND_EN } from "@/app/(site)/_content/legal";
import { LOCALES, ROUTES, resolvePath, type Locale } from "@/lib/site/routes";

/*
  Almanca, İspanyolca, Fransızca ve Arapça (28.10.2026) İngilizceden çevrildi.
  Çeviri METNİ değiştirir, YAPIYI değil: aynı alanlar, aynı kart sayısı,
  aynı kimlik/kod/görsel değerleri. Bir dilde eksik bir SSS ya da yanlış
  sıradaki bir fiyat kartı derlemede görünmez (tipler yalnızca şekle
  bakar), sayfada sessizce eksik çıkar. Bağlantılar da o dilin kendi
  sayfalarına gitmeli: Almanca sayfadan İngilizce sayfaya atlamak, okuru
  bir tıklamada dil değiştirmeye zorlar.
*/
const EN: SayfaIcerikleri = {
  home: HOME_EN, arvoos: ARVOOS_EN, "arvoos-modules": MODULES_EN, "arvoos-industries": INDUSTRIES_EN,
  "arvoos-solutions": SOLUTIONS_EN, "arvoos-plans": PLANS_EN, pricing: PRICING_EN, arvolab: ARVOLAB_EN,
  randevu: RANDEVU_EN, services: SERVICES_EN, "web-design": WEB_DESIGN_EN, "seo-geo": SEO_GEO_EN,
  "custom-software": CUSTOM_SOFTWARE_EN, about: ABOUT_EN, contact: CONTACT_EN, privacy: PRIVACY_EN,
  "distance-sales": DISTANCE_SALES_EN, refund: REFUND_EN, delivery: DELIVERY_EN,
};
const DILLER: [Locale, SayfaIcerikleri][] = [["de", ICERIK_DE], ["es", ICERIK_ES], ["fr", ICERIK_FR], ["ar", ICERIK_AR]];

/* Metin olmayan alanlar birebir aynı kalmalı (kimlik, kod, görsel, düzen). */
const SABIT = new Set(["id", "code", "size", "visual", "variant", "product", "category", "external", "appUrl", "tone"]);

function karsilastir(en: unknown, ceviri: unknown, yol: string, hatalar: string[]) {
  if (Array.isArray(en)) {
    if (!Array.isArray(ceviri)) return void hatalar.push(`${yol}: dizi değil`);
    // Hukuki metinler çeviriye bir "çeviri notu" paragrafı ekliyor; yalnızca orada fazlalık serbest.
    const notSerbest = /\.sections\[0\]\.p$/.test(yol);
    if (ceviri.length !== en.length && !(notSerbest && ceviri.length === en.length + 1)) hatalar.push(`${yol}: ${en.length} öğe yerine ${ceviri.length}`);
    const kayma = notSerbest && ceviri.length === en.length + 1 ? 1 : 0;
    en.forEach((x, i) => karsilastir(x, ceviri[i + kayma], `${yol}[${i}]`, hatalar));
    return;
  }
  if (en && typeof en === "object") {
    if (!ceviri || typeof ceviri !== "object") return void hatalar.push(`${yol}: nesne değil`);
    // Hukuki metnin ilk bölümünde paragraf yoksa çeviri notu için "p" açılabilir.
    const ek = /\.sections\[0\]$/.test(yol) && !("p" in en) ? ["p"] : [];
    const a = Object.keys(en).sort().join(","), b = Object.keys(ceviri).filter((k) => !ek.includes(k)).sort().join(",");
    if (a !== b) hatalar.push(`${yol}: alanlar farklı (${a} / ${b})`);
    for (const k of Object.keys(en)) {
      const e = (en as Record<string, unknown>)[k], c = (ceviri as Record<string, unknown>)[k];
      if (SABIT.has(k)) { if (e !== c) hatalar.push(`${yol}.${k}: ${String(e)} ≠ ${String(c)}`); }
      else karsilastir(e, c, `${yol}.${k}`, hatalar);
    }
    return;
  }
  if (typeof en !== typeof ceviri) hatalar.push(`${yol}: tür farklı`);
  else if (typeof en === "string" && en.trim() && !String(ceviri).trim()) hatalar.push(`${yol}: boş çeviri`);
}

function hrefler(x: unknown, out: string[] = []): string[] {
  if (Array.isArray(x)) x.forEach((y) => hrefler(y, out));
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) {
    if (k === "href" && typeof v === "string") out.push(v);
    else hrefler(v, out);
  }
  return out;
}

describe("çevrilmiş diller İngilizceyle aynı yapıda", () => {
  for (const [dil, icerik] of DILLER) {
    test(`${dil}: her sayfanın yapısı ve sabit alanları İngilizceyle aynı`, () => {
      const hatalar: string[] = [];
      for (const id of Object.keys(EN) as (keyof SayfaIcerikleri)[]) karsilastir(EN[id], icerik[id], `${dil}.${id}`, hatalar);
      assert.deepEqual(hatalar, []);
    });

    test(`${dil}: iç bağlantılar aynı dilin sayfalarına gider`, () => {
      const yanlis: string[] = [];
      for (const [id, sayfa] of Object.entries(icerik)) {
        for (const href of hrefler(sayfa)) {
          if (/^(https?:|mailto:|#)/.test(href)) continue;
          const yol = href.split(/[?#]/)[0];
          const hedef = resolvePath(yol);
          if (!hedef || hedef.locale !== dil) yanlis.push(`${id}: ${href}`);
        }
      }
      assert.deepEqual(yanlis, []);
    });
  }

  test("her dilin ana sayfası ve rota kökü kendi önekinde", () => {
    for (const dil of LOCALES) {
      if (dil === "en") continue;
      for (const yol of Object.values(ROUTES).map((r) => r[dil])) assert.ok(yol === `/${dil}` || yol.startsWith(`/${dil}/`), `${dil}: ${yol}`);
    }
  });
});
