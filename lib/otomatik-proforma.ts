import { ekKullaniciSayisi } from "./kota-durumu";
import { ibanYazisi } from "./iban";
import { htmlKacis } from "./posta-imza";
import { kdvDahilProforma, type ProformaKalemi, type ProformaToplami } from "./proforma";

/*
  OTOMATİK PROFORMANIN KURALI (29.10.2026) — saf.

  Kurum sahibinin isteği: dönem sonuna üç gün kala proforma kendiliğinden
  kesilsin ve yetkiliye gönderilsin. Veritabanına dokunan yarısı
  lib/otomatik-proforma-isi.ts'te; burada yalnızca karar ve metin var,
  birim testi (tests/unit/otomatik-proforma.test.ts) sabitliyor.

  Kim alır: ödemesi bize gelen, dönemi açık (active) abonelik. Deneme
  süresindeki DEĞİL: deneme bitince ne alacağına henüz karar vermemiş
  birine resmî bir ödeme belgesi göndermek satış baskısı olur; onlara
  abonelik hatırlatması zaten gidiyor. Ödemesi gecikmiş (past_due)
  olanın dönemi geçmiş, pencereye girmiyor.

  Pencere üç günün TAMAMI (0–3 gün kala), yalnızca "tam üç gün kala"
  değil: iş bir sabah koşmazsa (dağıtım, kesinti) ertesi sabah aynı
  dönemi yine yakalıyor. Aynı dönem için ikinci proformayı veritabanının
  benzersiz dizini reddediyor (migration 20261029160309).
*/

export const OTOMATIK_PROFORMA_GUN = 3;
export const OTOMATIK_KDV_ORANI = 20;

export type OtomatikUrun = "arvoos" | "arvolab" | "randevu";

const GUN = 86_400_000;

/** Zaman damgasının Türkiye günü (YYYY-AA-GG). Gün anahtarı UTC'den alınırsa gece 00–03 arası bir önceki güne düşer. */
export function turkiyeGunu(damga: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(damga)) return damga;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(damga));
}

const gunFarki = (bugun: string, hedef: string) =>
  Math.round((Date.parse(`${hedef}T00:00:00Z`) - Date.parse(`${bugun}T00:00:00Z`)) / GUN);

/** Bu abonelik için BUGÜN otomatik proforma kesilmeli mi. */
export function proformaZamaniMi(girdi: { durum: string; donemSonu: string | null }, bugun: string, gun = OTOMATIK_PROFORMA_GUN): boolean {
  if (girdi.durum !== "active" || !girdi.donemSonu) return false;
  const fark = gunFarki(bugun, turkiyeGunu(girdi.donemSonu));
  return fark >= 0 && fark <= gun;
}

/**
 * Bir sonraki dönemin son günü: bir ay sonrası, ayın son gününe kırpılarak
 * (31 Ocak → 28/29 Şubat). Proformada "hangi dönemin bedeli" yazıyor.
 */
export function sonrakiDonemSonu(gun: string): string {
  const [y, a, g] = gun.split("-").map(Number);
  const sonGun = new Date(Date.UTC(y, a + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, a, Math.min(g, sonGun))).toISOString().slice(0, 10);
}

export const gunYazisi = (gun: string) => gun.split("-").reverse().join(".");

const URUN_ADI: Record<OtomatikUrun, string> = { arvoos: "ArvoOS", arvolab: "ArvoLab", randevu: "ArvoCal" };

/**
 * Kalemler ve toplam. Lisanstaki aylık ücret müşterinin ÖDEDİĞİ tutar
 * (ödeme bağlantısı onu çekiyor) yani KDV DAHİL; proforma onu ara toplam
 * ve KDV'ye ayırıyor (lib/proforma kdvDahilProforma). ArvoOS'ta paketin
 * kullanıcı sınırını aşan her etkin kullanıcı ayrı kalem: toplam ödeme
 * bağlantısının ve havale denetiminin beklediğiyle aynı
 * (lib/abonelik-tutari donemTutari).
 */
export function otomatikKalemler(girdi: {
  urun: OtomatikUrun;
  paketAdi: string | null;
  bireysel: boolean;
  aylikUcret: number;
  donemBasi: string;
  donemSonu: string;
  aktifKullanici?: number;
  kullaniciLimiti?: number | null;
  ekKullaniciUcreti?: number | null;
}): { kalemler: ProformaKalemi[] } & ProformaToplami {
  const ad = [URUN_ADI[girdi.urun], girdi.bireysel ? "bireysel" : girdi.paketAdi].filter(Boolean).join(" ");
  const brut: ProformaKalemi[] = [{
    aciklama: `${ad} aboneliği (1 ay · ${gunYazisi(girdi.donemBasi)} – ${gunYazisi(girdi.donemSonu)})`,
    miktar: 1,
    birim_fiyat: Math.round(girdi.aylikUcret),
  }];
  if (girdi.urun === "arvoos") {
    const ek = ekKullaniciSayisi(girdi.aktifKullanici ?? 0, girdi.kullaniciLimiti ?? null);
    const birim = Math.max(0, Math.round(girdi.ekKullaniciUcreti ?? 0));
    if (ek > 0 && birim > 0) brut.push({ aciklama: "ArvoOS ek kullanıcı (1 ay)", miktar: ek, birim_fiyat: birim });
  }
  return kdvDahilProforma(brut, OTOMATIK_KDV_ORANI);
}

const para = (kurus: number, birim: string) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: birim || "TRY" }).format(kurus / 100);

