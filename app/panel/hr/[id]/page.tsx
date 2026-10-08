import Link from "next/link";
import { notFound } from "next/navigation";
import { getPanelContext } from "@/lib/panel-context";
import { statusTone } from "@/lib/status-tone";
import { formatPhone } from "@/lib/format-phone";
import { todayInIstanbul } from "@/lib/istanbul-date";
import { isManagementDepartmentName, MANAGEMENT_EMPLOYMENT_STATUSES } from "@/lib/management-department";
import { PanelDrawer } from "../../components/panel-drawer";
import { updateEmployee } from "../actions";
import { updateTeamMemberAccess, cancelInvitation } from "../team-actions";
import { InviteTeamForm } from "../invite-team-form";
import { TeamInviteLink } from "../invite-link";
import { uploadEmployeeDocument, deleteEmployeeDocument } from "../documents-actions";
import { roleNames } from "../role-names";
import { HrIcon, initials } from "../hr-icons";
import { requestStageNames } from "../../crm/request-status";
import { workflowStatusNames } from "../../operations/ops-shared";
import { teklifGrubu } from "@/lib/teklif-grubu";
import { gunOnce, oran } from "@/lib/liste-istatistik";
import { tamPara } from "../../crm/istatistik-karti";
import { simdi } from "../../os/genel-bakis";
import "../hr.css";
import "../../crm/kayit-detay/kayit-detay.css";

/*
  PERSONEL DETAYI (2026-10): talep, teklif, sözleşme, iş ve cari
  detayıyla aynı iskelet. Eskiden personelin ayrı bir sayfası yoktu;
  her şey ekip listesindeki kartın içinde ve iki çekmecedeydi (Düzenle,
  Özlük Dosyaları), personelin üstündeki talepler ve işler hiçbir yerde
  bir arada görünmüyordu.

  Üstte ad ve "Düzenle"; altında özet şeridi (durum, çalışma tipi,
  kıdem, panel erişimi). Solda kişi ve iletişim, ortada üstündeki açık
  talepler ve yürüttüğü işler, sağda panel erişimi ve özlük dosyaları.
*/

type Department = { id: string; name: string; is_active: boolean };
type Employee = { id: string; user_id: string | null; department_id: string | null; employee_no: string | null; full_name: string; job_title: string | null; email: string | null; phone: string | null; employment_type: string; employment_status: string; start_date: string | null; can_receive_sales_requests: boolean; commission_rate: number; operation_commission_rate: number };
type Member = { user_id: string; role: string; is_active: boolean };
type Invitation = { id: string; email: string; role: string; status: string; expires_at: string };
type Doc = { id: string; file_name: string; file_size: number | null; created_at: string };
type Talep = { id: string; title: string | null; customer_name: string | null; stage: string | null; created_at: string };
type Is = { id: string; title: string; customer_name: string | null; status: string; due_date: string | null };

