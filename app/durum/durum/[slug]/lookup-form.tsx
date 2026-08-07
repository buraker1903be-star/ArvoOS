"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { lookupStatus } from "./actions";
import { initialLookupState } from "./lookup-state";

const contractStatusNames: Record<string, string> = {
  signed: "İmzalandı",
  completed: "Tamamlandı",
};
const workflowStatusNames: Record<string, string> = {
  planned: "Planlandı",
  in_progress: "Devam Ediyor",
  blocked: "Beklemede",
  completed: "Tamamlandı",
  cancelled: "İptal Edildi",
};
const money = (cents: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format((cents ?? 0) / 100);

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="status-lookup-submit" type="submit" disabled={pending}>
      {pending ? "Sorgulanıyor..." : "Sorgula"}
    </button>
  );
}

export function StatusLookupForm({ orgSlug, prefillCode }: { orgSlug: string; prefillCode?: string }) {
  const boundAction = lookupStatus.bind(null, orgSlug);
  const [state, formAction] = useActionState(boundAction, initialLookupState);
  const formRef = useRef<HTMLFormElement>(null);
  const autoSubmitted = useRef(false);

  useEffect(() => {
    if (prefillCode && !autoSubmitted.current && formRef.current) {
      autoSubmitted.current = true;
      formRef.current.requestSubmit();
    }
  }, [prefillCode]);

  return (
    <div className="status-lookup">
      <form action={formAction} className="status-lookup-form" ref={formRef}>
        <label>
          Takip Kodu
          <input
            name="tracking_code"
            inputMode="text"
            maxLength={9}
            placeholder="ABCD-1234"
            required
            autoComplete="off"
            defaultValue={prefillCode ?? ""}
          />
        </label>
        <SubmitButton />
      </form>

      {state.error ? <p className="status-lookup-error" role="alert">{state.error}</p> : null}

      {state.results ? (
        <div className="status-lookup-results">
          {state.results.map((row, index) => (
            <article className="status-lookup-card" key={index}>
              <div className="status-lookup-card-head">
                <span className="status-lookup-no">{row.contract_no}</span>
                <span className="status-pill">
                  {row.workflow_status ? workflowStatusNames[row.workflow_status] ?? row.workflow_status : contractStatusNames[row.contract_status] ?? row.contract_status}
                </span>
              </div>
              <p className="status-lookup-title">{row.contract_title}</p>

              <div className="status-lookup-progress">
                <div className="status-lookup-progress-track"><span style={{ width: `${row.progress_percentage}%` }} /></div>
                <b>%{row.progress_percentage} tamamlandı</b>
              </div>

              <div className="status-lookup-balance">
                <div><span>Toplam Tutar</span><b>{money(row.total_amount)}</b></div>
                <div><span>Ödenen</span><b>{money(row.paid_amount)}</b></div>
                <div className="status-lookup-balance-remaining"><span>Kalan Bakiye</span><b>{money(row.remaining_amount)}</b></div>
              </div>

              <small>Son güncelleme: {new Date(row.last_update).toLocaleDateString("tr-TR")}</small>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
