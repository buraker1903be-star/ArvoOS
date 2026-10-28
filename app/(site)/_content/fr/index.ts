// Fransızca sayfa içerikleri, PageId'ye göre (sayfalar.ts → SayfaIcerikleri).
import type { SayfaIcerikleri } from "../sayfalar";
import { ABOUT_FR } from "./about";
import { ARVOLAB_FR } from "./arvolab";
import { ARVOOS_FR } from "./arvoos";
import { MODULES_FR } from "./arvoos-modules";
import { INDUSTRIES_FR, PLANS_FR, SOLUTIONS_FR } from "./arvoos-more";
import { CONTACT_FR } from "./contact";
import { CUSTOM_SOFTWARE_FR } from "./custom-software";
import { HOME_FR } from "./home";
import { DELIVERY_FR, DISTANCE_SALES_FR, REFUND_FR } from "./legal";
import { PRICING_FR } from "./pricing";
import { PRIVACY_FR } from "./privacy";
import { RANDEVU_FR } from "./randevu";
import { SEO_GEO_FR } from "./seo-geo";
import { SERVICES_FR, WEB_DESIGN_FR } from "./services";

export const ICERIK_FR: SayfaIcerikleri = {
  home: HOME_FR,
  arvoos: ARVOOS_FR,
  "arvoos-modules": MODULES_FR,
  "arvoos-industries": INDUSTRIES_FR,
  "arvoos-solutions": SOLUTIONS_FR,
  "arvoos-plans": PLANS_FR,
  pricing: PRICING_FR,
  arvolab: ARVOLAB_FR,
  randevu: RANDEVU_FR,
  services: SERVICES_FR,
  "web-design": WEB_DESIGN_FR,
  "seo-geo": SEO_GEO_FR,
  "custom-software": CUSTOM_SOFTWARE_FR,
  about: ABOUT_FR,
  contact: CONTACT_FR,
  privacy: PRIVACY_FR,
  "distance-sales": DISTANCE_SALES_FR,
  refund: REFUND_FR,
  delivery: DELIVERY_FR,
};
