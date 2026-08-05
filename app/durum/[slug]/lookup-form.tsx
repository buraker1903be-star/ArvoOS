"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { lookupStatus, initialLookupState } from "./actions";

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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="status-lookup-submit" type="submit" disabled={pending}>
      {pending ? "Sorgulanıyor..." : "Sorgula"}
    </button>
  );
}

export function StatusLookupForm({ orgSlug }: { orgSlug: string }) {
  const boundAction = lookupStatus.bind(null, orgSlug);
  const [state, formAction] = useActionState(boundAction, initialLookupState);

  return (
    <div className="status-lookup">
      <form action={formAction} className="status-lookup-form">
        <label>
          Telefon numaranızın son 4 hanesi
          <input
            name="phone_suffix"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            placeholder="0000"
            required
            autoComplete="off"
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
              <small>Son güncelleme: {new Date(row.last_update).toLocaleDateString("tr-TR")}</small>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
