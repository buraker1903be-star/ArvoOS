import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { formatSubject } from "@/lib/table-format";
import { RepresentativeCell } from "../../crm/table-cells";
import { unarchiveWorkflow } from "../actions";
import { OperationsTabs } from "../operations-tabs";
import { OpsIcon, shortDate } from "../ops-shared";
import "../../crm/crm.css";
import "../operations.css";

// Arşiv: tamamlanıp arşive gönderilen işler. Aktif işler tablosunda
// görünmezler. "Arşivden çıkar" işi tamamlandı durumuna geri alır.

const LIMIT = 500;
type ArchivedWorkflow = { id: string; title: string; customer_name: string | null; due_date: string | null; archived_at: string | null; archived_by: string | null; assigned_employee_id: string | null };

export default async function OperationsArchivePage({ searchParams }: { searchParams: Promise<{ arama?: string }> }) {
  const { arama } = await searchParams;
  const search = (arama ?? "").trim().toLocaleLowerCase("tr-TR");
  const { supabase, membership, modules, userId } = await getPanelContext();
  if (!modules.some((module) => module.code === "operations")) throw new Error("Operasyon modülüne erişiminiz yok.");
  const organizationId = membership.organization_id;

  const [{ data, error, count }, { data: employeeData, error: employeeError }] = await Promise.all([
    supabase.from("operation_workflows")
      .select("id,title,customer_name,due_date,archived_at,archived_by,assigned_employee_id", { count: "exact" })
      .eq("organization_id", organizationId)
      .eq("status", "archived")
      .order("archived_at", { ascending: false })
      .limit(LIMIT),
    // Pasif personel de dahil: arşivdeki eski işlerin sorumlusu ayrılmış olabilir
    supabase.from("hr_employees").select("id,full_name,user_id,employment_status").eq("organization_id", organizationId),
  ]);
  if (error) throw new Error("Arşiv okunamadı: " + error.message);
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);
  const archived = (data ?? []) as ArchivedWorkflow[];
  const employees = (employeeData ?? []) as { id: string; full_name: string; user_id: string | null; employment_status: string }[];
  const nameById = new Map(employees.map((employee) => [employee.id, employee.full_name]));
  const nameByUser = new Map(employees.filter((employee) => employee.user_id).map((employee) => [employee.user_id as string, formatPersonName(employee.full_name)]));
  const canManage = ["owner", "admin", "manager"].includes(membership.role);
  const myEmployeeId = employees.find((employee) => employee.user_id === userId && employee.employment_status === "active")?.id ?? null;

  // Arşivdeki işe müşteri yeniden yazmış olabilir: satırda kırmızı belirteç
  const ids = archived.map((workflow) => workflow.id);
  const { data: unreadRows } = ids.length
    ? await supabase.from("customer_file_messages").select("workflow_id").eq("organization_id", organizationId).eq("sender_type", "customer").is("read_at", null).in("workflow_id", ids)
    : { data: [] as { workflow_id: string }[] };
  const unreadByWorkflow = new Map<string, number>();
  for (const row of (unreadRows ?? []) as { workflow_id: string | null }[]) {
    if (row.workflow_id) unreadByWorkflow.set(row.workflow_id, (unreadByWorkflow.get(row.workflow_id) ?? 0) + 1);
  }

  const rows = archived.filter((workflow) => !search || [workflow.title, workflow.customer_name].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR").includes(search));
  const total = count ?? archived.length;

  return <div className="crm-page-stack">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">OPERASYON / ARŞİV</small><h1>Arşiv</h1><p>Tamamlanıp arşive gönderilen işler aktif listede görünmez. Gerekirse arşivden çıkarıp tamamlandı durumuna geri alabilirsiniz.</p></div>
      <div className="panel-page-actions"><span className="status-pill" data-tone="neutral">{total} arşivlenmiş iş</span><Link className="panel-secondary" href="/panel/operations/isler">Aktif işler</Link></div>
    </div>
    <OperationsTabs active="arsiv" />
    <div className="module-tab-panel">
      <section className="panel-card crm-filter-card"><form method="get" className="crm-filter-form ops-archive-filter">
        <label><span>İş / müşteri ara</span><input name="arama" defaultValue={arama ?? ""} placeholder="İş başlığı ya da müşteri adı" /></label>
        <div><button className="panel-primary">Ara</button><Link className="panel-secondary" href="/panel/operations/arsiv">Temizle</Link></div>
      </form></section>
      {total > LIMIT ? <p className="ops-archive-note">En son arşivlenen {LIMIT} iş gösteriliyor; daha eskisi için arama yapın.</p> : null}
      {rows.length ? <section className="panel-card crm-table-wrap"><table className="crm-data-table" data-cols="ops-archive"><thead><tr><th>İş</th><th className="crm-col-rep">Sorumlu</th><th>Arşivlenme</th><th>Arşivleyen</th><th>Termin</th><th></th></tr></thead><tbody>{rows.map((workflow) => {
        const unread = unreadByWorkflow.get(workflow.id) ?? 0;
        const canAct = canManage || (Boolean(myEmployeeId) && workflow.assigned_employee_id === myEmployeeId);
        return <tr key={workflow.id} className={unread ? "has-alert" : undefined}>
          <td data-label="İş"><Link className="crm-row-link" href={`/panel/operations/${workflow.id}`} aria-label={`${workflow.title} işini aç`}><div><span className="crm-table-title" title={workflow.title}>{formatSubject(workflow.title)}</span><span className="crm-table-sub">{workflow.customer_name || "Kurum içi iş"}</span>{unread ? <span className="crm-alert-chip">{unread} yeni müşteri mesajı</span> : null}</div></Link></td>
          <RepresentativeCell label="Sorumlu" name={workflow.assigned_employee_id ? nameById.get(workflow.assigned_employee_id) ?? "Pasif personel" : null} />
          <td data-label="Arşivlenme" className="crm-col-date">{shortDate(workflow.archived_at)}</td>
          <td data-label="Arşivleyen">{workflow.archived_by ? nameByUser.get(workflow.archived_by) ?? "Ekip üyesi" : "Otomatik (ödeme kapandı)"}</td>
          <td data-label="Termin" className="crm-col-date">{shortDate(workflow.due_date)}</td>
          <td className="crm-table-actions ops-row-actions">{canAct ? (
            <form action={unarchiveWorkflow}>
              <input type="hidden" name="workflow_id" value={workflow.id} />
              <button type="submit" className="ops-unarchive-btn"><OpsIcon name="unarchive" size={15} />Arşivden çıkar</button>
            </form>
          ) : <span className="crm-row-chevron" aria-hidden="true">›</span>}</td>
        </tr>;
      })}</tbody></table></section> : <div className="panel-card crm-empty">{search ? "Aramayla eşleşen arşivlenmiş iş yok." : "Arşiv boş. Tamamlanan işleri İşler sekmesinden “Arşivle” ile buraya gönderebilirsiniz."}</div>}
    </div>
  </div>;
}
