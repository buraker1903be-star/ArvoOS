export type PaymentPlanType = "cash" | "half" | "third" | "custom";

export type PaymentScheduleItem = {
  sequence: number;
  label: string;
  due_date: string;
  trigger?: string;
  amount: number;
  percentage: number;
};

const TRIGGER_CONTRACT = "Sözleşme Onayıyla Ödenecektir";
const TRIGGER_BEFORE_DELIVERY = "Teslimden 1 İş Günü Öncesi Ödenecektir";

const splitCents = (totalCents: number, count: number) => {
  const safeTotal = Math.max(0, Math.round(totalCents));
  const safeCount = Math.max(1, Math.round(count));
  const base = Math.floor(safeTotal / safeCount);
  const remainder = safeTotal - base * safeCount;
  return Array.from({ length: safeCount }, (_, index) => base + (index < remainder ? 1 : 0));
};

const percentOf = (amount: number, total: number) => (total ? Number(((amount / total) * 100).toFixed(2)) : 0);

/**
 * Yüzdeleri kuruşa çevirirken toplamı tam tutar. Eskiden her taksit ayrı ayrı
 * yuvarlanıyordu (`Math.round(tutar * yüzde / 100)`); %33 + %33 + %34 gibi
 * planlarda taksitlerin toplamı sözleşme tutarından birkaç kuruş sapıyordu.
 * İmzada taksitler bu tutarlarla yazıldığı için ödeme planı hiçbir zaman
 * "kapandı" sayılmıyor, müşteri portalındaki kilitli dosyalar açılmıyordu.
 * Yüzdeler %100 etmiyorsa (form kaydetmeye izin vermez) önizleme dürüst
 * kalsın diye tutarlar da o oranda eksik hesaplanır.
 */
export function splitByPercentages(totalCents: number, percentages: number[]): number[] {
  const safeTotal = Math.max(0, Math.round(totalCents));
  const weights = percentages.map((value) => Math.max(0, Number(value) || 0));
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  if (!weights.length) return [];
  if (weightTotal <= 0) return weights.map(() => 0);

  const target = Math.round((safeTotal * weightTotal) / 100);
  const amounts = weights.map((weight) => Math.floor((target * weight) / weightTotal));
  let remainder = target - amounts.reduce((sum, value) => sum + value, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % amounts.length) {
    amounts[index] += 1;
    remainder -= 1;
  }
  return amounts;
}

/**
 * Belirli bir tutar dizisini (her taksitin nakit tutarı) otomatik olarak
 * Ön Ödeme / Ara Ödeme / Son Ödeme şeklinde etiketler ve tetikleyici
 * metnini (ne zaman ödeneceği — tarih değil, olay bazlı) belirler.
 * Tek taksit varsa "Peşin Ödeme" olarak etiketlenir.
 */
export function buildLabeledSchedule(totalCents: number, amounts: number[]): PaymentScheduleItem[] {
  const safeTotal = Math.max(0, Math.round(totalCents));
  const middleCount = Math.max(0, amounts.length - 2);
  return amounts.map((amount, index) => {
    let label: string;
    let trigger: string;
    if (amounts.length === 1) {
      label = "Peşin Ödeme";
      trigger = TRIGGER_CONTRACT;
    } else if (index === 0) {
      label = "Ön Ödeme";
      trigger = TRIGGER_CONTRACT;
    } else if (index === amounts.length - 1) {
      label = "Son Ödeme";
      trigger = TRIGGER_BEFORE_DELIVERY;
    } else {
      label = middleCount > 1 ? `${index}. Ara Ödeme` : "Ara Ödeme";
      trigger = "";
    }
    return {
      sequence: index + 1,
      label,
      due_date: "",
      trigger,
      amount: Math.round(amount),
      percentage: percentOf(amount, safeTotal),
    };
  });
}

const validDueDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

/** Taksitlere sıra numarasına göre vade tarihi uygular (boş değer tarihi kaldırır). */
export function applyDueDates(schedule: PaymentScheduleItem[], dates: Record<number, string>): PaymentScheduleItem[] {
  return schedule.map((item) => ({ ...item, due_date: dates[item.sequence] ?? item.due_date ?? "" }));
}

/**
 * Önceki plandaki vade tarihlerini aynı sıra numaralı taksitlere taşır.
 * Tutar değişip plan yeniden hesaplandığında girilmiş tarihler kaybolmasın.
 */
export function carryDueDates(next: PaymentScheduleItem[], previous: unknown): PaymentScheduleItem[] {
  if (!Array.isArray(previous)) return next;
  const bySequence = new Map<number, string>();
  previous.forEach((item, index) => {
    const row = (item ?? {}) as Partial<PaymentScheduleItem>;
    const due = String(row.due_date ?? "");
    if (validDueDate(due)) bySequence.set(Number(row.sequence ?? index + 1), due);
  });
  return next.map((item) => (item.due_date ? item : { ...item, due_date: bySequence.get(item.sequence) ?? "" }));
}

/**
 * Her taksitin ya net bir vade tarihi ya da ödeme koşulu (ör. "Sözleşme
 * Onayıyla") olmalı. Eskiden 3'lü planın "Ara Ödeme"si ikisi de olmadan
 * kaydediliyor, sözleşmenin ödeme tablosunda boş görünüyordu.
 * Hata metni ya da null döner.
 */
