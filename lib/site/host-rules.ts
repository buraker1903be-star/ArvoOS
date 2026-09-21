// Pazarlama sitesinin host kuralları: hangi alan adında hangi SEO dosyası /
// yönlendirme uygulanır. Saf fonksiyonlar (Next'e bağımlı değil) — proxy,
// robots.ts ve llms rotaları buradan karar alır; test edilebilir.
import { MARKETING_HOSTS, SITE_ORIGIN, resolvePath } from "./routes";

/** "App.Arvo-OS.com:443" → "app.arvo-os.com" */
export function normalizeHost(raw: string | null | undefined): string {
  return (raw ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/** Önce x-forwarded-host (proxy arkası), yoksa host başlığı. */
export function hostFromHeaders(headers: { get(name: string): string | null }): string {
  return normalizeHost(headers.get("x-forwarded-host") || headers.get("host"));
}

/*
  Kurucu yönetim alan adı.

  Platform yönetimi (lisans, kota, abone, ödeme) kendi alan adında
  duruyor. Gerekçe: kurucu gün içinde hem kendi kurumunun panelinde hem
  de platform yönetiminde çalışıyor ve ikisi aynı kabukta olduğu için
  "şu an hangi kurum adına iş yapıyorum" sorusu sürekli karışıyordu.

  Aynı Vercel projesi, aynı kod; yalnızca alan adı ayrı. Çerezler alan
  adına özel olduğu için oturum da ayrı — bu bilinçli: yönetim oturumu
  müşteri panelindeki bir sekmeden devralınamıyor.

  Türkçe karakterli ad (yönetim.arvo-os.com) DNS'te punycode'a çevriliyor;
  ikisi de tanınıyor ve ASCII olana yönlendiriliyor. Punycode adres
  paylaşıldığında okunaksız görünüyor.
*/
export const MANAGEMENT_HOST = "yonetim.arvo-os.com";
const MANAGEMENT_HOST_IDN = "xn--ynetim-wxa.arvo-os.com";
/** Yönetim alan adında yalnızca bu ön ek servis ediliyor. */
export const MANAGEMENT_PATH = "/panel/platform";

export function isManagementHost(host: string): boolean {
  const h = normalizeHost(host);
  return h === MANAGEMENT_HOST || h === MANAGEMENT_HOST_IDN;
}

/**
 * Yönetim alan adındaki yönlendirme kararı; başka alan adlarında null.
 *
 * Üç kural:
 *  - Punycode adres okunur ASCII adrese taşınır.
 *  - Kök yol doğrudan platform yönetimine iner; burada başka bir giriş
 *    ekranı yok.
 *  - Platform DIŞINDAKİ panel yolları uygulama alan adına geri gönderilir.
 *    Kurucunun müşteri kurumunda yaptığı iş yönetim alan adında
 *    görünmemeli; karışmasın diye ayırdık.
 */
export function managementRedirectTarget(input: {
  host: string;
  pathname: string;
  search?: string;
  appHost: string;
}): string | null {
  const host = normalizeHost(input.host);
  if (!isManagementHost(host)) return null;
  const search = input.search ?? "";

  if (host === MANAGEMENT_HOST_IDN) return `https://${MANAGEMENT_HOST}${input.pathname}${search}`;
  if (input.pathname === "/" || input.pathname === "/panel") return `https://${MANAGEMENT_HOST}${MANAGEMENT_PATH}`;
  if (input.pathname.startsWith("/panel") && !input.pathname.startsWith(MANAGEMENT_PATH)) {
    return `https://${input.appHost}${input.pathname}${search}`;
  }
  return null;
}

export function isMarketingHost(host: string): boolean {
  return (MARKETING_HOSTS as readonly string[]).includes(normalizeHost(host));
}

/** Yerel geliştirme (localhost, 127.0.0.1, *.localhost). */
export function isLocalDevHost(host: string): boolean {
  const h = normalizeHost(host);
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1" || h.endsWith(".localhost");
}

/** Yerel geliştirme veya Vercel önizleme dağıtımı. */
export function isDevOrPreviewHost(host: string): boolean {
  return isLocalDevHost(host) || normalizeHost(host).endsWith(".vercel.app");
}

/**
 * Pazarlama sayfası panel/kurum alan adından istendiyse arvo-os.com'daki
 * kanonik adresi döndürür (308), aksi hâlde null.
 * - "/" hariç: kök yol panel hostunda ve kurum alan adlarında giriş/panel akışıdır.
 * - Yalnızca GET/HEAD: server action POST'ları başka origin'e taşınmaz.
 * - Boş host, arvo-os.com, localhost ve *.vercel.app'e dokunulmaz.
 */
export function marketingRedirectTarget(input: {
  host: string;
  pathname: string;
  search?: string;
  method?: string;
}): string | null {
  const host = normalizeHost(input.host);
  const method = (input.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;
  if (!host || isMarketingHost(host) || isDevOrPreviewHost(host)) return null;
  if (input.pathname === "/" || resolvePath(input.pathname) === null) return null;
  return `${SITE_ORIGIN}${input.pathname}${input.search ?? ""}`;
}

/** Her hostta dizine kapalı yollar (panel, müşteri belgeleri, oturum). */
export const PRIVATE_PATH_PREFIXES = [
  "/panel",
  "/api",
  "/teklif",
  "/sozlesme",
  // WhatsApp şablon düğmesinin kısa bağlantısı; müşteri belgesine gider.
  "/b",
  "/takip",
  "/durum",
  "/is-durumu",
  "/login",
  "/giris",
  "/auth",
  "/kurulum",
] as const;

/** robots.txt'de açıkça izin verilen yapay zekâ / yanıt motoru tarayıcıları. */
export const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "Google-Extended",
  "Applebot-Extended",
  "Applebot",
  "Bingbot",
  "Googlebot",
] as const;

type RobotsRule = { userAgent: string | string[]; allow?: string | string[]; disallow?: string | string[] };
export type RobotsConfig = { rules: RobotsRule[]; sitemap?: string; host?: string };

/**
 * Host'a göre robots.txt. Pazarlama hostunda her şey açık (özel yollar
 * hariç); diğer tüm hostlarda (app.arvo-os.com, kurum alan adları,
 * önizlemeler) her şey kapalı — paneller ve müşteri belgeleri dizine girmez.
 */
export function robotsFor(host: string): RobotsConfig {
  if (!isMarketingHost(host)) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  const disallow = [...PRIVATE_PATH_PREFIXES];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      // Belirli bir user-agent grubu "*" grubunu tamamen ezer; bu yüzden
      // özel yollar burada da tekrarlanır.
      { userAgent: [...AI_CRAWLERS], allow: "/", disallow },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}

/** llms.txt / llms-full.txt yalnızca pazarlama hostunda (ve yerelde) sunulur. */
export function servesSiteFiles(host: string): boolean {
  return isMarketingHost(host) || isLocalDevHost(host);
}
