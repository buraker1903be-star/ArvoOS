"use client";

import { usePathname } from "next/navigation";
import { navigationGroups } from "./panel-navigation-config";

/**
 * Üst bar konum göstergesi.
 *
 * Eskiden burada `organization.name` yazıyordu — yani kurumun ticari unvanı
 * ("ARVOCULTURE GROUP TEKNOLOJİ SANAYİ VE TİCARET LTD.ŞTİ."). Kenar çubuğu
 * ise markayı ("AkademikMerkez") gösterdiği için aynı ekranda iki farklı
 * isim çıkıyor, panel yanlış kiracıyı açmış gibi görünüyordu.
 *
 * Artık üst bar iki şeyi söylüyor: hangi markadasınız, hangi bölümdesiniz.
 * Ticari unvan sözleşme ve faturaya ait; her ekranda durması gerekmiyor.
 */

const extraSections: Record<string, string> = {
  notifications: "Bildirimler",
  messages: "Mesajlar",
  settings: "Ayarlar",
  support: "Destek",
  billing: "Abonelik",
  platform: "Platform",
  accounts: "Cari Hesaplar",
  banking: "Banka",
  roller: "Roller",
  ekip: "Ekip",
  isler: "İşler",
  stok: "Stok",
  sevkiyat: "Sevkiyat",
  satinalma: "Satın Alma",
  organizasyon: "Organizasyon",
  aktivite: "Aktivite",
  onboarding: "Kurulum",
  finans: "Finans",
  confidentiality: "Gizlilik Sözleşmesi",
  "satis-siparisleri": "Satış Siparişleri",
};

function sectionLabel(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean); // ["panel", "crm", ...]
  const first = segments[1];
  if (!first) return "Ana Sayfa";

  const key = first.replaceAll("-", "_").toLowerCase();
  const group = navigationGroups.find(
    (candidate) => candidate.key === key || candidate.codes.includes(key),
  );
  if (group) return group.label;

  return extraSections[first] ?? "Panel";
}

export function PanelBreadcrumb({ brandName }: { brandName: string }) {
  const pathname = usePathname() ?? "/panel";
  return (
    <div className="panel-breadcrumb">
      <small>{brandName.toLocaleUpperCase("tr-TR")}</small>
      <b>{sectionLabel(pathname)}</b>
    </div>
  );
}
