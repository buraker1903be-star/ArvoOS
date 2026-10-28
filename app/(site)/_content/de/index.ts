// Almanca sayfa içeriklerinin kayıt defteri (sayfalar.ts → SayfaIcerikleri).
import type { SayfaIcerikleri } from "../sayfalar";
import { ABOUT_DE } from "./about";
import { ARVOLAB_DE } from "./arvolab";
import { ARVOOS_DE } from "./arvoos";
import { MODULES_DE } from "./arvoos-modules";
import { INDUSTRIES_DE, PLANS_DE, SOLUTIONS_DE } from "./arvoos-more";
import { CONTACT_DE } from "./contact";
import { CUSTOM_SOFTWARE_DE } from "./custom-software";
import { HOME_DE } from "./home";
import { DELIVERY_DE, DISTANCE_SALES_DE, REFUND_DE } from "./legal";
import { PRICING_DE } from "./pricing";
import { PRIVACY_DE } from "./privacy";
import { RANDEVU_DE } from "./randevu";
import { SEO_GEO_DE } from "./seo-geo";
import { SERVICES_DE, WEB_DESIGN_DE } from "./services";

export const ICERIK_DE: SayfaIcerikleri = {
  home: HOME_DE,
  arvoos: ARVOOS_DE,
  "arvoos-modules": MODULES_DE,
  "arvoos-industries": INDUSTRIES_DE,
  "arvoos-solutions": SOLUTIONS_DE,
  "arvoos-plans": PLANS_DE,
  pricing: PRICING_DE,
  arvolab: ARVOLAB_DE,
  randevu: RANDEVU_DE,
  services: SERVICES_DE,
  "web-design": WEB_DESIGN_DE,
  "seo-geo": SEO_GEO_DE,
  "custom-software": CUSTOM_SOFTWARE_DE,
  about: ABOUT_DE,
  contact: CONTACT_DE,
  privacy: PRIVACY_DE,
  "distance-sales": DISTANCE_SALES_DE,
  refund: REFUND_DE,
  delivery: DELIVERY_DE,
};
