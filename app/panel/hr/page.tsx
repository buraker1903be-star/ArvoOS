import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { statusTone } from "@/lib/status-tone";
import { PanelDrawer } from "../components/panel-drawer";
import { createDepartment, createEmployee } from "./actions";
import { TeamInviteLink } from "./invite-link";
import { roleNames } from "./role-names";
import { formatPhone } from "@/lib/format-phone";
import { OtomatikSecim } from "../crm/otomatik-secim";
import { IstatistikKarti } from "../crm/istatistik-karti";
import { enCok, gunOnce, oran } from "@/lib/liste-istatistik";
import { simdi } from "../os/genel-bakis";
import "./hr.css";
import "../crm/crm.css";
import "../crm/kayit-detay/kayit-detay.css";
import { SatirTiklama } from "@/app/panel/crm/satir-tiklama";

/*
  EKİP LİSTESİ (2026-10): talepler, teklifler, sözleşmeler, işler ve
  cari listesiyle aynı düzen. Üstte başlık, "Yeni personel" ve "⋯";
  altında özet şeridi (durum sayıları süzer); solda sütunlu tablo
  (satırın tamamı personel detayına gider), sağda istatistikler ve varsa
  bekleyen davetler. Departman süzgeci tablonun üstünde.

  Eskiden her personel kartı kendi düzenleme ve özlük çekmecesini, rol
  formunu ve davet düğmelerini taşıyordu; liste bir yönetim ekranına
  dönmüştü ve on kişide sayfa ekranın üç katı uzuyordu. Bunların hepsi
  artık personel detayında (/panel/hr/[id]); liste yalnızca kim kim,
  hangi durumda ve panele girebiliyor mu sorularını yanıtlıyor.

  Süzme adresle (?durum=, ?departman=, ?arama=): sunucuda yapılıyor, bağlantı
  paylaşılabiliyor ve sayfa yenilenince kaybolmuyor.
*/

type Department = { id: string; name: string; code: string | null; is_active: boolean };
type Employee = { id: string; user_id: string | null; department_id: string | null; employee_no: string | null; full_name: string; job_title: string | null; email: string | null; phone: string | null; employment_type: string; employment_status: string; start_date: string | null; can_receive_sales_requests: boolean };
type Member = { user_id: string; role: string; is_active: boolean };
type Invitation = { id: string; email: string; role: string; status: string; created_at: string; expires_at: string };

const TZ = "Europe/Istanbul";
const statusNames: Record<string, string> = { active: "Aktif", on_leave: "İzinli", inactive: "Pasif", terminated: "İşten ayrıldı" };
const statusTones: Record<string, string> = { active: "success", on_leave: "warning", inactive: "neutral", terminated: "danger" };
const typeNames: Record<string, string> = { full_time: "Tam zamanlı", part_time: "Yarı zamanlı", contractor: "Sözleşmeli", intern: "Stajyer" };
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