const TZ = "Europe/Istanbul";
const statusNames: Record<string, string> = { active: "Aktif", on_leave: "İzinli", inactive: "Pasif", terminated: "İşten ayrıldı" };
const statusTones: Record<string, string> = { active: "success", on_leave: "warning", inactive: "neutral", terminated: "danger" };
const typeNames: Record<string, string> = { full_time: "Tam zamanlı", part_time: "Yarı zamanlı", contractor: "Sözleşmeli", intern: "Stajyer" };
const fileSize = (bytes: number | null) => { if (!bytes) return ""; const kb = bytes / 1024; return kb < 1024 ? `${kb.toFixed(0)} KB` : `${(kb / 1024).toFixed(1)} MB`; };
const shortDate = (value: string) => new Date(value.includes("T") ? value : `${value}T12:00:00`).toLocaleDateString("tr-TR", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const percent = (value: number) => new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
/** Kıdem: işe girişten bugüne (Türkiye takvimiyle) yıl ve ay. */
function kidem(baslangic: string, bugun: string) {
  const [by, ba] = baslangic.split("-").map(Number);
  const [y, a] = bugun.split("-").map(Number);
  const ay = (y - by) * 12 + (a - ba);
  if (ay < 1) return "Bu ay başladı";
  const yil = Math.floor(ay / 12);
  return [yil ? `${yil} yıl` : "", ay % 12 ? `${ay % 12} ay` : ""].filter(Boolean).join(" ");
}
// Süresi dolmamış davet (saat bileşen gövdesinde okunmaz).
// E-posta JS tarafında eşleşir: ilike, adreslerdeki "_" karakterini joker sayardı.
function canliDavet(rows: Invitation[], email: string | null) {
  const now = Date.now();
  const aranan = email?.toLowerCase();
  return aranan ? rows.find((invite) => invite.email.toLowerCase() === aranan && Date.parse(invite.expires_at) > now) : undefined;
}
/*
  Açık talep: talepler listesinin "Aktif" kümesi (yeni + inceleniyor).
  Eskiden kazanılan ve kaybedilen dışındaki her aşama sayılıyordu
  (teklif ve sözleşme aşamaları dahil): başlıkta 58 yazıp "tümünü gör"
  talepler listesinde 4 kayıt açıyordu.
*/
const AKTIF_ASAMALAR = ["lead", "qualified"];
/*
  Üstündeki iş: işler listesinde görünen küme (arşivlenmemiş, iptal
  edilmemiş; tamamlanıp arşive gönderilmeyi bekleyen dahil). Eskiden
  tamamlananlar sayılmıyordu: burada 10, "tümünü gör"de 11 iş çıkıyordu.
*/
const LISTEDEKI_IS_DURUMLARI = ["planned", "in_progress", "blocked", "completed"];
const LISTE = 6;

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, membership, userId, modules, organization, izin, isPlatformOwner } = await getPanelContext();
  if (!modules.some((module) => module.code === "hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  const canManageTeam = izin("hr.ekip.yonet");
  const crmVar = modules.some((module) => module.code === "crm");
  const opsVar = modules.some((module) => module.code === "operations");
  const org = membership.organization_id;

  const [{ data: employeeData, error: employeeError }, { data: departmentData }] = await Promise.all([
    supabase.from("hr_employees").select("id,user_id,department_id,employee_no,full_name,job_title,email,phone,employment_type,employment_status,start_date,can_receive_sales_requests,commission_rate,operation_commission_rate").eq("id", id).eq("organization_id", org).maybeSingle(),
    supabase.from("hr_departments").select("id,name,is_active").eq("organization_id", org).order("name"),
  ]);
  if (employeeError) throw new Error("Personel okunamadı: " + employeeError.message);
  if (!employeeData) notFound();
  const employee = employeeData as Employee;
  const departments = (departmentData ?? []) as Department[];
  const departmentName = employee.department_id ? departments.find((item) => item.id === employee.department_id)?.name ?? "Departman" : null;

  /*
    Sayılar ayrı "count" sorgularından: listeler LISTE kadar satır
    okuyor ve sınırlı listeden sayım almak, sınıra ulaşınca yanlış
    rakam gösterir (check:rakamlar).
  */
  const bos = Promise.resolve({ data: [], count: 0 });
  const [memberResult, invitationResult, docResult, talepResult, talepSayisi, isResult, isSayisi] = await Promise.all([
    canManageTeam && employee.user_id ? supabase.from("organization_memberships").select("user_id,role,is_active").eq("organization_id", org).eq("user_id", employee.user_id).maybeSingle() : Promise.resolve({ data: null }),
    canManageTeam && !employee.user_id && employee.email ? supabase.from("organization_invitations").select("id,email,role,status,expires_at").eq("organization_id", org).in("status", ["pending", "sent"]) : Promise.resolve({ data: [] as Invitation[] }),
    canManageTeam ? supabase.from("hr_employee_documents").select("id,file_name,file_size,created_at").eq("organization_id", org).eq("employee_id", employee.id).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as Doc[] }),
    crmVar ? supabase.from("crm_opportunities").select("id,title,customer_name,stage,created_at").eq("organization_id", org).eq("assigned_employee_id", employee.id).in("stage", AKTIF_ASAMALAR).order("created_at", { ascending: false }).limit(LISTE) : bos,
    crmVar ? supabase.from("crm_opportunities").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("assigned_employee_id", employee.id).in("stage", AKTIF_ASAMALAR) : bos,
    opsVar ? supabase.from("operation_workflows").select("id,title,customer_name,status,due_date").eq("organization_id", org).eq("assigned_employee_id", employee.id).in("status", LISTEDEKI_IS_DURUMLARI).order("due_date", { ascending: true, nullsFirst: false }).limit(LISTE) : bos,
    opsVar ? supabase.from("operation_workflows").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("assigned_employee_id", employee.id).in("status", LISTEDEKI_IS_DURUMLARI) : bos,
  ]);
  const member = memberResult.data as Member | null;
  const pendingInvite = canliDavet((invitationResult.data ?? []) as Invitation[], employee.email);
  const docs = (docResult.data ?? []) as Doc[];
  const talepler = (talepResult.data ?? []) as Talep[];
  const isler = (isResult.data ?? []) as Is[];
  const acikTalep = talepSayisi.count ?? 0;
  const acikIs = isSayisi.count ?? 0;

  /*
    PERFORMANS (2026-10, liste sayfalarındaki istatistik kartıyla aynı
    hesaplar): satışta imzalanan sözleşmeler ve teklif kabul oranı (bu
    personele atanmış taleplerden), operasyonda teslim edilen işler ve
    zamanında teslim oranı. Okunamayan modül (RLS) boş kalır.
  */
  const [sozlesmeSonuc, teklifSonuc, isSonuc] = await Promise.all([
    crmVar ? supabase.from("crm_contracts").select("amount,signed_at,crm_opportunities!inner(assigned_employee_id)").eq("organization_id", org).eq("crm_opportunities.assigned_employee_id", employee.id).in("status", ["signed", "completed"]) : bos,
    crmVar ? supabase.from("crm_proposals").select("status,archive_reason,superseded_by,crm_opportunities!inner(assigned_employee_id)").eq("organization_id", org).eq("crm_opportunities.assigned_employee_id", employee.id) : bos,
    opsVar ? supabase.from("operation_workflows").select("due_date,delivered_at").eq("organization_id", org).eq("assigned_employee_id", employee.id).not("delivered_at", "is", null) : bos,
  ]);
  const an = simdi();
  const imzalananlar = (sozlesmeSonuc.data ?? []) as { amount: number; signed_at: string | null }[];
  const son90Imza = imzalananlar.filter((s) => s.signed_at && gunOnce(s.signed_at, an) < 90);
  const son90Deger = son90Imza.reduce((sum, s) => sum + Number(s.amount), 0);
  const teklifGruplari = ((teklifSonuc.data ?? []) as { status: string; archive_reason: string | null; superseded_by: string | null }[]).map(teklifGrubu);
  const kabul = teklifGruplari.filter((g) => g === "accepted").length;
  const kabulOrani = oran(kabul, teklifGruplari.filter((g) => g === "accepted" || g === "rejected" || g === "expired").length);
  const teslimler = (isSonuc.data ?? []) as { due_date: string | null; delivered_at: string }[];
  const son90Teslim = teslimler.filter((t) => gunOnce(t.delivered_at, an) < 90).length;
  const teslimGunu = (deger: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(Date.parse(deger));
  const terminli = teslimler.filter((t) => t.due_date);
  const zamaninda = oran(terminli.filter((t) => teslimGunu(t.delivered_at) <= t.due_date!).length, terminli.length);
  const primGorebilir = isPlatformOwner || izin("hr.prim.gor");

  const isOwner = membership.role === "owner";
  // Yönetici departmanındaki aktif/izinli çalışanın rolü departmandan gelir
  // (Kurum Sahibi); elle değiştirilemez (ekip listesindeki kuralla aynı).
  const managedByDepartment = MANAGEMENT_EMPLOYMENT_STATUSES.includes(employee.employment_status) && isManagementDepartmentName(departmentName ?? "");
  const organizationName = organization.display_name || organization.name;
  const erisim = member ? (member.is_active ? roleNames[member.role] ?? member.role : "Erişim kapalı") : pendingInvite ? "Davet bekliyor" : "Erişim yok";
  const bugun = todayInIstanbul();

  const editForm = (
    <form className="panel-form hr-form" action={updateEmployee}>
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
    </form>
  );

  return (
    <main className="talep cari personel">
      <header className="talep-bas">
        <div className="talep-bas-metin">
          <small className="panel-kicker">{employee.employee_no ? `PERSONEL · NO ${employee.employee_no}` : "PERSONEL"}</small>
          <h1>{employee.full_name}</h1>
        </div>
        <div className="talep-bas-eylem">
          {canManageTeam ? (
            <PanelDrawer triggerLabel="Düzenle" kicker="PERSONEL" title="Personeli Düzenle" description={employee.full_name}>{editForm}</PanelDrawer>
          ) : null}
          <details className="os-menu talep-menu">
            <summary className="panel-secondary" aria-label="Diğer işlemler">⋯</summary>
            <div className="os-menu-list" role="menu">
              <Link className="os-menu-item" href="/panel/hr">Ekip listesi</Link>
              {primGorebilir ? <Link className="os-menu-item" href={`/panel/hr/prim-hesabi?personel=${employee.id}`}>Prim hesabı</Link> : null}
              <Link className="os-menu-item" href="/panel/hr/activity">Personel hareketleri</Link>
            </div>
          </details>
        </div>
      </header>

      {/* ÖZET ŞERİDİ: diğer detaylardaki aşama çizgisinin yerinde. */}
      <section className="kayit-serit" aria-label="Personel özeti">
        <dl>
          <div><dt>Durum</dt><dd><span className="status-pill" data-tone={statusTones[employee.employment_status] ?? "neutral"}>{statusNames[employee.employment_status] ?? employee.employment_status}</span></dd></div>
          <div><dt>Çalışma tipi</dt><dd>{typeNames[employee.employment_type] ?? "—"}</dd></div>
          <div><dt>Kıdem</dt><dd>{employee.start_date ? kidem(employee.start_date, bugun) : "—"}</dd></div>
          {crmVar ? <div><dt>Açık talep</dt><dd>{acikTalep}</dd></div> : null}
          {opsVar ? <div><dt>Üstündeki iş</dt><dd>{acikIs}</dd></div> : null}
          {canManageTeam ? <div><dt>Panel erişimi</dt><dd>{erisim}</dd></div> : null}
        </dl>
      </section>

      <div className={canManageTeam ? "talep-izgara" : "talep-izgara personel-iki"}>
        <section className="panel-card talep-musteri" aria-label="Personel">
          <div className="talep-musteri-kimlik">
            <span className="talep-avatar" aria-hidden="true">{initials(employee.full_name)}</span>
            <div>
              <h2>{employee.full_name}</h2>
              <small>{employee.job_title || "Pozisyon belirtilmedi"}{departmentName ? ` · ${departmentName}` : ""}</small>
            </div>
          </div>
          {employee.phone || employee.email ? (
            <div className="talep-iletisim">
              {employee.phone ? <a className="panel-secondary" href={`tel:${employee.phone.replace(/\s+/g, "")}`}>Ara</a> : null}
              {employee.email ? <a className="panel-secondary" href={`mailto:${employee.email}`}>E-posta</a> : null}
            </div>
          ) : null}
          <dl className="talep-liste">
            <div><dt>Telefon</dt><dd>{formatPhone(employee.phone) || <em>Yok</em>}</dd></div>
            <div><dt>E-posta</dt><dd>{employee.email || <em>Yok</em>}</dd></div>
            <div><dt>Departman</dt><dd>{departmentName || <em>Yok</em>}</dd></div>
            <div><dt>Personel no</dt><dd>{employee.employee_no || <em>Yok</em>}</dd></div>
            <div><dt>İşe giriş</dt><dd>{employee.start_date ? shortDate(employee.start_date) : <em>Belirtilmedi</em>}</dd></div>
          </dl>
          <div className="talep-gecmis">
            <h3>Prim ve satış</h3>
            <dl className="talep-liste">
              <div><dt>Satış talepleri</dt><dd>{employee.can_receive_sales_requests ? "Atanabilir" : <em>Atanmaz</em>}</dd></div>
              <div><dt>Satış primi</dt><dd>%{percent(employee.commission_rate)}</dd></div>
              <div><dt>Operasyon primi</dt><dd>%{percent(employee.operation_commission_rate)}</dd></div>
            </dl>
          </div>
        </section>

        <section className="panel-card talep-bilgi" aria-label="Üstündeki işler">
          {crmVar || opsVar ? (
            <>
              <div className="cari-baslik"><h2>Performans</h2><small>son 90 gün</small></div>
              <dl className="istat-kutular personel-performans">
                {crmVar ? (
                  <div><dt>İmzalanan sözleşme</dt><dd>{son90Imza.length}</dd><small>{son90Deger ? tamPara(son90Deger) : "—"} · toplam {imzalananlar.length}</small></div>
                ) : null}
                {crmVar ? (
                  <div><dt>Teklif kabul oranı</dt><dd>{kabulOrani === null ? "—" : `%${kabulOrani}`}</dd><small>{kabul} kabul · tüm zamanlar</small></div>
                ) : null}
                {opsVar ? (
                  <div><dt>Teslim edilen iş</dt><dd>{son90Teslim}</dd><small>toplam {teslimler.length}</small></div>
                ) : null}
                {opsVar ? (
                  <div><dt>Zamanında teslim</dt><dd>{zamaninda === null ? "—" : `%${zamaninda}`}</dd><small>{terminli.length} terminli iş</small></div>
                ) : null}
              </dl>
            </>
          ) : null}
          {crmVar ? (
            <div className="talep-not">
              <div className="cari-baslik">
                <h2>Açık talepler</h2>
                {/* Talepler listesinin temsilci süzgeci: hepsini aynı süzgeçle açar. */}
                <Link className="personel-tumu" href={`/panel/crm?temsilci=${employee.id}`}>{acikTalep > talepler.length ? `${talepler.length} / ${acikTalep} · tümünü gör` : `${acikTalep} · listede aç`}</Link>
              </div>
              {talepler.length ? (
                <ul className="cari-hareketler">
                  {talepler.map((talep) => (
                    <li key={talep.id}>
                      <Link href={`/panel/crm/requests/${talep.id}`}>
                        <span className="cari-hareket-metin">
                          <b>{talep.customer_name || talep.title || "Talep"}</b>
                          <small>{[talep.title, shortDate(talep.created_at)].filter(Boolean).join(" · ")}</small>
                        </span>
                        <span className="status-pill" data-tone={statusTone(talep.stage ?? "")}>{requestStageNames[talep.stage ?? ""] ?? talep.stage}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="talep-bos cari-not">Üstünde açık talep yok.</p>}
            </div>
          ) : null}
          {opsVar ? (
            <div className="talep-not">
              <div className="cari-baslik">
                <h2>Yürüttüğü işler</h2>
                {/* İşler listesinin sorumlu süzgeci. */}
                <Link className="personel-tumu" href={`/panel/operations/isler?sorumlu=${employee.id}`}>{acikIs > isler.length ? `${isler.length} / ${acikIs} · tümünü gör` : `${acikIs} · listede aç`}</Link>
              </div>
              {isler.length ? (
                <ul className="cari-hareketler">
                  {isler.map((is) => (
                    <li key={is.id}>
                      <Link href={`/panel/operations/${is.id}`}>
                        <span className="cari-hareket-metin">
                          <b>{is.title}</b>
                          <small>{[is.customer_name, is.due_date ? `Termin ${shortDate(is.due_date)}` : "Termin yok"].filter(Boolean).join(" · ")}</small>
                        </span>
                        <span className="status-pill" data-tone={statusTone(is.status)}>{workflowStatusNames[is.status] ?? is.status}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="talep-bos cari-not">Üstünde iş yok.</p>}
            </div>
          ) : null}
          {!crmVar && !opsVar ? <p className="ic-akis-bos">Talep ve iş modülleri açık değil.</p> : null}
        </section>

        {canManageTeam ? (
          <section className="panel-card talep-bilgi cari-sag" aria-label="Erişim ve özlük dosyaları">
            <div className="cari-baslik"><h2>Panel erişimi</h2></div>
            <div className="personel-erisim">
              {member ? (
                employee.user_id === userId ? (
                  <span className="status-pill" data-tone="gold">{roleNames[member.role] ?? member.role} · Siz</span>
                ) : managedByDepartment ? (
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
                  <div className="talep-iletisim">
                    <PanelDrawer triggerLabel="Giriş bağlantısı" triggerClassName="panel-secondary" kicker="PANEL ERİŞİMİ" title={`${employee.full_name} için giriş bağlantısı`} description="Davet e-postası ulaşmadıysa bağlantıyı WhatsApp veya e-postayla kendiniz gönderin.">
                      <TeamInviteLink invitationId={pendingInvite.id} organizationName={organizationName} personName={employee.full_name} email={pendingInvite.email} />
                    </PanelDrawer>
                    <form action={cancelInvitation}><input type="hidden" name="invitation_id" value={pendingInvite.id} /><button className="panel-secondary" type="submit">Daveti iptal et</button></form>
                  </div>
                </>
              ) : (
                <>
                  <p className="talep-bos cari-not">Bu personel panele giriş yapamıyor.</p>
                  <div className="talep-iletisim">
                    <PanelDrawer triggerLabel="Panele davet et" triggerClassName="panel-secondary" kicker="PANEL ERİŞİMİ" title={`${employee.full_name} için panel erişimi`} description="Bu personele gerçek bir davet e-postası gönderilir.">
                      <InviteTeamForm employeeId={employee.id} fullName={employee.full_name} defaultEmail={employee.email ?? ""} />
                    </PanelDrawer>
                  </div>
                </>
              )}
            </div>

            {/* Özlük dosyaları gizli: yalnızca ekip yönetme yetkisi olana. */}
            <div className="talep-not">
              <div className="cari-baslik"><h3>Özlük dosyaları</h3><small>{docs.length}</small></div>
              {docs.length ? (
                <ul className="cari-hareketler">
                  {docs.map((doc) => (
                    <li key={doc.id}>
                      <Link href={`/panel/hr/documents/${doc.id}`} target="_blank">
                        <span className="hr-doc-icon"><HrIcon name="doc" size={17} /></span>
                        <span className="cari-hareket-metin"><b>{doc.file_name}</b><small>{[fileSize(doc.file_size), shortDate(doc.created_at)].filter(Boolean).join(" · ")}</small></span>
                      </Link>
                      <form action={deleteEmployeeDocument}><input type="hidden" name="document_id" value={doc.id} /><button className="panel-danger personel-sil" type="submit">Sil</button></form>
                    </li>
                  ))}
                </ul>
              ) : <p className="talep-bos cari-not">Henüz dosya yüklenmedi.</p>}
              <form className="personel-yukle" action={uploadEmployeeDocument}>
                <input type="hidden" name="employee_id" value={employee.id} />
                <input type="file" name="file" required aria-label="Özlük dosyası" />
                <button className="panel-primary" type="submit">Yükle</button>
              </form>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
