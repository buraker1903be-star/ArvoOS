import Link from "next/link";
import type { ReactNode } from "react";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import { deleteReadNotification, markAllNotificationsRead, markNotificationRead, sendManagementAnnouncement } from "./actions";
import { describeNotifications, type DescribedNotification, type NotificationIconName, type NotificationRow } from "./describe";
import "./notifications.css";

// Filtreler: kategori anahtarları eski bağlantılarla uyumlu (?kategori=duyurular)
const filters = [
  { key: "sales", label: "Talepler", categories: ["sales_assignment"] },
  { key: "operations", label: "Operasyon", categories: ["operation_assignment", "crm_won_automation"] },
  { key: "musteri", label: "Müşteri", categories: ["customer_message"] },
  { key: "yorumlar", label: "Yorumlar", categories: ["internal_comment"] },
  { key: "duyurular", label: "Duyurular", categories: ["management_announcement"] },
] as const;

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

const icons: Record<NotificationIconName, ReactNode> = {
  bubble: <path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.6-5.1A8.5 8.5 0 1 1 21 12Z" />,
  comment: <><path d="M4 5h16v11H9l-5 4Z" /><path d="M8 9.5h8" /><path d="M8 12.5h5" /></>,
  person: <><circle cx="10" cy="8" r="3.5" /><path d="M3.5 20c.7-3.6 3.3-5.5 6.5-5.5 1.6 0 3 .4 4.1 1.2" /><path d="M18 14v6" /><path d="M15 17h6" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" /><path d="M3 12.5h18" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.7 2.7L16.5 9" /></>,
  card: <><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 10h19" /><path d="M6.5 14.5h4" /></>,
  lifebuoy: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /><path d="m5.6 5.6 3.9 3.9" /><path d="m14.5 14.5 3.9 3.9" /><path d="m18.4 5.6-3.9 3.9" /><path d="m9.5 14.5-3.9 3.9" /></>,
  megaphone: <><path d="M3 10.5v3a1 1 0 0 0 1 1h2l6 4V5.5l-6 4H4a1 1 0 0 0-1 1Z" /><path d="M16 9a4 4 0 0 1 0 6" /><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" /></>,
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
};

function Icon({ name }: { name: NotificationIconName }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ kategori?: string }> }) {
  const { kategori } = await searchParams;
  const selectedFilter = filters.find((filter) => filter.key === kategori) ?? null;
  const { supabase, userId, organization, isPlatformOwner, membership } = await getPanelContext();
  const canAnnounce = ["owner", "admin", "manager"].includes(membership.role) && !isPlatformOwner;
  let query = supabase
    .from("notifications")
    .select("id,title,message,category,action_url,user_id,read_at,created_at,metadata")
    .order("created_at", { ascending: false })
    .limit(100);

  query = isPlatformOwner
    ? query.eq("audience", "founder")
    : query.eq("audience", "organization").eq("organization_id", organization.id).or(`user_id.is.null,user_id.eq.${userId}`);

  const [{ data }, { data: dismissedRows }, { data: employeeRows }, { data: readRows }] = await Promise.all([
    query,
    supabase.from("notification_user_dismissals").select("notification_id").eq("user_id", userId),
    canAnnounce ? supabase.from("hr_employees").select("user_id,full_name,job_title").eq("organization_id", organization.id).eq("employment_status", "active").not("user_id", "is", null).order("full_name") : Promise.resolve({ data: [] }),
    supabase.from("notification_user_reads").select("notification_id,read_at").eq("user_id", userId),
  ]);
  const dismissedIds = new Set((dismissedRows ?? []).map((row) => row.notification_id));
  // Toplu bildirimlerde (user_id boş) okundu bilgisi kişiye özel.
  const ownReadAt = new Map((readRows ?? []).map((row) => [row.notification_id as string, row.read_at as string]));
  const rows = ((data ?? []) as NotificationRow[])
    .map((item) => (!isPlatformOwner && !item.user_id ? { ...item, read_at: ownReadAt.get(item.id) ?? null } : item))
    .filter((item) => !dismissedIds.has(item.id));
  const allNotifications = await describeNotifications(supabase, organization.id, rows);
  const inFilter = (item: DescribedNotification, filter: (typeof filters)[number]) => (filter.categories as readonly string[]).includes(item.category);
  const notifications = selectedFilter ? allNotifications.filter((item) => inFilter(item, selectedFilter)) : allNotifications;
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
        const count = allNotifications.filter((item) => inFilter(item, filter)).length;
        const active = selectedFilter?.key === filter.key;
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
                  <p className="ntf-detail">{item.detail}</p>
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
