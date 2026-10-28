import Link from "next/link";
import { ROUTES, type Locale, type PageId } from "@/lib/site/routes";
import { KISA } from "../_content/kisa";

const ITEMS: Record<Locale, [PageId, string][]> = {
  tr: [["arvoos", "Genel bakış"], ["arvoos-modules", "Modüller"], ["arvoos-industries", "Sektörler"], ["arvoos-solutions", "Çözümler"], ["arvoos-plans", "Paketler"]],
  en: [["arvoos", "Overview"], ["arvoos-modules", "Modules"], ["arvoos-industries", "Industries"], ["arvoos-solutions", "Solutions"], ["arvoos-plans", "Plans"]],
  de: [["arvoos", "Überblick"], ["arvoos-modules", "Module"], ["arvoos-industries", "Branchen"], ["arvoos-solutions", "Lösungen"], ["arvoos-plans", "Pakete"]],
  es: [["arvoos", "Visión general"], ["arvoos-modules", "Módulos"], ["arvoos-industries", "Sectores"], ["arvoos-solutions", "Soluciones"], ["arvoos-plans", "Planes"]],
  fr: [["arvoos", "Vue d’ensemble"], ["arvoos-modules", "Modules"], ["arvoos-industries", "Secteurs"], ["arvoos-solutions", "Solutions"], ["arvoos-plans", "Offres"]],
  ar: [["arvoos", "نظرة عامة"], ["arvoos-modules", "الوحدات"], ["arvoos-industries", "القطاعات"], ["arvoos-solutions", "الحلول"], ["arvoos-plans", "الباقات"]],
};

/** ArvoOS ve alt sayfalarının yapışkan alt gezinmesi. */
export function ArvoosSubnav({ locale, current }: { locale: Locale; current: PageId }) {
  return (
    <nav className="subnav" aria-label={KISA[locale].arvoosPages}>
      <ul>
        {ITEMS[locale].map(([id, label]) => (
          <li key={id}><Link href={ROUTES[id][locale]} aria-current={id === current ? "page" : undefined}>{label}</Link></li>
        ))}
      </ul>
    </nav>
  );
}
