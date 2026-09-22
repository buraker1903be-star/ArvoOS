"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

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
/*
  Menü dört gruba ayrıldı. Eskiden altı düz başlıktı ve hepsi "tüm
  kiracıları listele" eksenindeydi; kurucunun günü ise üç ayrı işten
  oluşuyor — kiracıyı yönetmek, parayı takip etmek, ürün erişimine
  bakmak.

  Kiracılar grubundaki iki süzgeç, "bugün kime bakmam gerek" sorusunun
  cevabını listeyi taramadan veriyor.

  Menüye yalnızca GERÇEKTEN bir yere giden öğe konuyor: boş sayfaya çıkan
  bir başlık, olmayandan kötü.
*/
const gruplar = [
  {
    ad: "Kiracılar",
    ogeler: [
      { href: "/panel/platform", label: "Tüm kiracılar", icon: "◇", tam: true },
      { href: "/panel/platform?filtre=kurulum", label: "Kurulum bekleyenler", icon: "◷" },
      { href: "/panel/platform?filtre=dikkat", label: "Dikkat gerektirenler", icon: "!" },
    ],
  },
  {
    ad: "Ticari",
    ogeler: [
      { href: "/panel/platform/licenses", label: "Lisans ve kota", icon: "▣" },
      { href: "/panel/platform/billing", label: "Abonelikler", icon: "₺" },
      { href: "/panel/platform/payments", label: "Ödeme onayları", icon: "✓" },
      { href: "/panel/platform/subscribers", label: "Bireysel aboneler", icon: "☺" },
    ],
  },
  {
    ad: "Ürün ve erişim",
    ogeler: [
      { href: "/panel/platform/moduller", label: "Modül matrisi", icon: "⊞" },
      { href: "/panel/platform/members", label: "Tüm üyeler", icon: "⚇" },
    ],
  },
] as const;

export function KonsolNavigasyon({ uygulamaAdresi }: { uygulamaAdresi: string }) {
  const pathname = usePathname();
  const parametreler = useSearchParams();
  const arama = parametreler.toString() ? `?${parametreler.toString()}` : "";

  return (
    <nav className="panel-nav panel-nav-v2" aria-label="Kurucu konsolu">
      <div className="panel-nav-groups">
        {gruplar.map((grup) => (
          <div key={grup.ad} className="konsol-grup">
            <span className="konsol-grup-ad">{grup.ad}</span>
            {grup.ogeler.map((oge) => {
              /*
                Süzgeçli bağlantılar aynı yola gidiyor; hangisinin aktif
                olduğunu adres değil süzgeç belirliyor. pathname ile
                karşılaştırmak üçünü birden aktif gösterirdi.
              */
              const [yol, sorgu] = oge.href.split("?");
              const aktif = yol === "/panel/platform"
                ? pathname === "/panel/platform" && (sorgu ? arama === `?${sorgu}` : !arama)
                : pathname.startsWith(yol);
              return (
                <Link
                  key={oge.href}
                  className={aktif ? "panel-nav-group-link active" : "panel-nav-group-link"}
                  href={oge.href}
                  title={oge.label}
                >
                  <i>{oge.icon}</i>
                  <span>{oge.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <a className="panel-nav-group-link" href={uygulamaAdresi} title="ArvoOS paneline geç">
        <i>↗</i>
        <span>Uygulamaya geç</span>
      </a>
    </nav>
  );
}
