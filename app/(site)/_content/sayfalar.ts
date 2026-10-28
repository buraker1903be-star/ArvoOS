/*
  Bir dilin bütün sayfa içerikleri, PageId'ye göre (28.10.2026).

  Almanca, İspanyolca ve Fransızca bu kayıt defteriyle geldi: her dil
  `_content/<dil>/index.ts`'te tek bir SayfaIcerikleri dışa aktarıyor,
  sayfa dosyaları (`app/(site)/<dil>/…`) ortak görünümden
  (_views/sayfa.tsx) çiziliyor. Tip eksik sayfayı derlemede yakalıyor —
  bir dilde unutulmuş sayfa yayına çıkamıyor. Türkçe ve İngilizce eski
  sayfa dosyalarıyla duruyor; içerikleri aynı tiplerden.
*/
import type { ContactContent } from "./contact";
import type { HomeContent } from "./home";
import type { PrivacyContent } from "./privacy";
import type { PricingContent, ProductContent, SubContent } from "./types";

export type SayfaIcerikleri = {
  home: HomeContent;
  arvoos: ProductContent;
  "arvoos-modules": SubContent;
  "arvoos-industries": SubContent;
  "arvoos-solutions": SubContent;
  "arvoos-plans": SubContent;
  pricing: PricingContent;
  arvolab: ProductContent;
  randevu: ProductContent;
  services: SubContent;
  "web-design": SubContent;
  "seo-geo": SubContent;
  "custom-software": SubContent;
  about: SubContent;
  contact: ContactContent;
  privacy: PrivacyContent;
  "distance-sales": PrivacyContent;
  refund: PrivacyContent;
  delivery: PrivacyContent;
};
