import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { statusTone } from "@/lib/status-tone";
import { PanelDrawer } from "../components/panel-drawer";
import { createDepartment, createEmployee } from "./actions";
import { TeamInviteLink } from "./invite-link";
import { roleNames } from "./role-names";
import { initials } from "./hr-icons";
import "./hr.css";
import "../crm/kayit-detay/kayit-detay.css";

/*
  EKİP LİSTESİ (2026-10): detay sayfalarıyla aynı iskelet. Üstte başlık,
  "Yeni personel" ve "⋯"; altında özet şeridi; solda ekip, sağda
  departmanlar ve bekleyen davetler.

  Eskiden her personel kartı kendi düzenleme ve özlük çekmecesini, rol
  formunu ve davet düğmelerini taşıyordu; liste bir yönetim ekranına
  dönmüştü ve on kişide sayfa ekranın üç katı uzuyordu. Bunların hepsi
  artık personel detayında (/panel/hr/[id]); liste yalnızca kim kim,
  hangi durumda ve panele girebiliyor mu sorularını yanıtlıyor.

  Süzme adresle (?durum=, ?departman=): sunucuda yapılıyor, bağlantı
  paylaşılabiliyor ve sayfa yenilenince kaybolmuyor.
*/

type Department = { id: string; name: string; code: string | null; is_active: boolean };
type Employee = { id: string; user_id: string | null; department_id: string | null; employee_no: string | null; full_name: string; job_title: string | null; email: string | null; phone: string | null; employment_type: string; employment_status: string; start_date: string | null; can_receive_sales_requests: boolean };
type Member = { user_id: string; role: string; is_active: boolean };
type Invitation = { id: string; email: string; role: string; status: string; created_at: string; expires_at: string };

