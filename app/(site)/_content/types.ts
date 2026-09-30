// Ürün / alt sayfa / hizmet sayfası içerik şekilleri (TR ve EN aynı şekli doldurur).
import type { PageId } from "@/lib/site/routes";
import type { PricedProduct } from "@/lib/site/pricing";
import type { Cta, QA } from "../_components/ui";

export type Meta = { title: string; description: string };
export type Card = {
  title: string; text: string; items?: string[]; href?: string;
  /** Bento: "hero" (2×2, arayüz parçasıyla) veya "wide" (2×1); yoksa küçük kutu */
  size?: "hero" | "wide";
  /** hero kutusu sağa yaslı */
  alt?: boolean;
  /** Kutudaki arayüz parçası (_components/frags.tsx) */
  visual?: "s0" | "s1" | "s2" | "s3" | "s4" | "s5" | "s6" | "web" | "seo" | "software";
};
export type Hero = { eyebrow: string; title: string; subtitle?: string; lead: string; actions: Cta[] };
export type Block = { eyebrow?: string; title: string; lead?: string };

export type ProductContent = {
  id: "arvoos" | "arvolab" | "arc";
  name: string;
  category: string;
  appUrl: string;
  featureList: string[];
  meta: Meta;
  hero: Hero;
  features: Block & { items: Card[] };
  flow?: Block & { steps: Card[]; cta?: Cta };
  audience: Block & { items: Card[]; more?: string };
  band?: Block & { items: string[] };
  faq: Block & { items: QA[] };
  cta: Block & { actions: Cta[] };
};

export type SubContent = {
  id: PageId;
  parent?: { id: PageId; name: string };
  meta: Meta;
  hero: Hero;
  cards: Block & { items: Card[]; cols?: "two" | "three" | "four"; numbered?: boolean };
  steps?: Block & { items: Card[] };
  band?: Block & { items: string[] };
  note?: string;
  faq: Block & { items: QA[] };
  cta: Block & { actions: Cta[] };
  /** Hizmet sayfaları için serviceLd adı */
  serviceName?: string;
  /** Organization JSON-LD eklensin mi (Hakkımızda) */
  org?: boolean;
};

/*
  Ücretler sayfası. RAKAM YOK: tutarlar lib/site/pricing.ts'ten okunur,
  buradaki `code` alanı karta hangi planın bağlandığını söyler. Metin ile
  rakamın ayrı durması, iki dilin fiyatının ayrışmasını imkânsız kılar.
*/
/** `name` YOKTUR: basamak adı pricing.ts'teki Plan.ad'dan gelir. */
export type PriceCard = { code: string; text: string; items: string[] };
export type PriceGroup = { product: PricedProduct; tag: string; lead: string; linkLabel: string; cards: PriceCard[] };
export type PricingContent = {
  id: PageId;
  meta: Meta;
  hero: Hero;
  /** Aylık / yıllık seçici ve yanındaki rozet. */
  cycle: { monthly: string; yearly: string; badge: string; perMonth: string; perYear: string; quote: string; quoteAction: string };
  vatNote: string;
  groups: PriceGroup[];
  addOns: Block & { items: { code: string; name: string; text: string }[]; quote: string };
  policy: Block & { items: { title: string; text: string }[]; links: Cta[] };
  faq: Block & { items: QA[] };
  cta: Block & { actions: Cta[] };
};
