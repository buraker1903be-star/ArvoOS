"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  buildLabeledSchedule,
  calculatePaymentSchedule,
  getPaymentPlanLabel,
  type PaymentPlanType,
  type PaymentScheduleItem,
} from "@/lib/payment-schedule";
import { updateContractPaymentPlan, type UpdateContractPlanState } from "./sales-actions";

const money = (value: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);

const initialState: UpdateContractPlanState = { error: null, success: false };

function SubmitButton({ valid }: { valid: boolean }) {
  const { pending } = useFormStatus();
  return <button className="panel-primary" type="submit" disabled={pending || !valid} aria-disabled={pending || !valid}>{pending ? "Kaydediliyor..." : "Ödeme Planını Kaydet"}</button>;
}

export function ContractPaymentPlanForm({
  contractId,
  amountCents,
  currentPlanType,
}: {
  contractId: string;
  amountCents: number;
  currentPlanType: string | null;
}) {
  const [state, formAction] = useActionState(updateContractPaymentPlan, initialState);
  const initialPlan: PaymentPlanType = (["cash", "half", "third", "custom"] as const).includes(currentPlanType as PaymentPlanType)
    ? (currentPlanType as PaymentPlanType)
    : "cash";
  const [plan, setPlan] = useState<PaymentPlanType>(initialPlan);
  const [customCount, setCustomCount] = useState(2);
  const [customPercentages, setCustomPercentages] = useState<number[]>([50, 50]);

  const autoSchedule = useMemo(() => calculatePaymentSchedule(amountCents, plan), [amountCents, plan]);

  function evenSplit(count: number) {
    const base = Math.floor(100 / count);
    const remainder = 100 - base * count;
    return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
  }
  function setInstallmentCount(count: number) {
    const safeCount = Math.min(8, Math.max(2, count));
    setCustomCount(safeCount);
    setCustomPercentages(evenSplit(safeCount));
  }
  function updatePercentage(index: number, value: number) {
    setCustomPercentages((rows) => rows.map((row, rowIndex) => (rowIndex === index ? value : row)));
  }
  const customPercentTotal = customPercentages.reduce((sum, value) => sum + (Number(value) || 0), 0);
  const customSchedule: PaymentScheduleItem[] = useMemo(
    () => buildLabeledSchedule(amountCents, customPercentages.map((percentage) => Math.round((amountCents * (Number(percentage) || 0)) / 100))),
    [amountCents, customPercentages],
  );

  const schedule = plan === "custom" ? customSchedule : autoSchedule;
  const planText = plan === "custom" ? schedule.map((item) => `${item.label}: %${item.percentage.toFixed(0)}${item.trigger ? ` (${item.trigger})` : ""}`).join(" · ") : getPaymentPlanLabel(plan);
  const valid = plan !== "custom" || customPercentTotal === 100;

  return (
    <form className="panel-form" action={formAction}>
      <input type="hidden" name="contract_id" value={contractId} />
      <input type="hidden" name="payment_plan_type" value={plan} />
      <input type="hidden" name="payment_plan_text" value={planText} />
      <input type="hidden" name="payment_schedule" value={JSON.stringify(schedule)} />
      <label className="wide">Ödeme planı<select value={plan} onChange={(event) => setPlan(event.target.value as PaymentPlanType)}>
        <option value="cash">1. Peşin Ödeme</option>
        <option value="half">2. Ön Ödeme (Sözleşme Onayında) + Son Ödeme (Teslim Öncesi)</option>
        <option value="third">3. Ön Ödeme (Sözleşme Onayında) + Ara Ödeme + Son Ödeme (Teslim Öncesi)</option>
        <option value="custom">4. Özel Ödeme Planı (Taksitli)</option>
      </select></label>

      {plan === "custom" ? (
        <section className="wide custom-plan-editor">
          <div className="custom-plan-head"><small>ÖZEL ÖDEME PLANI — TAKSİT SAYISI</small><span className={customPercentTotal === 100 ? "custom-plan-total ok" : "custom-plan-total warn"}>Toplam %{customPercentTotal.toFixed(0)}</span></div>
          <label className="custom-plan-count">Taksit sayısı<input type="number" min={2} max={8} value={customCount} onChange={(event) => setInstallmentCount(Number(event.target.value) || 2)} /></label>
          <div className="custom-plan-rows">
            {schedule.map((item, index) => (
              <div className="custom-plan-row" key={item.sequence}>
                <span className="custom-plan-index">{item.sequence}</span>
                <span className="custom-plan-row-label">{item.label}{item.trigger ? <small> · {item.trigger}</small> : null}</span>
                <input type="number" min="0" max="100" step="1" value={customPercentages[index] ?? 0} onChange={(event) => updatePercentage(index, Number(event.target.value) || 0)} />
                <span className="custom-plan-percent-sign">%</span>
                <span className="custom-plan-amount">{money(item.amount)}</span>
              </div>
            ))}
          </div>
          {customPercentTotal !== 100 ? <p className="custom-plan-hint">Taksit yüzdeleri toplamı %100 olmalı (şu an %{customPercentTotal.toFixed(0)}).</p> : null}
        </section>
      ) : (
        <section className="wide proposal-payment-breakdown">
          <small>ÖDEME PLANI ÖNİZLEME</small>
          {schedule.map((item) => <div key={item.sequence}><span>{item.sequence}. {item.label}{item.trigger ? ` · ${item.trigger}` : ""}</span><b>{money(item.amount)}</b></div>)}
        </section>
      )}

      {state.error ? <div className="wide panel-form-error" role="alert" style={{ border: "1px solid currentColor", borderRadius: "10px", padding: "12px 14px" }}><strong>Kaydedilemedi</strong><p style={{ margin: "6px 0 0" }}>{state.error}</p></div> : null}
      {state.success ? <div className="wide panel-form-success" role="status" style={{ border: "1px solid currentColor", borderRadius: "10px", padding: "12px 14px" }}>Ödeme planı güncellendi.</div> : null}

      <div className="wide panel-form-actions"><SubmitButton valid={valid} /></div>
      {!valid ? <p className="wide custom-plan-hint">Kaydetmeden önce taksit yüzdelerini %100&apos;e tamamlayın.</p> : null}
    </form>
  );
}
