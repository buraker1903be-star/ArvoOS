import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { formatPersonName } from "@/lib/format-name";
import { HrIcon, initials } from "../hr-icons";
import { HrTabs, canSeeHrRecords } from "../hr-tabs";
import { relativeTime } from "../../crm/last-contact";
import "../../crm/crm.css";
import "../../operations/overview.css";

// İK genel bakış: ekip durumunun özeti. Her kart, ayrıntısını gösteren
// sayfanın yetki kuralıyla görünür: panel erişimi ve davetler Kurum Sahibi
// ve Yönetici'ye (Personel sayfasıyla aynı), çevrimiçi durum ve gizlilik
// sözleşmeleri sahip/yönetici/sınırlı yöneticiye (Hareketler ve Gizlilik
// sayfalarıyla aynı). Departman dağılımı herkese açık.

type Employee = { id: string; user_id: string | null; department_id: string | null; full_name: string; job_title: string | null; email: string | null; employment_status: string; can_receive_sales_requests: boolean };
type Department = { id: string; name: string; is_active: boolean };
type Member = { user_id: string; is_active: boolean };
type Invitation = { id: string; email: string; status: string; expires_at: string };
type Presence = { user_id: string; last_seen_at: string };
type Agreement = { employee_id: string; status: string };
type Tone = "info" | "gold" | "success" | "danger" | "warning" | "brand" | "neutral";

const LIST_LIMIT = 5;
const ONLINE_MS = 2 * 60 * 1000; // Personel Hareketleri ile aynı: son 2 dakikada aktif

// HrIcon'da ok simgesi yok; satır ve "Tümünü gör" okları (diğer genel bakışlarla aynı)
const Chevron = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
);

// Zamana bağlı değerler (saat bileşen gövdesinde okunmaz)
function clock() {
  const now = Date.now();
  return { now, onlineCutoff: now - ONLINE_MS };
}

