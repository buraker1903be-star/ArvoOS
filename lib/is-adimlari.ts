// İş adımlarının durumu, termini ve hatırlatma kararı.
//
// Saf modül (Next/React/Supabase yok): testi tests/unit/is-adimlari.test.ts.
// Veritabanı tarafı ve gerekçeler:
// supabase/migrations/20260925113839_is_adimlari_tarihli_ve_kiraci_sablonu.sql

export type StepStatus = "planned" | "in_progress" | "review" | "done";
export type ReminderState = "due_soon" | "overdue";

export const STEP_STATUSES: StepStatus[] = ["planned", "in_progress", "review", "done"];

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  planned: "Planlandı",
  in_progress: "Çalışılıyor",
  review: "Kontrolde",
  done: "Tamamlandı",
};

export const STEP_STATUS_TONES: Record<StepStatus, string> = {
  planned: "neutral",
  in_progress: "info",
  review: "warning",
  done: "success",
};

/*
  İŞİN durumu (adımın değil). Liste üç yerde ayrı ayrı yazılıydı: iş detayı,
  çizelge ve sunucu işlemleri. Kayıt geçmişine "Devam ediyor → Tamamlandı"
  yazabilmek için dördüncü bir kopya gerekiyordu; kopya yerine tek kaynak.

  "archived" seçicide yok: arşive yalnızca tamamlanan iş "Arşivle" ile
  gider. Ama geçmişte ve etikette görünmesi gerekiyor.
*/
export const IS_DURUM_ADLARI: Record<string, string> = {
  planned: "Planlandı",
  in_progress: "Devam ediyor",
  blocked: "Beklemede",
  completed: "Tamamlandı",
  cancelled: "İptal",
  archived: "Arşivlendi",
};

export const isDurumAdi = (deger: string) => IS_DURUM_ADLARI[deger] ?? deger;

export const isStepStatus = (value: unknown): value is StepStatus =>
  typeof value === "string" && (STEP_STATUSES as string[]).includes(value);

/** Termin uyarısının açılma eşiği; ekrandaki dueBadge ile aynı (ops-shared.tsx). */
export const YAKLASIK_GUN = 3;

const GUN = 86_400_000;
const ISO_GUN = /^\d{4}-\d{2}-\d{2}$/;

