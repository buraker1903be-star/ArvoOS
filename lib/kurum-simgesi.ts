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

  YAYIN BİZDEN (12.10.2026): simge kurumun kendi alan adında BİZİM
  adresimizden veriliyor (app/kurum-simgesi, app/favicon.ico). Eskiden
  sayfa etiketi doğrudan depo adresini gösteriyordu ve kök adresteki
  /favicon.ico (tarayıcıların ve arama motorlarının doğrudan istediği)
  hiç yoktu: sekmede bir an boş simge, arama sonucunda simgesiz kayıt.

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

/*
  Sunucu yalnızca KENDİ deposundaki kurum görselini indirir: ayar
  ekranının yüklediği dosya (organization-assets/<kurum>/favicon.*).
  Başka bir adres yazılmış olsa bile indirilmez — kullanıcıdan gelen
  adresi sunucuya indirtmek, kurumu yöneten birinin sunucunun ağındaki
  bir şeyi kendi alan adında yayınlatması demek (AGENTS.md, logo kuralı).
*/
export function depodakiSimgeMi(adres: string | null | undefined, supabaseUrl: string | null | undefined, kurumId: string): adres is string {
  if (!adres || !supabaseUrl) return false;
  try {
    const url = new URL(adres);
    const depo = new URL(supabaseUrl);
    return url.protocol === "https:" && url.host === depo.host
      && /^\/storage\/v1\/object\/public\/organization-assets\/[0-9a-f-]{36}\/favicon\.(png|jpg|webp)$/.test(url.pathname)
      && url.pathname.split("/")[6] === kurumId;
  } catch { return false; }
}

/** Önbellek anahtarı: simge ya da renk/ad değişince sekme yenisini çeker. */
export function simgeSurumu(marka: KurumMarkasi): string {
  const kaynak = marka.favicon_url ? marka.favicon_url : `${marka.name}|${marka.primary_color ?? ""}`;
  let h = 5381;
  for (let i = 0; i < kaynak.length; i++) h = ((h * 33) ^ kaynak.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export type KurumMarkasi = { name: string; primary_color: string | null; favicon_url?: string | null };

export const SIMGE_YOLU = "/kurum-simgesi";

/** Next metadata `icons` alanı: her zaman bizim adresimiz (yüklenen simge ya da baş harf oradan). */
export function kurumSimgeleri(marka: KurumMarkasi): { icon: string; apple?: string } {
  const adres = `${SIMGE_YOLU}?v=${simgeSurumu(marka)}`;
  return marka.favicon_url ? { icon: adres, apple: adres } : { icon: adres };
}

/** Ayar ekranındaki önizleme için baş harf simgesi (yükleme yokken). */
export function harfSimgesiAdresi(marka: KurumMarkasi): string {
  return `data:image/svg+xml,${encodeURIComponent(harfSimgesiSvg(marka.name, marka.primary_color))}`;
}
