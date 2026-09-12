// Teklif ve sözleşme belgelerinde ortak biçimlendirme yardımcıları.
// Tümü saf fonksiyonlardır; bileşen gövdesinde Date.now()/new Date()
// çağrılmasın diye tarih işlemleri burada toplanır (react-hooks/purity).

export const LEGAL_TEXT_VERSION = "3.0";

// Belge satırları farklı kaynaklardan gelir (herkese açık RPC'ler, panel
// sorguları) ve canlı şema repodaki tanımlardan ayrışabildiği için tipleri
// üretilmiyor; tüm alan erişimleri bileşenlerde null-güvenli yapılır.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DocumentRow = Record<string, any>;
// Migration uygulanmadan (arvo_public_contract_audit yokken) imzalanan
// sözleşmelerde hangi metnin gösterileceğini belirleyen yedek sınır.
export const LEGAL_V3_FALLBACK_CUTOFF = "2026-09-12T21:00:00Z";

const TZ = "Europe/Istanbul";

export type PartyKind = "consumer" | "merchant";

export type TaxBreakdown = {
  status: "included" | "excluded" | "exempt" | "unknown";
  rate: number;
  net: number;
  tax: number;
  gross: number;
};

export type ScheduleRow = {
  sequence: number;
  label: string;
  dueDate: string | null;
  trigger: string | null;
  amount: number;
  percentage: number;
  status: string | null;
  paymentUrl: string | null;
};

const numberFormat = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Kuruş cinsinden tutarı "₺ 42.000,00" biçiminde yazar. */
export function formatMoney(cents: unknown, currency?: string | null) {
  const value = Number(cents || 0) / 100;
  const code = String(currency || "TRY").toUpperCase();
  if (code === "TRY" || code === "TL") return `₺ ${numberFormat.format(value)}`;
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: code, minimumFractionDigits: 2 }).format(value);
  } catch {
    return `${numberFormat.format(value)} ${code}`;
  }
}

const ones = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const tens = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
const scales = ["", "bin", "milyon", "milyar", "trilyon"];

function threeDigits(value: number) {
  const h = Math.floor(value / 100);
  const t = Math.floor((value % 100) / 10);
  const o = value % 10;
  return [h ? (h === 1 ? "yüz" : `${ones[h]} yüz`) : "", tens[t], ones[o]].filter(Boolean).join(" ");
}

/** Tam sayıyı Türkçe yazıyla ifade eder (ör. 42000 → "kırk iki bin"). */
export function numberToTurkishWords(input: number) {
  let value = Math.floor(Math.abs(input));
  if (value === 0) return "sıfır";
  const parts: string[] = [];
  let scale = 0;
  while (value > 0 && scale < scales.length) {
    const chunk = value % 1000;
    if (chunk) {
      const words = scale === 1 && chunk === 1 ? "" : threeDigits(chunk);
      parts.unshift([words, scales[scale]].filter(Boolean).join(" "));
    }
    value = Math.floor(value / 1000);
    scale += 1;
  }
  return parts.join(" ");
}

const currencyWords: Record<string, [string, string]> = {
  TRY: ["Türk lirası", "kuruş"],
  TL: ["Türk lirası", "kuruş"],
  USD: ["ABD doları", "sent"],
  EUR: ["avro", "sent"],
  GBP: ["İngiliz sterlini", "peni"],
};

/** "yalnız kırk iki bin Türk lirası" */
export function amountInWords(cents: unknown, currency?: string | null) {
  const total = Math.max(0, Math.round(Number(cents || 0)));
  const main = Math.floor(total / 100);
  const minor = total % 100;
  const [major, sub] = currencyWords[String(currency || "TRY").toUpperCase()] ?? [String(currency || ""), ""];
  return `yalnız ${numberToTurkishWords(main)} ${major}${minor ? ` ${numberToTurkishWords(minor)} ${sub}` : ""}`.trim();
}

function toDate(value?: string | null) {
  if (!value) return null;
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00+03:00`) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "12 Eylül 2026" */
export function formatDate(value?: string | null, fallback = "—") {
  const date = toDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(date);
}

/** "12 Eylül 2026, 14:32:05 (GMT+3)" — Türkiye'de yaz saati uygulanmadığı için sabit +3. */
export function formatDateTime(value?: string | null, fallback = "—") {
  const date = toDate(value);
  if (!date) return fallback;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("tr-TR", {
      timeZone: TZ, day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}:${parts.second} (GMT+3)`;
}

export function isBefore(value: string | null | undefined, reference: string) {
  const date = toDate(value);
  const ref = toDate(reference);
  return Boolean(date && ref && date.getTime() < ref.getTime());
}

