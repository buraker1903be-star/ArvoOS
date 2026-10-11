/*
  ÖZEL ALAN ADI — kiracının panele kendi adresinden girmesi.

  Beyaz etiketin tamamı bu adrese bağlı: sekme başlığı, logo, PWA
  kısayolu ve giriş ekranı kurumun markasını ancak KENDİ alan adında
  gösteriyor (bkz. lib/login-branding.ts).

  Burada yalnızca saf kurallar var; Vercel çağrıları
  lib/vercel-domains.ts'te. Birim testi tests/unit/alan-adi.test.ts.
*/

/*
  İki parçalı uzantılar. "firma.com.tr" üç etiketli ama KÖK alan adı:
  etiket saymak Türkiye'de yanlış cevap verir ve kurumun kendi web
  sitesini panele yönlendirmesi uyarısız geçerdi.
*/
const IKI_PARCALI_UZANTILAR = [
  "com.tr", "net.tr", "org.tr", "gov.tr", "edu.tr", "av.tr", "bel.tr",
  "biz.tr", "gen.tr", "info.tr", "web.tr", "k12.tr", "tel.tr", "tsk.tr",
  "co.uk", "org.uk", "me.uk", "com.au", "net.au", "org.au", "co.nz",
  "com.br", "com.mx", "co.za", "com.cn", "co.jp",
];

export type AlanAdiTuru = "alt" | "kok" | "gecersiz";

/**
 * Girilen adres bir ALT alan adı mı (panel.firma.com) yoksa KÖK alan
 * adı mı (firma.com, firma.com.tr).
 */
export function alanAdiTuru(ham: string | null | undefined): AlanAdiTuru {
  const adres = (ham ?? "").trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!adres || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(adres)) return "gecersiz";
  const uzanti = IKI_PARCALI_UZANTILAR.find((aday) => adres.endsWith(`.${aday}`));
  const kokParcaSayisi = uzanti ? uzanti.split(".").length + 1 : 2;
  return adres.split(".").length > kokParcaSayisi ? "alt" : "kok";
}

/**
 * Kullanıcıya gösterilecek uyarı; sorun yoksa null.
 *
 * KÖK ALAN ADI ENGELLENMİYOR, UYARILIYOR: bazı kurumlar gerçekten
 * kök adresi panele vermek istiyor. Ama çoğu bunu farkında olmadan
 * yazıyor ve kendi web sitesini panele yönlendirmiş oluyor — geri
 * almak DNS yayılması kadar sürer, yani saatler.
 */
export function alanAdiUyarisi(ham: string | null | undefined): string | null {
  const adres = (ham ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!adres) return null;
  const tur = alanAdiTuru(adres);
  if (tur === "gecersiz") {
    return adres.includes(" ")
      ? "Adreste boşluk var. Yalnızca alan adını yazın: panel.firmaniz.com"
      : "Bunu bir alan adı olarak tanıyamadım. Örnek: panel.firmaniz.com";
  }
  if (tur === "kok") {
    return "Bu sizin KÖK alan adınız. Panele bağlarsanız bu adrese gelen herkes panele düşer — web siteniz varsa erişilemez olur. Genelde istenen bir alt alan adıdır: panel." + adres;
  }
  if (adres.startsWith("www.")) {
    return "www adresi çoğu kurumda web sitesinin kendisidir. Panel için ayrı bir ad daha güvenli: panel." + adres.replace(/^www\./, "");
  }
  return null;
}

/** Önerilen alt alan adı: kök adresin başına "panel." */
export function onerilenAlanAdi(ham: string | null | undefined): string | null {
  const adres = (ham ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  if (!adres || alanAdiTuru(adres) !== "kok") return null;
  return `panel.${adres}`;
}