export default async function HrPage({ searchParams }: { searchParams: Promise<{ durum?: string; departman?: string; arama?: string }> }) {
  const { durum = "", departman = "", arama = "" } = await searchParams;
  const aranan = arama.trim().toLocaleLowerCase("tr-TR");
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
    (!departman || item.department_id === departman) &&
    (!aranan || [item.full_name, item.job_title, item.email, item.phone, item.employee_no].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR").includes(aranan)),
  );
  const adres = (ek: { durum?: string; departman?: string }) => {
    const q = new URLSearchParams();
    const d = ek.durum ?? durum;
    const dep = ek.departman ?? departman;
    if (d) q.set("durum", d);
    if (dep) q.set("departman", dep);
    if (arama) q.set("arama", arama);
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

  /*
    İSTATİSTİKLER (sağ kart): tüm personelden, süzgeçten bağımsız.
    Kıdem işe giriş tarihinden; tarihi girilmemiş personel ortalamaya
    girmez.
  */
  const an = simdi();
  const calisanlar = employees.filter((item) => !pasifMi(item));
  const kidemler = calisanlar.filter((item) => item.start_date).map((item) => gunOnce(`${item.start_date}T12:00:00Z`, an) / 30.44);
  const ortalamaKidem = kidemler.length ? kidemler.reduce((a, b) => a + b, 0) / kidemler.length : null;
  const kidemYazisi = ortalamaKidem === null ? "—" : ortalamaKidem >= 12 ? `${(ortalamaKidem / 12).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} yıl` : `${Math.round(ortalamaKidem)} ay`;
  const son90Giren = employees.filter((item) => item.start_date && gunOnce(`${item.start_date}T12:00:00Z`, an) < 90).length;
  const erisimOrani = oran(accessCount, calisanlar.length);
  const departmanDagilimi = enCok(calisanlar.map((item) => (item.department_id && departmentMap.get(item.department_id)) || "Departmansız"), 6);
  const tipDagilimi = enCok(calisanlar.map((item) => typeNames[item.employment_type] ?? "Belirtilmedi"), 4);

  return <main className="talep cari ekip talepler teklifler liste-sayfa">
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

    {/* ÖZET ŞERİDİ: diğer listelerdeki gibi; durum sayıları süzer. */}
    <nav className="kayit-serit talep-serit" aria-label="Ekip özeti">
      <dl>
        <div className={durum === "" ? "is-active" : undefined}><dt>Toplam personel</dt><dd><Link href={adres({ durum: "" })}>{durumSayisi("")}</Link></dd></div>
        <div className={durum === "active" ? "is-active" : undefined}><dt>Aktif</dt><dd className="cari-arti"><Link href={adres({ durum: "active" })}>{durumSayisi("active")}</Link></dd></div>
        <div className={durum === "on_leave" ? "is-active" : undefined}><dt>İzinli</dt><dd><Link href={adres({ durum: "on_leave" })}>{durumSayisi("on_leave")}</Link></dd></div>
        <div className={durum === "pasif" ? "is-active" : undefined}><dt>Ayrılan / pasif</dt><dd><Link href={adres({ durum: "pasif" })}>{durumSayisi("pasif")}</Link></dd></div>
        <div><dt>Satış temsilcisi</dt><dd>{salesCount}</dd></div>
        {canManageTeam ? <div><dt>Panel erişimi</dt><dd>{accessCount}</dd></div> : null}
        {canManageTeam ? <div><dt>Bekleyen davet</dt><dd className={invitations.length ? "talep-uyari" : undefined}>{invitations.length}</dd></div> : null}
      </dl>
    </nav>

    <div className="talep-izgara personel-iki ekip-izgara">
      <section className="panel-card talep-bilgi" aria-label="Ekip listesi">
        <div className="ekip-suzgec talep-suzgec">
          {DURUM_SUZGECLERI.map(([kod, ad]) => (
            <Link key={kod || "tumu"} href={adres({ durum: kod })} className={durum === kod ? "is-active" : undefined} aria-current={durum === kod ? "page" : undefined}>
              {ad} <small>{durumSayisi(kod)}</small>
            </Link>
          ))}
          {/* Departman süzgeci eskiden sağdaki departman kartındaydı; o kartın
              yerini istatistikler aldı, süzgeç buraya geldi. */}
          <form action="/panel/hr" className="talep-ara talep-ara--secimli" role="search">
            {durum ? <input type="hidden" name="durum" value={durum} /> : null}
            <OtomatikSecim name="departman" defaultValue={departman} className="talep-temsilci-sec" label="Departman">
              <option value="">Tüm departmanlar</option>
              {departments.map((item) => <option key={item.id} value={item.id}>{item.name}{item.is_active ? "" : " (pasif)"}</option>)}
            </OtomatikSecim>
            <input name="arama" defaultValue={arama} placeholder="Ad, pozisyon, telefon ara" aria-label="Personel ara" />
          </form>
        </div>

        {gorunen.length ? (
          <div className="talep-tablo">
            <table className="crm-data-table" data-cols="team">
              <thead>
                <tr>
                  <th>Personel</th>
                  <th>Departman</th>
                  <th>İletişim</th>
                  <th className="crm-col-date">İşe giriş</th>
                  {canManageTeam ? <th>Panel erişimi</th> : null}
                  <th>Durum</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {gorunen.map((employee) => {
                  const member = employee.user_id ? memberMap.get(employee.user_id) : undefined;
                  const pendingInvite = !employee.user_id && employee.email ? invitationByEmail.get(employee.email.toLowerCase()) : undefined;
                  const departmentName = employee.department_id ? departmentMap.get(employee.department_id) ?? null : null;
                  const erisim = member
                    ? member.is_active ? { ad: roleNames[member.role] ?? member.role, ton: "info" } : { ad: "Erişim kapalı", ton: "neutral" }
                    : pendingInvite ? { ad: "Davet bekliyor", ton: "warning" } : { ad: "Erişim yok", ton: "neutral" };
                  return (
                    <tr key={employee.id} className={pasifMi(employee) ? "is-pasif" : undefined}>
                      <td data-label="Personel">
                        <Link className="crm-row-link" href={`/panel/hr/${employee.id}`} aria-label={`${employee.full_name} detayını aç`}>
                          <span className="crm-table-title" title={employee.full_name}>{employee.full_name}</span>
                          <span className="crm-table-sub">{employee.job_title || "Pozisyon belirtilmedi"}{employee.employee_no ? ` · ${employee.employee_no}` : ""}</span>
                        </Link>
                      </td>
                      <td data-label="Departman">{departmentName ? <span className="crm-table-title">{departmentName}</span> : <span className="crm-table-sub">Departmansız</span>}</td>
                      <td data-label="İletişim">
                        <span className="crm-table-title">{formatPhone(employee.phone) || "—"}</span>
                        {employee.email ? <span className="crm-table-sub" title={employee.email}>{employee.email}</span> : null}
                      </td>
                      <td className="crm-col-date" data-label="İşe giriş">
                        {employee.start_date ? shortDate(`${employee.start_date}T12:00:00Z`) : "—"}
                        {employee.start_date ? <small>{typeNames[employee.employment_type] ?? ""}</small> : null}
                      </td>
                      {canManageTeam ? <td data-label="Panel erişimi"><span className="status-pill" data-tone={erisim.ton}>{erisim.ad}</span></td> : null}
                      <td data-label="Durum"><span className="status-pill" data-tone={statusTones[employee.employment_status] ?? "neutral"}>{statusNames[employee.employment_status] ?? employee.employment_status}</span></td>
                      <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <SatirTiklama />
          </div>
        ) : (
          <div className="crm-empty-state talep-bos-kutu">
            <h2>{employees.length ? "Eşleşen personel yok" : "Henüz personel kaydı yok"}</h2>
            <p>{employees.length ? "Aramayı veya süzgeci değiştirip yeniden deneyin." : canManageTeam ? "“Yeni personel” ile ilk kaydı ekleyin; ardından panele davet edebilirsiniz." : "Yöneticiniz personel ekledikçe burada görünecek."}</p>
            {employees.length ? <div className="crm-empty-actions"><Link className="panel-secondary" href="/panel/hr">Süzgeci temizle</Link></div> : null}
          </div>
        )}
      </section>

      {/* Sağ sütun: istatistikler; varsa altında bekleyen davetler (giriş
          bağlantısını yeniden göndermek için). */}
      <div className="liste-sag">
        <IstatistikKarti
          kapsam="çalışan personel"
          kutular={[
            { ad: "Aktif personel", deger: String(activeCount), alt: `${employees.length} kayıt` },
            { ad: "Ortalama kıdem", deger: kidemYazisi, alt: `${kidemler.length} kişinin işe giriş tarihi var` },
            { ad: "Son 90 günde katılan", deger: String(son90Giren), alt: "işe giriş tarihine göre" },
            { ad: "Panel erişimi", deger: canManageTeam ? (erisimOrani === null ? "—" : `%${erisimOrani}`) : "—", alt: canManageTeam ? `${accessCount}/${calisanlar.length} personel` : "yetkiniz yok" },
          ]}
          gruplar={[
            { baslik: "Departmana göre", satirlar: departmanDagilimi.map(([ad, adet]) => ({ ad, adet })) },
            { baslik: "Çalışma tipine göre", satirlar: tipDagilimi.map(([ad, adet]) => ({ ad, adet })) },
          ]}
        />
        {canManageTeam && invitations.length ? (
          <section className="panel-card talep-musteri" aria-label="Bekleyen davetler">
            <div className="cari-baslik"><h2>Bekleyen davetler</h2><small>{invitations.length}</small></div>
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
          </section>
        ) : null}
      </div>
    </div>
  </main>;
}
