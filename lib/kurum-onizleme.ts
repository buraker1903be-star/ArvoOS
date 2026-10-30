/*
  KURUMUN BAĞLANTI ÖNİZLEMESİ (30.10.2026) — saf.

  Kurumun kendi alan adındaki kamusal sayfalar (takip, iş durumu, giriş,
  şifre ekranları) sekme başlığını ve simgesini kurumdan alıyordu ama
  openGraph/twitter alanlarını yazmıyordu. Next bu alanları kök
  yerleşimden (app/layout.tsx) devralıyor: kurum müşterisine
  app.akademikmerkez.com/takip gönderdiğinde WhatsApp önizlemesinde
  ArvoOS logosu ve "ArvoOS | Ürünler ve Dijital Hizmetler" çıkıyordu.

  Sayfa düzeyindeki openGraph kökünkünü BÜTÜNÜYLE değiştiriyor (alan
  alan birleşmiyor); kökün ArvoOS görseli hiçbir koşulda sızmıyor.

  GÖRSEL KARE: KURUMUN SEKME SİMGESİ (app/onizleme-gorseli). İlk sürüm
  logonun adresini doğrudan veriyordu ve WhatsApp yatay logoyu kırptı
  ("AkademikMe…", 30.10.2026). Kurum sahibinin isteğiyle önizleme
  favicon gibi kare: WhatsApp kare görseli mesajın yanında küçük bir
  simge olarak gösteriyor, kırpacak bir şey kalmıyor. Simge yoksa
  logo karenin içine sığdırılıyor, o da yoksa kurumun baş harfi —
  ArvoOS logosuna hiçbir koşulda düşmüyor.
*/
import type { Metadata } from "next";

export type KurumOnizlemeGirdisi = {
  kurumAdi: string;
  logoUrl: string | null | undefined;
  baslik: string;
  aciklama: string;
  /** İsteğin kök adresi (https://app.kurum.com); önizleme görselinin adresi buna göre kurulur. */
  koken: string;
  /** Sayfanın yolu (/takip); önizlemenin adresi. */
  yol?: string;
};

export const ONIZLEME_GORSELI_YOLU = "/onizleme-gorseli";
export const ONIZLEME_BOYUTU = { width: 600, height: 600 } as const;

/** Logo değişince önizleme yenisini çeksin (WhatsApp görseli adresine göre önbelleğe alıyor). */
export function onizlemeSurumu(logoUrl: string | null | undefined, kurumAdi: string): string {
  const kaynak = `${logoUrl ?? ""}|${kurumAdi}`;
  let h = 5381;
  for (let i = 0; i < kaynak.length; i += 1) h = ((h << 5) + h + kaynak.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function kurumOnizlemesi(g: KurumOnizlemeGirdisi): Pick<Metadata, "openGraph" | "twitter"> {
  const gorsel = new URL(`${ONIZLEME_GORSELI_YOLU}?v=${onizlemeSurumu(g.logoUrl, g.kurumAdi)}`, g.koken).toString();
  const url = g.yol ? new URL(g.yol, g.koken).toString() : undefined;
  return {
    openGraph: {
      title: g.baslik,
      description: g.aciklama,
      type: "website",
      siteName: g.kurumAdi,
      ...(url ? { url } : {}),
      images: [{ url: gorsel, ...ONIZLEME_BOYUTU, alt: `${g.kurumAdi} logosu` }],
    },
    twitter: { card: "summary", title: g.baslik, description: g.aciklama, images: [gorsel] },
  };
}

/** PNG ya da JPEG başlığından piksel boyutu; okunamazsa null. */
export function gorselBoyutu(b: Uint8Array): { genislik: number; yukseklik: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { genislik: v.getUint32(16), yukseklik: v.getUint32(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const isaret = b[i + 1];
      const uzunluk = (b[i + 2] << 8) | b[i + 3];
      // SOF0–SOF15 (DHT 0xC4, JPG 0xC8, DAC 0xCC hariç) boyutu taşır.
      if (isaret >= 0xc0 && isaret <= 0xcf && isaret !== 0xc4 && isaret !== 0xc8 && isaret !== 0xcc) {
        return { yukseklik: (b[i + 5] << 8) | b[i + 6], genislik: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + uzunluk;
    }
  }
  return null;
}

/** Logoyu kutuya oranını koruyarak sığdırır; küçük logo büyütülür (bulanık değil, vektörel değilse de okunur kalsın diye üst sınır 2×). */
export function sigdir(boyut: { genislik: number; yukseklik: number }, kutu: { genislik: number; yukseklik: number }) {
  const oran = Math.min(kutu.genislik / boyut.genislik, kutu.yukseklik / boyut.yukseklik, 2);
  return { genislik: Math.max(1, Math.round(boyut.genislik * oran)), yukseklik: Math.max(1, Math.round(boyut.yukseklik * oran)) };
}
