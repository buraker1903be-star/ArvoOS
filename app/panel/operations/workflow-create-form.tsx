import { TarihSecici } from "@/app/panel/components/tarih-secici";
import { getPanelContext } from "@/lib/panel-context";
import { createWorkflow } from "./actions";
import "./operations.css";
import "../components/kayit-formu.css";

// "Yeni iş" formu (genel bakış ve işler sayfası ortak). Sunucu bileşeni:
// sorumlu listesi burada okunur.
export async function WorkflowCreateForm() {
  const { supabase, membership } = await getPanelContext();
  const [{ data }, { data: turData }] = await Promise.all([
    supabase.from("hr_employees").select("id,full_name").eq("organization_id", membership.organization_id).eq("employment_status", "active").order("full_name"),
    supabase.from("organization_step_template_sets").select("code,name,is_default").eq("organization_id", membership.organization_id).eq("is_active", true).order("sort_order").order("code"),
  ]);
  const employees = (data ?? []) as { id: string; full_name: string }[];
  const turler = (turData ?? []) as { code: string; name: string; is_default: boolean }[];
  const ontanimli = turler.find((tur) => tur.is_default) ?? null;
  return (
    // Ortak kayıt formu düzeni (components/kayit-formu.css), iki bölüm.
    <form className="panel-form kayit-formu" action={createWorkflow}>
      <p className="wide kayit-formu-bolum">İş bilgileri</p>
      <label className="wide"><span>İş başlığı<b className="req" aria-hidden="true">*</b></span><input name="title" required minLength={2} maxLength={180} placeholder="Örn. Müşteri teslimat süreci" /></label>
      <label className="wide">Müşteri / kurum<input name="customer_name" maxLength={160} placeholder="Boşsa kurum içi iş" /></label>
      <p className="wide kayit-formu-bolum">Plan</p>
      <label>Öncelik<select name="priority" defaultValue="normal"><option value="low">Düşük</option><option value="normal">Normal</option><option value="high">Yüksek</option><option value="urgent">Acil</option></select></label>
      <label>Başlangıç durumu<select name="status" defaultValue="planned"><option value="planned">Planlandı</option><option value="in_progress">Devam ediyor</option><option value="blocked">Beklemede</option></select></label>
      <label>Termin<TarihSecici name="due_date" /></label>
      <label>Operasyon sorumlusu<select name="assigned_employee_id" defaultValue=""><option value="">Atanmamış</option>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.full_name}</option>)}</select></label>
      {/* Tür, işin görev listesini belirliyor. Kurum tür tanımlamadıysa seçim
          gösterilmiyor: tek seçenekli bir açılır liste karar değil, gürültü. */}
      {turler.length ? (
        <label>Çalışma türü
          <select name="step_template_set" defaultValue="">
            <option value="">Öntanımlı{ontanimli ? ` (${ontanimli.name})` : ""}</option>
            {turler.map((tur) => <option value={tur.code} key={tur.code}>{tur.name}</option>)}
          </select>
        </label>
      ) : null}
      <p className="wide kayit-formu-not">
        {turler.length
          ? "Görev listesi seçilen çalışma türünün şablonundan gelir; şablonu olmayan türde standart 8 adım kullanılır."
          : "Yeni işler standart 8 aşamalı görev planıyla otomatik oluşturulur."}
      </p>
      <div className="wide panel-form-actions kayit-formu-eylem"><p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p><button className="panel-primary" type="submit">İşi oluştur</button></div>
    </form>
  );
}
