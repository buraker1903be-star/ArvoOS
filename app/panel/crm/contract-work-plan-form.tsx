"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { WorkPlanItem } from "@/lib/work-plan";
import { updateContractWorkPlan, type ContractPlanState } from "./contract-plan-actions";
import { WorkPlanEditor } from "./work-plan-editor";

const initialState: ContractPlanState = { error: null, success: null };
const boxStyle = { border: "1px solid currentColor", borderRadius: "10px", padding: "12px 14px" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button className="panel-primary" type="submit" disabled={pending} aria-disabled={pending}>{pending ? "Kaydediliyor..." : "İş Planını Kaydet"}</button>;
}

/** İmza öncesi sözleşmeye ara teslim takvimi yazar (madde 4'te gösterilir). */
export function ContractWorkPlanForm({ contractId, initial }: { contractId: string; initial: WorkPlanItem[] }) {
  const [state, formAction] = useActionState(updateContractWorkPlan, initialState);
  return (
    <form className="panel-form" action={formAction}>
      <input type="hidden" name="contract_id" value={contractId} />
      <p className="wide plan-form-hint">
        Ara teslimleri ve tarihlerini yazın. Takvim sözleşmenin “Hizmet Süresi, Teslim ve Termin” maddesinde tablo olarak yer alır; müşteri imzayla birlikte onaylar ve takip sayfasında görür.
      </p>
      <WorkPlanEditor initial={initial} />
      {state.error ? <div className="wide panel-form-error" role="alert" style={boxStyle}><strong>Kaydedilemedi</strong><p style={{ margin: "6px 0 0" }}>{state.error}</p></div> : null}
      {state.success ? <div className="wide panel-form-success" role="status" style={boxStyle}>{state.success}</div> : null}
      <div className="wide panel-form-actions"><SubmitButton /></div>
    </form>
  );
}
