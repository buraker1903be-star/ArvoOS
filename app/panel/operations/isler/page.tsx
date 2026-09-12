import Link from "next/link";
import type { CSSProperties } from "react";
import { statusTone } from "@/lib/status-tone";
import { formatSubject } from "@/lib/table-format";
import { fetchLastContacts } from "../../crm/last-contact";
import { CustomerCell, LastContactCell, RepresentativeCell } from "../../crm/table-cells";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../../components/panel-drawer";
import { archiveWorkflow } from "../actions";
import { OperationsTabs } from "../operations-tabs";
import { WorkflowCreateForm } from "../workflow-create-form";
import { OpsIcon, addDaysKey, priorityNames, priorityTones, shortDate, stepProgress, todayIstanbul, workflowStatusNames } from "../ops-shared";
import "../../crm/crm.css";
import "../operations.css";

// Aktif işler tablosu (eskiden /panel/operations). Arşivlenen işler burada
// görünmez; /panel/operations/arsiv'de listelenir. Tamamlanan iş satırında
// "Arşivle" düğmesi var.

const boardStatuses = ["planned", "in_progress", "blocked", "completed"] as const;
// "devam": devam eden + beklemede (genel bakıştaki kartla aynı küme)
const statusFilters: { value: string; label: string }[] = [
  ...boardStatuses.map((status) => ({ value: status, label: workflowStatusNames[status] })),
  { value: "devam", label: "Devam eden + beklemede" },
];
const dueFilters = [
  { value: "yaklasan", label: "7 gün içinde / geciken" },
  { value: "geciken", label: "Geciken" },
];
type Step = { id: string; title: string; is_completed: boolean; sort_order: number };
type Employee = { id: string; full_name: string; job_title: string | null; user_id: string | null };
type Workflow = { id: string; title: string; customer_name: string | null; description: string | null; status: string; priority: string; start_date: string | null; due_date: string | null; created_at: string; contract_id: string | null; assigned_employee_id: string | null; operation_steps: Step[] };

