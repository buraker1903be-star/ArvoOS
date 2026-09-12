import { formatPersonName } from "./format-name";

const lower = (value: string) => value.toLocaleLowerCase("tr-TR");
const upper = (value: string) => value.toLocaleUpperCase("tr-TR");

// Başlıkta küçük kalması gereken bağlaçlar ("Literatür ve Kaynak Taraması")
const CONNECTORS = new Set(["ve", "ile", "veya", "ya", "da", "de", "için", "ki"]);

/**
 * Talep/teklif konusu gösterimi. Kayıtların bir kısmı büyük harf kilidiyle
 * girilmiş ("TIPTA UZMANLIK TEZİ") ve tabloda "Literatür+Analiz" gibi
 * kayıtların yanında bağırıyor. Yalnızca TAMAMEN büyük harfli konular
 * düzeltilir; karışık yazılmış konudaki kısaltmalar (SPSS, MBA) olduğu gibi
 * kalır. Veri değişmez, yalnızca gösterim.
 */
export function formatSubject(value: string | null | undefined): string {
  const text = (value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length < 4 || letters !== upper(letters)) return text;
  return formatPersonName(text)
    .split(" ")
    .map((word, index) => (index > 0 && CONNECTORS.has(lower(word)) ? lower(word) : word))
    .join(" ");
}

/** "Meral Aydaç" -> "MA" (temsilci rozeti) */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return upper(first + last);
}
