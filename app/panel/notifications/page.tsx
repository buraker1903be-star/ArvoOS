import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import { deleteReadNotification, markAllNotificationsRead, markNotificationRead, sendManagementAnnouncement } from "./actions";
import type { DescribedNotification } from "./describe";
import { inNotificationFilter, notificationFilters as filters } from "./filters";
import { loadNotifications } from "./load-notifications";
import { NotificationIcon as Icon } from "./notification-icon";
import { DuyuruMetni } from "./duyuru-metni";
import "./notifications.css";

const TZ = "Europe/Istanbul";
const DAY = 24 * 60 * 60 * 1000;
const dayKey = (value: string | number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
const clock = (value: string) => new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(value));

function dayLabel(value: string, now: number) {
  const key = dayKey(value);
  if (key === dayKey(now)) return "Bugün";
  if (key === dayKey(now - DAY)) return "Dün";
  return new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(value));
}

/** Gün gruplarına ayırır (Bugün, Dün, 11 Eylül Perşembe…) */
function groupByDay(items: DescribedNotification[]) {
  const now = Date.now();
  const groups: { label: string; items: DescribedNotification[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.created_at, now);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ kategori?: string }> }) {
  const { kategori } = await searchParams;
  const selectedFilter = filters.find((filter) => filter.key === kategori) ?? null;
  const { supabase, userId, organization, isPlatformOwner, membership } = await getPanelContext();
  const canAnnounce = ["owner", "admin", "manager"].includes(membership.role) && !isPlatformOwner;

  // Liste sorgusu ve metin kurgusu çekmeceyle ortak (load-notifications.ts)
  const [allNotifications, { data: employeeRows }] = await Promise.all([
    loadNotifications({ supabase, userId, organizationId: organization.id, isPlatformOwner }),
    canAnnounce ? supabase.from("hr_employees").select("user_id,full_name,job_title").eq("organization_id", organization.id).eq("employment_status", "active").not("user_id", "is", null).order("full_name") : Promise.resolve({ data: [] }),
  ]);
  const notifications = selectedFilter ? allNotifications.filter((item) => inNotificationFilter(item.category, selectedFilter)) : allNotifications;
  const unreadCount = allNotifications.filter((item) => !item.read_at).length;
  const visibleUnread = notifications.filter((item) => !item.read_at).length;

  const groups = groupByDay(notifications);

  const announcementForm = <form className="panel-form notification-compose-form" action={sendManagementAnnouncement}>
    <label className="wide">Alıcı<select name="recipient_user_id" defaultValue="all"><option value="all">Tüm personel</option>{(employeeRows ?? []).map((employee) => <option value={employee.user_id!} key={employee.user_id!}>{employee.full_name}{employee.job_title ? ` · ${employee.job_title}` : ""}</option>)}</select></label>
    <label className="wide">Duyuru başlığı<input name="title" required minLength={3} maxLength={120} placeholder="Örn. Haftalık ekip toplantısı" /></label>
    <label className="wide">Duyuru metni<textarea name="message" required minLength={3} maxLength={2000} rows={6} placeholder="Personele iletilecek duyuruyu yazın..." /></label>
    <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Duyuruyu Gönder</button></div>
  </form>;

  return <div className="ntf-page">
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">BİLDİRİM MERKEZİ</small>
        <h1>Bildirimler</h1>
        <p>Size atanan işler, müşteri mesajları, ekip yorumları ve duyurular tek yerde.</p>
      </div>
      <div className="panel-page-actions">
        <span className="status-pill" data-tone={unreadCount ? "info" : undefined}>{unreadCount ? `${unreadCount} okunmamış` : "Hepsi okundu"}</span>
        {canAnnounce ? <PanelDrawer triggerLabel="+ Duyuru gönder" kicker="YÖNETİCİ DUYURUSU" title="Yeni duyuru" description="Tüm personele ya da seçtiğiniz kişiye bildirim gönderin.">{announcementForm}</PanelDrawer> : null}
      </div>
    </div>

    <nav className="ntf-filters" aria-label="Bildirim filtreleri">
      <Link className={!selectedFilter ? "is-active" : ""} href="/panel/notifications" aria-current={!selectedFilter ? "page" : undefined}>
        Tümü<b>{allNotifications.length}</b>
      </Link>
      {filters.map((filter) => {
        const count = allNotifications.filter((item) => inNotificationFilter(item.category, filter)).length;
        const active = selectedFilter?.key === filter.key;
        if (!count && !active) return null; // boş başlık gösterilmez (çekmeceyle aynı)
        return (
          <Link className={active ? "is-active" : ""} href={`/panel/notifications?kategori=${filter.key}`} key={filter.key} aria-current={active ? "page" : undefined}>
            {filter.label}<b>{count}</b>
          </Link>
        );
      })}
    </nav>

    <section className="ntf-card">
      <header className="ntf-card-head">
        <h2>{selectedFilter?.label ?? "Tüm bildirimler"}</h2>
        {visibleUnread > 0 ? <form action={markAllNotificationsRead}><button className="ntf-link" type="submit">Tümünü okundu işaretle</button></form> : null}
      </header>

      {groups.length ? groups.map((group) => (
        <div className="ntf-group" key={group.label}>
          <p className="ntf-day">{group.label}</p>
          {group.items.map((item) => {
            const unread = !item.read_at;
            return (
              <article className={`ntf-item${unread ? " is-unread" : ""}`} data-tone={item.tone} key={item.id}>
                <span className="ntf-icon"><Icon name={item.icon} /></span>
                <div className="ntf-body">
                  <div className="ntf-top">
                    <span className="ntf-label">{item.label}</span>
                    <time dateTime={item.created_at}>{clock(item.created_at)}</time>
                  </div>
                  <h3>{item.headline}</h3>
                  {/* Duyuru tek okunası metin; kesilirse açılabiliyor.
                      Otomatik bildirimler zaten tek satır, onlarda kırpma
                      listeyi taranabilir tutuyor. */}
                  {item.category === "management_announcement"
                    ? <DuyuruMetni metin={item.detail} />
                    : <p className="ntf-detail">{item.detail}</p>}
                  {item.context ? <p className="ntf-context">{item.context}</p> : null}
                  <div className="ntf-actions">
                    {item.action_url && item.category !== "management_announcement" ? (
                      <Link className="ntf-btn is-primary" href={item.action_url}>
                        {item.actionLabel}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                      </Link>
                    ) : null}
                    {unread ? (
                      <form action={markNotificationRead}><input type="hidden" name="notification_id" value={item.id} /><button className="ntf-btn" type="submit">Okundu</button></form>
                    ) : (
                      <form action={deleteReadNotification}><input type="hidden" name="notification_id" value={item.id} /><button className="ntf-btn is-danger" type="submit">Kaldır</button></form>
                    )}
                  </div>
                </div>
                {unread ? <span className="ntf-dot" role="img" aria-label="Okunmamış" /> : null}
              </article>
            );
          })}
        </div>
      )) : (
        <div className="ntf-empty">
          <span className="ntf-icon" data-tone="neutral"><Icon name="bell" /></span>
          <h3>{selectedFilter ? "Bu başlıkta bildirim yok" : "Henüz bildiriminiz yok"}</h3>
          <p>Size bir iş atandığında, müşteri mesaj bıraktığında ya da duyuru geldiğinde burada görünecek.</p>
        </div>
      )}
    </section>
  </div>;
}
