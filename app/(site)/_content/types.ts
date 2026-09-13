// Ürün / alt sayfa / hizmet sayfası içerik şekilleri (TR ve EN aynı şekli doldurur).
import type { PageId } from "@/lib/site/routes";
import type { Cta, QA } from "../_components/ui";

export type Meta = { title: string; description: string };
export type Card = { title: string; text: string; items?: string[]; href?: string };
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
