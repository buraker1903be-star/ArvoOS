/*
  KÖK ADRESTE DİL SEÇİMİ (28.10.2026, global site).

  Kök adres (/) İngilizce ana sayfa. Türkçe (ileride Almanca, İspanyolca…)
  konuşan ziyaretçi köke İLK geldiğinde kendi dilindeki ana sayfaya
  gönderilir. Kurallar ve nedenleri:

  - Karar TARAYICI DİLİNDEN (Accept-Language), IP'den/ülkeden değil.
    Yurt dışındaki Türk müşteri, VPN kullanan ziyaretçi ve ülke dışından
    tarayan Google, IP'ye göre yanlış dili görürdü.
  - Yalnızca KÖK ADRES. /pricing gibi bir iç sayfayı açan ziyaretçi
    bağlantıyı biri ona bilerek o dilde vermiş demektir; yönlendirilmez.
  - Seçim hatırlanır: dil değiştiriciye basan ziyaretçinin seçimi
    çereze yazılır (SITE_DIL_COOKIE) ve tarayıcının dilinden önce gelir.
    Yoksa İngilizce'yi bilerek seçen bir Türk her ana sayfa açılışında
    yeniden Türkçe'ye atılırdı.
  - Arama motoru ve önizleme botları HİÇ yönlendirilmez: her dil kendi
    adresinde dizine girer (hreflang bunu söylüyor); bot yönlendirilirse
    İngilizce ana sayfa dizinden düşebilir.
  - Yalnızca tarayıcının SAYFA AÇILIŞI. Next'in istemci içi gezinmesi ve
    önceden yüklemesi (RSC istekleri) yönlendirilmez: /tr'deki "EN"
    bağlantısı / adresini sayfa açılırken önceden yüklüyor, o anda çerez
    henüz "tr" olduğu için yük /tr'ye yönleniyor ve tıklanınca ziyaretçi
    Türkçe'de kalıyordu (28.10.2026, yerelde yakalandı).
  - Yönlendirme 307 ve önbelleğe alınmaz: kararı isteği yapanın dili
    veriyor, paylaşılan bir önbellek herkese aynı cevabı verirdi.

  Saf modül: tests/unit/dil-secimi.test.ts.
*/
import { DEFAULT_LOCALE, LOCALES, ROUTES, type Locale } from "./routes";

export const SITE_DIL_COOKIE = "arvo_site_dil";

/*
  28.10.2026'ya kadarki İngilizce ana sayfa. "/"e yönlenir ve İngilizce
  seçimini çereze yazar (proxy): o adresi açan ziyaretçi İngilizce
  istemiş demektir, "/"deki dil seçimi onu Türkçe'ye atmamalı.
*/
export const ESKI_INGILIZCE_KOK = "/en";
export const eskiIngilizceKokMu = (pathname: string) => pathname === ESKI_INGILIZCE_KOK || pathname === `${ESKI_INGILIZCE_KOK}/`;

const BOT = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|discord|lighthouse|pagespeed|headless|curl|wget|python-requests/i;

/** "tr-TR,tr;q=0.9,en;q=0.8" → desteklenen dillerin tercih sırası. */
export function tercihEdilenDil(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null;
  const adaylar = acceptLanguage
    .split(",")
    .map((parca, sira) => {
      const [etiket, ...ozellikler] = parca.trim().split(";");
      const q = ozellikler.map((o) => o.trim()).find((o) => o.startsWith("q="));
      const agirlik = q ? Number(q.slice(2)) : 1;
      return { dil: etiket.trim().toLowerCase().split("-")[0], agirlik: Number.isFinite(agirlik) ? agirlik : 0, sira };
    })
    .filter((a) => a.dil && a.agirlik > 0)
    // Eşit ağırlıkta başlıktaki sıra korunur.
    .sort((a, b) => b.agirlik - a.agirlik || a.sira - b.sira);
  const bulunan = adaylar.find((a) => (LOCALES as readonly string[]).includes(a.dil));
  return bulunan ? (bulunan.dil as Locale) : null;
}

/**
 * Kök adres isteği için yönlendirilecek ana sayfa yolu; yönlendirme
 * gerekmiyorsa null.
 */
export function kokDilYonlendirmesi(input: {
  pathname: string;
  method?: string;
  acceptLanguage?: string | null;
  cookie?: string | null;
  userAgent?: string | null;
  /** İstek Next'in RSC/önceden yükleme isteği mi (RSC başlığı). */
  rsc?: boolean;
}): string | null {
  if (input.pathname !== "/" || input.rsc) return null;
  const method = (input.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;
  if (!input.userAgent || BOT.test(input.userAgent)) return null;

  const secilen = (LOCALES as readonly string[]).includes(input.cookie ?? "") ? (input.cookie as Locale) : null;
  const dil = secilen ?? tercihEdilenDil(input.acceptLanguage);
  if (!dil || dil === DEFAULT_LOCALE) return null;
  return ROUTES.home[dil];
}
