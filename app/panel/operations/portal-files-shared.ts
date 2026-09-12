// Müşteri portalı dosyaları: istemci (yükleme kartı) ve sunucu (kayıt
// işlemi) arasında ortak kurallar. Kova sınırları migration
// 20260912203000_customer_portal_files.sql ile aynıdır.

export const PORTAL_BUCKET = "customer-portal-files";
export const PORTAL_MAX_BYTES = 50 * 1024 * 1024;
export const PORTAL_MAX_FILES_PER_BATCH = 10;

export type PortalAccessRule = "after_full_payment" | "immediate";
export const PORTAL_ACCESS_RULES: Record<PortalAccessRule, string> = {
  after_full_payment: "Ödeme tamamlanınca açılır",
  immediate: "Hemen erişilebilir",
};

// Uzantı → içerik türü. Tarayıcıların bildirdiği tür güvenilmez (Windows
// .csv'yi Excel, .zip'i x-zip-compressed diye bildirir); yüklemede tür
// uzantıdan belirlenir, sunucu depodaki türle yeniden doğrular.
export const PORTAL_EXTENSIONS: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  txt: "text/plain",
  csv: "text/csv",
};

export const PORTAL_ACCEPT = Object.keys(PORTAL_EXTENSIONS).map((ext) => `.${ext}`).join(",");
export const PORTAL_ALLOWED_MIME = new Set([...Object.values(PORTAL_EXTENSIONS), "application/x-zip-compressed"]);

export function portalExtension(fileName: string) {
  const match = /\.([a-z0-9]{1,8})$/i.exec(fileName.trim());
  const ext = match?.[1]?.toLowerCase() ?? "";
  return ext in PORTAL_EXTENSIONS ? ext : null;
}

// Kontrol karakterleri (U+0000–U+001F, U+007F); boşluk ve tire korunur.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");

/** Dosya adı: yol parçaları ve kontrol karakterleri atılır, 200 karaktere kısaltılır. */
export function cleanPortalFileName(fileName: string) {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= 200) return cleaned;
  const ext = portalExtension(cleaned);
  return ext ? `${cleaned.slice(0, 199 - ext.length).trimEnd()}.${ext}` : cleaned.slice(0, 200);
}

/** Depolama anahtarı: <kurum>/<iş>/<rastgele-uuid>.<uzantı> — asıl ad yalnızca tabloda. */
export const PORTAL_OBJECT_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/;

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB`;
}