/** Kullanıcı aracısı (user-agent) metninden kısa, okunur özet: "Safari 18 · iOS 18.2 · Mobil". */
export function summarizeUserAgent(ua?: string | null) {
  if (!ua) return null;
  const text = String(ua);
  const pick = (pattern: RegExp) => text.match(pattern)?.[1]?.replace(/_/g, ".") ?? null;
  let browser = "Tarayıcı";
  let version: string | null = null;
  if (/Edg(e|A|iOS)?\//.test(text)) { browser = "Microsoft Edge"; version = pick(/Edg(?:e|A|iOS)?\/(\d+)/); }
  else if (/OPR\/|Opera/.test(text)) { browser = "Opera"; version = pick(/OPR\/(\d+)/); }
  else if (/SamsungBrowser\//.test(text)) { browser = "Samsung Internet"; version = pick(/SamsungBrowser\/(\d+)/); }
  else if (/YaBrowser\//.test(text)) { browser = "Yandex Browser"; version = pick(/YaBrowser\/(\d+)/); }
  else if (/CriOS\//.test(text)) { browser = "Chrome"; version = pick(/CriOS\/(\d+)/); }
  else if (/FxiOS\//.test(text)) { browser = "Firefox"; version = pick(/FxiOS\/(\d+)/); }
  else if (/Firefox\//.test(text)) { browser = "Firefox"; version = pick(/Firefox\/(\d+)/); }
  else if (/Chrome\//.test(text)) { browser = "Chrome"; version = pick(/Chrome\/(\d+)/); }
  else if (/Safari\//.test(text) && /Version\//.test(text)) { browser = "Safari"; version = pick(/Version\/(\d+)/); }
  let os: string | null = null;
  if (/iPad/.test(text)) os = `iPadOS ${pick(/OS (\d+[_.]\d+)/) ?? ""}`.trim();
  else if (/iPhone|iPod/.test(text)) os = `iOS ${pick(/OS (\d+[_.]\d+)/) ?? ""}`.trim();
  else if (/Android/.test(text)) os = `Android ${pick(/Android (\d+(?:\.\d+)?)/) ?? ""}`.trim();
  else if (/Windows NT/.test(text)) os = "Windows";
  else if (/Mac OS X|Macintosh/.test(text)) os = "macOS";
  else if (/CrOS/.test(text)) os = "ChromeOS";
  else if (/Linux/.test(text)) os = "Linux";
  const device = /iPad|Tablet/.test(text) || (/Android/.test(text) && !/Mobile/.test(text)) ? "Tablet" : /Mobi|iPhone|Android/.test(text) ? "Mobil" : "Masaüstü";
  return [version ? `${browser} ${version}` : browser, os, device].filter(Boolean).join(" · ");
}

const companyPattern = /(ltd|limited|a\.\s?ş|anonim|şti|şirket|holding|kooperatif|koop\.|vakf|vakıf|derne|birliği|odası|inc\.|llc|gmbh|san\.|tic\.|ticaret)/i;

/**
 * Müşterinin tüketici mi tacir/kurum mu olduğu. Kayıtta 10 haneli VKN,
 * vergi dairesi ya da şirket unvanı varsa ticari işlem kabul edilir;
 * aksi halde tüketici (koruyucu hükümler) varsayılır.
 */
export function detectCustomerKind(input: { name?: string | null; taxNumber?: string | null; taxOffice?: string | null }): PartyKind {
  const digits = String(input.taxNumber || "").replace(/\D/g, "");
  if (digits.length === 10) return "merchant";
  if (String(input.taxOffice || "").trim()) return "merchant";
  if (companyPattern.test(String(input.name || "").toLocaleLowerCase("tr-TR"))) return "merchant";
  return "consumer";
}

export function taxIdLabel(taxNumber?: string | null) {
  const digits = String(taxNumber || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11) return { label: "T.C. Kimlik No", value: digits };
  if (digits.length === 10) return { label: "Vergi Kimlik No", value: digits };
  return { label: "Vergi / T.C. Kimlik No", value: String(taxNumber).trim() };
}

/**
 * amount her zaman brüt tutardır. Eski kayıtlarda net/brüt geride kalmış
 * olabilir; bu durumda KDV durumuna göre güncel brütten yeniden türetilir.
 */
export function computeTaxBreakdown(input: {
  amount?: unknown; tax_status?: string | null; net_amount?: unknown; tax_amount?: unknown; gross_amount?: unknown; tax_rate?: unknown;
}): TaxBreakdown {
  const gross = Math.round(Number(input.amount || input.gross_amount || 0));
  const status = (["included", "excluded", "exempt"].includes(String(input.tax_status)) ? input.tax_status : "unknown") as TaxBreakdown["status"];
  if (status === "unknown") return { status, rate: 0, net: gross, tax: 0, gross };
  if (status === "exempt") return { status, rate: 0, net: gross, tax: 0, gross };
  const storedRate = Number(input.tax_rate);
  const rate = Number.isFinite(storedRate) && storedRate > 0 ? storedRate : 20;
  const stale = input.gross_amount == null || Number(input.gross_amount) !== gross || input.net_amount == null;
  const net = stale ? Math.round(gross / (1 + rate / 100)) : Math.round(Number(input.net_amount));
  return { status, rate, net, tax: gross - net, gross };
}

export function splitScope(scope?: string | null, fallback?: string | null) {
  const items = String(scope || "").split(/\n|•|;\s*(?=\S)/).map((item) => item.trim().replace(/^(?:[-–•*]\s*|\d{1,2}[.)]\s+)/, "").trim()).filter(Boolean);
  return items.length ? items : [String(fallback || "Hizmet kapsamı")];
}

export function safeBrandColor(value?: string | null) {
  return /^#[0-9a-fA-F]{6}$/.test(value || "") ? String(value) : "#b8955a";
}

const asciiMap: Record<string, string> = { ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U" };

/** "Sozlesme-SOZ-2026-0012": kaydedilen PDF'in dosya adı document.title'dan gelir. */
export function pdfFileName(prefix: "Teklif" | "Sozlesme", documentNo?: string | null) {
  const clean = String(documentNo || "Belge").replace(/[çÇğĞıİöÖşŞüÜ]/g, (char) => asciiMap[char] ?? char).replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${prefix}-${clean || "Belge"}`;
}

const installmentStatuses: Record<string, string> = {
  pending: "Bekliyor", paid: "Ödendi", partial: "Kısmi ödendi", partially_paid: "Kısmi ödendi",
  overdue: "Gecikmede", cancelled: "İptal", waived: "Vazgeçildi", closed: "Kapandı",
};
export function installmentStatusLabel(status?: string | null) {
  if (!status) return null;
  return installmentStatuses[status] ?? status;
}

const cities = ["Adana","Adıyaman","Afyonkarahisar","Ağrı","Aksaray","Amasya","Ankara","Antalya","Ardahan","Artvin","Aydın","Balıkesir","Bartın","Batman","Bayburt","Bilecik","Bingöl","Bitlis","Bolu","Burdur","Bursa","Çanakkale","Çankırı","Çorum","Denizli","Diyarbakır","Düzce","Edirne","Elazığ","Erzincan","Erzurum","Eskişehir","Gaziantep","Giresun","Gümüşhane","Hakkari","Hatay","Iğdır","Isparta","İstanbul","İzmir","Kahramanmaraş","Karabük","Karaman","Kars","Kastamonu","Kayseri","Kırıkkale","Kırklareli","Kırşehir","Kilis","Kocaeli","Konya","Kütahya","Malatya","Manisa","Mardin","Mersin","Muğla","Muş","Nevşehir","Niğde","Ordu","Osmaniye","Rize","Sakarya","Samsun","Siirt","Sinop","Sivas","Şanlıurfa","Şırnak","Tekirdağ","Tokat","Trabzon","Tunceli","Uşak","Van","Yalova","Yozgat","Zonguldak"];

/** Kurum adres/alt bilgi metninden il adını bulur (yetkili mahkeme için). */
export function detectCity(text?: string | null) {
  const haystack = String(text || "").toLocaleLowerCase("tr-TR");
  if (!haystack) return null;
  let found: { city: string; index: number } | null = null;
  for (const city of cities) {
    const index = haystack.lastIndexOf(city.toLocaleLowerCase("tr-TR"));
    if (index >= 0 && (!found || index > found.index)) found = { city, index };
  }
  return found?.city ?? null;
}

/** Sunucu tarafında imzalı sözleşme için doğrulama özeti (SHA-256). */
export async function contractVerificationHash(input: { id?: string | null; contract_no?: string | null; signed_at?: string | null; amount?: unknown; currency?: string | null; signed_name?: string | null }) {
  if (!input.signed_at || !globalThis.crypto?.subtle) return null;
  const payload = [input.id, input.contract_no, input.signed_at, Math.round(Number(input.amount || 0)), input.currency || "TRY", input.signed_name || ""].join("|");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function groupHash(hash: string) {
  return hash.match(/.{1,8}/g)?.join(" ") ?? hash;
}