const TZ = "Europe/Istanbul";
const statusNames: Record<string, string> = { active: "Aktif", on_leave: "İzinli", inactive: "Pasif", terminated: "İşten ayrıldı" };
const statusTones: Record<string, string> = { active: "success", on_leave: "warning", inactive: "neutral", terminated: "danger" };
const inviteStatusNames: Record<string, string> = { sent: "Gönderildi", pending: "Gönderiliyor" };
const shortDate = (value: string) => new Date(value).toLocaleDateString("tr-TR", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const DURUM_SUZGECLERI = [
  ["", "Tümü"],
  ["active", "Aktif"],
  ["on_leave", "İzinli"],
  ["pasif", "Ayrılan / pasif"],
] as const;

// Süresi dolmamış davetler (saat bileşen gövdesinde okunmaz).
function liveInvitations(rows: Invitation[]) {
  const now = Date.now();
  return rows.filter((invite) => Date.parse(invite.expires_at) > now);
}

export default async function HrPage({ searchParams }: { searchParams: Promise<{ durum?: string; departman?: string }> }) {
  const { durum = "", departman = "" } = await searchParams;
  const { supabase, membership, modules, organization, izin } = await getPanelContext();
  const organizationName = organization.display_name || organization.name;
  if (!modules.some((module) => module.code === "hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  const canManageTeam = izin("hr.ekip.yonet");

  const [{ data: employeeData, error: employeeError }, { data: departmentData, error: departmentError }, { data: memberData }, { data: invitationData }] = await Promise.all([
    supabase.from("hr_employees").select("id,user_id,department_id,employee_no,full_name,job_title,email,phone,employment_type,employment_status,start_date,can_receive_sales_requests").eq("organization_id", membership.organization_id).order("full_name"),
    supabase.from("hr_departments").select("id,name,code,is_active").eq("organization_id", membership.organization_id).order("name"),
    canManageTeam ? supabase.from("organization_memberships").select("user_id,role,is_active").eq("organization_id", membership.organization_id) : Promise.resolve({ data: [] as Member[] }),
    canManageTeam ? supabase.from("organization_invitations").select("id,email,role,status,created_at,expires_at").eq("organization_id", membership.organization_id).in("status", ["pending", "sent"]) : Promise.resolve({ data: [] as Invitation[] }),
  ]);
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);
  if (departmentError) throw new Error("Departmanlar okunamadı: " + departmentError.message);

  const employees = (employeeData ?? []) as Employee[];
  const departments = (departmentData ?? []) as Department[];
  const departmentMap = new Map(departments.map((item) => [item.id, item.name]));
  const memberMap = new Map(((memberData ?? []) as Member[]).map((member) => [member.user_id, member]));
  const invitations = liveInvitations((invitationData ?? []) as Invitation[]);
  const invitationByEmail = new Map(invitations.map((invite) => [invite.email.toLowerCase(), invite]));

  const activeCount = employees.filter((item) => item.employment_status === "active").length;
  const salesCount = employees.filter((item) => item.employment_status === "active" && item.can_receive_sales_requests).length;
  const accessCount = employees.filter((item) => item.user_id && memberMap.get(item.user_id)?.is_active).length;

  const pasifMi = (item: Employee) => item.employment_status === "inactive" || item.employment_status === "terminated";
  const gorunen = employees.filter((item) =>
    (!durum || (durum === "pasif" ? pasifMi(item) : item.employment_status === durum)) &&
    (!departman || item.department_id === departman),
  );
  const adres = (ek: { durum?: string; departman?: string }) => {
    const q = new URLSearchParams();
    const d = ek.durum ?? durum;
    const dep = ek.departman ?? departman;
    if (d) q.set("durum", d);
    if (dep) q.set("departman", dep);
    const s = q.toString();
    return s ? `/panel/hr?${s}` : "/panel/hr";
  };
  // Durum sayıları seçili departmanın içinden: süzgeçte görünen sayı, tıklayınca gelen satır sayısı olsun.
  const depIci = departman ? employees.filter((item) => item.department_id === departman) : employees;
  const durumSayisi = (kod: string) =>
    kod === "" ? depIci.length : kod === "pasif" ? depIci.filter(pasifMi).length : depIci.filter((item) => item.employment_status === kod).length;

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

  return <main className="talep cari personel ekip">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">İNSAN KAYNAKLARI</small>
        <h1>Ekip ve personel</h1>
      </div>
      <div className="talep-bas-eylem">
        {canManageTeam ? <PanelDrawer triggerLabel="Yeni personel" kicker="YENİ KAYIT" title="Yeni Personel" description="Personel ve görev bilgilerini kaydedin.">{employeeForm}</PanelDrawer> : null}
        <details className="os-menu talep-menu">
          <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
          <div className="os-menu-list" role="menu">
            {canManageTeam ? (
              <PanelDrawer triggerLabel="Yeni departman" triggerClassName="os-menu-item" kicker="ORGANİZASYON" title="Yeni Departman">
                <form className="panel-form hr-form" action={createDepartment}><label className="wide">Departman adı<input name="name" required placeholder="Örn. Satış" /></label><label className="wide">Kısa kod<input name="code" maxLength={30} placeholder="Örn. SAT" /></label><div className="wide panel-form-actions"><button className="panel-primary" type="submit">Departmanı Kaydet</button></div></form>
              </PanelDrawer>
            ) : null}
            <Link className="os-menu-item" href="/panel/hr/activity">Personel hareketleri</Link>
          </div>
        </details>
      </div>
    </header>

    {/* ÖZET ŞERİDİ: detay sayfalarındaki şeritle aynı. */}
    <section className="kayit-serit" aria-label="Ekip özeti">
      <dl>
        <div><dt>Toplam personel</dt><dd>{employees.length}</dd></div>
        <div><dt>Aktif</dt><dd className="cari-arti">{activeCount}</dd></div>
        <div><dt>Satış temsilcisi</dt><dd>{salesCount}</dd></div>
        {canManageTeam ? <div><dt>Panel erişimi</dt><dd>{accessCount}</dd></div> : null}
        {canManageTeam ? <div><dt>Bekleyen davet</dt><dd>{invitations.length}</dd></div> : null}
      </dl>
    </section>

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="Ekip listesi">
        <div className="ekip-suzgec" role="group" aria-label="Duruma göre süz">
          {DURUM_SUZGECLERI.map(([kod, ad]) => (
            <Link key={kod || "tumu"} href={adres({ durum: kod })} className={durum === kod ? "is-active" : undefined} aria-current={durum === kod ? "page" : undefined}>
              {ad} <small>{durumSayisi(kod)}</small>
            </Link>
          ))}
          {departman ? <Link className="ekip-suzgec-dep" href={adres({ departman: "" })}>{departmentMap.get(departman) ?? "Departman"} ✕</Link> : null}
        </div>

        {gorunen.length ? (
          <ul className="ekip-liste">
            {gorunen.map((employee) => {
              const member = employee.user_id ? memberMap.get(employee.user_id) : undefined;
              const pendingInvite = !employee.user_id && employee.email ? invitationByEmail.get(employee.email.toLowerCase()) : undefined;
              const departmentName = employee.department_id ? departmentMap.get(employee.department_id) ?? null : null;
              const erisim = member
                ? member.is_active ? { ad: roleNames[member.role] ?? member.role, ton: "info" } : { ad: "Erişim kapalı", ton: "neutral" }
                : pendingInvite ? { ad: "Davet bekliyor", ton: "warning" } : { ad: "Erişim yok", ton: "neutral" };
              return (
                <li key={employee.id}>
                  <Link href={`/panel/hr/${employee.id}`} className={pasifMi(employee) ? "is-pasif" : undefined}>
                    <span className="talep-avatar" aria-hidden="true">{initials(employee.full_name)}</span>
                    <span className="cari-hareket-metin">
                      <b>{employee.full_name}</b>
                      <small>{[employee.job_title || "Pozisyon belirtilmedi", departmentName].filter(Boolean).join(" · ")}</small>
                    </span>
                    <span className="ekip-iletisim">{employee.phone || employee.email || ""}</span>
                    {canManageTeam ? <span className="status-pill ekip-erisim" data-tone={erisim.ton}>{erisim.ad}</span> : null}
                    <span className="status-pill" data-tone={statusTones[employee.employment_status] ?? "neutral"}>{statusNames[employee.employment_status] ?? employee.employment_status}</span>
                    <span className="ekip-ok" aria-hidden="true">›</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="ic-akis-bos">
            {employees.length
              ? "Bu süzgeçle eşleşen personel yok."
              : canManageTeam ? "Henüz personel kaydı yok. “Yeni personel” ile ilk kaydı ekleyin; ardından panele davet edebilirsiniz." : "Yöneticiniz personel ekledikçe burada görünecek."}
          </p>
        )}
      </section>

      <section className="panel-card talep-musteri" aria-label="Departmanlar ve davetler">
        <div className="cari-baslik">
          <h2>Departmanlar</h2>
          <small>{departments.filter((item) => item.is_active).length} aktif</small>
        </div>
        {departments.length ? (
          <ul className="cari-hareketler">
            {departments.map((department) => {
              const count = employees.filter((employee) => employee.department_id === department.id).length;
              return (
                <li key={department.id}>
                  {/* Departmana tıklamak listeyi o departmana süzer. */}
                  <Link href={adres({ departman: departman === department.id ? "" : department.id })} className={departman === department.id ? "is-active" : undefined}>
                    <span className="ekip-dep-kod" data-pasif={department.is_active ? undefined : ""}>{(department.code || initials(department.name)).slice(0, 3).toLocaleUpperCase("tr-TR")}</span>
                    <span className="cari-hareket-metin"><b>{department.name}</b><small>{department.is_active ? `${count} kişi` : `${count} kişi · Pasif`}</small></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <p className="talep-bos cari-not">Henüz departman yok.</p>}

        {canManageTeam ? (
          <div className="talep-not">
            <div className="cari-baslik"><h3>Bekleyen davetler</h3><small>{invitations.length}</small></div>
            {invitations.length ? (
              <ul className="cari-hareketler">
                {invitations.map((invite) => (
                  <li key={invite.id}>
                    <span className="cari-hareket-metin"><b title={invite.email}>{invite.email}</b><small>{roleNames[invite.role] ?? invite.role} · son gün {shortDate(invite.expires_at)}</small></span>
                    <span className="status-pill" data-tone={statusTone(invite.status)}>{inviteStatusNames[invite.status] ?? invite.status}</span>
                    <PanelDrawer triggerLabel="Bağlantı" triggerClassName="panel-secondary ekip-baglanti" kicker="PANEL ERİŞİMİ" title={`${invite.email} için giriş bağlantısı`} description="Davet e-postası ulaşmadıysa bağlantıyı WhatsApp veya e-postayla kendiniz gönderin.">
                      <TeamInviteLink invitationId={invite.id} organizationName={organizationName} personName={null} email={invite.email} />
                    </PanelDrawer>
                  </li>
                ))}
              </ul>
            ) : <p className="talep-bos cari-not">Bekleyen davet yok.</p>}
          </div>
        ) : null}
      </section>
    </div>
  </main>;
}
