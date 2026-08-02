import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

type NotificationRow = {
  id: string;
  title: string;
  message: string;
  category: string;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

export default async function NotificationsPage() {
  const { supabase, organizationId, isPlatformOwner } = await getPanelContext();
  let query = supabase
    .from("notifications")
    .select("id,title,message,category,action_url,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  query = isPlatformOwner
    ? query.eq("audience", "founder")
    : query.eq("audience", "organization").eq("organization_id", organizationId);

  const { data } = await query;
  const notifications = (data ?? []) as NotificationRow[];
  const unreadCount = notifications.filter((item) => !item.read_at).length;

  return <>
    <div className="panel-pagehead">
      <div>
        <small className="panel-kicker">BİLDİRİM MERKEZİ</small>
        <h1>Bildirimler</h1>
        <p>Ödeme, lisans ve kurum işlemlerindeki gelişmeleri buradan izleyin.</p>
      </div>
      <span className="status-pill">{unreadCount} okunmamış</span>
    </div>

    <section className="panel-card management-card">
      <div className="management-heading">
        <div><small>SON GELİŞMELER</small><h2>Bildirim akışı</h2></div>
        {unreadCount > 0 ? <form action={markAllNotificationsRead}><button className="panel-button" type="submit">Tümünü okundu işaretle</button></form> : null}
      </div>

      <div className="module-control-list">
        {notifications.length ? notifications.map((item) => <div className="module-control" key={item.id}>
          <div>
            <b>{item.title}</b>
            <small>{item.message}</small>
            <small>{new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</small>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!item.read_at ? <form action={markNotificationRead}><input type="hidden" name="notification_id" value={item.id} /><button className="panel-button" type="submit">Okundu</button></form> : <span className="status-pill">Okundu</span>}
            {item.action_url ? <Link className="panel-button" href={item.action_url}>Aç</Link> : null}
          </div>
        </div>) : <div className="platform-note"><span>i</span><p>Henüz bildiriminiz yok.</p></div>}
      </div>
    </section>
  </>;
}
