import Link from "next/link";

/*
  Kurucu konsolunun sekmeleri.

  Alt sayfalar (lisans, abonelik, üyeler, ödemeler) birbirine yalnızca
  platform ana sayfasından bağlanıyordu: bir alt sayfaya girdikten sonra
  diğerine geçmek için her seferinde geri dönmek gerekiyordu. Kurucu
  bunların arasında gün içinde defalarca gidip geliyor.

  "Kurumlar" ana sayfanın kendisi: kurum seçimi ve kurum ayarları orada.
*/
const sekmeler = [
  { key: "kurumlar", href: "/panel/platform", label: "Kurumlar" },
  { key: "lisans", href: "/panel/platform/licenses", label: "Lisans ve kota" },
  { key: "abonelikler", href: "/panel/platform/billing", label: "Abonelikler" },
  { key: "aboneler", href: "/panel/platform/subscribers", label: "Bireysel aboneler" },
  { key: "uyeler", href: "/panel/platform/members", label: "Tüm üyeler" },
  { key: "odemeler", href: "/panel/platform/payments", label: "Ödeme onayları" },
] as const;

export type PlatformTabKey = (typeof sekmeler)[number]["key"];

export function PlatformTabs({ active, bekleyenOdeme }: { active: PlatformTabKey; bekleyenOdeme?: number }) {
  return (
    <div className="module-tabs">
      {sekmeler.map((sekme) => (
        <Link
          key={sekme.key}
          href={sekme.href}
          className={sekme.key === active ? "active" : ""}
          aria-current={sekme.key === active ? "page" : undefined}
        >
          {sekme.label}
          {/* Bekleyen ödeme sayısı sekmede duruyor: kurucu hangi sayfada
              olursa olsun onay bekleyen bir ödeme olduğunu görsün. */}
          {sekme.key === "odemeler" && bekleyenOdeme ? <span className="plt-count">{bekleyenOdeme}</span> : null}
        </Link>
      ))}
    </div>
  );
}