export function scheduleDateIssue(schedule: unknown): string | null {
  if (!Array.isArray(schedule)) return "Ödeme planı okunamadı. Ödeme planını yeniden oluşturun.";
  for (const [index, item] of schedule.entries()) {
    const row = (item ?? {}) as Partial<PaymentScheduleItem>;
    const label = String(row.label ?? "").trim() || `${index + 1}. Ödeme`;
    const due = String(row.due_date ?? "").trim();
    if (due && !validDueDate(due)) return `“${label}” için geçerli bir vade tarihi seçin.`;
    if (!due && !String(row.trigger ?? "").trim()) return `“${label}” için vade tarihi girin; tarihi ya da koşulu olmayan taksit sözleşmede boş görünür.`;
  }
  return null;
}

/**
 * Taksit adı. Eski kayıtlarda tek satırlık planın adı bütün plan metni
 * ("ÖN ÖDEME: 16.000 TL (...) ARA ÖDEME: ...") olabiliyor; uzun adlar
 * "1. Ödeme" biçimine kısaltılır.
 */
export function installmentLabel(label: unknown, sequence: number) {
  const text = String(label ?? "").trim().replace(/\s+/g, " ");
  return text && text.length <= 40 ? text : `${sequence}. Ödeme`;
}

export function getPaymentPlanLabel(type: PaymentPlanType) {
  if (type === "cash") return "Peşin Ödeme";
  if (type === "half") return "Ön Ödeme (Sözleşme Onayıyla) - Son Ödeme (Teslimden Önce)";
  if (type === "third") return "Ön Ödeme (Sözleşme Onayıyla) - Ara Ödeme - Son Ödeme (Teslimden Önce)";
  return "Özel Ödeme Planı";
}

/**
 * "custom" hariç tüm planlar burada tamamen otomatik hesaplanır (Ücret Hesapla).
 * "custom" için sadece tek satırlık bir başlangıç noktası döner; gerçek satırlar
 * ProposalBuilderForm içindeki düzenlenebilir taksit listesinden gelir.
 */
export function calculatePaymentSchedule(
  totalCents: number,
  type: PaymentPlanType,
): PaymentScheduleItem[] {
  const safeTotal = Math.max(0, Math.round(totalCents));

  if (type === "cash") return buildLabeledSchedule(safeTotal, [safeTotal]);
  if (type === "half") return buildLabeledSchedule(safeTotal, splitCents(safeTotal, 2));
  if (type === "third") return buildLabeledSchedule(safeTotal, splitCents(safeTotal, 3));

  // custom: tek satırlık başlangıç noktası, kullanıcı formda taksit sayısını belirler.
  return buildLabeledSchedule(safeTotal, [safeTotal]);
}

export function normalizePaymentSchedule(
  value: unknown,
  expectedTotalCents?: number,
  fallbackType?: PaymentPlanType,
): PaymentScheduleItem[] {
  const expectedTotal = Number.isFinite(expectedTotalCents)
    ? Math.max(0, Math.round(Number(expectedTotalCents)))
    : 0;

  if (!Array.isArray(value) || value.length === 0) {
    return fallbackType && expectedTotal > 0
      ? calculatePaymentSchedule(expectedTotal, fallbackType)
      : [];
  }

  const rows = value.map((item, index) => {
    const row = item as Partial<PaymentScheduleItem> & { amount?: number; label?: string };
    return {
      sequence: Number(row.sequence ?? index + 1),
      label: String(row.label ?? `${index + 1}. Ödeme`),
      due_date: String(row.due_date ?? ""),
      trigger: row.trigger ? String(row.trigger) : undefined,
      amount: Math.max(0, Math.round(Number(row.amount ?? 0))),
      percentage: Math.max(0, Number(row.percentage ?? 0)),
    };
  });

  if (expectedTotal <= 0) return rows.filter((item) => item.amount > 0 || item.label);

  const storedTotal = rows.reduce((sum, item) => sum + item.amount, 0);
  if (storedTotal === expectedTotal) return rows;

  // Legacy records may contain TL values while current records store kuruş.
  if (storedTotal * 100 === expectedTotal) {
    const corrected = rows.map((item) => ({ ...item, amount: item.amount * 100 }));
    const correctedTotal = corrected.reduce((sum, item) => sum + item.amount, 0);
    if (correctedTotal === expectedTotal) return corrected;
  }

  // If the stored plan is stale or malformed, rebuild it from the selected plan type.
  if (fallbackType && fallbackType !== "custom") {
    return calculatePaymentSchedule(expectedTotal, fallbackType);
  }

  // Preserve custom labels/triggers, but force installment amounts to reconcile exactly.
  const weights = rows.map((item) => item.percentage > 0 ? item.percentage : item.amount);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const amounts = weightTotal > 0
    ? (() => {
        const provisional = weights.map((weight) => Math.floor((expectedTotal * weight) / weightTotal));
        let remainder = expectedTotal - provisional.reduce((sum, amount) => sum + amount, 0);
        for (let index = 0; remainder > 0; index = (index + 1) % provisional.length) {
          provisional[index] += 1;
          remainder -= 1;
        }
        return provisional;
      })()
    : splitCents(expectedTotal, rows.length);

  return rows.map((item, index) => ({
    ...item,
    amount: amounts[index],
    percentage: expectedTotal ? Number(((amounts[index] / expectedTotal) * 100).toFixed(2)) : 0,
  }));
}