export function isoGunMu(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_GUN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** İki gün anahtarı arasındaki fark (hedef - bugün). */
export const gunFarki = (bugun: string, hedef: string) =>
  Math.round((Date.parse(`${hedef}T00:00:00Z`) - Date.parse(`${bugun}T00:00:00Z`)) / GUN);

/**
 * Bir adım için hangi uyarı durumu geçerli: geçti mi, yaklaştı mı, yoksa
 * daha erken mi. Tarih yoksa ya da adım bittiyse uyarı yok.
 */
export function hatirlatmaDurumu(
  adim: { due_date: string | null; is_completed: boolean },
  bugun: string,
): ReminderState | null {
  if (adim.is_completed || !isoGunMu(adim.due_date)) return null;
  const fark = gunFarki(bugun, adim.due_date);
  if (fark < 0) return "overdue";
  if (fark <= YAKLASIK_GUN) return "due_soon";
  return null;
}

export interface HatirlatilacakAdim {
  id: string;
  workflow_id: string;
  organization_id: string;
  title: string;
  due_date: string | null;
  is_completed: boolean;
  reminder_state: ReminderState | null;
  assigned_employee_id: string | null;
}

/**
 * Bu koşuda kime uyarı gidecek.
 *
 * Aynı uyarı iki kez gitmiyor: adımda en son hangi durum için
 * gönderildiği yazılı (reminder_state) ve yalnızca DEĞİŞTİĞİNDE yeniden
 * gidiyor. Böylece "yaklaştı" bir kez, gün geçince "gecikti" bir kez daha
 * düşüyor; her gece aynı satırı tekrar bildirmiyor.
 *
 * Geri de gidebiliyor: adımın tarihi ileri alınırsa veritabanı işareti
 * temizliyor (arvo_operation_step_status_sync), yani ertelenen iş yeniden
 * gecikirse uyarı tekrar gelir.
 */
export function hatirlatilacaklar(adimlar: HatirlatilacakAdim[], bugun: string) {
  return adimlar
    .map((adim) => ({ adim, durum: hatirlatmaDurumu(adim, bugun) }))
    .filter((satir): satir is { adim: HatirlatilacakAdim; durum: ReminderState } =>
      satir.durum !== null && satir.durum !== satir.adim.reminder_state);
}

/** Bildirim metni: "3 gün kaldı" / "2 gün gecikti". */
export function hatirlatmaMetni(baslik: string, due: string, bugun: string) {
  const fark = gunFarki(bugun, due);
  if (fark < 0) return `“${baslik}” adımının teslimi ${-fark} gün gecikti.`;
  if (fark === 0) return `“${baslik}” adımı bugün teslim edilmeli.`;
  return `“${baslik}” adımının teslimine ${fark} gün kaldı.`;
}

// ---------- Kurum adım şablonu ----------

export interface StepTemplateRow {
  code: string;
  title: string;
  sort_order: number;
  day_offset: number | null;
  is_active: boolean;
}

/** Veritabanıyla aynı sınırlar (organization_step_templates CHECK'leri). */
export const SABLON_KODU = /^[a-z0-9_]{2,40}$/;
export const SABLON_EN_COK = 40;
export const OFSET_EN_COK = 3650;

/*
  Kurum şablonu tanımlamamışsa add_standard_operation_steps bu sekiz adımı
  kullanıyor. Liste burada da duruyor çünkü ekran "varsayılanı kopyala"
  düğmesi sunuyor: kurum kendi şablonunu sıfırdan yazmak yerine bugünkü
  listeden başlayıp düzenleyebilsin. İki yer de değişirse ikisi birden
  değişmeli; testi bunu sabitliyor.
*/
export const VARSAYILAN_ADIMLAR: { code: string; title: string }[] = [
  { code: "is_kabul", title: "İş Kabul Edildi" },
  { code: "hazirlik", title: "Hazırlık Yapılıyor" },
  { code: "hazirlaniyor", title: "Hazırlanıyor" },
  { code: "ic_kontrol", title: "İç Kontrol Yapılıyor" },
  { code: "hazirlandi", title: "Hazırlandı" },
  { code: "talimat", title: "Müşteri İlişkileri Talimatı Bekleniyor" },
  { code: "revizyon", title: "Revizyonlar Yapılıyor" },
  { code: "teslime_hazir", title: "Evrak Teslimine Hazır" },
];

/** Formdan gelen şablonu veritabanına göndermeden önce denetler. Hata metni ya da null. */
export function sablonSorunu(satirlar: unknown): string | null {
  if (!Array.isArray(satirlar)) return "Şablon okunamadı. Sayfayı yenileyip tekrar deneyin.";
  if (satirlar.length > SABLON_EN_COK) return `Şablona en fazla ${SABLON_EN_COK} adım eklenebilir.`;
  const kodlar = new Set<string>();
  for (const [sira, ham] of satirlar.entries()) {
    const satir = (ham ?? {}) as Partial<StepTemplateRow>;
    const title = String(satir.title ?? "").trim();
    if (title.length < 2 || title.length > 180) return `${sira + 1}. adımın adını yazın (2–180 karakter).`;
    const code = String(satir.code ?? "").trim();
    if (!SABLON_KODU.test(code)) return `${sira + 1}. adımın kodu geçersiz (küçük harf, rakam ve alt çizgi).`;
    if (kodlar.has(code)) return `“${code}” kodu iki kez kullanılmış; her adımın kodu benzersiz olmalı.`;
    kodlar.add(code);
    const offset = satir.day_offset;
    if (offset !== null && offset !== undefined) {
      if (!Number.isInteger(offset) || offset < 0 || offset > OFSET_EN_COK) {
        return `${sira + 1}. adımın gün sayısı 0 ile ${OFSET_EN_COK} arasında olmalı.`;
      }
    }
  }
  return null;
}

/**
 * Başlıktan kod türetir ("Literatür 1. kısım" → "literatur_1_kisim").
 *
 * Türkçe harfler ASCII'ye çevriliyor: kod deseni yalnızca [a-z0-9_] kabul
 * ediyor ve "ş" ya da "İ" içeren bir başlık aksi hâlde boş koda düşerdi.
 * "I" ve "İ" ayrımı önemli: toLocaleLowerCase("tr") "I"yı "ı" yapar, o da
 * ASCII'de "i"dir — sırasıyla yapılmazsa "IŞIK" ile "Işık" farklı kod üretir.
 */
export function kodTuret(baslik: string, kullanilan: Set<string> = new Set()) {
  const ascii = baslik
    .replace(/İ/g, "I").replace(/ı/g, "i")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/ğ/g, "g").replace(/ş/g, "s").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const govde = ascii.length >= 2 ? ascii : "adim";
  if (!kullanilan.has(govde)) return govde;
  for (let ek = 2; ek < 100; ek += 1) {
    const aday = `${govde.slice(0, 37)}_${ek}`;
    if (!kullanilan.has(aday)) return aday;
  }
  return `${govde.slice(0, 34)}_${Date.now() % 1000}`;
}
