import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import { deleteReadNotification, markAllNotificationsRead, markNotificationRead, sendManagementAnnouncement } from "./actions";
import "./notifications.css";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  category: string;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

const filters = [
  { key: "sales", label: "Yeni Atanan Talepler", category: "sales_assignment" },
  { key: "operations", label: "Operasyon Talepleri", category: "operation_assignment" },
  { key: "musteri", label: "Müşteri Bildirimleri", category: "customer_message" },
  { key: "duyurular", label: "Yönetici Duyuruları", category: "management_announcement" },
] as const;

const categoryLabels: Record<string, string> = {
  sales_assignment: "Yeni Talep",
  operation_assignment: "Operasyon",
  customer_message: "Müşteri Mesajı",
  management_announcement: "Yönetici Duyurusu",
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ kategori?: string }> }) {
  const { kategori } = await searchParams;
  const selectedFilter = filters.find((filter) => filter.key === kategori) ?? null;
  const { supabase, userId, organization, isPlatformOwner, membership } = await getPanelContext();
  const canAnnounce = ["owner", "admin", "manager"].includes(membership.role) && !isPlatformOwner;
  let query = supabase
    .from("notifications")
    .select("id,title,message,category,action_url,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  query = isPlatformOwner
    ? query.eq("audience", "founder")
    : query.eq("audience", "organization").eq("organization_id", organization.id).or(`user_id.is.null,user_id.eq.${userId}`);

  const [{ data }, { data: dismissedRows }, { data: employeeRows }] = await Promise.all([
    query,
    supabase.from("notification_user_dismissals").select("notification_id").eq("user_id", userId),
    canAnnounce ? supabase.from("hr_employees").select("user_id,full_name,job_title").eq("organization_id", organization.id).eq("employment_status", "active").not("user_id", "is", null).order("full_name") : Promise.resolve({ data: [] }),
  ]);
  const dismissedIds = new Set((dismissedRows ?? []).map((row) => row.notification_id));
  const allNotifications = ((data ?? []) as NotificationRow[]).filter((item) => !dismissedIds.has(item.id));
  const notifications = selectedFilter ? allNotifications.filter((item) => item.category === selectedFilter.category) : allNotifications;
  const unreadCount = notifications.filter((item) => !item.read_at).length;
  const categoryCounts = new Map(filters.map((filter) => [filter.key, allNotifications.filter((item) => item.category === filter.category).length]));
  const announcementForm = <form className="panel-form notification-compose-form" action={sendManagementAnnouncement}>
    <label className="wide">Alıcı<select name="recipient_user_id" defaultValue="all"><option value="all">Tüm personel</option>{(employeeRows ?? []).map((employee) => <option value={employee.user_id!} key={employee.user_id!}>{employee.full_name}{employee.job_title ? ` · ${employee.job_title}` : ""}</option>)}</select></label>
    <label className="wide">Duyuru başlığı<input name="title" required minLength={3} maxLength={120} placeholder="Örn. Haftalık ekip toplantısı" /></label>
    <label className="wide">Duyuru metni<textarea name="message" required minLength={3} maxLength={2000} rows={6} placeholder="Personele iletilecek duyuruyu yazın..." /></label>
    <div className="wide panel-form-actions"><button className="panel-primary" type="submit">Duyuruyu Gönder</button></div>
  </form>;

  return <>
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">BİLDİRİM MERKEZİ</small>
        <h1>Bildirimler</h1>
        <p>Ödeme, lisans ve kurum işlemlerindeki gelişmeleri buradan izleyin.</p>
      </div>
      <div className="panel-page-actions"><span className="status-pill">{unreadCount} okunmamış</span>{canAnnounce ? <PanelDrawer triggerLabel="+ Duyuru Gönder" title="Yönetici Duyurusu" description="Tüm personele veya seçtiğiniz bir personele bildirim gönderin.">{announcementForm}</PanelDrawer> : null}</div>
    </div>

    <nav className="notification-filters" aria-label="Bildirim filtreleri">
      <Link className={!selectedFilter ? "active" : ""} href="/panel/notifications"><span>Tümü</span><b>{allNotifications.length}</b></Link>
      {filters.map((filter) => <Link className={selectedFilter?.key === filter.key ? "active" : ""} href={`/panel/notifications?kategori=${filter.key}`} key={filter.key}><span>{filter.label}</span><b>{categoryCounts.get(filter.key) ?? 0}</b></Link>)}
    </nav>

    <section className="panel-card management-card">
      <div className="management-heading">
        <div><small>SON GELİŞMELER</small><h2>{selectedFilter?.label ?? "Tüm bildirimler"}</h2></div>
        {unreadCount > 0 ? <form action={markAllNotificationsRead}><button className="panel-button" type="submit">Tümünü okundu işaretle</button></form> : null}
      </div>

      <div className="notification-feed">
        {notifications.length ? notifications.map((item) => <article className={`notification-item${item.read_at ? " is-read" : " is-unread"}`} key={item.id}>
          <div className="notification-item-marker" aria-hidden="true" />
          <div className="notification-item-body">
            <div className="notification-item-meta">
              <span className="notification-category">{categoryLabels[item.category] ?? "Bildirim"}</span>
              {!item.read_at ? <span className="notification-new">Yeni</span> : null}
              <time dateTime={item.created_at}>{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</time>
            </div>
            <h3>{item.title}</h3>
            <p>{item.message}</p>
          </div>
          <div className="notification-item-actions">
            {!item.read_at ? <form action={markNotificationRead}><input type="hidden" name="notification_id" value={item.id} /><button className="notification-action notification-action-muted" type="submit">Okundu İşaretle</button></form> : <><span className="notification-read-state">Okundu</span><form action={deleteReadNotification}><input type="hidden" name="notification_id" value={item.id} /><button className="notification-action notification-action-danger" type="submit">Sil</button></form></>}
            {item.action_url && item.category !== "management_announcement" ? <Link className="notification-action notification-action-primary" href={item.action_url}>Kaydı Aç <span aria-hidden="true">→</span></Link> : null}
          </div>
        </article>) : <div className="platform-note"><span>i</span><p>Henüz bildiriminiz yok.</p></div>}
      </div>
    </section>
  </>;
}
