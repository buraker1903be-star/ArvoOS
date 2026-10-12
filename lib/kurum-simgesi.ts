import { readableOn } from "./tenant-theme";

/*
  KURUMUN SEKME SİMGESİ (12.10.2026).

  Kendi alan adındaki kurumun sekmesinde logosu görünüyordu. Logo
  çoğunlukla yatay (simge + yazı) ve tarayıcı onu 16×16'lık kareye
  sıkıştırıyor: sekmede okunmayan ince bir şerit kalıyordu.

  Sıra: kurumun yüklediği kare simge (organizations.favicon_url); yoksa
  kurumun baş harfi, kendi renginin üstünde. Logo artık sekmede
  kullanılmıyor — sıkıştırılmış logo, hiç simge olmamasından kötü.

  Panel, giriş, şifre ve iş durumu sayfaları aynı kuralı buradan alır
  (eskiden beş dosyada `icons: { icon: marka.logo_url }` vardı).

  Saf modül: birim testi tests/unit/kurum-simgesi.test.ts.
*/

const VARSAYILAN_RENK = "#8e6d33";
const RENK = /^#[0-9a-fA-F]{6}$/;

/** Adın ilk harfi ya da rakamı, Türkçe büyük harfle ("ışık" → "I", "istanbul" → "İ"). */
export function basHarf(ad: string | null | undefined): string {
  const ilk = (ad ?? "").match(/[\p{L}\p{N}]/u)?.[0];
  return ilk ? ilk.toLocaleUpperCase("tr-TR") : "•";
}

/** Baş harf simgesi (SVG metni). Renk geçersizse panelin vurgusu. */
export function harfSimgesiSvg(ad: string | null | undefined, renk: string | null | undefined): string {
  const zemin = renk && RENK.test(renk) ? renk : VARSAYILAN_RENK;
  const yazi = readableOn(zemin);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`
    + `<rect width="64" height="64" rx="14" fill="${zemin}"/>`
    + `<text x="32" y="44" text-anchor="middle" font-family="Inter,Segoe UI,Helvetica,Arial,sans-serif" font-size="36" font-weight="700" fill="${yazi}">${basHarf(ad)}</text>`
    + `</svg>`;
}

/** Yalnızca https adresi kabul edilir; başka her şey (javascript:, data:) yok sayılır. */
const httpsMi = (adres: string | null | undefined): adres is string => {
  if (!adres) return false;
  try { return new URL(adres).protocol === "https:"; } catch { return false; }
};

export type KurumMarkasi = { name: string; primary_color: string | null; favicon_url?: string | null };

/** Next metadata `icons` alanı. */
export function kurumSimgeleri(marka: KurumMarkasi): { icon: string; apple?: string } {
  if (httpsMi(marka.favicon_url)) return { icon: marka.favicon_url, apple: marka.favicon_url };
  return { icon: `data:image/svg+xml,${encodeURIComponent(harfSimgesiSvg(marka.name, marka.primary_color))}` };
}
