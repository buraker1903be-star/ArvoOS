import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import { createDepartment, createEmployee, updateEmployee } from "./actions";
import { inviteTeamMember, updateTeamMemberAccess, cancelInvitation } from "./team-actions";
import { roleNames } from "./role-names";
import "./hr.css";

type Department = { id: string; name: string; code: string | null; is_active: boolean };
type Employee = { id: string; user_id: string | null; department_id: string | null; employee_no: string | null; full_name: string; job_title: string | null; email: string | null; phone: string | null; employment_type: string; employment_status: string; start_date: string | null; can_receive_sales_requests: boolean; commission_rate: number };
type Member = { organization_id: string; user_id: string; role: string; is_active: boolean; joined_at: string };
type Profile = { id: string; full_name: string | null };
type HrEmployeeInfo = { user_id: string | null; full_name: string; job_title: string | null };
type Invitation = { id: string; email: string; role: string; status: string; created_at: string; expires_at: string };

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR");
const statusNames: Record<string, string> = { active: "Aktif", on_leave: "İzinli", inactive: "Pasif", terminated: "İşten ayrıldı" };

export default async function HrPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams;
  const { supabase, membership, userId, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  const canManageTeam = ["owner", "admin"].includes(membership.role);
  const tab = params.tab === "ekip" && canManageTeam ? "ekip" : "personel";

  const [{ data: employeeData, error: employeeError }, { data: departmentData, error: departmentError }] = await Promise.all([
    supabase.from("hr_employees").select("id,user_id,department_id,employee_no,full_name,job_title,email,phone,employment_type,employment_status,start_date,can_receive_sales_requests,commission_rate").eq("organization_id", membership.organization_id).order("full_name"),
    supabase.from("hr_departments").select("id,name,code,is_active").eq("organization_id", membership.organization_id).order("name"),
  ]);
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);
  if (departmentError) throw new Error("Departmanlar okunamadı: " + departmentError.message);
  const employees = (employeeData ?? []) as Employee[];
  const departments = (departmentData ?? []) as Department[];
  const departmentMap = new Map(departments.map((item) => [item.id, item.name]));
  const activeCount = employees.filter((item) => item.employment_status === "active").length;
  const salesCount = employees.filter((item) => item.employment_status === "active" && item.can_receive_sales_requests).length;
  const leaveCount = employees.filter((item) => item.employment_status === "on_leave").length;

  let members: Member[] = [];
  let invitations: Invitation[] = [];
  let profileMap = new Map<string, string | null>();
  let hrEmployeeMap = new Map<string, HrEmployeeInfo>();
  if (tab === "ekip" && canManageTeam) {
    const [{ data: memberData, error: memberError }, { data: invitationData, error: invitationError }] = await Promise.all([
      supabase.from("organization_memberships").select("organization_id,user_id,role,is_active,joined_at").eq("organization_id", membership.organization_id).order("joined_at", { ascending: true }),
      supabase.from("organization_invitations").select("id,email,role,status,created_at,expires_at").eq("organization_id", membership.organization_id).in("status", ["pending", "sent"]).order("created_at", { ascending: false }),
    ]);
    if (memberError) throw new Error("Ekip üyeleri okunamadı: " + memberError.message);
    if (invitationError) throw new Error("Davetler okunamadı: " + invitationError.message);
    members = (memberData ?? []) as Member[];
    invitations = ((invitationData ?? []) as Invitation[]).filter((invite) => new Date(invite.expires_at) > new Date());
    const userIds = members.map((member) => member.user_id);
    const { data: profileData } = userIds.length ? await supabase.from("profiles").select("id,full_name").in("id", userIds) : { data: [] as Profile[] };
    profileMap = new Map(((profileData ?? []) as Profile[]).map((profile) => [profile.id, profile.full_name]));
    const { data: hrEmployeeData } = userIds.length ? await supabase.from("hr_employees").select("user_id,full_name,job_title").eq("organization_id", membership.organization_id).in("user_id", userIds) : { data: [] as HrEmployeeInfo[] };
    hrEmployeeMap = new Map(((hrEmployeeData ?? []) as HrEmployeeInfo[]).filter((item) => item.user_id).map((item) => [item.user_id as string, item]));
  }
  const activeTeamCount = members.filter((member) => member.is_active).length;

  const employeeForm = <form className="panel-form" action={createEmployee}>
    <label className="wide">Ad soyad<input name="full_name" required minLength={2} /></label>
    <label>Personel numarası<input name="employee_no" /></label>
    <label>Pozisyon<input name="job_title" /></label>
    <label>Departman<select name="department_id" defaultValue=""><option value="">Departman seçin</option>{departments.filter((item) => item.is_active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label>Çalışma tipi<select name="employment_type" defaultValue="full_time"><option value="full_time">Tam zamanlı</option><option value="part_time">Yarı zamanlı</option><option value="contractor">Sözleşmeli</option><option value="intern">Stajyer</option></select></label>
    <label>E-posta<input name="email" type="email" /></label><label>Telefon<input name="phone" /></label>
    <label>İşe giriş tarihi<input name="start_date" type="date" /></label>
    <label>Prim oranı (%)<input name="commission_rate" type="number" min="0" max="100" step="0.01" defaultValue="0" /></label>
    <label className="wide"><span>Satış yetkisi</span><span><input name="can_receive_sales_requests" type="checkbox" /> Satış talepleri atanabilir</span></label>
    <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Personeli Kaydet</button></div>
  </form>;

  const tabHref = (target: string) => `/panel/hr?tab=${target}`;

  return <div className="hr-page">
    <div className="panel-pagehead">
      <div><small className="panel-kicker">İNSAN KAYNAKLARI</small><h1>{tab === "ekip" ? "Ekip ve Kullanıcılar" : "Personel Merkezi"}</h1><p>{tab === "ekip" ? "Kurum üyelerini, rollerini ve panel erişimlerini yönetin." : "Personelleri, departmanları, CRM atama yetkilerini ve prim oranlarını tek merkezden yönetin."}</p></div>
      <div className="panel-page-actions">
        {tab === "personel" ? <PanelDrawer triggerLabel="+ Yeni Personel" title="Yeni Personel" description="Personel ve görev bilgilerini kaydedin.">{employeeForm}</PanelDrawer> : null}
        {tab === "ekip" ? <>
          <span className="status-pill">{activeTeamCount} aktif</span>
          <PanelDrawer triggerLabel="+ Kullanıcı davet et" title="Yeni kullanıcı davet et" description="Kullanıcıya gerçek bir davet e-postası gönderilir; e-postadaki linkten kendi şifresini oluşturur.">
            <form className="panel-form" action={inviteTeamMember}>
              <label className="wide">E-posta<input name="email" type="email" required placeholder="kullanici@firma.com" /></label>
              <label>Ad Soyad (opsiyonel)<input name="full_name" placeholder="Ad Soyad" /></label>
              <label>Rol<select name="role" defaultValue="member">
                <option value="member">Üye</option>
                <option value="manager">Ekip Lideri</option>
                <option value="admin">Yönetici</option>
                <option value="owner">Kurum Sahibi</option>
              </select></label>
              <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Daveti Gönder</button></div>
            </form>
          </PanelDrawer>
        </> : null}
      </div>
    </div>

    {canManageTeam ? (
      <div className="module-tabs">
        <Link className={tab === "personel" ? "active" : ""} href={tabHref("personel")}>Personel</Link>
        <Link className={tab === "ekip" ? "active" : ""} href={tabHref("ekip")}>Ekip Yönetimi</Link>
      </div>
    ) : null}

    <div className="module-tab-panel">
    {tab === "personel" ? <>
    <section className="hr-metrics"><article><small>TOPLAM PERSONEL</small><strong>{employees.length}</strong><span>Tüm personel kayıtları</span></article><article><small>AKTİF PERSONEL</small><strong>{activeCount}</strong><span>Çalışmaya devam eden</span></article><article><small>SATIŞ TEMSİLCİSİ</small><strong>{salesCount}</strong><span>Talep atanabilir personel</span></article><article><small>İZİNLİ</small><strong>{leaveCount}</strong><span>Şu anda izinli</span></article></section>
    <section className="hr-layout"><div className="panel-card"><div className="panel-card-head"><div><small>PERSONELLER</small><h2>Ekip Listesi</h2></div></div><div className="hr-employee-list">{employees.map((employee) => {
      const edit = <form className="panel-form" action={updateEmployee}><input type="hidden" name="employee_id" value={employee.id} /><label className="wide">Ad soyad<input name="full_name" required defaultValue={employee.full_name} /></label><label>Pozisyon<input name="job_title" defaultValue={employee.job_title ?? ""} /></label><label>Departman<select name="department_id" defaultValue={employee.department_id ?? ""}><option value="">Departman seçin</option>{departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>E-posta<input name="email" type="email" defaultValue={employee.email ?? ""} /></label><label>Telefon<input name="phone" defaultValue={employee.phone ?? ""} /></label><label>Durum<select name="employment_status" defaultValue={employee.employment_status}><option value="active">Aktif</option><option value="on_leave">İzinli</option><option value="inactive">Pasif</option><option value="terminated">İşten ayrıldı</option></select></label><label>Prim oranı (%)<input name="commission_rate" type="number" min="0" max="100" step="0.01" defaultValue={employee.commission_rate} /></label><label className="wide"><span><input name="can_receive_sales_requests" type="checkbox" defaultChecked={employee.can_receive_sales_requests} /> Satış talepleri atanabilir</span></label><div className="wide panel-form-actions"><button className="panel-primary">Kaydet</button></div></form>;
      return <article className="hr-employee-card" key={employee.id}><div className="hr-avatar">{initials(employee.full_name)}</div><div><h3>{employee.full_name}</h3><p>{employee.job_title || "Pozisyon belirtilmedi"}{employee.department_id ? ` · ${departmentMap.get(employee.department_id) ?? "Departman"}` : ""}</p><div className="hr-tags"><span>{statusNames[employee.employment_status] ?? employee.employment_status}</span>{employee.can_receive_sales_requests ? <span>Satış atanabilir</span> : null}{employee.commission_rate > 0 ? <span>Prim %{employee.commission_rate}</span> : null}{employee.user_id ? <span>Panel kullanıcısı</span> : null}</div></div><PanelDrawer triggerLabel="Düzenle" title="Personeli Düzenle">{edit}</PanelDrawer></article>;
    })}{!employees.length ? <div className="hr-empty">Henüz personel kaydı yok.</div> : null}</div></div>
      <aside className="hr-side"><section className="panel-card"><div className="panel-card-head"><div><small>ORGANİZASYON</small><h2>Departmanlar</h2></div><PanelDrawer triggerLabel="+ Ekle" title="Yeni Departman"><form className="panel-form" action={createDepartment}><label className="wide">Departman adı<input name="name" required /></label><label className="wide">Kısa kod<input name="code" maxLength={30} /></label><div className="wide panel-form-actions"><button className="panel-primary">Departmanı Kaydet</button></div></form></PanelDrawer></div><div className="hr-department-list">{departments.map((department) => <div key={department.id}><b>{department.name}</b><span>{employees.filter((employee) => employee.department_id === department.id).length} kişi</span></div>)}{!departments.length ? <p>Henüz departman yok.</p> : null}</div></section></aside>
    </section>
    </> : null}

    {tab === "ekip" ? <>
      {invitations.length ? (
        <section className="panel-card team-invites">
          <div className="section-heading compact"><div><small className="panel-kicker">BEKLEYEN DAVETLER</small><h2>Henüz kabul edilmedi</h2></div></div>
          <div className="team-invite-list">
            {invitations.map((invite) => (
              <div className="team-invite-row" key={invite.id}>
                <div><b>{invite.email}</b><small>{roleNames[invite.role] ?? invite.role} · {new Date(invite.created_at).toLocaleDateString("tr-TR")} gönderildi</small></div>
                <span className="status-pill">{invite.status === "sent" ? "E-posta gönderildi" : "Gönderiliyor"}</span>
                <form action={cancelInvitation}><input type="hidden" name="invitation_id" value={invite.id} /><button className="panel-secondary" type="submit">İptal Et</button></form>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel-card">
        <div className="section-heading compact"><div><small className="panel-kicker">EKİP ÜYELERİ</small><h2>Panel erişimi olanlar</h2></div></div>
        <div className="team-member-list">
          {members.map((member) => {
            const hrInfo = hrEmployeeMap.get(member.user_id);
            const displayName = hrInfo?.full_name || profileMap.get(member.user_id) || (member.user_id === userId ? roleNames[membership.role] ?? "Siz" : "İsimsiz kullanıcı");
            const subline = member.user_id === userId
              ? (hrInfo?.job_title ? `Siz · ${hrInfo.job_title}` : "Siz")
              : hrInfo
                ? [hrInfo.job_title, `Katılım: ${new Date(member.joined_at).toLocaleDateString("tr-TR")}`].filter(Boolean).join(" · ")
                : `Katılım: ${new Date(member.joined_at).toLocaleDateString("tr-TR")} · Personel kaydı yok`;
            return (
            <div className="team-member-row" key={member.user_id}>
              <div className="team-member-identity">
                <span className="team-avatar">{displayName.slice(0, 2).toUpperCase()}</span>
                <div><b>{displayName}</b><small>{subline}</small></div>
              </div>
              {member.user_id === userId ? (
                <span className="status-pill">{roleNames[member.role] ?? member.role} · Kendiniz</span>
              ) : (
                <form className="team-member-form" action={updateTeamMemberAccess}>
                  <input type="hidden" name="user_id" value={member.user_id} />
                  <select name="role" defaultValue={member.role}>
                    <option value="member">Üye</option>
                    <option value="manager">Ekip Lideri</option>
                    <option value="admin">Yönetici</option>
                    <option value="owner">Kurum Sahibi</option>
                  </select>
                  <label className="team-active-toggle"><input type="checkbox" name="is_active" defaultChecked={member.is_active} /> Aktif</label>
                  <button className="panel-secondary" type="submit">Kaydet</button>
                </form>
              )}
            </div>
            );
          })}
          {!members.length ? <p className="panel-empty">Henüz ekip üyesi yok.</p> : null}
        </div>
      </section>
    </> : null}
    </div>
  </div>;
}
