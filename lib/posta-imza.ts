/*
  ORTAK POSTA KUTUSU — HTML gövde ve kurum logolu imza (saf).

  Giden posta 10.10.2026'ya kadar yalnızca düz metindi; imza "-- "
  ayıracının altındaki birkaç satırdı. Kurum sahibinin kararı: imza
  kurum logosuyla, HTML olarak gitsin — müşteriye giden ilk izlenim bu.

  DÜZ METİN KALDIRILMIYOR. Mesaj multipart/alternative olarak iki
  biçimde birden gidiyor (bkz. posta-gonderim.ts): HTML'i göstermeyen
  kutuda (kurumsal Outlook kuralları, otomatik işleyen sistemler, metin
  istemcileri) yazışma yine okunur kalıyor. Yalnızca HTML göndermek o
  kutularda boş mesaj demekti.

  Burada ağ, veritabanı ve React yok: logo baytları ve kurum bilgisi
  dışarıdan geliyor — birim testten çağrılabilsin (tests/unit/posta-imza.test.ts).
*/

import { alintiBasligi, kisaltilmisAlinti } from "@/lib/posta-gonderim";

/*
  Logo mesajın İÇİNDE gidiyor (multipart/related + cid), uzaktaki
  adresten değil: Gmail ve Outlook uzak görselleri varsayılan olarak
  engelliyor ve imza, alıcı "görselleri göster"e basana kadar kırık bir
  kare olarak duruyordu. Gömülü görsel ilk açılışta görünüyor ve posta
  çevrimdışı okunduğunda da duruyor.
*/
export const LOGO_CID = "arvo-kurum-logosu";

/** İmzadaki logonun hedef yüksekliği ve en fazla genişliği (piksel). */
export const LOGO_YUKSEKLIK = 44;
export const LOGO_EN_COK_GENISLIK = 200;

const YAZI_TIPI = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const VARSAYILAN_RENK = "#e3e6ea";

/**
 * Metni HTML'e sokmadan kaçırır.
 *
 * Müşteriye giden gövdeyi personel yazıyor; içinde "<" geçen bir cümle
 * ("fiyat < 5.000 TL") kaçırılmazsa tarayıcı onu etiket başı sanıp
 * cümlenin kalanını yutuyor. Tırnak da kaçıyor: aynı fonksiyon href
 * değerlerinde de kullanılıyor.
 */
