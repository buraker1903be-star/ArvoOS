"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createContractDirectly } from "./contract-actions";
import { createProposal } from "./proposal-actions";
import type { CreateProposalState } from "./sales-shared";
import { parseTurkishAmount } from "@/lib/turkish-amount";
import { todayInIstanbul } from "@/lib/istanbul-date";
import {
  applyDueDates,
  buildLabeledSchedule,
  calculatePaymentSchedule,
  getPaymentPlanLabel,
  scheduleDateIssue,
  splitByPercentages,
  type PaymentPlanType,
  type PaymentScheduleItem,
} from "@/lib/payment-schedule";
import { ScheduleDateRows } from "./schedule-date-rows";
// Ortak çekmece formu düzeni; bileşen stilini kendisi alıyor (AGENTS.md).
import "../components/kayit-formu.css";

type Props = {
  opportunityId: string;
  title: string;
  scope: string;
  mode?: "proposal" | "contract";
  /** Talebe atanabilecek satış temsilcileri (talepte temsilci yoksa seçim zorunlu) */
  representatives?: { id: string; full_name: string }[];
  needsRepresentative?: boolean;
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

/* Türkiye günü: toISOString UTC'ye çeviriyor ve gece 00:00–03:00
   arasında dünü veriyordu, yani kutular geçmiş bir günü kabul ediyordu. */
const today = () => todayInIstanbul();
const shortDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("tr-TR");

function SubmitButton({ customPlanValid, mode, blocked = false }: { customPlanValid: boolean; mode: "proposal" | "contract"; blocked?: boolean }) {
  const { pending } = useFormStatus();
  const idleLabel = mode === "contract" ? "Sözleşmeyi Oluştur" : "Teklifi Oluştur";
  const pendingLabel = mode === "contract" ? "Sözleşme Oluşturuluyor..." : "Teklif Oluşturuluyor...";

  return (
    <button
      className="panel-primary"
      type="submit"
      disabled={pending || !customPlanValid || blocked}
      aria-disabled={pending || !customPlanValid || blocked}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}

export function ProposalBuilderForm({
  opportunityId,
  title,
  scope,
  mode = "proposal",
  representatives = [],
  needsRepresentative = false,
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
  // Taksit sıra numarasına göre vade tarihleri (plan değişse de korunur)
  const [dueDates, setDueDates] = useState<Record<number, string>>({});

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
    () => buildLabeledSchedule(calculation.gross, splitByPercentages(calculation.gross, customPercentages)),
    [calculation.gross, customPercentages],
  );

  const schedule = useMemo(
    () => applyDueDates(plan === "custom" ? customSchedule : autoSchedule, dueDates),
    [plan, customSchedule, autoSchedule, dueDates],
  );
  const planText = plan === "custom"
    ? schedule.map((item) => `${item.label}: %${item.percentage.toFixed(0)}${item.trigger ? ` (${item.trigger})` : ""}`).join(" · ")
    : getPaymentPlanLabel(plan);
  const customPlanValid = (plan !== "custom" || customPercentTotal === 100) && !scheduleDateIssue(schedule);

  const belge = mode === "contract" ? "Sözleşme" : "Teklif";

  /*
    DÜZEN (2026-10): talep girişiyle aynı ortak form (components/kayit-formu.css)
    ve dört bölüm — ${belge}, Tutar ve ödeme, Tarihler, özet. Eskiden alanlar
    tek parça sıralanıyor, girilen metin kalın görünüyor ve formun üstünde
    çekmece başlığını tekrar eden gri bir bant duruyordu; müşteri adı artık
    çekmece başlığında (requests/[id]/page.tsx). Alan adları aynı.
  */
  return (
    <div className="proposal-drawer-content">
      <form className="panel-form proposal-builder kayit-formu" action={formAction}>
        <input type="hidden" name="opportunity_id" value={opportunityId} />
        <input type="hidden" name="payment_schedule" value={JSON.stringify(schedule)} />
        <input type="hidden" name="payment_plan_type" value={plan} />
        <input type="hidden" name="payment_plan" value={planText} />

        {state.error ? (
          <div className="wide panel-form-error kayit-formu-hata" role="alert" aria-live="assertive">
            <strong>{belge} oluşturulamadı</strong>
            <p>{state.error}</p>
          </div>
        ) : null}

        {needsRepresentative ? (
          <>
            <div className="wide proposal-rep-required" role="note">
              <span aria-hidden="true">!</span>
              <div>
                <strong>Satış temsilcisi atanmamış</strong>
                <p>
                  {representatives.length
                    ? `Bu talebe henüz satış temsilcisi atanmadı. ${belge} oluşturmak için bir temsilci seçin; seçtiğiniz kişi talebe atanır ve bilgilendirilir.`
                    : "Satış talebi alabilen aktif personel yok. Önce İnsan Kaynakları'ndan bir personeli satış temsilcisi olarak işaretleyin."}
                </p>
              </div>
            </div>
            {representatives.length ? (
              <label className="wide proposal-rep-select"><span>Satış temsilcisi<b className="req" aria-hidden="true">*</b></span>
                <select name="assigned_employee_id" required defaultValue="">
                  <option value="" disabled>Temsilci seçin</option>
                  {representatives.map((employee) => <option value={employee.id} key={employee.id}>{employee.full_name}</option>)}
                </select>
              </label>
            ) : null}
          </>
        ) : null}

        <p className="wide kayit-formu-bolum">{belge}</p>
        <label className="wide"><span>{belge} başlığı<b className="req" aria-hidden="true">*</b></span><input name="title" required defaultValue={title} /></label>
        <label className="wide"><span>Hizmet kapsamı<b className="req" aria-hidden="true">*</b></span><textarea name="scope" required defaultValue={scope} placeholder="Verilecek hizmetler ve teslimler" /></label>

        <p className="wide kayit-formu-bolum">Tutar ve ödeme</p>
        <label><span>{belge} tutarı (₺)<b className="req" aria-hidden="true">*</b></span><input name="amount" inputMode="decimal" autoComplete="off" required placeholder="0,00" onChange={(event) => setAmount(parseTurkishAmount(event.target.value) || 0)} /></label>
        <label>KDV durumu<select name="tax_status" value={tax} onChange={(event) => setTax(event.target.value as Tax)}><option value="excluded">KDV Hariç</option><option value="included">KDV Dahil</option><option value="exempt">KDV İstisna</option></select></label>
        <label className="wide">Ödeme planı<select value={plan} onChange={(event) => setPlan(event.target.value as PaymentPlanType)}><option value="cash">Peşin ödeme</option><option value="half">Ön ödeme (sözleşme onayında) + son ödeme (teslim öncesi)</option><option value="third">Ön ödeme + ara ödeme + son ödeme (teslim öncesi)</option><option value="custom">Özel ödeme planı (taksitli)</option></select></label>

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

        <ScheduleDateRows schedule={schedule} dates={dueDates} onChange={(sequence, value) => setDueDates((current) => ({ ...current, [sequence]: value }))} />

        <p className="wide kayit-formu-bolum">Tarihler</p>
        <label><span>Tahmini teslim tarihi<b className="req" aria-hidden="true">*</b></span><input name="estimated_delivery_date" type="date" min={today()} required /></label>
        <label>{mode === "contract" ? "Son geçerlilik tarihi" : "Teklifin geçerlilik tarihi"}<input name="valid_until" type="date" min={today()} /></label>

        <section className="proposal-live-summary wide" aria-live="polite">
          <header><span>{mode === "contract" ? "SÖZLEŞME ÖZETİ" : "TEKLİF ÖZETİ"}</span><strong>{money(calculation.gross)}</strong></header>
          <div><span>Ara toplam</span><b>{money(calculation.net)}</b></div>
          <div><span>KDV</span><b>{money(calculation.vat)}</b></div>
          <div className="proposal-summary-total"><span>Genel toplam</span><strong>{money(calculation.gross)}</strong></div>
          <section className="proposal-payment-breakdown">
            <small>{plan === "custom" ? "ÖDEME PLANI" : "OTOMATİK ÖDEME PLANI"}</small>
            {schedule.map((item) => <div key={item.sequence}><span>{item.sequence}. {item.label}{item.due_date ? ` · ${shortDate(item.due_date)}` : item.trigger ? ` · ${item.trigger}` : ""}</span><b>{money(item.amount)}</b></div>)}
          </section>
        </section>

        <div className="wide panel-form-actions kayit-formu-eylem">
          <p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p>
          <SubmitButton customPlanValid={customPlanValid} mode={mode} blocked={needsRepresentative && !representatives.length} />
        </div>
      </form>
    </div>
  );
}
