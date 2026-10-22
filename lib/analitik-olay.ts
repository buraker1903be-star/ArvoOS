/*
  ANALİTİK: GELEN OLAYIN AYRIŞTIRILMASI (22.10.2026).

  Kurumun sitesine eklenen takip kodu (public/k.js) her sayfa açılışında
  ve form gönderiminde /api/k'ya küçük bir gövde yolluyor. Buradaki
  kararlar YAZIMDA veriliyor, okumada değil: kaynak platform adına
  ("l.instagram.com" → "Instagram") yazarken iniyor, böylece özet işlevi
  veritabanında doğrudan gruplayabiliyor. Okumada eşlemek, aynı
  platformu üç satıra bölüp bellekte birleştirmek demekti ve satır
  tavanına çarpan gün sayılar sessizce eksilirdi.

  KİŞİSEL VERİ TUTULMUYOR: tam yönlendiren adresi değil yalnızca konağı,
  IP'yi değil günlük tuzlu karmayı (veritabanı işlevinde) saklıyoruz.

  Saf modül (Next/React/Supabase yok): testi tests/unit/analitik-olay.test.ts.
*/

/*
  Eşleşme PARÇAYA bakıyor, tam ada değil: Google'ın ülke alan adları
  (google.com.tr) ve Instagram'ın yönlendirme konakları (l.instagram.com)
  aynı platform. Liste ArvoARC'taki src/lib/ziyaret-kaynagi.ts'ten
  alındı; iki ürün ayrı depoda olduğu için paylaşılan modül yok.
*/
const PLATFORMLAR: Array<[RegExp, string]> = [
  [/(^|\.)google\./, "Google"],
  [/(^|\.)instagram\.com$|^instagram$|^ig$/, "Instagram"],
  [/(^|\.)facebook\.com$|(^|\.)fb\.(com|me)$|^facebook$|^fb$/, "Facebook"],
  [/(^|\.)tiktok\.com$|^tiktok$/, "TikTok"],
  /* t.co Twitter/X'in kısaltma alan adı: tıklama oradan geliyor. */
  [/(^|\.)x\.com$|(^|\.)twitter\.com$|^t\.co$|^twitter$|^x$/, "X"],
  [/(^|\.)youtube\.com$|^youtu\.be$|^youtube$/, "YouTube"],
  [/(^|\.)pinterest\.|^pinterest$/, "Pinterest"],
  [/(^|\.)linkedin\.com$|^lnkd\.in$|^linkedin$/, "LinkedIn"],
  [/whatsapp|^wa\.me$/, "WhatsApp"],
  [/(^|\.)bing\.com$|^bing$/, "Bing"],
  [/(^|\.)yandex\./, "Yandex"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [/(^|\.)telegram\.|^t\.me$/, "Telegram"],
  [/(^|\.)reddit\.com$/, "Reddit"],
  [/^(mail|outlook|gmail)\.|(^|\.)yahoo\./, "E-posta"],
];

/**
 * Ham kaynaktan platform adı. Boş değer "Doğrudan": adres çubuğuna
 * yazarak, yer iminden ya da uygulama içinden gelinmiş. Tanınmayan
 * kaynak OLDUĞU GİBİ kalır, "Diğer" diye toplanmaz — hangi siteden
 * geldiğini görmek, o sitenin adını bilmekten daha değerli.
 */
export function kaynakAdi(ham: string | null | undefined): string {
  const deger = (ham ?? "").trim().toLowerCase();
  if (!deger) return "Doğrudan";
  for (const [desen, ad] of PLATFORMLAR) {
    if (desen.test(deger)) return ad;
  }
  return deger.replace(/^www\./, "");
}

export type Cihaz = "mobil" | "tablet" | "masaustu";

/**
 * Cihaz türü. Önce tarayıcı kimliği, yoksa ekran genişliği: iPad'in
 * yeni sürümleri kendini masaüstü Safari diye tanıtıyor, genişlik ise
 * yalan söylemiyor.
 */
export function cihazTuru(ua: string, genislik: number | null): Cihaz {
  const kimlik = ua.toLowerCase();
  if (/ipad|tablet|kindle|silk|playbook/.test(kimlik)) return "tablet";
  if (/android/.test(kimlik) && !/mobile/.test(kimlik)) return "tablet";
  if (/mobi|iphone|ipod|android|windows phone/.test(kimlik)) return "mobil";
  if (genislik !== null && genislik > 0) {
    if (genislik < 768) return "mobil";
    if (genislik < 1024 && /macintosh/.test(kimlik)) return "tablet";
  }
  return "masaustu";
}

/**
 * Tarayıcı adı. SIRA ÖNEMLİ: Edge ve Opera kimliklerinde "Chrome",
 * Chrome'unkinde "Safari" de geçiyor; özelden genele gidiliyor.
 * Uygulama içi tarayıcılar (Instagram, Facebook) ayrı yazılıyor: "kaç
 * kişi Instagram'ın içinden açtı" kaynak listesinden ayrı bir soru.
 */
export function tarayiciAdi(ua: string): string {
  const k = ua.toLowerCase();
  if (/instagram/.test(k)) return "Instagram uygulaması";
  if (/fban|fbav|fb_iab/.test(k)) return "Facebook uygulaması";
  if (/edg\//.test(k)) return "Edge";
  if (/opr\/|opera/.test(k)) return "Opera";
  if (/samsungbrowser/.test(k)) return "Samsung Internet";
  if (/yabrowser/.test(k)) return "Yandex";
  if (/firefox|fxios/.test(k)) return "Firefox";
  if (/chrome|crios/.test(k)) return "Chrome";
  if (/safari/.test(k)) return "Safari";
  return "Diğer";
}

/*
  Bot eleme yazımda: önizleme üreticileri (WhatsApp'a bağlantı
  yapıştırınca çağrılan) ve arama motoru tarayıcıları bir "ziyaret"
  değil. Yalnızca kendini açıkça tanıtanlar; gerisini veritabanındaki
  dakikalık hız sınırı tutuyor.
*/
const BOT = /^whatsapp\/|bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|uptime|curl\/|wget|python-requests|axios\/|node-fetch|go-http-client/i;

export const botMu = (ua: string) => !ua.trim() || BOT.test(ua);

export type OlayTuru = "sayfa" | "form";

export interface Olay {
  siteAnahtari: string;
  tur: OlayTuru;
  yol: string;
  kaynak: string;
  kaynakHam: string | null;
  kampanya: string | null;
  ortam: string | null;
  genislik: number | null;
}

const ANAHTAR = /^[a-z0-9]{16,40}$/;

/** Yönlendiren adresten yalnızca konak; kendi sitesinden gelen tıklama kaynak değildir. */
export function yonlendirenKonak(adres: unknown, siteKonagi: string | null): string | null {
  if (typeof adres !== "string" || !adres) return null;
  try {
    const konak = new URL(adres).hostname.toLowerCase().replace(/^www\./, "");
    if (!konak) return null;
    if (siteKonagi && konak === siteKonagi.toLowerCase().replace(/^www\./, "")) return null;
    return konak.slice(0, 120);
  } catch {
    return null;
  }
}

const metin = (deger: unknown, tavan: number) =>
  typeof deger === "string" && deger.trim() ? deger.trim().slice(0, tavan) : null;

/**
 * Gövdeyi doğrular. Geçersizse null: uç 204 dönüp sessizce geçer —
 * takip kodu yanıta bakmıyor, hata metni yalnızca saldırgana bilgi
 * verirdi.
 *
 * Gövde alanları kısa (k, t, p, r, s, m, c, w): her sayfa açılışında
 * gidiyor ve sendBeacon'ın 64 KB'lık kuyruğunu başka sekmelerle
 * paylaşıyor.
 */
export function olayiOku(govde: unknown): Olay | null {
  if (!govde || typeof govde !== "object") return null;
  const g = govde as Record<string, unknown>;
  const siteAnahtari = typeof g.k === "string" ? g.k : "";
  if (!ANAHTAR.test(siteAnahtari)) return null;
  const tur: OlayTuru = g.t === "form" ? "form" : "sayfa";

  let yol = "/";
  let siteKonagi: string | null = null;
  if (typeof g.p === "string") {
    try {
      const adres = new URL(g.p);
      siteKonagi = adres.hostname;
      /* Sorgu dizesi ATILIYOR: arama terimleri, e-posta adresleri,
         oturum anahtarları orada durabiliyor. UTM ayrı alanlarda geliyor. */
      yol = adres.pathname.slice(0, 300) || "/";
    } catch {
      return null;
    }
  } else {
    return null;
  }

  /*
    utm_source yönlendirenden ÖNCE gelir: Instagram'daki bağlantıya
    "utm_source=instagram" yazan kurum, uygulama içi tarayıcı
    yönlendireni hiç göndermese de doğru kaynağı görür.
  */
  const utm = metin(g.s, 80);
  const konak = yonlendirenKonak(g.r, siteKonagi);
  const kaynakHam = utm ?? konak;
  const genislik = typeof g.w === "number" && Number.isFinite(g.w) && g.w > 0 && g.w < 20000 ? Math.round(g.w) : null;

  return {
    siteAnahtari,
    tur,
    yol,
    kaynak: kaynakAdi(kaynakHam),
    kaynakHam: kaynakHam ? kaynakHam.toLowerCase() : null,
    kampanya: metin(g.c, 120),
    ortam: metin(g.m, 60),
    genislik,
  };
}

/**
 * Vercel'in kenar başlığındaki şehir adı URL kodlu geliyor
 * ("%C4%B0stanbul"); bozuk kodlamada ham değeri döndürmek, olayı
 * düşürmekten iyi.
 */
export function sehirAdi(ham: string | null): string | null {
  if (!ham) return null;
  try {
    return decodeURIComponent(ham).slice(0, 120);
  } catch {
    return ham.slice(0, 120);
  }
}

/*
  KURULUMDA YAZILAN ALAN ADI. Kullanıcı adres çubuğundan kopyalıyor:
  "https://www.akademikmerkez.com/iletisim" → "akademikmerkez.com".
  Veritabanındaki kısıtla aynı biçim; geçersizse null ve form sebebini
  yazar. www atılıyor çünkü olay yazımı da onu atıyor — biri kalsaydı
  www'lu site hiç eşleşmezdi.
*/
const ALAN_ADI = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function alanAdiOku(girdi: string): string | null {
  let deger = girdi.trim().toLowerCase();
  if (!deger) return null;
  if (!/^[a-z]+:\/\//.test(deger)) deger = "https://" + deger;
  try {
    const konak = new URL(deger).hostname.replace(/^www\./, "");
    return ALAN_ADI.test(konak) ? konak : null;
  } catch {
    return null;
  }
}