export type ProformaPostasiGirdisi = {
  /** Selamlamadaki ad: kurumun tabela adı ya da abonenin adı. */
  muhatap: string | null;
  urun: OtomatikUrun;
  proformaNo: string;
  toplam: number;
  paraBirimi: string;
  /** Son ödeme günü (YYYY-AA-GG). */
  sonGun: string;
  /** Müşterinin proformayı görüp yazdırdığı sayfa. */
  adres: string;
  satici: string;
  hesaplar: { banka: string; hesapSahibi: string | null; iban: string }[];
  otomatik: boolean;
};

/*
  E-POSTANIN METNİ. HTML ile düz metin AYNI içerik, aynı sırada: HTML'i
  göstermeyen kutuda (kurumsal Outlook kuralları, otomatik işleyen
  sistemler) yalnızca HTML göndermek boş posta demek (AGENTS.md "Giden
  postanın HTML'i varsa düz metni de olmalı"). HTML'e giren her değer
  htmlKacis'tan geçiyor: muhatap adını kurum yazıyor.

  Banka hesapları postada da yazıyor: müşteri ödemeyi postadan yapabilsin,
  panele girmeden. Belgenin kendisi panelde (yazdırılabilir); PDF eki yok,
  çünkü sunucuda PDF üretilmiyor ve panel ile postanın iki ayrı belge
  taşıması, birinin eskimesi demek.
*/
export function proformaPostasi(g: ProformaPostasiGirdisi): { konu: string; metin: string; html: string } {
  const urun = URUN_ADI[g.urun];
  const tutar = para(g.toplam, g.paraBirimi);
  const son = gunYazisi(g.sonGun);
  const konu = `${urun} proforma faturanız · ${g.proformaNo} · son ödeme ${son}`;
  const selam = g.muhatap ? `Merhaba ${g.muhatap},` : "Merhaba,";
  const giris = g.otomatik
    ? `${urun} aboneliğinizin dönemi ${son} tarihinde doluyor. Yeni dönemin proforma faturası hazır.`
    : `${urun} için proforma faturanız hazır.`;
  const hesapSatirlari = g.hesaplar.map((h) => `${h.banka}${h.hesapSahibi ? ` · ${h.hesapSahibi}` : ""} · ${ibanYazisi(h.iban)}`);
  const metin = [
    selam,
    "",
    giris,
    "",
    `Proforma no: ${g.proformaNo}`,
    `Tutar: ${tutar} (KDV dahil)`,
    `Son ödeme: ${son}`,
    "",
    `Proformayı görüntüleyip yazdırmak için: ${g.adres}`,
    ...(hesapSatirlari.length ? ["", "Havale / EFT ile ödeme (açıklamaya proforma numarasını yazın):", ...hesapSatirlari] : []),
    "",
    "Ödemeniz hesabımıza geçtiğinde aboneliğiniz yeni dönem için uzatılır.",
    "",
    g.satici,
  ].join("\n");

  const h = htmlKacis;
  const satir = (ad: string, deger: string) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#5b6472">${h(ad)}</td><td style="padding:4px 0;font-weight:600">${h(deger)}</td></tr>`;
  const html = `<!doctype html><html lang="tr"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d2433">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px" cellpadding="0" cellspacing="0"><tr><td>
<p style="margin:0 0 12px">${h(selam)}</p>
<p style="margin:0 0 16px">${h(giris)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${satir("Proforma no", g.proformaNo)}${satir("Tutar", `${tutar} (KDV dahil)`)}${satir("Son ödeme", son)}</table>
<p style="margin:0 0 20px"><a href="${h(g.adres)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#1f3a5f;color:#ffffff;text-decoration:none;font-weight:600">Proformayı görüntüle</a></p>
${hesapSatirlari.length ? `<p style="margin:0 0 6px;font-weight:600">Havale / EFT ile ödeme</p><p style="margin:0 0 6px;color:#5b6472">Açıklamaya proforma numarasını yazın.</p><ul style="margin:0 0 20px;padding-left:18px">${hesapSatirlari.map((s) => `<li style="margin:2px 0">${h(s)}</li>`).join("")}</ul>` : ""}
<p style="margin:0 0 16px;color:#5b6472">Ödemeniz hesabımıza geçtiğinde aboneliğiniz yeni dönem için uzatılır.</p>
<p style="margin:0;color:#5b6472">${h(g.satici)}</p>
</td></tr></table></body></html>`;
  return { konu, metin, html };
}

/**
 * Uygulama içi bildirimin metni (ArvoOS paneli ve ArvoLab). Kısa: bildirim
 * sınırları (ArvoLab başlık 200, gövde 500) ve zilin tek satırı.
 */
export function proformaBildirimi(g: { urun: OtomatikUrun; proformaNo: string; toplam: number; paraBirimi: string; sonGun: string }): { baslik: string; metin: string } {
  return {
    baslik: `${URUN_ADI[g.urun]} proforma faturanız hazır`,
    metin: `${g.proformaNo} · ${para(g.toplam, g.paraBirimi)} (KDV dahil) · son ödeme ${gunYazisi(g.sonGun)}. Abonelik ve faturalama sayfasından görüntüleyip ödeyebilirsiniz.`,
  };
}

/** Geçerli bir e-posta mı (gönderim sağlayıcısının reddedeceği biçimler elenir). */
export const epostaUygunMu = (e: string | null | undefined): e is string => Boolean(e && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(e));

/** Alıcı listesi: tekrarsız, küçük harf, geçersizler düşer. */
export function alicilariTopla(adresler: (string | null | undefined)[]): string[] {
  return [...new Set(adresler.filter(epostaUygunMu).map((e) => e.trim().toLowerCase()))];
}
