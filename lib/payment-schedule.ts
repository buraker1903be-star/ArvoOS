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
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
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
    const first = Math.floor(safeTotal / 2);
    const second = safeTotal - first;
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

export function normalizePaymentSchedule(value: unknown): PaymentScheduleItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const row = item as Partial<PaymentScheduleItem> & { amount?: number; label?: string };
      const amount = Math.max(0, Math.round(Number(row.amount ?? 0)));
      return {
        sequence: Number(row.sequence ?? index + 1),
        label: String(row.label ?? `${index + 1}. Ödeme`),
        due_date: String(row.due_date ?? ""),
        amount,
        percentage: Number(row.percentage ?? 0),
      };
    })
    .filter((item) => item.amount > 0 || item.label);
}
