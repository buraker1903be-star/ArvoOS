// İspanyolca sayfa içerikleri, PageId'ye göre (sayfalar.ts → SayfaIcerikleri).
import type { SayfaIcerikleri } from "../sayfalar";
import { ABOUT_ES } from "./about";
import { ARVOLAB_ES } from "./arvolab";
import { ARVOOS_ES } from "./arvoos";
import { MODULES_ES } from "./arvoos-modules";
import { INDUSTRIES_ES, PLANS_ES, SOLUTIONS_ES } from "./arvoos-more";
import { CONTACT_ES } from "./contact";
import { CUSTOM_SOFTWARE_ES } from "./custom-software";
import { HOME_ES } from "./home";
import { DELIVERY_ES, DISTANCE_SALES_ES, REFUND_ES } from "./legal";
import { PRICING_ES } from "./pricing";
import { PRIVACY_ES } from "./privacy";
import { RANDEVU_ES } from "./randevu";
import { SEO_GEO_ES } from "./seo-geo";
import { SERVICES_ES, WEB_DESIGN_ES } from "./services";

export const ICERIK_ES: SayfaIcerikleri = {
  home: HOME_ES,
  arvoos: ARVOOS_ES,
  "arvoos-modules": MODULES_ES,
  "arvoos-industries": INDUSTRIES_ES,
  "arvoos-solutions": SOLUTIONS_ES,
  "arvoos-plans": PLANS_ES,
  pricing: PRICING_ES,
  arvolab: ARVOLAB_ES,
  randevu: RANDEVU_ES,
  services: SERVICES_ES,
  "web-design": WEB_DESIGN_ES,
  "seo-geo": SEO_GEO_ES,
  "custom-software": CUSTOM_SOFTWARE_ES,
  about: ABOUT_ES,
  contact: CONTACT_ES,
  privacy: PRIVACY_ES,
  "distance-sales": DISTANCE_SALES_ES,
  refund: REFUND_ES,
  delivery: DELIVERY_ES,
};
