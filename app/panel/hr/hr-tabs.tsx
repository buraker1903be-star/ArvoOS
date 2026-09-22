import Link from "next/link";

// İnsan Kaynakları modülünün sekmeleri (diğer modüllerle aynı dil).
// Eskiden Prim, Gizlilik ve Hareketler yalnızca başlıktaki düğmelerle
// açılıyor, alt sayfalardan "← Personellere Dön" ile geri dönülüyordu.
// Her sekme, açtığı sayfanın kendi yetki kuralıyla görünür.
export type HrTabKey = "genel-bakis" | "personel" | "prim" | "prim-hesabi" | "gizlilik" | "hareketler";

type HrAccess = { membership: { role: string }; isPlatformOwner?: boolean };

/** Prim hesaplama: commissions/page.tsx ile aynı kural. */
export const canSeeCommissions = (access: HrAccess) =>
  Boolean(access.isPlatformOwner) || ["owner", "admin", "manager"].includes(access.membership.role);

/** Gizlilik sözleşmeleri ve personel hareketleri: ilgili sayfalarla aynı kural. */
export const canSeeHrRecords = (access: HrAccess) => ["owner", "admin", "manager"].includes(access.membership.role);

export function HrTabs({ active, access }: { active: HrTabKey; access: HrAccess }) {
  const tabs: { key: HrTabKey; href: string; label: string }[] = [
    { key: "genel-bakis", href: "/panel/hr/genel-bakis", label: "Genel Bakış" },
    { key: "personel", href: "/panel/hr", label: "Personel" },
    ...(canSeeCommissions(access)
      ? [
          { key: "prim" as const, href: "/panel/hr/commissions", label: "Prim Hesaplama" },
          { key: "prim-hesabi" as const, href: "/panel/hr/prim-hesabi", label: "Prim Hesabı" },
        ]
      : []),
    ...(canSeeHrRecords(access)
      ? [
          { key: "gizlilik" as const, href: "/panel/hr/confidentiality", label: "Gizlilik Sözleşmeleri" },
          { key: "hareketler" as const, href: "/panel/hr/activity", label: "Personel Hareketleri" },
        ]
      : []),
  ];
  return (
    <nav className="module-tabs" aria-label="İnsan Kaynakları bölümleri">
      {tabs.map((tab) => (
        <Link key={tab.key} href={tab.href} className={tab.key === active ? "active" : ""} aria-current={tab.key === active ? "page" : undefined}>{tab.label}</Link>
      ))}
    </nav>
  );
}
