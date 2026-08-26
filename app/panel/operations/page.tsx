import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import { addWorkflowStep, createWorkflow, setWorkflowStatus, assignWorkflow, deleteWorkflow } from "./actions";
import { ConfirmDeleteButton } from "../accounts/confirm-delete-button";
import { OperationsTabs } from "./operations-tabs";
import "../crm/crm.css";
import "./operations.css";

const statusNames: Record<string, string> = { planned: "Planlandı", in_progress: "Devam ediyor", blocked: "Beklemede", completed: "Tamamlandı", cancelled: "İptal" };
const priorityNames: Record<string, string> = { low: "Düşük", normal: "Normal", high: "Yüksek", urgent: "Acil" };
const boardStatuses = ["planned", "in_progress", "blocked", "completed"] as const;
type Step = { id: string; title: string; is_completed: boolean; sort_order: number };
type Employee = { id: string; full_name: string; job_title: string | null };
type Workflow = { id: string; title: string; customer_name: string | null; description: string | null; status: string; priority: string; start_date: string | null; due_date: string | null; created_at: string; contract_id: string | null; assigned_employee_id: string | null; operation_steps: Step[] };

export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ arama?: string; durum?: string }> }) {
  const { arama, durum } = await searchParams;
  const search = (arama ?? "").trim().toLocaleLowerCase("tr-TR");
  const selectedStatus = boardStatuses.includes((durum ?? "") as typeof boardStatuses[number]) ? durum! : "";
  const { supabase, membership, modules } = await getPanelContext();
  const canAssign = ["owner", "admin", "manager"].includes(membership.role);
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  const [{ data, error }, { data: employeeData, error: employeeError }] = await Promise.all([
    supabase.from("operation_workflows").select("id,title,customer_name,description,status,priority,start_date,due_date,created_at,contract_id,assigned_employee_id,operation_steps(id,title,is_completed,sort_order)").eq("organization_id", membership.organization_id).neq("status", "cancelled").order("created_at", { ascending: false }),
    supabase.from("hr_employees").select("id,full_name,job_title").eq("organization_id", membership.organization_id).eq("employment_status", "active").order("full_name"),
  ]);
  if (error) throw new Error("İş akışları okunamadı: " + error.message);
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);
  const allWorkflows = (data ?? []) as Workflow[];
  const employees = (employeeData ?? []) as Employee[];
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee.full_name]));

  // Tamamlanan + ödemesi tam kapanan işler panoyu şişirmesin diye burada
  // canlı olarak arşive ayrılır (ayrı bir "arşivlendi" alanı tutmuyoruz,
  // gerçek fatura durumuna göre her açılışta yeniden hesaplanır).
  const completedContractIds = [...new Set(allWorkflows.filter((wf) => wf.status === "completed" && wf.contract_id).map((wf) => wf.contract_id as string))];
  const settledContractIds = new Set<string>();
  const invoicelessContractIds = new Set<string>();
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
      if (!contract.invoice_id) invoicelessContractIds.add(contract.id);
    }
  }
  // Bir sözleşmeye hiç fatura bağlanmamışsa (bekleyecek bir şey yok — örn.
  // eski/aktarılmış kayıtlar), tamamlanan iş sonsuza kadar panoda takılı
  // kalmasın diye tamamlanır tamamlanmaz arşive düşer.
  const isSettled = (wf: Workflow) => wf.status === "completed" && (!wf.contract_id || settledContractIds.has(wf.contract_id) || invoicelessContractIds.has(wf.contract_id));
  const workflows = allWorkflows.filter((wf) => !isSettled(wf));
  const archivedWorkflows = allWorkflows.filter(isSettled);

  const filteredWorkflows = workflows.filter((workflow) => {
    const hay = [workflow.title, workflow.customer_name].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
    return (!search || hay.includes(search)) && (!selectedStatus || workflow.status === selectedStatus);
  });

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
    <label>Operasyon sorumlusu<select name="assigned_employee_id" defaultValue=""><option value="">Atanmamış</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.full_name}</option>)}</select></label>
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
    <section className="panel-card"><form method="get" className="crm-filter-form"><label><span>İş / müşteri ara</span><input name="arama" defaultValue={arama ?? ""} /></label><label><span>Durum</span><select name="durum" defaultValue={selectedStatus}><option value="">Tümü</option>{boardStatuses.map((status) => <option value={status} key={status}>{statusNames[status]}</option>)}</select></label><div><button className="panel-primary">Filtrele</button><Link className="panel-secondary" href="/panel/operations">Temizle</Link></div></form></section>
    {filteredWorkflows.length ? <section className="panel-card crm-table-wrap"><table className="crm-data-table"><thead><tr><th>İş</th><th>Müşteri</th><th>Sorumlu</th><th>Öncelik</th><th>Durum</th><th>İlerleme</th><th>Termin</th><th></th></tr></thead><tbody>{filteredWorkflows.map((workflow) => {
      const steps = [...(workflow.operation_steps ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      const done = steps.filter((step) => step.is_completed).length;
      const percentage = steps.length ? Math.round(done / steps.length * 100) : 0;
      const assignmentForm = <form className="panel-form" action={assignWorkflow}><input type="hidden" name="workflow_id" value={workflow.id} /><label className="wide">Operasyon sorumlusu<select name="assigned_employee_id" defaultValue={workflow.assigned_employee_id ?? ""}><option value="">Atanmamış</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.full_name}</option>)}</select></label><div className="wide panel-form-actions"><button className="panel-primary" type="submit">Atamayı Kaydet</button></div></form>;
      const statusForm = <form className="panel-form" action={setWorkflowStatus}><input type="hidden" name="workflow_id" value={workflow.id} /><label>Durum<select name="status" defaultValue={workflow.status}><option value="planned">Planlandı</option><option value="in_progress">Devam ediyor</option><option value="blocked">Beklemede</option><option value="completed">Tamamlandı</option><option value="cancelled">İptal</option></select></label><div className="panel-form-actions"><button className="panel-primary" type="submit">Güncelle</button></div></form>;
      const stepForm = <form className="panel-form" action={addWorkflowStep}><input type="hidden" name="workflow_id" value={workflow.id} /><label>Yeni adım<input name="title" required minLength={2} maxLength={180} placeholder="Örn. Müşteri onayı" /></label><div className="panel-form-actions"><button className="panel-primary" type="submit">Ekle</button></div></form>;
      return <tr key={workflow.id}>
        <td data-label="İş"><div><span className="crm-table-title">{workflow.title}</span><span className="crm-table-sub">{done}/{steps.length} adım</span></div></td>
        <td data-label="Müşteri">{workflow.customer_name || "Kurum içi iş"}</td>
        <td data-label="Sorumlu">{workflow.assigned_employee_id ? employeeMap.get(workflow.assigned_employee_id) ?? "Pasif personel" : "Atanmamış"}</td>
        <td data-label="Öncelik"><span className={"priority priority-" + workflow.priority}>{priorityNames[workflow.priority] ?? workflow.priority}</span></td>
        <td data-label="Durum"><span className="status-pill">{statusNames[workflow.status] ?? workflow.status}</span></td>
        <td data-label="İlerleme">%{percentage}</td>
        <td data-label="Termin">{workflow.due_date ? new Date(workflow.due_date + "T00:00:00").toLocaleDateString("tr-TR") : "—"}</td>
        <td className="crm-table-actions">
          <Link className="panel-secondary" href={`/panel/operations/${workflow.id}`}>Detay</Link>
          {canAssign ? <PanelDrawer triggerLabel="Sorumlu Ata" title={workflow.title} description="Bu operasyonu bir personele atayın.">{assignmentForm}</PanelDrawer> : null}
          <PanelDrawer triggerLabel="Adım Ekle" title={workflow.title} description="Bu işe yeni bir adım ekleyin.">{stepForm}</PanelDrawer>
          <PanelDrawer triggerLabel="Durum" title={workflow.title} description="İşin durumunu güncelleyin.">{statusForm}</PanelDrawer>
          <form action={deleteWorkflow}><input type="hidden" name="workflow_id" value={workflow.id} /><ConfirmDeleteButton label="Sil" confirmMessage={`"${workflow.title}" iş akışını kalıcı olarak silmek istediğinize emin misiniz? Tüm adımlar ve yorumlar da silinecek. Bu işlem geri alınamaz.`} /></form>
        </td>
      </tr>;
    })}</tbody></table></section> : <div className="panel-card crm-empty">Eşleşen iş bulunamadı.</div>}
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
