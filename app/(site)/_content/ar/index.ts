// Arapça sayfa içeriklerinin kayıt defteri (sayfalar.ts → SayfaIcerikleri).
import type { SayfaIcerikleri } from "../sayfalar";
import { ABOUT_AR } from "./about";
import { ARVOLAB_AR } from "./arvolab";
import { ARVOOS_AR } from "./arvoos";
import { MODULES_AR } from "./arvoos-modules";
import { INDUSTRIES_AR, PLANS_AR, SOLUTIONS_AR } from "./arvoos-more";
import { CONTACT_AR } from "./contact";
import { CUSTOM_SOFTWARE_AR } from "./custom-software";
import { HOME_AR } from "./home";
import { DELIVERY_AR, DISTANCE_SALES_AR, REFUND_AR } from "./legal";
import { PRICING_AR } from "./pricing";
import { PRIVACY_AR } from "./privacy";
import { RANDEVU_AR } from "./randevu";
import { SEO_GEO_AR } from "./seo-geo";
import { SERVICES_AR, WEB_DESIGN_AR } from "./services";

export const ICERIK_AR: SayfaIcerikleri = {
  home: HOME_AR,
  arvoos: ARVOOS_AR,
  "arvoos-modules": MODULES_AR,
  "arvoos-industries": INDUSTRIES_AR,
  "arvoos-solutions": SOLUTIONS_AR,
  "arvoos-plans": PLANS_AR,
  pricing: PRICING_AR,
  arvolab: ARVOLAB_AR,
  randevu: RANDEVU_AR,
  services: SERVICES_AR,
  "web-design": WEB_DESIGN_AR,
  "seo-geo": SEO_GEO_AR,
  "custom-software": CUSTOM_SOFTWARE_AR,
  about: ABOUT_AR,
  contact: CONTACT_AR,
  privacy: PRIVACY_AR,
  "distance-sales": DISTANCE_SALES_AR,
  refund: REFUND_AR,
  delivery: DELIVERY_AR,
};
