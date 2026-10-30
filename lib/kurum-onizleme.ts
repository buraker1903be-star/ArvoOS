/*
  KURUMUN BAĞLANTI ÖNİZLEMESİ (30.10.2026) — saf.

  Kurumun kendi alan adındaki kamusal sayfalar (takip, iş durumu, giriş,
  şifre ekranları) sekme başlığını ve simgesini kurumdan alıyordu ama
  openGraph/twitter alanlarını yazmıyordu. Next bu alanları kök
  yerleşimden (app/layout.tsx) devralıyor: kurum müşterisine
  app.akademikmerkez.com/takip gönderdiğinde WhatsApp önizlemesinde
  ArvoOS logosu ve "ArvoOS | Ürünler ve Dijital Hizmetler" çıkıyordu.

  Sayfa düzeyindeki openGraph kökünkünü BÜTÜNÜYLE değiştiriyor (alan
  alan birleşmiyor). Bu yüzden kurumun logosu yoksa görsel hiç
  verilmiyor: ArvoOS logosuna düşmek, düzeltilen hatanın kendisi olurdu.

  Kart türü "summary": görsel bir LOGO, geniş kapak görseli değil;
  "summary_large_image" yatay logoyu kırpıp büyütüyordu.
*/
import type { Metadata } from "next";

export type KurumOnizlemeGirdisi = {
  kurumAdi: string;
  logoUrl: string | null | undefined;
  baslik: string;
  aciklama: string;
  /** İsteğin kök adresi (https://app.kurum.com); göreli logo yolu buna göre çözülür. */
  koken: string;
  /** Sayfanın yolu (/takip); önizlemenin adresi. */
  yol?: string;
};

/** Logo adresini mutlak yapar; çözülemezse null (bozuk görsel yerine görselsiz önizleme). */
export function mutlakLogo(logoUrl: string | null | undefined, koken: string): string | null {
  const ham = logoUrl?.trim();
  if (!ham) return null;
  try {
    const adres = new URL(ham, koken);
    return adres.protocol === "https:" || adres.protocol === "http:" ? adres.toString() : null;
  } catch {
    return null;
  }
}

export function kurumOnizlemesi(g: KurumOnizlemeGirdisi): Pick<Metadata, "openGraph" | "twitter"> {
  const logo = mutlakLogo(g.logoUrl, g.koken);
  const url = g.yol ? new URL(g.yol, g.koken).toString() : undefined;
  return {
    openGraph: {
      title: g.baslik,
      description: g.aciklama,
      type: "website",
      siteName: g.kurumAdi,
      ...(url ? { url } : {}),
      ...(logo ? { images: [{ url: logo, alt: `${g.kurumAdi} logosu` }] } : {}),
    },
    twitter: {
      card: "summary",
      title: g.baslik,
      description: g.aciklama,
      ...(logo ? { images: [logo] } : {}),
    },
  };
}
