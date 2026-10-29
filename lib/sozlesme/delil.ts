import { htmlKacis } from "../posta-imza";
import type { SozlesmeMetni } from "./kullanim-sozlesmesi";

/*
  SÖZLEŞME ONAYININ DELİLİ (29.10.2026) — saf.

  IP, cihaz ve konum İSTEĞİN BAŞLIKLARINDAN, sunucuda okunuyor
  (app/panel/sozlesme-actions.ts); istemci bunları gönderseydi kayıt delil
  olmazdı. Bu dosya başlıkları okunur bir kayda çeviriyor; birim testi
  (tests/unit/sozlesme-delili.test.ts) sabitliyor.

  KONUM: barındırıcı (Vercel) her isteğe IP'den çıkardığı yaklaşık konumu
  ekliyor (x-vercel-ip-country / -country-region / -city / -latitude /
  -longitude / -timezone). Şehir adı URL kodlu geliyor ("%C4%B0stanbul").
  Başlık yoksa (yerel geliştirme, başka barındırıcı) konum boş kalır;
  uydurulmaz. Tarayıcıdan GPS istenmiyor: gerekçesi migration'da
  (20261029162437).
*/

type Baslik = (ad: string) => string | null;

/** İstemcinin IP'si: Vercel x-forwarded-for'un ilk girdisini istemci olarak yazar. */
export function istemciIp(baslik: Baslik): string | null {
  const ileri = baslik("x-forwarded-for")?.split(",")[0]?.trim();
  return (ileri || baslik("x-real-ip") || "").slice(0, 100) || null;
}

export type Konum = {
  ulke: string | null;
  bolge: string | null;
  sehir: string | null;
  enlem: number | null;
  boylam: number | null;
  saatDilimi: string | null;
};

const coz = (deger: string | null, sinir: number) => {
  if (!deger) return null;
  let metin = deger;
  try { metin = decodeURIComponent(deger); } catch { /* bozuk kodlama: olduğu gibi */ }
  return metin.trim().slice(0, sinir) || null;
};

const sayi = (deger: string | null, sinir: number) => {
  if (!deger) return null;
  const n = Number(deger);
  return Number.isFinite(n) && Math.abs(n) <= sinir ? n : null;
};

export function konumOku(baslik: Baslik): Konum {
  return {
    ulke: coz(baslik("x-vercel-ip-country"), 10),
    bolge: coz(baslik("x-vercel-ip-country-region"), 100),
    sehir: coz(baslik("x-vercel-ip-city"), 120),
    enlem: sayi(baslik("x-vercel-ip-latitude"), 90),
    boylam: sayi(baslik("x-vercel-ip-longitude"), 180),
    saatDilimi: coz(baslik("x-vercel-ip-timezone"), 60),
  };
}

/** Konumun tek satırı: "İstanbul, 34, TR (41.01, 28.97)". Hiçbiri yoksa null. */
export function konumYazisi(k: Pick<Konum, "ulke" | "bolge" | "sehir" | "enlem" | "boylam">): string | null {
  const yer = [k.sehir, k.bolge, k.ulke].filter(Boolean).join(", ");
  const koordinat = k.enlem !== null && k.boylam !== null ? `(${k.enlem}, ${k.boylam})` : "";
  return [yer, koordinat].filter(Boolean).join(" ") || null;
}

/**
 * Cihazın kısa adı ("Chrome · macOS"). Kayda TAM kullanıcı aracı yazılıyor;
 * bu yalnızca ekranda ve postada okunur bir özet.
 */
export function cihazOzeti(ua: string | null): string | null {
  if (!ua) return null;
  const tarayici = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : null;
  const sistem = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : null;
  return [tarayici, sistem].filter(Boolean).join(" · ") || "Bilinmeyen cihaz";
}

export type OnayKaydi = {
  zaman: string;
  surum: string;
  ozet: string;
  ip: string | null;
  konum: string | null;
  cihaz: string | null;
  adres: string | null;
  kurum: string | null;
};

/*
  ONAYIN KOPYASI (sözleşmenin 14. maddesi bunu vaat ediyor). Metnin tamamı
  postada, kayıt bilgileri altta. HTML ile düz metin aynı içerik ve aynı
  sırada (AGENTS.md: HTML'i göstermeyen kutuda boş posta olmasın); her
  değer htmlKacis'tan geçiyor.
*/
export function onayPostasi(metin: SozlesmeMetni, kayit: OnayKaydi): { konu: string; metin: string; html: string } {
  const konu = `${metin.baslik} onayınız`;
  const satirlar: [string, string | null][] = [
    ["Onay zamanı", kayit.zaman],
    ["Sürüm", kayit.surum],
    ["Metin özeti (SHA-256)", kayit.ozet],
    ["Kurum", kayit.kurum],
    ["IP adresi", kayit.ip],
    ["Yaklaşık konum (IP'den)", kayit.konum],
    ["Cihaz / tarayıcı", kayit.cihaz],
    ["Panel adresi", kayit.adres],
  ];
  const dolu = satirlar.filter((s): s is [string, string] => Boolean(s[1]));
  const giris = "Aşağıdaki sözleşmeyi ArvoOS'ta onayladınız. Bu e-postayı saklayın; sözleşmenin ve onay kaydının size ait kopyasıdır.";
  const duz = [
    giris,
    "",
    metin.baslik,
    metin.giris,
    ...metin.bolumler.flatMap((b) => ["", b.baslik, ...b.paragraflar]),
    "",
    "— Onay kaydı —",
    ...dolu.map(([ad, deger]) => `${ad}: ${deger}`),
  ].join("\n");

  const h = htmlKacis;
  const html = `<!doctype html><html lang="tr"><body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d2433">
<table role="presentation" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px" cellpadding="0" cellspacing="0"><tr><td>
<p style="margin:0 0 12px;font-size:16px;font-weight:600">Onayınız kaydedildi</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.5">${h(giris)}</p>
<p style="margin:18px 0 4px;font-size:15px;font-weight:600">${h(metin.baslik)}</p>
<p style="margin:0 0 8px;font-size:13px;color:#5b6472;line-height:1.5">${h(metin.giris)}</p>
${metin.bolumler.map((b) => `<p style="margin:16px 0 4px;font-size:13px;font-weight:600">${h(b.baslik)}</p>${b.paragraflar.map((p) => `<p style="margin:0 0 8px;font-size:13px;line-height:1.55">${h(p)}</p>`).join("")}`).join("")}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0;border-top:1px solid #e3e6e3;padding-top:12px">
${dolu.map(([ad, deger]) => `<tr><td style="padding:2px 12px 2px 0;font-size:12px;color:#5b6472;vertical-align:top;white-space:nowrap">${h(ad)}</td><td style="padding:2px 0;font-size:12px;word-break:break-all">${h(deger)}</td></tr>`).join("")}
</table>
</td></tr></table></body></html>`;
  return { konu, metin: duz, html };
}
