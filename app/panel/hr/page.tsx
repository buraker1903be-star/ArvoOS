import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { statusTone } from "@/lib/status-tone";
import { PanelDrawer } from "../components/panel-drawer";
import { createDepartment, createEmployee, updateEmployee } from "./actions";
import { updateTeamMemberAccess, cancelInvitation } from "./team-actions";
import { InviteTeamForm } from "./invite-team-form";
import { uploadEmployeeDocument, deleteEmployeeDocument } from "./documents-actions";
import { roleNames } from "./role-names";
import { HrIcon, initials } from "./hr-icons";
import { isManagementDepartmentName, MANAGEMENT_EMPLOYMENT_STATUSES } from "@/lib/management-department";
import "./hr.css";

type Department = { id: string; name: string; code: string | null; is_active: boolean };
type Employee = { id: string; user_id: string | null; department_id: string | null; employee_no: string | null; full_name: string; job_title: string | null; email: string | null; phone: string | null; employment_type: string; employment_status: string; start_date: string | null; can_receive_sales_requests: boolean; commission_rate: number; operation_commission_rate: number };
type Member = { user_id: string; role: string; is_active: boolean };
type Invitation = { id: string; email: string; role: string; status: string; created_at: string; expires_at: string };
type Doc = { id: string; employee_id: string; file_name: string; file_size: number | null; created_at: string };
type Tone = "info" | "gold" | "success" | "warning" | "danger" | "brand" | "neutral";

