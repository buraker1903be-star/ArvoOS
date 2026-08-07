"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createProposal, createContractDirectly, type CreateProposalState } from "./sales-actions";
import {
  buildLabeledSchedule,
  calculatePaymentSchedule,
  getPaymentPlanLabel,
  type PaymentPlanType,
  type PaymentScheduleItem,
} from "@/lib/payment-schedule";

type Props = {
  opportunityId: string;
  customerName: string;
  title: string;
  scope: string;
  mode?: "proposal" | "contract";
};
type Tax = "excluded" | "included" | "exempt";

const initialCreateProposalState: CreateProposalState = { error: null };
const money = (value: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);

const today = () => new Date().toISOString().slice(0, 10);

function SubmitButton({ customPlanValid, mode }: { customPlanValid: boolean; mode: "proposal" | "contract" }) {
  const { pending } = useFormStatus();
  const idleLabel = mode === "contract" ? "Sözleşmeyi Oluştur" : "Teklifi Oluştur";
  const pendingLabel = mode === "contract" ? "Sözleşme Oluşturuluyor..." : "Teklif Oluşturuluyor...";

  return (
    <button
      className="panel-primary"
      type="submit"
      disabled={pending || !customPlanValid}
      aria-disabled={pending || !customPlanValid}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function ProposalBuilderForm({
  opportunityId,
  customerName,
  title,
  scope,
  mode = "proposal",
}: Props) {
  const [state, formAction] = useActionState(
    mode === "contract" ? createContractDirectly : createProposal,
    initialCreateProposalState,
  );
  const [amount, setAmount] = useState(0);
  const [tax, setTax] = useState<Tax>("excluded");
  const [plan, setPlan] = useState<PaymentPlanType>("cash");
  const [customCount, setCustomCount] = useState(2);
  const [customPercentages, setCustomPercentages] = useState<number[]>([50, 50]);

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

  const autoSchedule = useMemo(
    () => calculatePaymentSchedule(calculation.gross, plan),
    [calculation.gross, plan],
  );

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
    () => buildLabeledSchedule(
      calculation.gross,
      customPercentages.map((percentage) => Math.round((calculation.gross * (Number(percentage) || 0)) / 100)),
    ),
    [calculation.gross, customPercentages],
  );

  const schedule = plan === "custom" ? customSchedule : autoSchedule;
  const planText = plan === "custom"
    ? schedule.map((item) => `${item.label}: %${item.percentage.toFixed(0)}${item.trigger ? ` (${item.trigger})` : ""}`).join(" · ")
    : getPaymentPlanLabel(plan);
  const customPlanValid = plan !== "custom" || customPercentTotal === 100;

  return (
    <div className="proposal-drawer-content">
      <section className="proposal-drawer-intro">
        <small>{mode === "contract" ? "DİREKT SÖZLEŞME" : "YENİ TEKLİF"}</small>
        <h3
          style={{
            fontSize: "18px",
            lineHeight: 1.25,
            margin: "8px 0 10px",
            maxWidth: "calc(100% - 8px)",
          }}
        >
          {customerName} için {mode === "contract" ? "sözleşme" : "teklif"}
        </h3>
        <p style={{ margin: 0, paddingBottom: "2px" }}>
          {mode === "contract"
            ? "Tutarı ve ödeme planını belirleyin — müşteri onayı beklenmeden sözleşme hemen oluşturulacak."
            : "Tutarı, ödeme planını ve tahmini teslim tarihini belirleyin."}
        </p>
      </section>

      <form className="panel-form proposal-builder" action={formAction}>
        <input type="hidden" name="opportunity_id" value={opportunityId} />
        <input type="hidden" name="payment_schedule" value={JSON.stringify(schedule)} />
        <input type="hidden" name="payment_plan_type" value={plan} />
        <input type="hidden" name="payment_plan" value={planText} />

        {state.error ? (
          <div className="wide panel-form-error" role="alert" aria-live="assertive" style={{ border: "1px solid currentColor", borderRadius: "10px", padding: "12px 14px" }}>
            <strong>{mode === "contract" ? "Sözleşme oluşturulamadı" : "Teklif oluşturulamadı"}</strong>
            <p style={{ margin: "6px 0 0" }}>{state.error}</p>
          </div>
        ) : null}

        <label className="wide">Teklif başlığı<input name="title" required defaultValue={title} /></label>
        <label>Teklif tutarı<input name="amount" type="number" min="0" step="0.01" required onChange={(event) => setAmount(Number(event.target.value) || 0)} /></label>
        <label>KDV durumu<select name="tax_status" value={tax} onChange={(event) => setTax(event.target.value as Tax)}><option value="excluded">KDV Hariç</option><option value="included">KDV Dahil</option><option value="exempt">KDV İstisna</option></select></label>
        <label className="wide">Ödeme planı<select value={plan} onChange={(event) => setPlan(event.target.value as PaymentPlanType)}><option value="cash">1. Peşin Ödeme</option><option value="half">2. Ön Ödeme (Sözleşme Onayında) + Son Ödeme (Teslim Öncesi)</option><option value="third">3. Ön Ödeme (Sözleşme Onayında) + Ara Ödeme + Son Ödeme (Teslim Öncesi)</option><option value="custom">4. Özel Ödeme Planı (Taksitli)</option></select></label>
        <label>Tahmini teslim tarihi<input name="estimated_delivery_date" type="date" min={today()} required /></label>
        <label>Geçerlilik tarihi<input name="valid_until" type="date" min={today()} /></label>
        <label className="wide">Hizmet kapsamı<textarea name="scope" required defaultValue={scope} /></label>

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
        ) : null}

        <section className="proposal-live-summary wide" aria-live="polite">
          <header><span>TEKLİF ÖZETİ</span><strong>{money(calculation.gross)}</strong></header>
          <div><span>Ara toplam</span><b>{money(calculation.net)}</b></div>
          <div><span>KDV</span><b>{money(calculation.vat)}</b></div>
          <div className="proposal-summary-total"><span>Genel toplam</span><strong>{money(calculation.gross)}</strong></div>
          <section className="proposal-payment-breakdown">
            <small>{plan === "custom" ? "ÖDEME PLANI" : "OTOMATİK ÖDEME PLANI"}</small>
            {schedule.map((item) => <div key={item.sequence}><span>{item.sequence}. {item.label}{item.trigger ? ` · ${item.trigger}` : ""}</span><b>{money(item.amount)}</b></div>)}
          </section>
        </section>

        <div className="wide panel-form-actions"><SubmitButton customPlanValid={customPlanValid} mode={mode} /></div>
      </form>
    </div>
  );
}
