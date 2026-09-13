import Link from "next/link";
import { ROUTES, type Locale, type PageId } from "@/lib/site/routes";

const ITEMS: Record<Locale, [PageId, string][]> = {
  tr: [["arvoos", "Genel bakış"], ["arvoos-modules", "Modüller"], ["arvoos-industries", "Sektörler"], ["arvoos-solutions", "Çözümler"], ["arvoos-plans", "Paketler"]],
  en: [["arvoos", "Overview"], ["arvoos-modules", "Modules"], ["arvoos-industries", "Industries"], ["arvoos-solutions", "Solutions"], ["arvoos-plans", "Plans"]],
};

/** ArvoOS ve alt sayfalarının yapışkan alt gezinmesi. */
export function ArvoosSubnav({ locale, current }: { locale: Locale; current: PageId }) {
  return (
    <nav className="subnav" aria-label={locale === "tr" ? "ArvoOS sayfaları" : "ArvoOS pages"}>
      <ul>
        {ITEMS[locale].map(([id, label]) => (
          <li key={id}><Link href={ROUTES[id][locale]} aria-current={id === current ? "page" : undefined}>{label}</Link></li>
        ))}
      </ul>
    </nav>
  );
}
