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

  "Dikkat gerektirenler" menüden kalktı: aynı soruyu kiracı tablosunun
  kendi süzgeci yanıtlıyor ve satırdaki kırmızı kota hücresi zaten
  gösteriyor. Aynı yolu iki yerde tutmak, birinin sapması demek.

  Menüye yalnızca GERÇEKTEN bir yere giden öğe konuyor: boş sayfaya çıkan
  bir başlık, olmayandan kötü.
*/
const gruplar = [
  {
    ad: "Kiracılar",
    ogeler: [
      { href: "/panel/platform", label: "Kiracılar", icon: "◇", tam: true },
      { href: "/panel/platform?filtre=kurulum", label: "Kurulum bekleyenler", icon: "◷" },
    ],
  },
  {
    ad: "Ticari",
    ogeler: [
      { href: "/panel/platform/licenses", label: "Lisans ve kota", icon: "▣" },
      { href: "/panel/platform/sozlesmeler", label: "Onay bekleyen sözleşmeler", icon: "⎘" },
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
  const filtre = parametreler.get("filtre");

  return (
    <nav className="panel-nav panel-nav-v2" aria-label="Kurucu konsolu">
      {/* Ana sayfa gruplardan önce ve grup başlığı olmadan: kiracı
          panelindeki yeriyle aynı. Konsolun bir "eve dönüş" noktası yoktu;
          menü doğrudan kiracı listesiyle başlıyor, kurucunun ilk sorusu
          ("bugün neye bakmam gerek") hiçbir ekranda yanıtlanmıyordu. */}
      <Link className={pathname === "/panel" ? "panel-nav-home active" : "panel-nav-home"} href="/panel" title="Ana Sayfa">
        <i>⌂</i><span>Ana Sayfa</span>
      </Link>
      <div className="panel-nav-groups">
        {gruplar.map((grup) => (
          /* Grup başlığı yazılmıyor: menü daraltıldığında simgeler tek
             sütuna inerken başlık metni olduğu yerde kalıyor ve dar
             şeritte taşıyordu. Gruplar artık yalnızca aralık ve ince bir
             çizgiyle ayrılıyor; aria-label yerini söylemeye devam ediyor. */
          <div key={grup.ad} className="konsol-grup" role="group" aria-label={grup.ad}>
            {grup.ogeler.map((oge) => {
              /*
                Süzgeçli bağlantı aynı yola gidiyor; hangisinin aktif
                olduğunu adres değil SÜZGEÇ belirliyor. Tüm sorguyu
                karşılaştırmak, kiracı dosyasında (?organization=…)
                ikisini birden sönük bırakıyordu — kurucu bir kiracının
                içindeyken menüde nerede olduğunu göremiyordu.
              */
              const [yol, sorgu] = oge.href.split("?");
              const aktif = yol === "/panel/platform"
                ? pathname === "/panel/platform" && (sorgu ? sorgu === `filtre=${filtre}` : !filtre)
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
