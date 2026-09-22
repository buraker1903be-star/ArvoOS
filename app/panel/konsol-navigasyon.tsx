"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/*
  Kurucu konsolunun kenar menüsü (yalnızca yonetim.arvo-os.com).

  Normal panel menüsü müşteri modüllerini (CRM, Operasyon, Finans, İK…)
  çiziyor. Yönetim alan adında bunların hepsi diğer alan adına sıçradığı
  için menü baştan sona yanıltıcıydı: kurucu tıklıyor, uygulama alan adına
  atılıyor ve konsoldan çıkmış oluyordu.

  Burada yalnızca platformun kendi bölümleri var. "Uygulamaya geç"
  bilinçli olarak en altta ve ayrı duruyor: konsoldan çıkmak bir karar
  olmalı, yanlışlıkla tıklanan bir menü öğesi değil.
*/
const bolumler = [
  { href: "/panel/platform", label: "Kurumlar", icon: "◇" },
  { href: "/panel/platform/licenses", label: "Lisans ve kota", icon: "▣" },
  { href: "/panel/platform/billing", label: "Abonelikler", icon: "₺" },
  { href: "/panel/platform/subscribers", label: "Bireysel aboneler", icon: "☺" },
  { href: "/panel/platform/members", label: "Tüm üyeler", icon: "⚇" },
  { href: "/panel/platform/payments", label: "Ödeme onayları", icon: "✓" },
] as const;

export function KonsolNavigasyon({ uygulamaAdresi }: { uygulamaAdresi: string }) {
  const pathname = usePathname();

  return (
    <nav className="panel-nav panel-nav-v2" aria-label="Kurucu konsolu">
      <div className="panel-nav-groups">
        {bolumler.map((bolum) => {
          // "Kurumlar" konsolun kökü; alt sayfalar onu aktif göstermesin.
          const aktif = bolum.href === "/panel/platform"
            ? pathname === "/panel/platform"
            : pathname.startsWith(bolum.href);
          return (
            <Link
              key={bolum.href}
              className={aktif ? "panel-nav-group-link active" : "panel-nav-group-link"}
              href={bolum.href}
              title={bolum.label}
            >
              <i>{bolum.icon}</i>
              <span>{bolum.label}</span>
            </Link>
          );
        })}
      </div>
      <a className="panel-nav-group-link" href={uygulamaAdresi} title="ArvoOS paneline geç">
        <i>↗</i>
        <span>Uygulamaya geç</span>
      </a>
    </nav>
  );
}
