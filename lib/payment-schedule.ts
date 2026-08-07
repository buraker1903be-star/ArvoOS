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
