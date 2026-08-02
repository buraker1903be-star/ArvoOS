import { getPanelContext } from "@/lib/panel-context";
import { createDepartment, createEmployee, createLeaveRequest, reviewLeaveRequest } from "./actions";

const leaveNames: Record<string,string> = { annual:"Yıllık", sick:"Sağlık", unpaid:"Ücretsiz", parental:"Ebeveyn", other:"Diğer" };
const statusNames: Record<string,string> = { pending:"Bekliyor", approved:"Onaylandı", rejected:"Reddedildi", canceled:"İptal" };

export default async function HrPage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  const organizationId = membership.organization_id;
  const canManage = ["owner","admin"].includes(membership.role);

  const [{ data: departments }, { data: employees }, { data: leaves }, { data: reviews }] = await Promise.all([
    supabase.from("hr_departments").select("id,name,code,is_active").eq("organization_id",organizationId).order("name"),
    supabase.from("hr_employees").select("id,first_name,last_name,employee_no,position_title,employment_status,hire_date,department_id,user_id").eq("organization_id",organizationId).order("last_name"),
    supabase.from("hr_leave_requests").select("id,employee_id,leave_type,start_date,end_date,total_days,status,reason,created_at").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(30),
    supabase.from("hr_performance_reviews").select("id,employee_id,score,review_period,created_at").eq("organization_id",organizationId).order("created_at",{ascending:false}),
  ]);

  const departmentMap = new Map((departments ?? []).map((department) => [department.id, department.name]));
  const employeeMap = new Map((employees ?? []).map((employee) => [employee.id, `${employee.first_name} ${employee.last_name}`]));
  const activeEmployees = (employees ?? []).filter((employee) => employee.employment_status === "active");
  const pendingLeaves = (leaves ?? []).filter((leave) => leave.status === "pending");
  const averageScore = (reviews ?? []).length ? Math.round((reviews ?? []).reduce((sum,item) => sum + Number(item.score ?? 0),0) / (reviews ?? []).length) : 0;

  return <>
    <div className="panel-pagehead"><div><small className="panel-kicker">İNSAN KAYNAKLARI</small><h1>Ekibi tek merkezden yönetin</h1><p>Personel, departman, izin ve performans süreçlerini kurum bazında izleyin.</p></div><span className="status-pill">{activeEmployees.length} aktif çalışan</span></div>

    <section className="finance-metrics">
      <article><small>AKTİF PERSONEL</small><strong>{activeEmployees.length}</strong><span>Toplam aktif çalışan</span></article>
      <article><small>DEPARTMAN</small><strong>{departments?.length ?? 0}</strong><span>Aktif organizasyon birimleri</span></article>
      <article><small>BEKLEYEN İZİN</small><strong>{pendingLeaves.length}</strong><span>Yönetici aksiyonu bekliyor</span></article>
      <article><small>ORTALAMA PERFORMANS</small><strong>{averageScore || "—"}</strong><span>100 üzerinden</span></article>
    </section>

    {canManage ? <section className="management-grid">
      <article className="panel-card management-card"><div className="management-heading"><div><small>ORGANİZASYON</small><h2>Departman oluştur</h2></div></div><form className="panel-form" action={createDepartment}><label>Departman adı<input name="name" required minLength={2} maxLength={120}/></label><label>Kod<input name="code" maxLength={20}/></label><button className="panel-primary" type="submit">Departman ekle</button></form></article>
      <article className="panel-card management-card"><div className="management-heading"><div><small>PERSONEL</small><h2>Çalışan ekle</h2></div></div><form className="panel-form" action={createEmployee}>
        <label>Ad<input name="first_name" required/></label><label>Soyad<input name="last_name" required/></label><label>Personel no<input name="employee_no"/></label><label>Departman<select name="department_id"><option value="">Seçilmedi</option>{(departments ?? []).map((department)=><option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label>Pozisyon<input name="position_title"/></label><label>Çalışma türü<select name="employment_type"><option value="full_time">Tam zamanlı</option><option value="part_time">Yarı zamanlı</option><option value="contractor">Sözleşmeli</option><option value="intern">Stajyer</option></select></label><label>E-posta<input name="email" type="email"/></label><label>Telefon<input name="phone"/></label><label>İşe giriş<input name="hire_date" type="date"/></label><button className="panel-primary" type="submit">Personel ekle</button>
      </form></article>
    </section> : null}

    <section className="panel-card management-card"><div className="management-heading"><div><small>İZİN YÖNETİMİ</small><h2>Yeni izin talebi</h2></div></div><form className="panel-form" action={createLeaveRequest}><label>Personel<select name="employee_id" required><option value="">Seçin</option>{activeEmployees.map((employee)=><option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name}</option>)}</select></label><label>İzin türü<select name="leave_type"><option value="annual">Yıllık</option><option value="sick">Sağlık</option><option value="unpaid">Ücretsiz</option><option value="parental">Ebeveyn</option><option value="other">Diğer</option></select></label><label>Başlangıç<input name="start_date" type="date" required/></label><label>Bitiş<input name="end_date" type="date" required/></label><label>Toplam gün<input name="total_days" type="number" min="0.5" step="0.5" required/></label><label className="wide">Açıklama<textarea name="reason" maxLength={1000}/></label><button className="panel-primary" type="submit">Talep oluştur</button></form></section>

    <section className="management-grid">
      <article className="panel-card management-card"><div className="management-heading"><div><small>PERSONEL LİSTESİ</small><h2>Ekip</h2></div><span className="status-pill">{employees?.length ?? 0}</span></div><div className="module-control-list">{(employees ?? []).map((employee)=><div className="module-control" key={employee.id}><div><b>{employee.first_name} {employee.last_name}</b><small>{employee.position_title || "Pozisyon belirtilmedi"}{employee.department_id ? ` · ${departmentMap.get(employee.department_id)}` : ""}{employee.employee_no ? ` · ${employee.employee_no}` : ""}</small></div><span className="status-pill">{employee.employment_status}</span></div>)}{!employees?.length ? <p className="panel-muted">Henüz personel kaydı yok.</p> : null}</div></article>
      <article className="panel-card management-card"><div className="management-heading"><div><small>İZİN TALEPLERİ</small><h2>Son talepler</h2></div><span className="status-pill">{leaves?.length ?? 0}</span></div><div className="module-control-list">{(leaves ?? []).map((leave)=><div className="module-control" key={leave.id}><div><b>{employeeMap.get(leave.employee_id) || "Personel"} · {leaveNames[leave.leave_type]}</b><small>{new Date(leave.start_date+"T00:00:00").toLocaleDateString("tr-TR")} – {new Date(leave.end_date+"T00:00:00").toLocaleDateString("tr-TR")} · {leave.total_days} gün</small></div>{canManage && leave.status === "pending" ? <form action={reviewLeaveRequest}><input type="hidden" name="request_id" value={leave.id}/><button name="status" value="approved" type="submit">Onayla</button><button name="status" value="rejected" type="submit">Reddet</button></form> : <span className="status-pill">{statusNames[leave.status]}</span>}</div>)}{!leaves?.length ? <p className="panel-muted">Henüz izin talebi yok.</p> : null}</div></article>
    </section>
  </>;
}
