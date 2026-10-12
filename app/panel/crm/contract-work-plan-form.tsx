"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { WorkPlanItem } from "@/lib/work-plan";
import { updateContractWorkPlan, type ContractPlanState } from "./contract-plan-actions";
import { WorkPlanEditor } from "./work-plan-editor";
// Ortak çekmece formu düzeni; bileşen stilini kendisi alıyor (AGENTS.md).
import "../components/kayit-formu.css";

const initialState: ContractPlanState = { error: null, success: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button className="panel-primary" type="submit" disabled={pending} aria-disabled={pending}>{pending ? "Kaydediliyor..." : "İş Planını Kaydet"}</button>;
}

/** İmza öncesi sözleşmeye ara teslim takvimi yazar (madde 4'te gösterilir). */
export function ContractWorkPlanForm({ contractId, initial }: { contractId: string; initial: WorkPlanItem[] }) {
  const [state, formAction] = useActionState(updateContractWorkPlan, initialState);
  return (
    <form className="panel-form kayit-formu" action={formAction}>
      <input type="hidden" name="contract_id" value={contractId} />
      <p className="wide kayit-formu-not">
        Ara teslimleri ve tarihlerini yazın. Takvim sözleşmenin “Hizmet Süresi, Teslim ve Termin” maddesinde tablo olarak yer alır; müşteri imzayla birlikte onaylar ve takip sayfasında görür.
      </p>
      <WorkPlanEditor initial={initial} />
      {state.error ? <div className="wide panel-form-error kayit-formu-hata" role="alert"><strong>Kaydedilemedi</strong><p>{state.error}</p></div> : null}
      {state.success ? <div className="wide panel-form-success kayit-formu-basari" role="status">{state.success}</div> : null}
      <div className="wide panel-form-actions kayit-formu-eylem"><SubmitButton /></div>
    </form>
  );
}
