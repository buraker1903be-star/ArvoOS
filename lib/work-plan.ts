// Sözleşme iş planı (ara teslim takvimi) ve ek protokol yardımcıları.
// Veritabanı tarafı ve kurallar:
// supabase/migrations/20260914090000_contract_work_plan_addenda.sql

export type WorkPlanItem = { sequence: number; title: string; due_date: string };
export type AddendumPaymentDate = { sequence: number; due_date: string };
export type AddendumStatus = "sent" | "accepted" | "rejected" | "cancelled";

export type ContractAddendum = {
  id: string;
  addendum_no: number;
  work_plan: WorkPlanItem[];
  payment_dates: AddendumPaymentDate[];
  note: string | null;
  status: AddendumStatus;
  created_at: string;
  responded_at: string | null;
  responder_name: string | null;
  responder_ip: string | null;
  responder_user_agent: string | null;
  response_note: string | null;
};

/** Veritabanıyla aynı sınır (arvo_normalize_work_plan). */
export const WORK_PLAN_LIMIT = 20;

export const ADDENDUM_STATUS_LABELS: Record<AddendumStatus, string> = {
  sent: "Müşteri onayı bekleniyor",
  accepted: "Müşteri onayladı",
  rejected: "Müşteri değişiklik istedi",
  cancelled: "Geri çekildi",
};

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Belgede ve takip sayfasında gösterim için: geçersiz satırları atar, tarihe göre sıralar. */
export function normalizeWorkPlan(value: unknown): WorkPlanItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const row = (item ?? {}) as Partial<WorkPlanItem>;
      return { sequence: Number(row.sequence) || index + 1, title: String(row.title ?? "").trim(), due_date: String(row.due_date ?? "") };
    })
    .filter((row) => row.title && isIsoDate(row.due_date))
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.sequence - b.sequence)
    .map((row, index) => ({ ...row, sequence: index + 1 }));
}

function normalizePaymentDates(value: unknown): AddendumPaymentDate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = (item ?? {}) as Partial<AddendumPaymentDate>;
      return { sequence: Number(row.sequence), due_date: String(row.due_date ?? "") };
    })
    .filter((row) => Number.isInteger(row.sequence) && row.sequence > 0 && isIsoDate(row.due_date))
    .sort((a, b) => a.sequence - b.sequence);
}

const STATUSES = new Set<AddendumStatus>(["sent", "accepted", "rejected", "cancelled"]);
const textOrNull = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

export function normalizeAddenda(value: unknown): ContractAddendum[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      return {
        id: String(row.id ?? ""),
        addendum_no: Number(row.addendum_no) || 0,
        work_plan: normalizeWorkPlan(row.work_plan),
        payment_dates: normalizePaymentDates(row.payment_dates),
        note: textOrNull(row.note),
        status: (STATUSES.has(row.status as AddendumStatus) ? row.status : "sent") as AddendumStatus,
        created_at: String(row.created_at ?? ""),
        responded_at: textOrNull(row.responded_at),
        responder_name: textOrNull(row.responder_name),
        responder_ip: textOrNull(row.responder_ip),
        responder_user_agent: textOrNull(row.responder_user_agent),
        response_note: textOrNull(row.response_note),
      };
    })
    .filter((row) => row.id && row.addendum_no > 0)
    .sort((a, b) => a.addendum_no - b.addendum_no);
}

/** Formdan gelen iş planını veritabanına göndermeden önce denetler. Hata metni ya da null. */
export function workPlanIssue(value: unknown): string | null {
  if (!Array.isArray(value)) return "İş planı okunamadı. Sayfayı yenileyip tekrar deneyin.";
  if (value.length > WORK_PLAN_LIMIT) return `İş planına en fazla ${WORK_PLAN_LIMIT} teslim eklenebilir.`;
  for (const [index, item] of value.entries()) {
    const row = (item ?? {}) as { title?: unknown; due_date?: unknown };
    const title = String(row.title ?? "").trim();
    if (title.length < 2 || title.length > 200) return `${index + 1}. teslimin içeriğini yazın (2–200 karakter).`;
    if (!isIsoDate(row.due_date)) return `${index + 1}. teslim için geçerli bir tarih seçin.`;
  }
  return null;
}

// Veritabanı hata kodları → kullanıcı metni. Özel kodlar genelden önce gelir
// ("invalid_work_plan_title", "invalid_work_plan"ı da içerir).
const ADDENDUM_ERRORS: [string, string][] = [
  ["contract_not_signed", "Ek protokol yalnızca imzalanmış sözleşmede oluşturulur. İmza öncesi takvimi “İş Planı” ve “Ödeme Planı” ile doğrudan sözleşmeye yazın."],
  ["addendum_pending", "Bu sözleşmede müşterinin onayını bekleyen bir ek protokol var. Yenisini göndermeden önce onu geri çekin."],
  ["addendum_empty", "Ek protokola en az bir ara teslim ya da bir ödeme tarihi girin."],
  ["installment_closed", "Ödenmiş taksidin vadesi değiştirilemez."],
  ["unknown_installment", "Seçilen taksit bu sözleşmenin ödeme planında bulunamadı."],
  ["duplicate_installment", "Aynı taksit için iki tarih girilemez."],
  ["invalid_work_plan_title", "Her ara teslimin içeriğini yazın (2–200 karakter)."],
  ["invalid_work_plan_date", "Her ara teslim için geçerli bir tarih seçin."],
  ["work_plan_too_long", `İş planına en fazla ${WORK_PLAN_LIMIT} teslim eklenebilir.`],
  ["invalid_work_plan", "İş planı okunamadı. Sayfayı yenileyip tekrar deneyin."],
  ["invalid_payment_date", "Ödeme tarihleri okunamadı. Tarihleri kontrol edin."],
  ["contract_not_found", "Sözleşme bulunamadı veya bu sözleşmeye erişiminiz yok."],
  ["addendum_not_found", "Ek protokol bulunamadı veya erişiminiz yok."],
  ["iş planı değiştirilemez", "Bu sözleşme imzalandı; iş planı değişikliği için ek protokol oluşturun."],
];

export function addendumErrorMessage(message: string | null | undefined, fallback = "İşlem tamamlanamadı. Lütfen tekrar deneyin.") {
  const text = String(message ?? "");
  return ADDENDUM_ERRORS.find(([code]) => text.includes(code))?.[1] ?? fallback;
}
