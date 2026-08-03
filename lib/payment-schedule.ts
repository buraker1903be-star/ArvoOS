export type PaymentPlanType = "cash" | "half" | "installments_3" | "installments_6" | "installments_12";

export type PaymentScheduleItem = {
  sequence: number;
  label: string;
  due_date: string;
  amount: number;
  percentage: number;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const splitCents = (totalCents: number, count: number) => {
  const safeTotal = Math.max(0, Math.round(totalCents));
  const safeCount = Math.max(1, Math.round(count));
  const base = Math.floor(safeTotal / safeCount);
  const remainder = safeTotal - base * safeCount;
  return Array.from({ length: safeCount }, (_, index) => base + (index < remainder ? 1 : 0));
};

export function getPaymentPlanLabel(type: PaymentPlanType) {
  if (type === "cash") return "Peşin Ödeme";
  if (type === "half") return "%50 Peşin - %50 Teslim Öncesi";
  if (type === "installments_3") return "3 Taksit";
  if (type === "installments_6") return "6 Taksit";
  return "12 Taksit";
}

export function calculatePaymentSchedule(
  totalCents: number,
  type: PaymentPlanType,
  startDate = new Date(),
): PaymentScheduleItem[] {
  const safeTotal = Math.max(0, Math.round(totalCents));

  if (type === "cash") {
    return [{ sequence: 1, label: "Peşin ödeme", due_date: isoDate(startDate), amount: safeTotal, percentage: 100 }];
  }

  if (type === "half") {
    const [first, second] = splitCents(safeTotal, 2);
    return [
      { sequence: 1, label: "Peşin ödeme", due_date: isoDate(startDate), amount: first, percentage: 50 },
      { sequence: 2, label: "Teslim öncesi", due_date: isoDate(addDays(startDate, 30)), amount: second, percentage: 50 },
    ];
  }

  const count = type === "installments_3" ? 3 : type === "installments_6" ? 6 : 12;
  const amounts = splitCents(safeTotal, count);
  return amounts.map((amount, index) => ({
    sequence: index + 1,
    label: `${index + 1}. Taksit`,
    due_date: isoDate(addDays(startDate, index * 30)),
    amount,
    percentage: safeTotal ? Number(((amount / safeTotal) * 100).toFixed(2)) : 0,
  }));
}

export function normalizePaymentSchedule(
  value: unknown,
  expectedTotalCents?: number,
  fallbackType?: PaymentPlanType,
  fallbackStartDate = new Date(),
): PaymentScheduleItem[] {
  const expectedTotal = Number.isFinite(expectedTotalCents)
    ? Math.max(0, Math.round(Number(expectedTotalCents)))
    : 0;

  if (!Array.isArray(value) || value.length === 0) {
    return fallbackType && expectedTotal > 0
      ? calculatePaymentSchedule(expectedTotal, fallbackType, fallbackStartDate)
      : [];
  }

  const rows = value.map((item, index) => {
    const row = item as Partial<PaymentScheduleItem> & { amount?: number; label?: string };
    return {
      sequence: Number(row.sequence ?? index + 1),
      label: String(row.label ?? `${index + 1}. Ödeme`),
      due_date: String(row.due_date ?? ""),
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
  if (fallbackType) {
    const firstDueDate = rows[0]?.due_date
      ? new Date(`${rows[0].due_date}T12:00:00`)
      : fallbackStartDate;
    return calculatePaymentSchedule(expectedTotal, fallbackType, firstDueDate);
  }

  // Preserve custom labels/dates, but force installment amounts to reconcile exactly.
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
