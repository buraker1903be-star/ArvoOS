import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import { createDepartment, createEmployee, updateEmployee } from "./actions";
import { updateTeamMemberAccess, cancelInvitation } from "./team-actions";
import { InviteTeamForm } from "./invite-team-form";
import { uploadEmployeeDocument, deleteEmployeeDocument } from "./documents-actions";
import { roleNames } from "./role-names";
import "./hr.css";

type Department = { id: string; name: string; code: string | null; is_active: boolean };
type Employee = { id: string; user_id: string | null; department_id: string | null; employee_no: string | null; full_name: string; job_title: string | null; email: string | null; phone: string | null; employment_type: string; employment_status: string; start_date: string | null; can_receive_sales_requests: boolean; commission_rate: number; operation_commission_rate: number };
type Member = { user_id: string; role: string; is_active: boolean };
type Invitation = { id: string; email: string; role: string; status: string; created_at: string; expires_at: string };
type Doc = { id: string; employee_id: string; file_name: string; file_size: number | null; created_at: string };

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR");
const statusNames: Record<string, string> = { active: "Aktif", on_leave: "İzinli", inactive: "Pasif", terminated: "İşten ayrıldı" };
const fileSize = (bytes: number | null) => { if (!bytes) return ""; const kb = bytes / 1024; return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`; };

export default async function HrPage() {
  const { supabase, membership, userId, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  const canManageTeam = ["owner", "admin"].includes(membership.role);

  const [{ data: employeeData, error: employeeError }, { data: departmentData, error: departmentError }, { data: memberData }, { data: invitationData }, { data: docData }] = await Promise.all([
    supabase.from("hr_employees").select("id,user_id,department_id,employee_no,full_name,job_title,email,phone,employment_type,employment_status,start_date,can_receive_sales_requests,commission_rate,operation_commission_rate").eq("organization_id", membership.organization_id).order("full_name"),
    supabase.from("hr_departments").select("id,name,code,is_active").eq("organization_id", membership.organization_id).order("name"),
    canManageTeam ? supabase.from("organization_memberships").select("user_id,role,is_active").eq("organization_id", membership.organization_id) : Promise.resolve({ data: [] as Member[] }),
    canManageTeam ? supabase.from("organization_invitations").select("id,email,role,status,created_at,expires_at").eq("organization_id", membership.organization_id).in("status", ["pending", "sent"]) : Promise.resolve({ data: [] as Invitation[] }),
    canManageTeam ? supabase.from("hr_employee_documents").select("id,employee_id,file_name,file_size,created_at").eq("organization_id", membership.organization_id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as Doc[] }),
  ]);
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);
  if (departmentError) throw new Error("Departmanlar okunamadı: " + departmentError.message);

  const employees = (employeeData ?? []) as Employee[];
  const departments = (departmentData ?? []) as Department[];
  const departmentMap = new Map(departments.map((item) => [item.id, item.name]));
  const memberMap = new Map(((memberData ?? []) as Member[]).map((member) => [member.user_id, member]));
  const invitations = ((invitationData ?? []) as Invitation[]).filter((invite) => new Date(invite.expires_at) > new Date());
  const invitationByEmail = new Map(invitations.map((invite) => [invite.email.toLowerCase(), invite]));
  const docs = (docData ?? []) as Doc[];
  const docsByEmployee = new Map<string, Doc[]>();
  for (const doc of docs) { if (!docsByEmployee.has(doc.employee_id)) docsByEmployee.set(doc.employee_id, []); docsByEmployee.get(doc.employee_id)!.push(doc); }

  const activeCount = employees.filter((item) => item.employment_status === "active").length;
  const salesCount = employees.filter((item) => item.employment_status === "active" && item.can_receive_sales_requests).length;
  const accessCount = employees.filter((item) => item.user_id && memberMap.get(item.user_id)?.is_active).length;

  const employeeForm = <form className="panel-form" action={createEmployee}>
    <label className="wide">Ad soyad<input name="full_name" required minLength={2} /></label>
    <label>Personel numarası<input name="employee_no" /></label>
    <label>Pozisyon<input name="job_title" /></label>
    <label>Departman<select name="department_id" defaultValue=""><option value="">Departman seçin</option>{departments.filter((item) => item.is_active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label>Çalışma tipi<select name="employment_type" defaultValue="full_time"><option value="full_time">Tam zamanlı</option><option value="part_time">Yarı zamanlı</option><option value="contractor">Sözleşmeli</option><option value="intern">Stajyer</option></select></label>
    <label>E-posta<input name="email" type="email" /></label><label>Telefon<input name="phone" /></label>
    <label>İşe giriş tarihi<input name="start_date" type="date" /></label>
    <label>Satış primi (%)<input name="commission_rate" type="number" min="0" max="100" step="0.01" defaultValue="0" /></label>\n    <label>Operasyon primi (%)<input name="operation_commission_rate" type="number" min="0" max="100" step="0.01" defaultValue="0" /></label>
    <label className="wide"><span>Satış yetkisi</span><span><input name="can_receive_sales_requests" type="checkbox" /> Satış talepleri atanabilir</span></label>
    <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Personeli Kaydet</button></div>
  </form>;

  return <div className="hr-page">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">İNSAN KAYNAKLARI</small><h1>Ekip ve Personel</h1><p>Personel bilgileri, panel erişimi, prim oranları ve özlük dosyaları tek yerden.</p></div>
      <div className="panel-page-actions"><PanelDrawer triggerLabel="+ Yeni Personel" title="Yeni Personel" description="Personel ve görev bilgilerini kaydedin.">{employeeForm}</PanelDrawer></div>
    </div>

    <section className="hr-metrics">
      <article><small>TOPLAM PERSONEL</small><strong>{employees.length}</strong><span>Tüm personel kayıtları</span></article>
      <article><small>AKTİF PERSONEL</small><strong>{activeCount}</strong><span>Çalışmaya devam eden</span></article>
      <article><small>SATIŞ TEMSİLCİSİ</small><strong>{salesCount}</strong><span>Talep atanabilir personel</span></article>
      <article><small>PANEL ERİŞİMİ OLAN</small><strong>{accessCount}</strong><span>Giriş yapabilen personel</span></article>
    </section>

    <section className="hr-layout">
      <div className="panel-card">
        <div className="panel-card-head"><div><small>PERSONELLER</small><h2>Ekip Listesi</h2></div></div>
        <div className="hr-employee-list">
          {employees.map((employee) => {
            const editForm = <form className="panel-form" action={updateEmployee}>
              <input type="hidden" name="employee_id" value={employee.id} />
              <label className="wide">Ad soyad<input name="full_name" required defaultValue={employee.full_name} /></label>
              <label>Pozisyon<input name="job_title" defaultValue={employee.job_title ?? ""} /></label>
              <label>Departman<select name="department_id" defaultValue={employee.department_id ?? ""}><option value="">Departman seçin</option>{departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
              <label>E-posta<input name="email" type="email" defaultValue={employee.email ?? ""} /></label>
              <label>Telefon<input name="phone" defaultValue={employee.phone ?? ""} /></label>
              <label>Durum<select name="employment_status" defaultValue={employee.employment_status}><option value="active">Aktif</option><option value="on_leave">İzinli</option><option value="inactive">Pasif</option><option value="terminated">İşten ayrıldı</option></select></label>
              <label>Satış primi (%)<input name="commission_rate" type="number" min="0" max="100" step="0.01" defaultValue={employee.commission_rate} /></label>\n              <label>Operasyon primi (%)<input name="operation_commission_rate" type="number" min="0" max="100" step="0.01" defaultValue={employee.operation_commission_rate} /></label>
              <label className="wide"><span><input name="can_receive_sales_requests" type="checkbox" defaultChecked={employee.can_receive_sales_requests} /> Satış talepleri atanabilir</span></label>
              <div className="wide panel-form-actions"><button className="panel-primary">Kaydet</button></div>
            </form>;

            const member = employee.user_id ? memberMap.get(employee.user_id) : undefined;
            const pendingInvite = !employee.user_id && employee.email ? invitationByEmail.get(employee.email.toLowerCase()) : undefined;
            const employeeDocs = docsByEmployee.get(employee.id) ?? [];

            const docsPanel = <div className="hr-docs-drawer">
              <form className="hr-doc-upload" action={uploadEmployeeDocument}>
                <input type="hidden" name="employee_id" value={employee.id} />
                <input type="file" name="file" required />
                <button className="panel-primary" type="submit">Yükle</button>
              </form>
              <div className="hr-doc-list">
                {employeeDocs.map((doc) => (
                  <div className="hr-doc-row" key={doc.id}>
                    <Link href={`/panel/hr/documents/${doc.id}`} target="_blank"><b>{doc.file_name}</b><small>{fileSize(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString("tr-TR")}</small></Link>
                    <form action={deleteEmployeeDocument}><input type="hidden" name="document_id" value={doc.id} /><button className="panel-danger" type="submit">Sil</button></form>
                  </div>
                ))}
                {!employeeDocs.length ? <p className="panel-empty">Henüz dosya yüklenmedi.</p> : null}
              </div>
            </div>;

            return <article className="hr-employee-card" key={employee.id}>
              <div className="hr-avatar">{initials(employee.full_name)}</div>
              <div className="hr-employee-main">
                <h3>{employee.full_name}</h3>
                <p>{employee.job_title || "Pozisyon belirtilmedi"}{employee.department_id ? ` · ${departmentMap.get(employee.department_id) ?? "Departman"}` : ""}</p>
                <div className="hr-tags">
                  <span>{statusNames[employee.employment_status] ?? employee.employment_status}</span>
                  {employee.can_receive_sales_requests ? <span>Satış atanabilir</span> : null}
                  {employee.commission_rate > 0 ? <span>Satış primi %{employee.commission_rate}</span> : null}\n                  {employee.operation_commission_rate > 0 ? <span>Operasyon primi %{employee.operation_commission_rate}</span> : null}
                </div>
              </div>

              {canManageTeam ? (
                <div className="hr-access-block">
                  {member ? (
                    employee.user_id === userId ? (
                      <span className="status-pill">{roleNames[member.role] ?? member.role} · Siz</span>
                    ) : (
                      <form className="hr-access-form" action={updateTeamMemberAccess}>
                        <input type="hidden" name="user_id" value={employee.user_id ?? ""} />
                        <select name="role" defaultValue={member.role}>
                          <option value="member">Satış Personeli</option>
                          <option value="operasyoncu">Operasyon Personeli</option>
                          <option value="admin">Yönetici</option>
                          <option value="owner">Kurum Sahibi</option>
                        </select>
                        <label className="team-active-toggle"><input type="checkbox" name="is_active" defaultChecked={member.is_active} /> Aktif</label>
                        <button className="panel-secondary" type="submit">Kaydet</button>
                      </form>
                    )
                  ) : pendingInvite ? (
                    <div className="hr-invite-pending">
                      <span className="status-pill">{pendingInvite.status === "sent" ? "Davet gönderildi" : "Davet gönderiliyor"}</span>
                      <form action={cancelInvitation}><input type="hidden" name="invitation_id" value={pendingInvite.id} /><button className="panel-secondary" type="submit">İptal Et</button></form>
                    </div>
                  ) : (
                    <PanelDrawer triggerLabel="Panele Davet Et" title={`${employee.full_name} için panel erişimi`} description="Bu personele gerçek bir davet e-postası gönderilir.">
                      <InviteTeamForm employeeId={employee.id} fullName={employee.full_name} defaultEmail={employee.email ?? ""} />
                    </PanelDrawer>
                  )}
                </div>
              ) : null}

              <div className="hr-employee-actions">
                <PanelDrawer triggerLabel="Düzenle" title="Personeli Düzenle">{editForm}</PanelDrawer>
                {canManageTeam ? <PanelDrawer triggerLabel={`Özlük Dosyaları${employeeDocs.length ? ` (${employeeDocs.length})` : ""}`} title="Özlük Dosyaları" description={employee.full_name}>{docsPanel}</PanelDrawer> : null}
              </div>
            </article>;
          })}
          {!employees.length ? <div className="hr-empty">Henüz personel kaydı yok.</div> : null}
        </div>
      </div>

      <aside className="hr-side">
        <section className="panel-card">
          <div className="panel-card-head"><div><small>ORGANİZASYON</small><h2>Departmanlar</h2></div><PanelDrawer triggerLabel="+ Ekle" title="Yeni Departman"><form className="panel-form" action={createDepartment}><label className="wide">Departman adı<input name="name" required /></label><label className="wide">Kısa kod<input name="code" maxLength={30} /></label><div className="wide panel-form-actions"><button className="panel-primary">Departmanı Kaydet</button></div></form></PanelDrawer></div>
          <div className="hr-department-list">{departments.map((department) => <div key={department.id}><b>{department.name}</b><span>{employees.filter((employee) => employee.department_id === department.id).length} kişi</span></div>)}{!departments.length ? <p>Henüz departman yok.</p> : null}</div>
        </section>
      </aside>
    </section>
  </div>;
}