// Satış tutarı hesapları. Next ve Supabase'e dokunmaz: teklif/sözleşme
// işlemlerinden ayrı durduğu için birim testlenebilir
// (tests/unit/sales-amounts.test.ts).

import {
  calculatePaymentSchedule,
  carryDueDates,
  normalizePaymentSchedule,
  type PaymentPlanType,
} from "@/lib/payment-schedule";

export const TAX_STATUSES = new Set(["excluded", "included", "exempt"]);

export const PLAN_TYPES = new Set<PaymentPlanType>(["cash", "half", "third", "custom"]);

// create_crm_proposal_v2 ile birebir aynı hesap. Girilen tutar KDV
// durumuna göre net (hariç/istisna) ya da brüt (dahil) kabul edilir;
// crm_proposals.amount her zaman brüt tutarı tutar.

// create_crm_proposal_v2 ile birebir aynı hesap. Girilen tutar KDV
// durumuna göre net (hariç/istisna) ya da brüt (dahil) kabul edilir;
// crm_proposals.amount her zaman brüt tutarı tutar.
export function splitTax(enteredCents: number, taxStatus: string) {
  if (taxStatus === "included") {
    const net = Math.round(enteredCents / 1.2);
    return { net, tax: enteredCents - net, gross: enteredCents };
  }
  if (taxStatus === "excluded") {
    const tax = Math.round(enteredCents * 0.2);
    return { net: enteredCents, tax, gross: enteredCents + tax };
  }
  return { net: enteredCents, tax: 0, gross: enteredCents };
}

// Tutar değiştiğinde ödeme planı da yeni toplama göre yeniden
// hesaplanmalı; yoksa müşteri belgesinde eski taksit tutarları kalıyor.
// Özel planlarda etiketler ve yüzdeler korunur, tutarlar ölçeklenir.
export function rescaleSchedule(stored: unknown, totalCents: number, planType: unknown) {
  const type = PLAN_TYPES.has(planType as PaymentPlanType)
    ? (planType as PaymentPlanType)
    : undefined;
  // Girilmiş vade tarihleri aynı sıra numaralı taksitlere taşınır.
  if (type && type !== "custom") return carryDueDates(calculatePaymentSchedule(totalCents, type), stored);
  const rows = normalizePaymentSchedule(stored, totalCents, type);
  return carryDueDates(rows.length ? rows : calculatePaymentSchedule(totalCents, "cash"), stored);
}

// Teklif / direkt sözleşme oluşturmadan önce talebin satış temsilcisi
// olmalı. Atanmamışsa formdaki seçim zorunlu; seçilen temsilci talebe atanır
// (atama bildirimi tetikleyiciyle gider). Hata metni döner, sorun yoksa null.
