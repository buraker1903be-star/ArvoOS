"use client";

import { useMemo, useState } from "react";
import { createProposal } from "./sales-actions";
import {
  calculatePaymentSchedule,
  getPaymentPlanLabel,
  type PaymentPlanType,
} from "@/lib/payment-schedule";

type Props = { opportunityId: string; customerName: string; title: string; scope: string };
type Tax = "excluded" | "included" | "exempt";

const money = (value: number) => new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value / 100);

export function ProposalBuilderForm({ opportunityId, customerName, title, scope }: Props) {
  const [amount, setAmount] = useState(0);
  const [tax, setTax] = useState<Tax>("excluded");
  const [plan, setPlan] = useState<PaymentPlanType>("cash");
  const [firstPaymentDate, setFirstPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));

  const calculation = useMemo(() => {
    const amountCents = Math.max(0, Math.round(amount * 100));
    if (tax === "included") {
      const gross = amountCents;
      const net = Math.round(gross / 1.2);
      return { net, vat: gross - net, gross };
    }
    if (tax === "excluded") {
      const net = amountCents;
      const vat = Math.round(net * 0.2);
      return { net, vat, gross: net + vat };
    }
    return { net: amountCents, vat: 0, gross: amountCents };
  }, [amount, tax]);

  const schedule = useMemo(() => {
    const startDate = firstPaymentDate ? new Date(`${firstPaymentDate}T12:00:00`) : new Date();
    return calculatePaymentSchedule(calculation.gross, plan, startDate);
  }, [calculation.gross, plan, firstPaymentDate]);

  const planText = getPaymentPlanLabel(plan);

  return <div className="proposal-drawer-content">
    <section className="proposal-drawer-intro">
      <small>YENİ TEKLİF</small>
      <h3 style={{ fontSize: "18px", lineHeight: 1.25, margin: "8px 0 10px", maxWidth: "calc(100% - 8px)" }}>{customerName} için teklif</h3>
      <p style={{ margin: 0, paddingBottom: "2px" }}>Teklif tutarını, KDV durumunu ve ödeme planını belirleyin.</p>
    </section>

    <form className="panel-form proposal-builder" action={createProposal}>
      <input type="hidden" name="opportunity_id" value={opportunityId} />
      <input type="hidden" name="payment_schedule" value={JSON.stringify(schedule)} />
      <input type="hidden" name="payment_plan" value={planText} />

      <label className="wide">Teklif başlığı<input name="title" required defaultValue={title} /></label>
      <label>Teklif tutarı<input name="amount" type="number" min="0" step="0.01" required onChange={(event) => setAmount(Number(event.target.value) || 0)} /></label>
      <label>KDV durumu<select name="tax_status" value={tax} onChange={(event) => setTax(event.target.value as Tax)}><option value="excluded">KDV Hariç</option><option value="included">KDV Dahil</option><option value="exempt">KDV İstisna</option></select></label>
      <label>Ödeme planı<select name="payment_plan_type" value={plan} onChange={(event) => setPlan(event.target.value as PaymentPlanType)}><option value="cash">Peşin Ödeme</option><option value="half">%50 Peşin - %50 Teslim Öncesi</option><option value="installments_3">3 Taksit</option><option value="installments_6">6 Taksit</option><option value="installments_12">12 Taksit</option></select></label>
      <label>İlk ödeme tarihi<input type="date" value={firstPaymentDate} onChange={(event) => setFirstPaymentDate(event.target.value)} /></label>

      <label className="wide">Hizmet kapsamı<textarea name="scope" required defaultValue={scope} /></label>
      <label className="wide">Geçerlilik tarihi<input name="valid_until" type="date" /></label>

      <section className="proposal-live-summary wide" aria-live="polite">
        <header><span>TEKLİF ÖZETİ</span><strong>{money(calculation.gross)}</strong></header>
        <div><span>Ara toplam</span><b>{money(calculation.net)}</b></div>
        <div><span>KDV</span><b>{money(calculation.vat)}</b></div>
        <div className="proposal-summary-total"><span>Genel toplam</span><strong>{money(calculation.gross)}</strong></div>
        <section className="proposal-payment-breakdown">
          <small>OTOMATİK ÖDEME PLANI</small>
          {schedule.map((item) => <div key={`${item.sequence}-${item.due_date}`}><span>{item.sequence}. {item.label} · {new Date(`${item.due_date}T12:00:00`).toLocaleDateString("tr-TR")}</span><b>{money(item.amount)}</b></div>)}
        </section>
      </section>

      <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Teklifi Oluştur</button></div>
    </form>
  </div>;
}