const TZ = "Europe/Istanbul";
const statusNames: Record<string, string> = { active: "Aktif", on_leave: "İzinli", inactive: "Pasif", terminated: "İşten ayrıldı" };
const statusTones: Record<string, Tone> = { active: "success", on_leave: "warning", inactive: "neutral", terminated: "danger" };
const typeNames: Record<string, string> = { full_time: "Tam zamanlı", part_time: "Yarı zamanlı", contractor: "Sözleşmeli", intern: "Stajyer" };
const inviteStatusNames: Record<string, string> = { sent: "Gönderildi", pending: "Gönderiliyor" };
const fileSize = (bytes: number | null) => { if (!bytes) return ""; const kb = bytes / 1024; return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`; };
const shortDate = (value: string) => new Date(value).toLocaleDateString("tr-TR", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const percent = (value: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);

// Süresi dolmamış davetler (saat bileşen gövdesinde okunmaz).
function liveInvitations(rows: Invitation[]) {
  const now = Date.now();
  return rows.filter((invite) => Date.parse(invite.expires_at) > now);
}

export default async function HrPage() {
  const { supabase, membership, userId, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  const canManageTeam = ["owner", "admin"].includes(membership.role);
  const canViewCommissions = ["owner", "admin", "manager"].includes(membership.role);

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
  const isOwner = membership.role === "owner";
  // Yönetici departmanındaki aktif/izinli çalışanın rolü departmandan gelir
  // (Kurum Sahibi); Ekip ekranından elle değiştirilemez.
  const managedByDepartment = (employee: Employee) =>
    MANAGEMENT_EMPLOYMENT_STATUSES.includes(employee.employment_status) &&
    isManagementDepartmentName(departmentMap.get(employee.department_id ?? ""));
  const memberMap = new Map(((memberData ?? []) as Member[]).map((member) => [member.user_id, member]));
  const invitations = liveInvitations((invitationData ?? []) as Invitation[]);
  const invitationByEmail = new Map(invitations.map((invite) => [invite.email.toLowerCase(), invite]));
  const docs = (docData ?? []) as Doc[];
  const docsByEmployee = new Map<string, Doc[]>();
  for (const doc of docs) { if (!docsByEmployee.has(doc.employee_id)) docsByEmployee.set(doc.employee_id, []); docsByEmployee.get(doc.employee_id)!.push(doc); }

  const activeCount = employees.filter((item) => item.employment_status === "active").length;
  const salesCount = employees.filter((item) => item.employment_status === "active" && item.can_receive_sales_requests).length;
  const accessCount = employees.filter((item) => item.user_id && memberMap.get(item.user_id)?.is_active).length;

  const widgets: { label: string; value: number; note: string; icon: string; tone: Tone }[] = [
    { label: "Toplam personel", value: employees.length, note: "Tüm personel kayıtları", icon: "users", tone: "brand" },
    { label: "Aktif personel", value: activeCount, note: "Çalışmaya devam eden", icon: "check", tone: "success" },
    { label: "Satış temsilcisi", value: salesCount, note: "Talep atanabilen personel", icon: "spark", tone: "gold" },
    { label: "Panel erişimi", value: accessCount, note: "Giriş yapabilen personel", icon: "key", tone: "info" },
  ];

  const employeeForm = <form className="panel-form hr-form" action={createEmployee}>
    <p className="wide hr-form-section">Kimlik</p>
    <label className="wide">Ad soyad<input name="full_name" required minLength={2} placeholder="Örn. Ayşe Yılmaz" /></label>
    <label>Personel numarası<input name="employee_no" /></label>
    <label>İşe giriş tarihi<input name="start_date" type="date" /></label>
    <p className="wide hr-form-section">Görev</p>
    <label>Pozisyon<input name="job_title" placeholder="Örn. Satış Uzmanı" /></label>
    <label>Departman<select name="department_id" defaultValue=""><option value="">Departman seçin</option>{departments.filter((item) => item.is_active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label>Çalışma tipi<select name="employment_type" defaultValue="full_time"><option value="full_time">Tam zamanlı</option><option value="part_time">Yarı zamanlı</option><option value="contractor">Sözleşmeli</option><option value="intern">Stajyer</option></select></label>
    <p className="wide hr-form-section">İletişim</p>
    <label>E-posta<input name="email" type="email" placeholder="ad@kurum.com" /></label><label>Telefon<input name="phone" placeholder="05xx xxx xx xx" /></label>
    <p className="wide hr-form-section">Prim ve satış</p>
    <label>Satış primi (%)<input name="commission_rate" type="number" min="0" max="100" step="0.01" defaultValue="0" /></label>
    <label>Operasyon primi (%)<input name="operation_commission_rate" type="number" min="0" max="100" step="0.01" defaultValue="0" /></label>
    <label className="wide hr-check"><input name="can_receive_sales_requests" type="checkbox" /><span><b>Satış talepleri atanabilir</b><small>Yeni satış talepleri bu personele atanabilir.</small></span></label>
    <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Personeli Kaydet</button></div>
  </form>;

  return <div className="hr-page">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">İNSAN KAYNAKLARI</small><h1>Ekip ve Personel</h1><p>Personel bilgileri, panel erişimi, prim oranları ve özlük dosyaları tek yerde.</p></div>
      <div className="panel-page-actions">{canViewCommissions ? <Link className="panel-secondary" href="/panel/hr/commissions">Prim Hesaplama</Link> : null}{canManageTeam ? <><Link className="panel-secondary" href="/panel/hr/confidentiality">Gizlilik Sözleşmeleri</Link><Link className="panel-secondary" href="/panel/hr/activity">Personel Hareketleri</Link></> : null}{canManageTeam ? <PanelDrawer triggerLabel="+ Yeni Personel" kicker="YENİ KAYIT" title="Yeni Personel" description="Personel ve görev bilgilerini kaydedin.">{employeeForm}</PanelDrawer> : null}</div>
    </div>

    <section className="hr-widgets" aria-label="Özet">
      {widgets.map((widget) => (
        <article className="hr-widget" data-tone={widget.tone} key={widget.label}>
          <span className="hr-widget-icon"><HrIcon name={widget.icon} /></span>
          <small>{widget.label}</small>
          <strong>{widget.value}</strong>
          <span className="hr-widget-note">{widget.note}</span>
        </article>
      ))}
    </section>

    <section className="hr-layout">
      <article className="hr-card">
        <header className="hr-card-head">
          <div><h2>Ekip listesi</h2><p>{employees.length ? `${activeCount} aktif · ${employees.length - activeCount} diğer durumda` : "Personel kayıtları burada listelenir"}</p></div>
          <span className="hr-count">{employees.length}</span>
        </header>

        {employees.length ? <ul className="hr-people">
          {employees.map((employee) => {
            const editForm = <form className="panel-form hr-form" action={updateEmployee}>
              <input type="hidden" name="employee_id" value={employee.id} />
              <p className="wide hr-form-section">Kimlik ve görev</p>
              <label className="wide">Ad soyad<input name="full_name" required defaultValue={employee.full_name} /></label>
              <label>Pozisyon<input name="job_title" defaultValue={employee.job_title ?? ""} /></label>
              <label>Departman<select name="department_id" defaultValue={employee.department_id ?? ""}><option value="">Departman seçin</option>{departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
              <label>Durum<select name="employment_status" defaultValue={employee.employment_status}><option value="active">Aktif</option><option value="on_leave">İzinli</option><option value="inactive">Pasif</option><option value="terminated">İşten ayrıldı</option></select></label>
              <p className="wide hr-form-section">İletişim</p>
              <label>E-posta<input name="email" type="email" defaultValue={employee.email ?? ""} /></label>
              <label>Telefon<input name="phone" defaultValue={employee.phone ?? ""} /></label>
              <p className="wide hr-form-section">Prim ve satış</p>
              <label>Satış primi (%)<input name="commission_rate" type="number" min="0" max="100" step="0.01" defaultValue={employee.commission_rate} /></label>
              <label>Operasyon primi (%)<input name="operation_commission_rate" type="number" min="0" max="100" step="0.01" defaultValue={employee.operation_commission_rate} /></label>
              <label className="wide hr-check"><input name="can_receive_sales_requests" type="checkbox" defaultChecked={employee.can_receive_sales_requests} /><span><b>Satış talepleri atanabilir</b><small>Yeni satış talepleri bu personele atanabilir.</small></span></label>
              <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Kaydet</button></div>
            </form>;

            const member = employee.user_id ? memberMap.get(employee.user_id) : undefined;
            const pendingInvite = !employee.user_id && employee.email ? invitationByEmail.get(employee.email.toLowerCase()) : undefined;
            const employeeDocs = docsByEmployee.get(employee.id) ?? [];
            const departmentName = employee.department_id ? departmentMap.get(employee.department_id) ?? "Departman" : null;
            const isDormant = employee.employment_status === "inactive" || employee.employment_status === "terminated";

            const docsPanel = <div className="hr-docs">
              <form className="hr-upload" action={uploadEmployeeDocument}>
                <input type="hidden" name="employee_id" value={employee.id} />
                <div className="hr-upload-head">
                  <span className="hr-upload-icon"><HrIcon name="upload" /></span>
                  <span><b>Yeni dosya yükle</b><small>Sözleşme, kimlik ve diploma gibi özlük belgeleri bu personelin klasöründe saklanır.</small></span>
                </div>
                <div className="hr-upload-row">
                  <input type="file" name="file" required />
                  <button className="panel-primary" type="submit">Yükle</button>
                </div>
              </form>
              {employeeDocs.length ? <ul className="hr-doc-list">
                {employeeDocs.map((doc) => (
                  <li className="hr-doc" key={doc.id}>
                    <Link href={`/panel/hr/documents/${doc.id}`} target="_blank">
                      <span className="hr-doc-icon"><HrIcon name="doc" size={17} /></span>
                      <span className="hr-doc-text"><b>{doc.file_name}</b><small>{[fileSize(doc.file_size), shortDate(doc.created_at)].filter(Boolean).join(" · ")}</small></span>
                    </Link>
                    <form action={deleteEmployeeDocument}><input type="hidden" name="document_id" value={doc.id} /><button className="panel-danger" type="submit">Sil</button></form>
                  </li>
                ))}
              </ul> : <p className="hr-doc-empty">Henüz dosya yüklenmedi.</p>}
            </div>;

            return <li className="hr-person" key={employee.id}>
              <span className={`hr-avatar is-lg${isDormant ? " is-muted" : ""}`} aria-hidden="true">{initials(employee.full_name)}</span>
              <div className="hr-person-main">
                <div className="hr-person-title">
                  <h3>{employee.full_name}</h3>
                  <span className="status-pill" data-tone={statusTones[employee.employment_status] ?? "neutral"}>{statusNames[employee.employment_status] ?? employee.employment_status}</span>
                </div>
                <p className="hr-person-role">{employee.job_title || "Pozisyon belirtilmedi"}{departmentName ? ` · ${departmentName}` : ""}</p>
                {employee.email || employee.phone || employee.employee_no || employee.start_date ? <div className="hr-person-meta">
                  {employee.email ? <a href={`mailto:${employee.email}`}><HrIcon name="mail" size={14} />{employee.email}</a> : null}
                  {employee.phone ? <a href={`tel:${employee.phone.replace(/\s+/g, "")}`}><HrIcon name="phone" size={14} />{employee.phone}</a> : null}
                  {employee.employee_no ? <span>No {employee.employee_no}</span> : null}
                  {employee.start_date ? <span>{typeNames[employee.employment_type] ?? "Personel"} · {shortDate(employee.start_date)} tarihinden beri</span> : null}
                </div> : null}
                {employee.can_receive_sales_requests || employee.commission_rate > 0 || employee.operation_commission_rate > 0 ? <div className="hr-chips">
                  {employee.can_receive_sales_requests ? <span className="hr-chip" data-tone="info">Satış atanabilir</span> : null}
                  {employee.commission_rate > 0 ? <span className="hr-chip" data-tone="gold">Satış primi %{percent(employee.commission_rate)}</span> : null}
                  {employee.operation_commission_rate > 0 ? <span className="hr-chip" data-tone="gold">Operasyon primi %{percent(employee.operation_commission_rate)}</span> : null}
                </div> : null}
              </div>

              {canManageTeam ? <div className="hr-person-actions">
                <PanelDrawer triggerLabel="Düzenle" triggerClassName="panel-secondary" kicker="PERSONEL" title="Personeli Düzenle" description={employee.full_name}>{editForm}</PanelDrawer>
                <PanelDrawer triggerLabel={`Özlük Dosyaları${employeeDocs.length ? ` (${employeeDocs.length})` : ""}`} triggerClassName="panel-secondary" kicker="GİZLİ" title="Özlük Dosyaları" description={employee.full_name}>{docsPanel}</PanelDrawer>
              </div> : null}

              {canManageTeam ? (
                <div className="hr-access">
                  <span className="hr-access-label"><HrIcon name="key" size={14} />Panel erişimi</span>
                  <div className="hr-access-body">
                    {member ? (
                      employee.user_id === userId ? (
                        <span className="status-pill" data-tone="gold">{roleNames[member.role] ?? member.role} · Siz</span>
                      ) : managedByDepartment(employee) ? (
                        <span className="status-pill" data-tone="gold">Kurum Sahibi · Yönetici departmanı</span>
                      ) : member.role === "owner" && !isOwner ? (
                        <span className="status-pill" data-tone="gold">{roleNames.owner}</span>
                      ) : (
                        <form className="hr-access-form" action={updateTeamMemberAccess}>
                          <input type="hidden" name="user_id" value={employee.user_id ?? ""} />
                          <select name="role" defaultValue={member.role} aria-label="Rol">
                            <option value="member">Satış Personeli</option>
                            <option value="operasyoncu">Operasyon Personeli</option>
                            <option value="admin">Yönetici</option>
                            {/* manager seçenekte yoktu; kaydedince sessizce Satış Personeli'ne düşüyordu. */}
                            {member.role === "manager" ? <option value="manager">Yönetici (sınırlı)</option> : null}
                            {isOwner ? <option value="owner">Kurum Sahibi</option> : null}
                          </select>
                          <label className="hr-toggle"><input type="checkbox" name="is_active" defaultChecked={member.is_active} /> Aktif</label>
                          <button className="panel-secondary" type="submit">Kaydet</button>
                        </form>
                      )
                    ) : pendingInvite ? (
                      <>
                        <span className="status-pill" data-tone={statusTone(pendingInvite.status)}>{pendingInvite.status === "sent" ? "Davet gönderildi" : "Davet gönderiliyor"}</span>
                        <form action={cancelInvitation}><input type="hidden" name="invitation_id" value={pendingInvite.id} /><button className="panel-secondary" type="submit">Daveti İptal Et</button></form>
                      </>
                    ) : (
                      <PanelDrawer triggerLabel="Panele Davet Et" triggerClassName="panel-secondary hr-invite-btn" kicker="PANEL ERİŞİMİ" title={`${employee.full_name} için panel erişimi`} description="Bu personele gerçek bir davet e-postası gönderilir.">
                        <InviteTeamForm employeeId={employee.id} fullName={employee.full_name} defaultEmail={employee.email ?? ""} />
                      </PanelDrawer>
                    )}
                  </div>
                </div>
              ) : null}
            </li>;
          })}
        </ul> : <div className="hr-empty-state">
          <span className="hr-empty-icon"><HrIcon name="users" size={24} /></span>
          <h3>Henüz personel kaydı yok</h3>
          <p>{canManageTeam ? "“+ Yeni Personel” ile ilk kaydı ekleyin; ardından panele davet edebilirsiniz." : "Yöneticiniz personel ekledikçe burada görünecek."}</p>
        </div>}
      </article>

      <aside className="hr-side">
        <section className="hr-card">
          <header className="hr-card-head">
            <div><h2>Departmanlar</h2><p>{departments.length ? `${departments.filter((item) => item.is_active).length} aktif departman` : "Organizasyon yapısı"}</p></div>
            {canManageTeam ? <PanelDrawer triggerLabel="+ Ekle" triggerClassName="panel-secondary" kicker="ORGANİZASYON" title="Yeni Departman"><form className="panel-form hr-form" action={createDepartment}><label className="wide">Departman adı<input name="name" required placeholder="Örn. Satış" /></label><label className="wide">Kısa kod<input name="code" maxLength={30} placeholder="Örn. SAT" /></label><div className="wide panel-form-actions"><button className="panel-primary" type="submit">Departmanı Kaydet</button></div></form></PanelDrawer> : null}
          </header>
          {departments.length ? <ul className="hr-list">
            {departments.map((department) => {
              const count = employees.filter((employee) => employee.department_id === department.id).length;
              return <li className={`hr-list-row${department.is_active ? "" : " is-inactive"}`} key={department.id}>
                <span className="hr-list-icon" data-tone={department.is_active ? "brand" : "neutral"}>{(department.code || initials(department.name)).slice(0, 3).toLocaleUpperCase("tr-TR")}</span>
                <span className="hr-list-body"><b>{department.name}</b><small>{department.is_active ? `${count} kişi` : `${count} kişi · Pasif`}</small></span>
                <span className="hr-list-count" data-tone={count ? "brand" : "neutral"}>{count}</span>
              </li>;
            })}
          </ul> : <div className="hr-empty-state is-compact">
            <span className="hr-empty-icon"><HrIcon name="building" size={20} /></span>
            <p>Henüz departman yok.</p>
          </div>}
        </section>

        {canManageTeam ? <section className="hr-card">
          <header className="hr-card-head">
            <div><h2>Bekleyen davetler</h2><p>Henüz kabul edilmemiş panel davetleri</p></div>
            <span className="hr-count">{invitations.length}</span>
          </header>
          {invitations.length ? <ul className="hr-list">
            {invitations.map((invite) => (
              <li className="hr-list-row" key={invite.id}>
                <span className="hr-list-icon" data-tone={statusTone(invite.status)}><HrIcon name="send" size={15} /></span>
                <span className="hr-list-body"><b title={invite.email}>{invite.email}</b><small>{roleNames[invite.role] ?? invite.role}</small><small>Son gün {shortDate(invite.expires_at)}</small></span>
                <span className="status-pill" data-tone={statusTone(invite.status)}>{inviteStatusNames[invite.status] ?? invite.status}</span>
              </li>
            ))}
          </ul> : <div className="hr-empty-state is-compact">
            <span className="hr-empty-icon"><HrIcon name="mail" size={20} /></span>
            <p>Bekleyen davet yok.</p>
          </div>}
        </section> : null}
      </aside>
    </section>
  </div>;
}
