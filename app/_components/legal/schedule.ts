import { normalizePaymentSchedule, type PaymentPlanType } from "@/lib/payment-schedule";
import type { ScheduleRow } from "./format";

export type InstallmentRecord = {
  installment_no?: number | null;
  due_date?: string | null;
  amount?: number | null;
  status?: string | null;
  payment_url?: string | null;
};

const planTypes = new Set<PaymentPlanType>(["cash", "half", "third", "custom"]);

/**
 * Ödeme planını belge satırlarına dönüştürür. İmzasız belgede taksitler
 * güncel toplamla uzlaştırılır; imzalı belge dondurulmuş haliyle gösterilir.
 * İmzadan sonra finans modülünde oluşan taksitler (vade tarihi, durum,
 * ödeme bağlantısı) sıra numarasına göre eşleştirilir.
 */
export function buildSchedule(input: {
  schedule: unknown;
  total: number;
  planType?: string | null;
  planLabel?: string | null;
  fallbackDueDate?: string | null;
  frozen?: boolean;
  installments?: InstallmentRecord[] | null;
}): ScheduleRow[] {
  const planType = planTypes.has(input.planType as PaymentPlanType) ? (input.planType as PaymentPlanType) : undefined;
  const normalized = input.frozen
    ? normalizePaymentSchedule(input.schedule)
    : normalizePaymentSchedule(input.schedule, input.total, planType);
  const base = normalized.length
    ? normalized
    : [{ sequence: 1, label: input.planLabel || "Peşin ödeme", due_date: input.fallbackDueDate || "", trigger: "Sözleşme Onayıyla Ödenecektir", amount: input.total, percentage: 100 }];
  const bySequence = new Map<number, InstallmentRecord>();
  for (const item of input.installments ?? []) {
    if (item?.installment_no != null) bySequence.set(Number(item.installment_no), item);
  }
  const total = base.reduce((sum, item) => sum + item.amount, 0) || input.total;
  return base.map((item) => {
    const record = bySequence.get(item.sequence);
    return {
      sequence: item.sequence,
      label: item.label,
      dueDate: item.due_date || record?.due_date || null,
      trigger: item.trigger || null,
      amount: item.amount,
      percentage: item.percentage || (total ? Number(((item.amount / total) * 100).toFixed(2)) : 0),
      status: record?.status ?? null,
      paymentUrl: record?.payment_url && /^https:\/\//.test(record.payment_url) ? record.payment_url : null,
    };
  });
}