export function htmlKacis(metin: string): string {
  return (metin ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/*
  Bağlantılar tıklanabilir yapılıyor. Giden postanın çoğu bir teklif ya
  da sözleşme bağlantısı taşıyor; HTML parçada çıplak adres bazı
  istemcilerde düz metin olarak kalıyor ve müşteri adresi elle kopyalamak
  zorunda kalıyordu.

  Sondaki noktalama bağlantının dışında bırakılıyor: "…/teklif/abc."
  cümlesinde nokta adrese girerse bağlantı 404 veriyor.
*/
const ADRES_DESENI_HTML = /https?:\/\/[^\s<]+/g;
/* Kaçırılmış tırnak da kuyruğa giriyor: gövdedeki "…/teklif/abc" yazısı
   kaçıştan sonra &quot; ile bitiyor ve o altı karakter adrese girerse
   bağlantı bozuluyor. */
const KUYRUK_DESENI = /([.,;:!?)\]]|&quot;|&#39;)+$/;

export function baglantilandir(kacisli: string): string {
  return kacisli.replace(ADRES_DESENI_HTML, (bulunan) => {
    const kuyruk = bulunan.match(KUYRUK_DESENI)?.[0] ?? "";
    const adres = bulunan.slice(0, bulunan.length - kuyruk.length);
    if (!adres) return bulunan;
    return `<a href="${adres}" style="color:#1d6ef5">${adres}</a>${kuyruk}`;
  });
}

/** Düz metin paragrafları: kaçırılır, bağlantılanır, satır sonları <br> olur. */
export function metinHtml(metin: string): string {
  return baglantilandir(htmlKacis(metin ?? "")).replace(/\r?\n/g, "<br>");
}

/**
 * Marka rengi doğrulanır. Kurum ayarlarından serbest metin olarak
 * geliyor; doğrudan style'a yazmak ("red; background:url(…)") imzaya
 * başka bildirim sokardı. Geçersizse nötr griye düşülüyor — gönderimi
 * renk yüzünden durdurmak yanlış olurdu.
 */
export function markaRengi(ham: string | null | undefined): string {
  const sade = (ham ?? "").trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(sade) ? sade : VARSAYILAN_RENK;
}

/**
 * Logonun imzada görünecek ölçüsü.
 *
 * Ölçü HTML'e YAZILIYOR (width/height nitelikleri): Outlook'un Word
 * motoru yalnızca CSS ile verilen boyutu yoksayıp görseli özgün
 * boyutunda çiziyor ve 1200 pikselli bir logo imzayı mesajın tamamı
 * kadar büyütüyordu. Geniş (kelime) logolar yükseklik yerine genişlikten
 * sınırlanıyor; yoksa 44 piksel yükseklikte 900 piksel genişleyen bir
 * şerit oluyordu.
 */
export function logoOlcusu(ozgun: { en: number; boy: number } | null | undefined):
  { en: number; boy: number } | null {
  if (!ozgun || !(ozgun.en > 0) || !(ozgun.boy > 0)) return null;
  const oran = ozgun.en / ozgun.boy;
  let boy = LOGO_YUKSEKLIK;
  let en = Math.round(boy * oran);
  if (en > LOGO_EN_COK_GENISLIK) {
    en = LOGO_EN_COK_GENISLIK;
    boy = Math.max(1, Math.round(en / oran));
  }
  return { en, boy };
}

export type ImzaGirdisi = {
  /** İmzanın ilk satırı: yanıtı yazan personel (bkz. imzaliGovde). */
  gonderenAdi?: string | null;
  /** Kurum imzası; satır satır yazılıyor. */
  imza?: string | null;
  /** Gönderimde "cid:…", ekrandaki önizlemede logonun genel adresi. */
  logoSrc?: string | null;
  logoAlt?: string | null;
  logoOlculeri?: { en: number; boy: number } | null;
  renk?: string | null;
};

/**
 * İmza bloğu. Tablo kullanılıyor, flex ya da grid değil: Outlook'un
 * Word motoru ikisini de yoksayıyor ve logo ile metin üst üste biniyor.
 * Bütün biçim satır içi (inline) — Gmail <style> bloğunu siliyor.
 */
export function imzaHtml(girdi: ImzaGirdisi): string {
  const ad = (girdi.gonderenAdi ?? "").trim();
  const satirlar = (girdi.imza ?? "").split(/\r?\n/).map((satir) => satir.trim()).filter(Boolean);
  const kaynak = (girdi.logoSrc ?? "").trim();
  if (!ad && !satirlar.length && !kaynak) return "";

  const renk = markaRengi(girdi.renk);
  const olcu = logoOlcusu(girdi.logoOlculeri);
  const olcuNitelikleri = olcu ? ` width="${olcu.en}" height="${olcu.boy}"` : ` height="${LOGO_YUKSEKLIK}"`;
  const olcuBicimi = olcu ? `width:${olcu.en}px;height:${olcu.boy}px` : `height:${LOGO_YUKSEKLIK}px`;

  const logoHucresi = kaynak
    ? `<td style="padding:0 14px 0 0;vertical-align:middle">`
      + `<img src="${htmlKacis(kaynak)}" alt="${htmlKacis(girdi.logoAlt ?? "")}"${olcuNitelikleri}`
      + ` style="display:block;border:0;outline:none;text-decoration:none;${olcuBicimi}"></td>`
    : "";

  const metinHucresi = ad || satirlar.length
    ? `<td style="vertical-align:middle;border-left:3px solid ${renk};padding:2px 0 2px 14px;`
      + `font-family:${YAZI_TIPI};font-size:13px;line-height:1.5;color:#4a4f57">`
      + (ad ? `<div style="font-weight:600;color:#1b1f24">${htmlKacis(ad)}</div>` : "")
      + (satirlar.length ? `<div>${satirlar.map((satir) => metinHtml(satir)).join("<br>")}</div>` : "")
      + `</td>`
    : "";

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"`
    + ` style="border-collapse:collapse;margin:20px 0 0"><tr>${logoHucresi}${metinHucresi}</tr></table>`;
}

export type HtmlGovdeGirdisi = ImzaGirdisi & {
  govde: string;
  alinti?: {
    gonderenAd: string | null;
    gonderenAdres: string;
    tarih: Date | null;
    metin: string;
  } | null;
};

/**
 * Gönderilecek HTML gövde.
 *
 * Sıra düz metinle aynı: yanıt → imza → alıntı. İmza alıntının içinde
 * kalırsa her turda bir kopya daha birikiyor.
 *
 * Tam belge gönderiliyor (doctype + charset): Gmail <html> ve <body>
 * etiketlerini kendisi atıyor ama charset'i olmayan parçayı bazı
 * istemciler latin-1 sanıp Türkçe harfleri bozuyordu.
 */
export function htmlGovdesi(girdi: HtmlGovdeGirdisi): string {
  const imza = imzaHtml(girdi);
  const alintiMetni = (girdi.alinti?.metin ?? "").trim();
  const alinti = girdi.alinti && alintiMetni
    ? `<div style="margin:22px 0 6px;font-size:13px;color:#5b6069">${htmlKacis(alintiBasligi(girdi.alinti))}</div>`
      + `<blockquote style="margin:0;padding:0 0 0 12px;border-left:2px solid #d7dae0;color:#5b6069">`
      + `${metinHtml(kisaltilmisAlinti(alintiMetni))}</blockquote>`
    : "";

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1"></head>`
    + `<body style="margin:0;padding:0;background:#ffffff">`
    + `<div style="font-family:${YAZI_TIPI};font-size:14px;line-height:1.55;color:#1b1f24">`
    + `<div>${metinHtml(girdi.govde.replace(/\s+$/, ""))}</div>${imza}${alinti}`
    + `</div></body></html>`;
}

/*
  LOGO ADRESİ GÜVENLİ Mİ.

  Adres kurum ayarlarından geliyor ve SUNUCU onu indiriyor; indirileni de
  postaya gömüyor. Bu, kurumu yöneten birine sunucunun ağından bir şey
  çekip kendi postasına koyma yolu açıyor (bulut üst verisi 169.254.169.254,
  iç ağdaki bir servis). Yalnızca https ve genel adlar: IP yazılamıyor,
  localhost ve iç alan adları reddediliyor. Kurumların logosu bizim
  storage'ımızda (organization-assets) ya da kendi sitelerinde; ikisi de
  bu kuralın içinde kalıyor.
*/
const OZEL_ADLAR = /(^|\.)(localhost|local|internal|intranet|home|lan)$/i;

export function logoAdresiUygunMu(ham: string | null | undefined): boolean {
  const sade = (ham ?? "").trim();
  if (!sade) return false;
  let adres: URL;
  try {
    adres = new URL(sade);
  } catch {
    return false;
  }
  if (adres.protocol !== "https:") return false;
  const makine = adres.hostname.replace(/^\[|\]$/g, "");
  if (!makine.includes(".") || OZEL_ADLAR.test(makine)) return false;
  /* IP yazılmış: 169.254.169.254 ve 10.x gibi iç adresler bu kapıdan
     geçmesin diye sayısal ve altıgen gösterimlerin tamamı reddediliyor. */
  if (/^[0-9.]+$/.test(makine) || makine.includes(":")) return false;
  return true;
}

/*
  GÖRSELİN ÖZGÜN ÖLÇÜSÜ, baytlarından okunuyor.

  Ölçü imzaya yazılmak zorunda (bkz. logoOlcusu) ama sunucuda tarayıcı
  yok: görseli çözümleyecek bir kütüphane eklemek, yalnızca iki sayı
  için bağımlılık demekti. Üç biçimin başlığı sabit yerde duruyor:
  PNG'de IHDR, GIF'te ekran tanımı, JPEG'de SOF işaretçisi.

  WEBP okunmuyor (başlığı VP8/VP8L/VP8X'e göre üç ayrı yerde): o
  durumda yalnızca yükseklik yazılıyor ve en oranla çiziliyor —
  Outlook'ta logo biraz daha büyük görünebilir, bozulmaz.
*/
export function gorselOlculeri(veri: Buffer): { en: number; boy: number } | null {
  if (veri.length >= 24 && veri.toString("latin1", 1, 4) === "PNG") {
    return { en: veri.readUInt32BE(16), boy: veri.readUInt32BE(20) };
  }
  if (veri.length >= 10 && veri.toString("latin1", 0, 3) === "GIF") {
    return { en: veri.readUInt16LE(6), boy: veri.readUInt16LE(8) };
  }
  if (veri.length >= 4 && veri[0] === 0xff && veri[1] === 0xd8) {
    let yer = 2;
    while (yer + 9 < veri.length) {
      if (veri[yer] !== 0xff) { yer += 1; continue; }
      const isaret = veri[yer + 1];
      /* SOF0–SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15: çerçeve başlığı.
         Aradaki 0xC4/0xC8/0xCC başka şey (Huffman tabloları) — onları
         çerçeve sanmak boyutu baytların ortasından okumak olurdu. */
      const cerceve = isaret >= 0xc0 && isaret <= 0xcf
        && isaret !== 0xc4 && isaret !== 0xc8 && isaret !== 0xcc;
      if (cerceve) return { en: veri.readUInt16BE(yer + 7), boy: veri.readUInt16BE(yer + 5) };
      if (isaret === 0xd8 || isaret === 0x01 || (isaret >= 0xd0 && isaret <= 0xd7)) { yer += 2; continue; }
      if (isaret === 0xd9 || isaret === 0xda) return null;
      yer += 2 + veri.readUInt16BE(yer + 2);
    }
  }
  return null;
}

/*
  İMZA BOŞKEN KURUMUN KENDİ BİLGİLERİ.

  İmza serbest metin bir kutuydu ve doldurulmadığında giden postada
  kurumdan hiçbir iz kalmıyordu: yalnızca logo ve yazanın adı. Oysa
  kurumun adı, telefonu, e-postası ve sitesi Ayarlar'da zaten kayıtlı —
  aynı bilgiyi ikinci kez yazdırmak, yazılmayınca da imzasız posta
  göndermek demekti (10.10.2026).

  Kutuya bir şey yazılmışsa ona DOKUNULMUYOR: kurum imzasını kendi
  istediği gibi kuruyorsa (unvan, ek satır, yasal uyarı) altına bizim
  satırlarımızı eklemek onu bozardı.

  Adres "https://" olmadan yazılıyor: imzada şema gürültü, istemciler
  zaten bağlantıya çeviriyor.
*/
export function varsayilanImza(kurum: {
  ad?: string | null;
  eposta?: string | null;
  telefon?: string | null;
  web?: string | null;
}): string {
  const sade = (deger: string | null | undefined) => (deger ?? "").trim();
  const iletisim = [sade(kurum.eposta), sade(kurum.telefon)].filter(Boolean).join(" · ");
  const web = sade(kurum.web).replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return [sade(kurum.ad), iletisim, web].filter(Boolean).join("\n");
}
