import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { istanbulMidnight, todayInIstanbul } from "@/lib/istanbul-date";
import { ActivityAutoRefresh } from "./activity-auto-refresh";
import { HrIcon, initials } from "../hr-icons";
import "../hr.css";
import "./activity.css";

type Presence = { user_id: string; last_seen_at: string };
type Employee = { id: string; user_id: string | null; full_name: string; job_title: string | null };
type Session = { id: string; user_id: string; employee_id: string | null; login_at: string; last_seen_at: string; logout_at: string | null; logout_reason: string | null; ip_address: string | null; current_path: string | null };
type Tone = "info" | "gold" | "success" | "warning" | "brand" | "neutral";

const TZ = "Europe/Istanbul";
const DAY = 24 * 60 * 60 * 1000;
const dateTime = (value: string | null) => value ? new Date(value).toLocaleString("tr-TR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }) : "—";
const timeText = (value: string) => new Date(value).toLocaleTimeString("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dayKey = (value: string | number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const duration = (start: string, end: string) => { const ms = Math.max(0, new Date(end).getTime() - new Date(start).getTime()); const minutes = Math.round(ms / 60000); if (minutes < 60) return minutes + " dk"; return Math.floor(minutes / 60) + " sa " + minutes % 60 + " dk"; };
const reasonNames: Record<string, string> = { manual: "Normal çıkış", timeout: "Zaman aşımı", workspace_switch: "Çalışma alanı değişti" };
const reasonTones: Record<string, Tone> = { manual: "neutral", timeout: "warning", workspace_switch: "info" };

// Saate bağlı değerler bileşen gövdesinde okunmaz (react-hooks/purity).
// "Bugün" Türkiye takvimine göre; sunucu UTC'de çalışıyor.
function activityClock() {
  const now = Date.now();
  const todayKey = todayInIstanbul(new Date(now));
  return {
    onlineCutoff: now - 2 * 60 * 1000,
    todayStart: istanbulMidnight(todayKey).getTime(),
    todayKey,
    yesterdayKey: todayInIstanbul(new Date(now - DAY)),
  };
}

function dayLabel(key: string, todayKey: string, yesterdayKey: string) {
  if (key === todayKey) return "Bugün";
  if (key === yesterdayKey) return "Dün";
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${key}T12:00:00Z`));
}

// Oturumlar giriş saatine göre (yeniden eskiye) sıralı geliyor; ardışık
// aynı günleri tek başlık altında toplar.
function groupByDay(sessions: Session[]) {
  const groups: { key: string; items: Session[] }[] = [];
  for (const session of sessions) {
    const key = dayKey(session.login_at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(session);
    else groups.push({ key, items: [session] });
  }
  return groups;
}

export default async function PersonnelActivityPage() {
  const { supabase, membership, modules } = await getPanelContext();
  if (!modules.some((module) => module.code === "hr")) throw new Error("İnsan Kaynakları modülüne erişiminiz yok.");
  if (!["owner", "admin", "manager"].includes(membership.role)) throw new Error("Personel hareketlerini görme yetkiniz yok.");
  const [{ data: presenceData }, { data: employeeData }, { data: sessionData }] = await Promise.all([
    supabase.from("user_presence").select("user_id,last_seen_at").eq("organization_id", membership.organization_id).order("last_seen_at", { ascending: false }),
    supabase.from("hr_employees").select("id,user_id,full_name,job_title").eq("organization_id", membership.organization_id).order("full_name"),
    supabase.from("user_session_logs").select("id,user_id,employee_id,login_at,last_seen_at,logout_at,logout_reason,ip_address,current_path").eq("organization_id", membership.organization_id).order("login_at", { ascending: false }).limit(250),
  ]);
  const presences = (presenceData ?? []) as Presence[];
  const employees = (employeeData ?? []) as Employee[];
  const sessions = (sessionData ?? []) as Session[];
  const employeeByUser = new Map(employees.filter((item) => item.user_id).map((item) => [item.user_id!, item]));
  const employeeById = new Map(employees.map((item) => [item.id, item]));
  const presenceByUser = new Map(presences.map((item) => [item.user_id, item]));
  // Açık oturumdaki son sayfa (artık yalnızca oturum kaydında; ekibe açık presence'ta yok)
  const pathByUser = new Map<string, string>();
  for (const session of sessions) { if (session.current_path && !session.logout_at && !pathByUser.has(session.user_id)) pathByUser.set(session.user_id, session.current_path); }

  const { onlineCutoff, todayStart, todayKey, yesterdayKey } = activityClock();
  const connected = employees.filter((item) => item.user_id);
  const isOnline = (employee: Employee) => new Date(presenceByUser.get(employee.user_id!)?.last_seen_at ?? 0).getTime() >= onlineCutoff;
  const onlineEmployees = connected.filter(isOnline);
  const offlineEmployees = connected.filter((employee) => !isOnline(employee));
  const onlineCount = onlineEmployees.length;
  const todaySessions = sessions.filter((item) => new Date(item.login_at).getTime() >= todayStart);
  const openSessions = sessions.filter((item) => !item.logout_at && new Date(item.last_seen_at).getTime() >= onlineCutoff);
  const averageMinutes = todaySessions.length ? Math.round(todaySessions.reduce((total, item) => total + (new Date(item.logout_at ?? item.last_seen_at).getTime() - new Date(item.login_at).getTime()), 0) / todaySessions.length / 60000) : 0;
  const sessionGroups = groupByDay(sessions);

  const widgets: { label: string; value: string | number; note: string; icon: string; tone: Tone }[] = [
    { label: "Çevrimiçi", value: onlineCount, note: "Son 2 dakikada aktif", icon: "signal", tone: "success" },
    { label: "Panel erişimi", value: connected.length, note: "Hesabı bağlı personel", icon: "key", tone: "brand" },
    { label: "Bugünkü giriş", value: todaySessions.length, note: "Bugün başlayan oturum", icon: "login", tone: "info" },
    { label: "Ortalama oturum", value: `${averageMinutes} dk`, note: "Bugünkü kayıtlar", icon: "timer", tone: "gold" },
  ];

  const personRow = (employee: Employee, online: boolean) => {
    const presence = presenceByUser.get(employee.user_id!);
    return <li className="hr-act-person" key={employee.id}>
      <span className={`hr-avatar${online ? "" : " is-muted"}`} aria-hidden="true">{initials(employee.full_name)}<i className={online ? "hr-presence is-online" : "hr-presence"} /></span>
      <span className="hr-act-body">
        <b>{employee.full_name}</b>
        <small>{employee.job_title || "Pozisyon belirtilmedi"}</small>
        {online ? <span className="hr-act-path" title={pathByUser.get(employee.user_id!) || "Panel"}>{pathByUser.get(employee.user_id!) || "Panel"}</span> : null}
      </span>
      <span className="hr-act-when">{online ? <span className="status-pill" data-tone="success">Çevrimiçi</span> : presence ? <>Son görülme<br />{dateTime(presence.last_seen_at)}</> : "Henüz giriş yapmadı"}</span>
    </li>;
  };

  return <div className="hr-page hr-act"><ActivityAutoRefresh />
    <div className="panel-pagehead">
      <div><small className="panel-kicker">İNSAN KAYNAKLARI</small><h1>Personel Hareketleri</h1><p>Çevrimiçi durum, son görülme ve giriş-çıkış geçmişi. Sayfa 30 saniyede bir kendiliğinden yenilenir.</p></div>
      <div className="panel-page-actions"><span className="hr-live" role="status"><i aria-hidden="true" />Canlı · 30 sn</span><Link className="panel-secondary" href="/panel/hr">← Personellere Dön</Link></div>
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

    <section className="hr-act-grid">
      <article className="hr-card">
        <header className="hr-card-head"><div><h2>Anlık durum</h2><p>{openSessions.length} aktif oturum</p></div><span className="hr-count">{connected.length}</span></header>
        {connected.length ? <>
          <div className="hr-act-group">
            <h3>Şu an çevrimiçi <span>{onlineEmployees.length}</span></h3>
            {onlineEmployees.length ? <ul className="hr-act-people">{onlineEmployees.map((employee) => personRow(employee, true))}</ul> : <p className="hr-act-none">Şu an kimse çevrimiçi değil.</p>}
          </div>
          {offlineEmployees.length ? <div className="hr-act-group">
            <h3>Çevrimdışı <span>{offlineEmployees.length}</span></h3>
            <ul className="hr-act-people">{offlineEmployees.map((employee) => personRow(employee, false))}</ul>
          </div> : null}
        </> : <div className="hr-empty-state is-compact">
          <span className="hr-empty-icon"><HrIcon name="key" size={20} /></span>
          <p>Panel hesabı bağlı personel bulunmuyor.</p>
        </div>}
      </article>

      <article className="hr-card is-table">
        <header className="hr-card-head"><div><h2>Giriş ve çıkış kayıtları</h2><p>Oturum geçmişi · son {sessions.length} kayıt</p></div></header>
        <div className="hr-table-wrap">
          <table className="hr-table hr-act-table">
            <thead><tr><th>Personel</th><th>Giriş</th><th>Çıkış / Son görülme</th><th className="is-num">Süre</th><th>Durum</th></tr></thead>
            <tbody>
              {sessionGroups.flatMap((group) => [
                <tr className="hr-group-row" key={`day-${group.key}`}><th colSpan={5} scope="colgroup">{dayLabel(group.key, todayKey, yesterdayKey)}<span>{group.items.length} oturum</span></th></tr>,
                ...group.items.map((session) => {
                  const employee = (session.employee_id ? employeeById.get(session.employee_id) : undefined) || employeeByUser.get(session.user_id);
                  const active = !session.logout_at && new Date(session.last_seen_at).getTime() >= onlineCutoff;
                  const end = session.logout_at ?? session.last_seen_at;
                  const name = employee?.full_name || "Kullanıcı";
                  const tone: Tone = active ? "success" : session.logout_reason ? reasonTones[session.logout_reason] ?? "neutral" : "neutral";
                  return <tr key={session.id}>
                    <td className="is-lead"><span className="hr-table-person"><span className="hr-avatar is-sm" aria-hidden="true">{initials(name)}</span><span><b>{name}</b><small>{employee?.job_title || session.ip_address || ""}</small></span></span></td>
                    <td data-label="Giriş" className="is-nowrap">{timeText(session.login_at)}</td>
                    <td data-label="Çıkış / Son görülme" className="is-nowrap">{dayKey(end) === group.key ? timeText(end) : dateTime(end)}</td>
                    <td data-label="Süre" className="is-num">{duration(session.login_at, end)}</td>
                    <td data-label="Durum"><span className="status-pill" data-tone={tone}>{active ? "Aktif" : session.logout_reason ? (reasonNames[session.logout_reason] || "Çıkış") : "Bağlantı kapandı"}</span></td>
                  </tr>;
                }),
              ])}
              {!sessions.length ? <tr><td colSpan={5} className="hr-table-empty"><div className="hr-empty-state">
                <span className="hr-empty-icon"><HrIcon name="login" size={24} /></span>
                <h3>Henüz oturum kaydı yok</h3>
                <p>Personel panele giriş yaptıkça giriş ve çıkış kayıtları burada listelenir.</p>
              </div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  </div>;
}