export default async function OperationsJobsPage({ searchParams }: { searchParams: Promise<{ arama?: string; durum?: string; termin?: string; mesaj?: string }> }) {
  const { arama, durum, termin, mesaj } = await searchParams;
  const search = (arama ?? "").trim().toLocaleLowerCase("tr-TR");
  const selectedStatus = statusFilters.some((filter) => filter.value === durum) ? durum! : "";
  const selectedDue = dueFilters.some((filter) => filter.value === termin) ? termin! : "";
  const onlyUnread = mesaj === "yeni";
  const { supabase, membership, modules, userId } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  const [{ data, error }, { data: employeeData, error: employeeError }, { count: archivedCount }] = await Promise.all([
    supabase.from("operation_workflows").select("id,title,customer_name,description,status,priority,start_date,due_date,created_at,contract_id,assigned_employee_id,operation_steps(id,title,is_completed,sort_order)").eq("organization_id", membership.organization_id).not("status", "in", "(cancelled,archived)").order("created_at", { ascending: false }),
    supabase.from("hr_employees").select("id,full_name,job_title,user_id").eq("organization_id", membership.organization_id).eq("employment_status", "active").order("full_name"),
    supabase.from("operation_workflows").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).eq("status", "archived"),
  ]);
  if (error) throw new Error("İş akışları okunamadı: " + error.message);
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);
  const workflows = (data ?? []) as Workflow[];
  const employees = (employeeData ?? []) as Employee[];
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee.full_name]));
  const contractIds = [...new Set(workflows.map((workflow) => workflow.contract_id).filter((value): value is string => Boolean(value)))];
  const { data: workflowContracts, error: workflowContractsError } = contractIds.length
    ? await supabase.from("crm_contracts").select("id,opportunity_id,invoice_id,crm_opportunities(contact_phone,contact_email)").in("id", contractIds)
    : { data: [], error: null };
  if (workflowContractsError) throw new Error("İşlerin CRM bağlantıları okunamadı: " + workflowContractsError.message);
  const opportunityByContract = new Map((workflowContracts ?? []).map((contract) => [contract.id, contract.opportunity_id]));
  const operationOpportunityIds = [...new Set((workflowContracts ?? []).map((contract) => contract.opportunity_id))];
  // Müşteri iletişimi ve son temas: CRM tablolarıyla aynı hücreler
  const contactByContract = new Map((workflowContracts ?? []).map((contract) => {
    const raw = (contract as { crm_opportunities?: unknown }).crm_opportunities;
    const opportunity = (Array.isArray(raw) ? raw[0] : raw) as { contact_phone?: string | null; contact_email?: string | null } | null | undefined;
    return [contract.id, { phone: opportunity?.contact_phone ?? null, email: opportunity?.contact_email ?? null }];
  }));
  const lastContacts = await fetchLastContacts(supabase, membership.organization_id, operationOpportunityIds);
  const today = todayIstanbul();
  const weekEnd = addDaysKey(today, 7);
  // Müşteriden gelen, henüz okunmamış mesajlar: ilgili iş satırında kırmızı belirteç
  const workflowIdsForMessages = workflows.map((workflow) => workflow.id);
  const { data: unreadMessageRows } = workflowIdsForMessages.length
    ? await supabase.from("customer_file_messages").select("workflow_id").eq("organization_id", membership.organization_id).eq("sender_type", "customer").is("read_at", null).in("workflow_id", workflowIdsForMessages)
    : { data: [] as { workflow_id: string }[] };
  const unreadByWorkflow = new Map<string, number>();
  for (const row of (unreadMessageRows ?? []) as { workflow_id: string | null }[]) {
    if (row.workflow_id) unreadByWorkflow.set(row.workflow_id, (unreadByWorkflow.get(row.workflow_id) ?? 0) + 1);
  }
  const totalUnreadMessages = [...unreadByWorkflow.values()].reduce((sum, count) => sum + count, 0);
  // Termini ve arşivi yöneticiler ve işin sorumlusu yönetebilir (actions.ts isManagerOrAssignee)
  const canManage = ["owner", "admin", "manager"].includes(membership.role);
  const myEmployeeId = employees.find((employee) => employee.user_id === userId)?.id ?? null;
  const canActOn = (workflow: Workflow) => canManage || (Boolean(myEmployeeId) && workflow.assigned_employee_id === myEmployeeId);

  // Tamamlanan işin ödemesi kapandıysa (ya da bekleyecek fatura yoksa)
  // "arşive hazır" ipucu gösterilir. Arşivleme artık elle yapılır.
  const invoiceIds = (workflowContracts ?? []).map((contract) => (contract as { invoice_id?: string | null }).invoice_id).filter((value): value is string => Boolean(value));
  const paidInvoiceIds = new Set<string>();
  if (invoiceIds.length && workflows.some((workflow) => workflow.status === "completed")) {
    const { data: invoices } = await supabase.from("billing_invoices").select("id,status").in("id", invoiceIds);
    for (const invoice of invoices ?? []) if (invoice.status === "paid") paidInvoiceIds.add(invoice.id);
  }
  const invoiceByContract = new Map((workflowContracts ?? []).map((contract) => [contract.id, (contract as { invoice_id?: string | null }).invoice_id ?? null]));
  const readyForArchive = (workflow: Workflow) => {
    if (workflow.status !== "completed") return false;
    if (!workflow.contract_id) return true;
    if (!invoiceByContract.has(workflow.contract_id)) return false;
    const invoiceId = invoiceByContract.get(workflow.contract_id);
    return !invoiceId || paidInvoiceIds.has(invoiceId);
  };

  const filteredWorkflows = workflows.filter((workflow) => {
    const hay = [workflow.title, workflow.customer_name].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
    if (search && !hay.includes(search)) return false;
    if (selectedStatus === "devam" ? !["in_progress", "blocked"].includes(workflow.status) : selectedStatus && workflow.status !== selectedStatus) return false;
    if (selectedDue) {
      if (!workflow.due_date || workflow.status === "completed") return false;
      if (selectedDue === "geciken" && workflow.due_date >= today) return false;
      if (selectedDue === "yaklasan" && workflow.due_date > weekEnd) return false;
    }
    if (onlyUnread && !unreadByWorkflow.get(workflow.id)) return false;
    return true;
  });
  const hasFilter = Boolean(search || selectedStatus || selectedDue || onlyUnread);

  const activeCount = workflows.filter((item) => item.status === "in_progress").length;
  const blockedCount = workflows.filter((item) => item.status === "blocked").length;
  const completedCount = workflows.filter((item) => item.status === "completed").length;
  const allSteps = workflows.flatMap((item) => item.operation_steps ?? []);
  const progress = allSteps.length ? Math.round(allSteps.filter((step) => step.is_completed).length / allSteps.length * 100) : 0;

  return <div className="crm-page-stack">
    <div className="panel-pagehead"><div><small className="panel-kicker">OPERASYON / İŞ AKIŞI</small><h1>İşler</h1><p>Aktif işleri, adımları ve terminleri tek yerden takip edin. Tamamlanan işleri arşive gönderebilirsiniz.</p></div><div className="panel-page-actions"><span className="status-pill">{workflows.length} iş</span>{totalUnreadMessages ? <Link className="status-pill" data-tone="danger" href="/panel/operations/isler?mesaj=yeni">{totalUnreadMessages} yeni müşteri mesajı</Link> : null}<Link className="panel-secondary" href="/panel/operations/arsiv">Arşiv ({archivedCount ?? 0})</Link>{canManage ? <PanelDrawer triggerLabel="+ Yeni iş" kicker="YENİ KAYIT" title="Yeni iş" description="İş başlığını, önceliğini ve terminini belirleyin."><WorkflowCreateForm /></PanelDrawer> : null}</div></div>
    <OperationsTabs active="is-akisi" />
    <div className="module-tab-panel">
    <section className="crm-metrics">
      <article><small>DEVAM EDEN</small><strong>{activeCount}</strong><span>Aktif iş</span></article>
      <article><small>AKSİYON BEKLEYEN</small><strong>{blockedCount}</strong><span>Beklemede</span></article>
      <article><small>TAMAMLANAN</small><strong>{completedCount}</strong><span>{completedCount ? "Arşive gönderilebilir" : "Kapanan iş"}</span></article>
      <article><small>İLERLEME</small><strong>%{progress}</strong><span>Tamamlanan adımlar</span></article>
    </section>
    <section className="panel-card crm-filter-card"><form method="get" className="crm-filter-form ops-filter-form">
      <label><span>İş / müşteri ara</span><input name="arama" defaultValue={arama ?? ""} /></label>
      <label><span>Durum</span><select name="durum" defaultValue={selectedStatus}><option value="">Tümü</option>{statusFilters.map((filter) => <option value={filter.value} key={filter.value}>{filter.label}</option>)}</select></label>
      <label><span>Termin</span><select name="termin" defaultValue={selectedDue}><option value="">Tümü</option>{dueFilters.map((filter) => <option value={filter.value} key={filter.value}>{filter.label}</option>)}</select></label>
      <label><span>Müşteri mesajı</span><select name="mesaj" defaultValue={onlyUnread ? "yeni" : ""}><option value="">Tümü</option><option value="yeni">Okunmamış mesajı olan</option></select></label>
      <div><button className="panel-primary">Filtrele</button><Link className="panel-secondary" href="/panel/operations/isler">Temizle</Link></div>
    </form></section>
    {filteredWorkflows.length ? <section className="panel-card crm-table-wrap"><table className="crm-data-table" data-cols="operations"><thead><tr><th>İş</th><th>Müşteri</th><th className="crm-col-rep">Sorumlu</th><th>Öncelik</th><th>Durum</th><th>İlerleme</th><th className="crm-col-date">Termin</th><th className="crm-col-contact">Son temas</th><th></th></tr></thead><tbody>{[...filteredWorkflows].sort((a, b) => Number((unreadByWorkflow.get(b.id) ?? 0) > 0) - Number((unreadByWorkflow.get(a.id) ?? 0) > 0)).map((workflow) => {
      const steps = [...(workflow.operation_steps ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      const { done, percentage } = stepProgress(steps);
      const opportunityId = workflow.contract_id ? opportunityByContract.get(workflow.contract_id) : null;
      const contact = workflow.contract_id ? contactByContract.get(workflow.contract_id) : null;
      const late = Boolean(workflow.due_date && workflow.due_date < today && workflow.status !== "completed");
      const unreadMessages = unreadByWorkflow.get(workflow.id) ?? 0;
      const canAct = canActOn(workflow);
      return <tr key={workflow.id} className={unreadMessages ? "has-alert" : undefined}>
        {/* Satırın tamamı bu bağlantıyla tıklanır (panel-premium.css, ilk hücre) */}
        <td data-label="İş"><Link className="crm-row-link" href={`/panel/operations/${workflow.id}`} aria-label={`${workflow.title} işini aç`}><div><span className="crm-table-title" title={workflow.title}>{formatSubject(workflow.title)}</span><span className="crm-table-sub">{steps.length ? `${done}/${steps.length} adım tamamlandı` : "Adım yok"}</span>{unreadMessages ? <span className="crm-alert-chip">{unreadMessages} yeni müşteri mesajı</span> : null}</div></Link></td>
        <CustomerCell name={workflow.customer_name || "Kurum içi iş"} phone={contact?.phone} email={contact?.email} />
        <RepresentativeCell label="Sorumlu" name={workflow.assigned_employee_id ? employeeMap.get(workflow.assigned_employee_id) ?? "Pasif personel" : null} />
        <td data-label="Öncelik"><span className="status-pill" data-tone={priorityTones[workflow.priority] ?? "neutral"}>{priorityNames[workflow.priority] ?? workflow.priority}</span></td>
        <td data-label="Durum" className="ops-status-cell">
          <span className="status-pill" data-tone={statusTone(workflow.status)}>{workflowStatusNames[workflow.status] ?? workflow.status}</span>
          {workflow.status === "completed" && canAct ? (
            <form action={archiveWorkflow} className="ops-archive-form">
              <input type="hidden" name="workflow_id" value={workflow.id} />
              <button type="submit" className="ops-archive-btn" title={readyForArchive(workflow) ? "Ödemesi kapandı, arşive gönderilebilir" : "İşi arşive gönder"}><OpsIcon name="archive" size={14} />Arşivle</button>
            </form>
          ) : null}
          {workflow.status === "completed" && readyForArchive(workflow) ? <small className="ops-ready-hint">Ödeme kapandı</small> : null}
        </td>
        <td data-label="İlerleme" className="crm-col-progress"><span className="ops-progress-mini" aria-hidden="true"><i style={{ "--p": `${percentage}%` } as CSSProperties} /></span><b>%{percentage}</b></td>
        <td data-label="Termin" className={`crm-col-date${late ? " is-late" : ""}`}>{workflow.due_date ? shortDate(workflow.due_date) : canAct ? <Link className="crm-inline-action" href={`/panel/operations/${workflow.id}#termin`}>+ Termin ekle</Link> : "—"}{late ? <small>Gecikti</small> : null}</td>
        <LastContactCell contact={opportunityId ? lastContacts.get(opportunityId) : null} />
        <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
      </tr>;
    })}</tbody></table></section> : <div className="panel-card crm-empty">{hasFilter ? "Eşleşen iş bulunamadı." : "Aktif iş yok. Tamamlanıp arşivlenen işler Arşiv sekmesinde."}</div>}
    </div>
  </div>;
}
