import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import { addWorkflowStep, createWorkflow, setWorkflowStatus, toggleWorkflowStep } from "./actions";
import { OperationsTabs } from "./operations-tabs";
import "./operations.css";

const statusNames: Record<string, string> = { planned: "Planlandı", in_progress: "Devam ediyor", blocked: "Beklemede", completed: "Tamamlandı", cancelled: "İptal" };
const priorityNames: Record<string, string> = { low: "Düşük", normal: "Normal", high: "Yüksek", urgent: "Acil" };
const boardStatuses = ["planned", "in_progress", "blocked", "completed"] as const;
type Step = { id: string; title: string; is_completed: boolean; sort_order: number };
type Workflow = { id: string; title: string; customer_name: string | null; description: string | null; status: string; priority: string; start_date: string | null; due_date: string | null; created_at: string; contract_id: string | null; operation_steps: Step[] };

export default async function OperationsPage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  const { data, error } = await supabase.from("operation_workflows").select("id,title,customer_name,description,status,priority,start_date,due_date,created_at,contract_id,operation_steps(id,title,is_completed,sort_order)").eq("organization_id", membership.organization_id).neq("status", "cancelled").order("created_at", { ascending: false });
  if (error) throw new Error("İş akışları okunamadı: " + error.message);
  const allWorkflows = (data ?? []) as Workflow[];

  // Tamamlanan + ödemesi tam kapanan işler panoyu şişirmesin diye burada
  // canlı olarak arşive ayrılır (ayrı bir "arşivlendi" alanı tutmuyoruz,
  // gerçek fatura durumuna göre her açılışta yeniden hesaplanır).
  const completedContractIds = [...new Set(allWorkflows.filter((wf) => wf.status === "completed" && wf.contract_id).map((wf) => wf.contract_id as string))];
  const settledContractIds = new Set<string>();
  if (completedContractIds.length) {
    const { data: contracts } = await supabase.from("crm_contracts").select("id,invoice_id").in("id", completedContractIds);
    const invoiceIds = (contracts ?? []).map((c) => c.invoice_id).filter((value): value is string => Boolean(value));
    const invoiceStatusById = new Map<string, string>();
    if (invoiceIds.length) {
      const { data: invoices } = await supabase.from("billing_invoices").select("id,status").in("id", invoiceIds);
      for (const invoice of invoices ?? []) invoiceStatusById.set(invoice.id, invoice.status);
    }
    for (const contract of contracts ?? []) {
      if (contract.invoice_id && invoiceStatusById.get(contract.invoice_id) === "paid") settledContractIds.add(contract.id);
    }
  }
  const isSettled = (wf: Workflow) => wf.status === "completed" && (!wf.contract_id || settledContractIds.has(wf.contract_id));
  const workflows = allWorkflows.filter((wf) => !isSettled(wf));
  const archivedWorkflows = allWorkflows.filter(isSettled);

  const activeCount = workflows.filter((item) => item.status === "in_progress").length;
  const blockedCount = workflows.filter((item) => item.status === "blocked").length;
  const completedCount = workflows.filter((item) => item.status === "completed").length;
  const allSteps = workflows.flatMap((item) => item.operation_steps ?? []);
  const progress = allSteps.length ? Math.round(allSteps.filter((step) => step.is_completed).length / allSteps.length * 100) : 0;

  const workflowForm = <form className="panel-form" action={createWorkflow}>
    <label>İş başlığı<input name="title" required minLength={2} maxLength={180} placeholder="Müşteri teslimat süreci" /></label>
    <label>Müşteri / kurum<input name="customer_name" maxLength={160} /></label>
    <label>Öncelik<select name="priority" defaultValue="normal"><option value="low">Düşük</option><option value="normal">Normal</option><option value="high">Yüksek</option><option value="urgent">Acil</option></select></label>
    <label>Başlangıç durumu<select name="status" defaultValue="planned"><option value="planned">Planlandı</option><option value="in_progress">Devam ediyor</option><option value="blocked">Beklemede</option></select></label>
    <label>Termin<input name="due_date" type="date" /></label>
    <p className="wide panel-form-note">Yeni işler standart 8 aşamalı görev planıyla otomatik oluşturulur.</p>
    <div className="wide panel-form-actions"><button className="panel-primary" type="submit">İşi oluştur</button></div>
  </form>;

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">OPERASYON / İŞ AKIŞI</small><h1>İşler</h1><p>Devam eden işleri, adımları ve terminleri tek yerden takip edin.</p></div><div className="panel-page-actions"><span className="status-pill">{workflows.length} iş</span><PanelDrawer triggerLabel="+ Yeni iş" title="Yeni iş" description="İş başlığını, önceliğini ve terminini belirleyin.">{workflowForm}</PanelDrawer></div></div>
    <OperationsTabs active="is-akisi" />
    <div className="module-tab-panel">
    <section className="ops-metrics">
      <article><small>DEVAM EDEN</small><strong>{activeCount}</strong><span>Aktif iş</span></article>
      <article><small>AKSİYON BEKLEYEN</small><strong>{blockedCount}</strong><span>Beklemede</span></article>
      <article><small>TAMAMLANAN</small><strong>{completedCount}</strong><span>Kapanan iş</span></article>
      <article><small>İLERLEME</small><strong>%{progress}</strong><span>Tamamlanan adımlar</span></article>
    </section>
    <section className="ops-board">{boardStatuses.map((status) => { const items = workflows.filter((workflow) => workflow.status === status); return <section className={"ops-column column-" + status} key={status}><header><div><small>{statusNames[status]}</small><strong>{items.length}</strong></div></header><div className="ops-column-list">
      {items.map((workflow) => { const steps = [...(workflow.operation_steps ?? [])].sort((a,b) => a.sort_order - b.sort_order); const done = steps.filter((step) => step.is_completed).length; const percentage = steps.length ? Math.round(done / steps.length * 100) : 0; return <article className="panel-card ops-kanban-card" key={workflow.id}>
        <div className="ops-card-top"><span className={"priority priority-" + workflow.priority}>{priorityNames[workflow.priority] ?? workflow.priority}</span><small>{workflow.due_date ? new Date(workflow.due_date + "T00:00:00").toLocaleDateString("tr-TR") : "Termin yok"}</small></div><h3>{workflow.title}</h3><p>{workflow.customer_name || "Kurum içi iş"}</p>
        <div className="ops-progress"><div><span style={{ width: percentage + "%" }} /></div><b>%{percentage}</b></div><small className="ops-step-count">{done}/{steps.length} adım</small>
        <div className="ops-steps compact">{steps.map((step) => <form action={toggleWorkflowStep} key={step.id}><input type="hidden" name="step_id" value={step.id} /><input type="hidden" name="workflow_id" value={workflow.id} /><input type="hidden" name="is_completed" value={String(!step.is_completed)} /><button className={step.is_completed ? "completed" : ""} type="submit"><i>{step.is_completed ? "✓" : ""}</i><span>{step.title}</span></button></form>)}</div>
        <Link className="panel-secondary ops-detail-link" href={`/panel/operations/${workflow.id}`}>İş detayını aç</Link>
        <form className="ops-add-step" action={addWorkflowStep}><input type="hidden" name="workflow_id" value={workflow.id} /><input name="title" required minLength={2} maxLength={180} placeholder="Yeni adım" /><button type="submit">+</button></form>
        <form className="ops-move" action={setWorkflowStatus}><input type="hidden" name="workflow_id" value={workflow.id} /><select name="status" defaultValue={workflow.status}><option value="planned">Planlandı</option><option value="in_progress">Devam ediyor</option><option value="blocked">Beklemede</option><option value="completed">Tamamlandı</option><option value="cancelled">İptal</option></select><button type="submit">Güncelle</button></form>
      </article>})}{!items.length ? <div className="ops-column-empty">Kayıt yok</div> : null}</div></section>})}</section>
    {archivedWorkflows.length ? (
      <details className="ops-archive">
        <summary><span>Arşivlenen işler</span><em>{archivedWorkflows.length}</em><small>Tamamlandı ve ödemesi kapandı, panoyu meşgul etmiyor</small></summary>
        <div className="ops-archive-list">
          {archivedWorkflows.map((workflow) => (
            <Link key={workflow.id} href={`/panel/operations/${workflow.id}`} className="ops-archive-row">
              <div><b>{workflow.title}</b><small>{workflow.customer_name || "Kurum içi iş"}</small></div>
              <span className="status-pill">Ödendi ve tamamlandı</span>
            </Link>
          ))}
        </div>
      </details>
    ) : null}
    </div>
  </>;
}