export default async function HrOverviewPage() {
  const { supabase, membership, modules, isPlatformOwner } = await getPanelContext();
  if (!modules.some((module) => module.code === "hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  const organizationId = membership.organization_id;
  const access = { membership, isPlatformOwner };
  const canManageTeam = ["owner", "admin"].includes(membership.role);
  const canSeeRecords = canSeeHrRecords(access);
  const time = clock();
  const none = Promise.resolve({ data: [] as never[], error: null });

  const [
    { data: employeeData, error: employeeError },
    { data: departmentData, error: departmentError },
    { data: memberData },
    { data: invitationData },
    { data: presenceData },
    { data: agreementData },
  ] = await Promise.all([
    supabase.from("hr_employees").select("id,user_id,department_id,full_name,job_title,email,employment_status,can_receive_sales_requests").eq("organization_id", organizationId).order("full_name"),
    supabase.from("hr_departments").select("id,name,is_active").eq("organization_id", organizationId).order("name"),
    canManageTeam ? supabase.from("organization_memberships").select("user_id,is_active").eq("organization_id", organizationId) : none,
    canManageTeam ? supabase.from("organization_invitations").select("id,email,status,expires_at").eq("organization_id", organizationId).in("status", ["pending", "sent"]) : none,
    canSeeRecords ? supabase.from("user_presence").select("user_id,last_seen_at").eq("organization_id", organizationId) : none,
    canSeeRecords ? supabase.from("hr_confidentiality_agreements").select("employee_id,status").eq("organization_id", organizationId) : none,
  ]);
  if (employeeError) throw new Error("Personeller okunamadı: " + employeeError.message);
  if (departmentError) throw new Error("Departmanlar okunamadı: " + departmentError.message);

  const employees = (employeeData ?? []) as Employee[];
  const departments = (departmentData ?? []) as Department[];
  const departmentName = new Map(departments.map((row) => [row.id, row.name]));
  const active = employees.filter((row) => row.employment_status === "active");
  const onLeave = employees.filter((row) => row.employment_status === "on_leave");
  // Çalışmaya devam edenler (aktif + izinli): erişim ve sözleşme bunlar için anlamlı
  const working = employees.filter((row) => row.employment_status === "active" || row.employment_status === "on_leave");
  const roleOf = (row: Employee) => row.job_title || (row.department_id ? departmentName.get(row.department_id) : null) || "Personel";

  // ---- Panel erişimi (sahip/yönetici)
  const memberActive = new Map(((memberData ?? []) as Member[]).map((row) => [row.user_id, row.is_active]));
  const invitations = ((invitationData ?? []) as Invitation[]).filter((row) => Date.parse(row.expires_at) > time.now);
  const invitedEmails = new Set(invitations.map((row) => row.email.toLowerCase()));
  const withAccess = working.filter((row) => row.user_id && memberActive.get(row.user_id));
  const withoutAccess = working
    .filter((row) => !row.user_id)
    .map((row) => ({ ...row, state: !row.email ? "no-email" : invitedEmails.has(row.email.toLowerCase()) ? "invited" : "not-invited" }))
    // Davet edilmemişler üstte: yapılacak iş onlarda
    .sort((a, b) => (a.state === "not-invited" ? 0 : a.state === "no-email" ? 1 : 2) - (b.state === "not-invited" ? 0 : b.state === "no-email" ? 1 : 2) || a.full_name.localeCompare(b.full_name, "tr"));

  // ---- Çevrimiçi (sahip/yönetici/sınırlı yönetici)
  const lastSeen = new Map(((presenceData ?? []) as Presence[]).map((row) => [row.user_id, row.last_seen_at]));
  const connected = working.filter((row) => row.user_id && lastSeen.has(row.user_id));
  const online = connected.filter((row) => Date.parse(lastSeen.get(row.user_id!)!) >= time.onlineCutoff);
  const recent = [...connected].sort((a, b) => lastSeen.get(b.user_id!)!.localeCompare(lastSeen.get(a.user_id!)!));

  // ---- Gizlilik sözleşmeleri
  const agreements = (agreementData ?? []) as Agreement[];
  const signedIds = new Set(agreements.filter((row) => row.status === "signed").map((row) => row.employee_id));
  const pendingIds = new Set(agreements.filter((row) => row.status !== "signed" && row.status !== "revoked").map((row) => row.employee_id));
  const unsigned = working.filter((row) => !signedIds.has(row.id)).sort((a, b) => Number(pendingIds.has(b.id)) - Number(pendingIds.has(a.id)) || a.full_name.localeCompare(b.full_name, "tr"));

  // ---- Departman dağılımı (herkes)
  const departmentCounts = departments
    .filter((row) => row.is_active)
    .map((row) => ({ id: row.id, name: row.name, count: working.filter((employee) => employee.department_id === row.id).length }))
    .concat([{ id: "none", name: "Departmansız", count: working.filter((employee) => !employee.department_id || !departmentName.has(employee.department_id)).length }])
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

  const widgets: { label: string; value: string | number; note: string; href: string; icon: string; tone: Tone }[] = [
    { label: "Aktif personel", value: active.length, note: onLeave.length ? `${onLeave.length} kişi izinli` : "İzinli personel yok", href: "/panel/hr", icon: "users", tone: "brand" },
    { label: "Satış temsilcisi", value: active.filter((row) => row.can_receive_sales_requests).length, note: "Talep atanabilen personel", href: "/panel/hr", icon: "spark", tone: "gold" },
  ];
  if (canManageTeam) {
    widgets.push(
      { label: "Panel erişimi", value: withAccess.length, note: withoutAccess.length ? `${withoutAccess.length} personelin erişimi yok` : "Herkes giriş yapabiliyor", href: "/panel/hr", icon: "key", tone: withoutAccess.length ? "warning" : "success" },
      { label: "Bekleyen davet", value: invitations.length, note: invitations.length ? "Henüz kabul edilmedi" : "Bekleyen davet yok", href: "/panel/hr", icon: "send", tone: "info" },
    );
  }
  if (canSeeRecords) {
    widgets.push(
      { label: "Şu an çevrimiçi", value: online.length, note: connected.length ? `${connected.length} bağlı personelden` : "Henüz giriş kaydı yok", href: "/panel/hr/activity", icon: "signal", tone: "success" },
      { label: "Gizlilik sözleşmesi", value: `${working.length - unsigned.length}/${working.length}`, note: unsigned.length ? `${unsigned.length} personelin imzalı sözleşmesi yok` : "Tüm personel imzaladı", href: "/panel/hr/confidentiality", icon: "shield", tone: unsigned.length ? "warning" : "success" },
    );
  }
  // 5'ten fazlaysa en az bilgi vereni çıkar (yönetici görünümü 6 widget olurdu)
  if (widgets.length > 5) widgets.splice(1, 1);

  const parts = [
    canManageTeam && withoutAccess.filter((row) => row.state === "not-invited").length ? `${withoutAccess.filter((row) => row.state === "not-invited").length} personel panele davet edilmedi` : null,
    canManageTeam && invitations.length ? `${invitations.length} davet bekliyor` : null,
    canSeeRecords && unsigned.length ? `${unsigned.length} gizlilik sözleşmesi eksik` : null,
    canSeeRecords && online.length ? `${online.length} kişi çevrimiçi` : null,
  ].filter(Boolean);
  const summary = parts.length ? `Şu an ${parts.join(", ")}.` : `${working.length} kişilik ekip; bekleyen bir İK işi yok.`;

  const stateLabel: Record<string, { tone: Tone; label: string }> = {
    "not-invited": { tone: "warning", label: "Davet edilmedi" },
    "no-email": { tone: "neutral", label: "E-posta yok" },
    invited: { tone: "info", label: "Davet gönderildi" },
  };

  return (
    <div className="crm-page-stack">
      <div className="panel-pagehead">
        <div><small className="panel-kicker">İNSAN KAYNAKLARI / GENEL BAKIŞ</small><h1>Genel bakış</h1><p>{summary}</p></div>
        <div className="panel-page-actions"><Link className="panel-primary" href="/panel/hr">Personel listesi</Link></div>
      </div>
      <HrTabs active="genel-bakis" access={access} />
      <div className="module-tab-panel opsov crmov">
        <section className="opsov-widgets" aria-label="Özet">
          {widgets.map((widget) => (
            <Link className="opsov-widget" data-tone={widget.tone} href={widget.href} key={widget.label}>
              <span className="opsov-widget-icon"><HrIcon name={widget.icon} /></span>
              <small>{widget.label}</small>
              <strong>{widget.value}</strong>
              <span className="opsov-widget-note">{widget.note}</span>
            </Link>
          ))}
        </section>

        <section className="opsov-grid">
          {canManageTeam ? (
            <article className="opsov-card" data-tone={withoutAccess.length ? "warning" : "success"}>
              <header className="opsov-card-head">
                <span className="opsov-card-icon"><HrIcon name="key" /></span>
                <div><h2>Panel erişimi olmayanlar</h2><p>{withoutAccess.length ? "Davet edilmemiş personel üstte" : "Tüm personel panele giriş yapabiliyor"}</p></div>
                <b className="opsov-count">{withoutAccess.length}</b>
              </header>
              {withoutAccess.length ? (
                <ul className="opsov-list">
                  {withoutAccess.slice(0, LIST_LIMIT).map((row) => (
                    <li key={row.id} className={row.state === "not-invited" ? "is-flagged" : undefined} data-flag="gold">
                      <Link className="opsov-row" href="/panel/hr">
                        <span className="opsov-row-main"><b>{formatPersonName(row.full_name)}</b><small>{roleOf(row)}{row.email ? ` · ${row.email}` : ""}</small></span>
                        <span className="opsov-row-side"><span className="status-pill" data-tone={stateLabel[row.state].tone}>{stateLabel[row.state].label}</span></span>
                        <Chevron />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="opsov-empty"><HrIcon name="check" size={20} />Tüm personel panele giriş yapabiliyor.</p>}
              <Link className="opsov-more" href="/panel/hr">Personele git<Chevron /></Link>
            </article>
          ) : null}

          {canSeeRecords ? (
            <article className="opsov-card" data-tone="success">
              <header className="opsov-card-head">
                <span className="opsov-card-icon"><HrIcon name="signal" /></span>
                <div><h2>Son görülenler</h2><p>{online.length ? `${online.length} kişi şu an çevrimiçi` : "Şu an çevrimiçi kimse yok"}</p></div>
                <b className="opsov-count">{online.length}</b>
              </header>
              {recent.length ? (
                <ul className="opsov-list">
                  {recent.slice(0, LIST_LIMIT).map((row) => {
                    const seen = lastSeen.get(row.user_id!)!;
                    const isOnline = Date.parse(seen) >= time.onlineCutoff;
                    return (
                      <li key={row.id}>
                        <Link className="opsov-row" href="/panel/hr/activity">
                          <span className="opsov-person" aria-hidden="true"><i>{initials(formatPersonName(row.full_name))}</i></span>
                          <span className="opsov-row-main"><b>{formatPersonName(row.full_name)}</b><small>{roleOf(row)}</small></span>
                          <span className="opsov-row-side"><span className="status-pill" data-tone={isOnline ? "success" : "neutral"}>{isOnline ? "Çevrimiçi" : relativeTime(seen)}</span></span>
                          <Chevron />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="opsov-empty"><HrIcon name="clock" size={20} />Henüz panele giriş yapan personel yok.</p>}
              <Link className="opsov-more" href="/panel/hr/activity">Personel hareketleri<Chevron /></Link>
            </article>
          ) : null}

          {canSeeRecords ? (
            <article className="opsov-card" data-tone={unsigned.length ? "warning" : "success"}>
              <header className="opsov-card-head">
                <span className="opsov-card-icon"><HrIcon name="shield" /></span>
                <div><h2>Gizlilik sözleşmesi eksik</h2><p>{unsigned.length ? "İmza bekleyenler üstte" : "Tüm personel imzaladı"}</p></div>
                <b className="opsov-count">{unsigned.length}</b>
              </header>
              {unsigned.length ? (
                <ul className="opsov-list">
                  {unsigned.slice(0, LIST_LIMIT).map((row) => (
                    <li key={row.id} className={pendingIds.has(row.id) ? undefined : "is-flagged"} data-flag="warning">
                      <Link className="opsov-row" href="/panel/hr/confidentiality">
                        <span className="opsov-row-main"><b>{formatPersonName(row.full_name)}</b><small>{roleOf(row)}</small></span>
                        <span className="opsov-row-side"><span className="status-pill" data-tone={pendingIds.has(row.id) ? "info" : "warning"}>{pendingIds.has(row.id) ? "İmza bekliyor" : "Sözleşme yok"}</span></span>
                        <Chevron />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="opsov-empty"><HrIcon name="check" size={20} />Tüm personelin gizlilik sözleşmesi imzalı.</p>}
              <Link className="opsov-more" href="/panel/hr/confidentiality">Gizlilik sözleşmeleri<Chevron /></Link>
            </article>
          ) : null}

          <article className="opsov-card" data-tone="brand">
            <header className="opsov-card-head">
              <span className="opsov-card-icon"><HrIcon name="building" /></span>
              <div><h2>Departmanlar</h2><p>Çalışan ve izinli personel dağılımı</p></div>
              <b className="opsov-count">{departmentCounts.filter((row) => row.id !== "none").length}</b>
            </header>
            {departmentCounts.length ? (
              <ul className="opsov-list">
                {departmentCounts.map((row) => (
                  <li key={row.id}>
                    <Link className="opsov-row" href="/panel/hr">
                      <span className="opsov-row-main"><b>{row.name}</b><small>{row.count} personel</small></span>
                      <span className="opsov-row-side"><span className="opsov-bar" aria-hidden="true"><i style={{ "--p": `${Math.round((row.count / Math.max(1, working.length)) * 100)}%` } as React.CSSProperties} /></span></span>
                      <Chevron />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="opsov-empty"><HrIcon name="building" size={20} />Henüz personel kaydı yok. Personel sekmesinden “+ Yeni Personel” ile ekleyin.</p>}
            <Link className="opsov-more" href="/panel/hr">Personele git<Chevron /></Link>
          </article>
        </section>
      </div>
    </div>
  );
}
