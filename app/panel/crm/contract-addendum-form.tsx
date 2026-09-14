"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { PaymentScheduleItem } from "@/lib/payment-schedule";
import type { WorkPlanItem } from "@/lib/work-plan";
import { createContractAddendum, type ContractPlanState } from "./contract-plan-actions";
import { ScheduleDateRows } from "./schedule-date-rows";
import { WorkPlanEditor } from "./work-plan-editor";

export type AddendumInstallment = {
  sequence: number;
  label: string;
  amount: number;
  due_date: string | null;
  trigger: string | null;
  status: string | null;
};

const initialState: ContractPlanState = { error: null, success: null };
const boxStyle = { border: "1px solid currentColor", borderRadius: "10px", padding: "12px 14px" };
const CLOSED: Record<string, string> = { paid: "Ödendi · vadesi değiştirilemez", cancelled: "İptal · vadesi değiştirilemez" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button className="panel-primary" type="submit" disabled={pending} aria-disabled={pending}>{pending ? "Gönderiliyor..." : "Ek Protokolü Müşteriye Sun"}</button>;
}

/**
 * İmzalı sözleşme için ek protokol: yeni ara teslim takvimi ve ödenmemiş
 * taksitlerin vadeleri. Tutarlar değişmez. Müşteri sözleşme bağlantısından
 * onaylayınca vadeler finans kaydına işlenir.
 */
export function ContractAddendumForm({
  contractId,
  installments,
  initialPlan,
}: {
  contractId: string;
  installments: AddendumInstallment[];
  initialPlan: WorkPlanItem[];
}) {
  const [state, formAction] = useActionState(createContractAddendum, initialState);
  const [dates, setDates] = useState<Record<number, string>>(() =>
    Object.fromEntries(installments.filter((item) => item.due_date).map((item) => [item.sequence, item.due_date as string])),
  );

  const locked = new Map(installments.filter((item) => CLOSED[item.status ?? ""]).map((item) => [item.sequence, CLOSED[item.status ?? ""]]));
  const schedule: PaymentScheduleItem[] = installments.map((item) => ({
    sequence: item.sequence,
    label: item.label,
    due_date: dates[item.sequence] ?? "",
    trigger: item.trigger ?? undefined,
    amount: item.amount,
    percentage: 0,
  }));
  const changed = installments
    .filter((item) => !locked.has(item.sequence) && dates[item.sequence] && dates[item.sequence] !== (item.due_date ?? ""))
    .map((item) => ({ sequence: item.sequence, due_date: dates[item.sequence] }));

  return (
    <form className="panel-form" action={formAction}>
      <input type="hidden" name="contract_id" value={contractId} />
      <input type="hidden" name="payment_dates" value={JSON.stringify(changed)} />
      <p className="wide plan-form-hint">
        İmzalı sözleşmenin metni değişmez. Takvim ve vade değişiklikleri ek protokol olarak sözleşme bağlantısında müşterinin onayına sunulur; onayı tarih-saat, IP ve cihaz bilgisiyle kaydedilir.
      </p>
      <WorkPlanEditor initial={initialPlan} hint="Onaylandığında bu takvim geçerli iş planı olur. Değişiklik yoksa satırları boş bırakın." />
      {installments.length ? (
        <ScheduleDateRows schedule={schedule} dates={dates} locked={locked} title="TAKSİT VADELERİ" onChange={(sequence, value) => setDates((current) => ({ ...current, [sequence]: value }))} />
      ) : null}
      <label className="wide">
        Müşteriye not <small style={{ fontWeight: 400, color: "var(--muted)" }}>(isteğe bağlı)</small>
        <textarea name="note" maxLength={2000} placeholder="Ör. Danışman görüşmesine göre ara teslim tarihleri netleştirildi." />
      </label>
      <p className="wide plan-form-hint">{changed.length ? `${changed.length} taksidin vadesi değişecek.` : "Taksit vadelerinde değişiklik yok."}</p>
      {state.error ? <div className="wide panel-form-error" role="alert" style={boxStyle}><strong>Gönderilemedi</strong><p style={{ margin: "6px 0 0" }}>{state.error}</p></div> : null}
      {state.success ? <div className="wide panel-form-success" role="status" style={boxStyle}>{state.success}</div> : null}
      <div className="wide panel-form-actions"><SubmitButton /></div>
    </form>
  );
}
