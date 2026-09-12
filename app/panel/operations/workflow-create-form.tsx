import { getPanelContext } from "@/lib/panel-context";
import { createWorkflow } from "./actions";

// "Yeni iş" formu (genel bakış ve işler sayfası ortak). Sunucu bileşeni:
// sorumlu listesi burada okunur.
export async function WorkflowCreateForm() {
  const { supabase, membership } = await getPanelContext();
  const { data } = await supabase.from("hr_employees").select("id,full_name").eq("organization_id", membership.organization_id).eq("employment_status", "active").order("full_name");
  const employees = (data ?? []) as { id: string; full_name: string }[];
  return (
    <form className="panel-form" action={createWorkflow}>
      <label>İş başlığı<input name="title" required minLength={2} maxLength={180} placeholder="Müşteri teslimat süreci" /></label>
      <label>Müşteri / kurum<input name="customer_name" maxLength={160} /></label>
      <label>Öncelik<select name="priority" defaultValue="normal"><option value="low">Düşük</option><option value="normal">Normal</option><option value="high">Yüksek</option><option value="urgent">Acil</option></select></label>
      <label>Başlangıç durumu<select name="status" defaultValue="planned"><option value="planned">Planlandı</option><option value="in_progress">Devam ediyor</option><option value="blocked">Beklemede</option></select></label>
      <label>Termin<input name="due_date" type="date" /></label>
      <label>Operasyon sorumlusu<select name="assigned_employee_id" defaultValue=""><option value="">Atanmamış</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.full_name}</option>)}</select></label>
      <p className="wide panel-form-note">Yeni işler standart 8 aşamalı görev planıyla otomatik oluşturulur.</p>
      <div className="wide panel-form-actions"><button className="panel-primary" type="submit">İşi oluştur</button></div>
    </form>
  );
}
