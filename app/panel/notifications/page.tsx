import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import { deleteReadNotification, markAllNotificationsRead, markNotificationRead, sendManagementAnnouncement } from "./actions";
import type { DescribedNotification } from "./describe";
import { inNotificationFilter, notificationFilters as filters } from "./filters";
import { countUnreadNotifications, loadNotifications } from "./load-notifications";
import { NotificationIcon as Icon } from "./notification-icon";
import { DuyuruMetni } from "./duyuru-metni";
import { AnlikBildirimAyari } from "./anlik-bildirim-ayari";
import { pushGenelAnahtar, pushYapilandi } from "@/lib/anlik-bildirim-gonder";
import { todayInIstanbul } from "@/lib/istanbul-date";
// Sayfa düzeni (talep-bas, kayit-serit, ekip-suzgec) panelin öteki sayfalarıyla ortak.
import "../crm/kayit-detay/kayit-detay.css";
import "./notifications.css";
// Ortak kayıt formu düzeni (zorunlu alan işareti, kaydet çubuğu).
import "../components/kayit-formu.css";

const TZ = "Europe/Istanbul";
/** Sayfada gösterilen en çok bildirim (çekmeceyle aynı sorgu). */
const LISTE_SINIRI = 100;
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

/*
  BİLDİRİMLER, PANELİN DÜZENİNDE (12.10.2026): başlık talep-bas, özet
  şeridi kayit-serit, başlık çipleri ekip-suzgec, liste panel-card.
  Eskiden sayfa kendi başlığını ve kendi çip dilini çiziyordu.

  SAYILAR. "N okunmamış" eskiden son 100 bildirimden sayılıyordu; 100'den
  fazla okunmamışı olan biri eksik sayı görüyordu ve üst çubuk rozeti
  (veritabanından, sınırsız) başka bir sayı söylüyordu. Okunmamış sayısı
  artık rozetle AYNI işlevden. Başlık sayıları listeden geliyor; liste
  sınıra ulaştıysa bu açıkça yazılıyor ("son 100 bildirimde").

  "Okundu işaretle" seçili başlığa uygulanıyor (actions.ts): eskiden
  "Posta" açıkken basılan "Tümünü okundu işaretle" bütün başlıkları
  okunmuş yapıyordu.
*/
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ kategori?: string; durum?: string }> }) {
  const { kategori, durum } = await searchParams;
  const selectedFilter = filters.find((filter) => filter.key === kategori) ?? null;
  const yalnizOkunmamis = durum === "okunmamis";
  const { supabase, userId, organization, isPlatformOwner, izin } = await getPanelContext();
  const canAnnounce = izin("bildirim.duyuru.gonder") && !isPlatformOwner;

  // Liste sorgusu ve metin kurgusu çekmeceyle ortak (load-notifications.ts)
  const [allNotifications, okunmamisToplam, { data: employeeRows }] = await Promise.all([
    loadNotifications({ supabase, userId, organizationId: organization.id, isPlatformOwner }, LISTE_SINIRI),
    countUnreadNotifications({ supabase, organizationId: organization.id, isPlatformOwner }),
    canAnnounce ? supabase.from("hr_employees").select("user_id,full_name,job_title").eq("organization_id", organization.id).eq("employment_status", "active").not("user_id", "is", null).order("full_name") : Promise.resolve({ data: [] }),
  ]);
  const sinirda = allNotifications.length >= LISTE_SINIRI;
  const baslikta = selectedFilter ? allNotifications.filter((item) => inNotificationFilter(item.category, selectedFilter)) : allNotifications;
  const notifications = yalnizOkunmamis ? baslikta.filter((item) => !item.read_at) : baslikta;
  const visibleUnread = baslikta.filter((item) => !item.read_at).length;
  const bugun = todayInIstanbul();
  const bugunGelen = allNotifications.filter((item) => dayKey(item.created_at) === bugun).length;
  const duyuruOkunmamis = allNotifications.filter((item) => item.category === "management_announcement" && !item.read_at).length;

  const groups = groupByDay(notifications);
  // Süzgeçler adreste birlikte duruyor: başlık + okunmamış.
  const adres = (yeni: { kategori?: string | null; okunmamis?: boolean }) => {
    const p = new URLSearchParams();
    const k = yeni.kategori === undefined ? selectedFilter?.key : yeni.kategori;
    if (k) p.set("kategori", k);
    if (yeni.okunmamis ?? yalnizOkunmamis) p.set("durum", "okunmamis");
    const q = p.toString();
    return q ? `/panel/notifications?${q}` : "/panel/notifications";
  };

  const announcementForm = <form className="panel-form notification-compose-form kayit-formu" action={sendManagementAnnouncement}>
    <label className="wide">Alıcı<select name="recipient_user_id" defaultValue="all"><option value="all">Tüm personel</option>{(employeeRows ?? []).map((employee) => <option value={employee.user_id!} key={employee.user_id!}>{employee.full_name}{employee.job_title ? ` · ${employee.job_title}` : ""}</option>)}</select></label>
    <label className="wide"><span>Duyuru başlığı<b className="req" aria-hidden="true">*</b></span><input name="title" required minLength={3} maxLength={120} placeholder="Örn. Haftalık ekip toplantısı" /></label>
    <label className="wide"><span>Duyuru metni<b className="req" aria-hidden="true">*</b></span><textarea name="message" required minLength={3} maxLength={2000} rows={6} placeholder="Personele iletilecek duyuruyu yazın..." /></label>
    <div className="wide panel-form-actions kayit-formu-eylem"><p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p><button className="panel-primary" type="submit">Duyuruyu gönder</button></div>
  </form>;

  return <main className="talep cari ntf-page">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">BİLDİRİM MERKEZİ</small>
        <h1>Bildirimler</h1>
      </div>
      <div className="talep-bas-eylem">
        {okunmamisToplam > 0 ? <form action={markAllNotificationsRead}><button className="panel-secondary" type="submit">Tümünü okundu işaretle</button></form> : null}
        {canAnnounce ? <PanelDrawer triggerLabel="+ Duyuru gönder" triggerClassName="panel-primary" kicker="YÖNETİCİ DUYURUSU" title="Yeni duyuru" description="Tüm personele ya da seçtiğiniz kişiye bildirim olarak gider.">{announcementForm}</PanelDrawer> : null}
      </div>
    </header>

    {/* Bu cihazda anlık bildirim (web push, 13.10.2026). */}
    <AnlikBildirimAyari genelAnahtar={pushYapilandi() ? pushGenelAnahtar() : null} />

    {/* ÖZET ŞERİDİ: okunmamış sayısı rozetle aynı işlevden (sınırsız). */}
    <nav className="kayit-serit talep-serit" aria-label="Bildirim özeti">
      <dl>
        <div className={yalnizOkunmamis && !selectedFilter ? "is-active" : undefined}><dt>Okunmamış</dt><dd className={okunmamisToplam ? "talep-uyari" : "cari-arti"}><Link href={adres({ kategori: null, okunmamis: true })}>{okunmamisToplam}</Link></dd></div>
        <div><dt>Bugün gelen</dt><dd>{bugunGelen}</dd></div>
        {duyuruOkunmamis ? <div><dt>Okunmamış duyuru</dt><dd><Link href={adres({ kategori: "duyurular", okunmamis: true })}>{duyuruOkunmamis}</Link></dd></div> : null}
        <div><dt>{sinirda ? `Son ${LISTE_SINIRI} bildirim` : "Listede"}</dt><dd>{allNotifications.length}</dd></div>
      </dl>
    </nav>

    <section className="panel-card ntf-card" aria-label="Bildirim listesi">
      <div className="ekip-suzgec talep-suzgec ntf-suzgec">
        <Link className={!selectedFilter ? "is-active" : undefined} href={adres({ kategori: null })} aria-current={!selectedFilter ? "page" : undefined}>Tümü <small>{allNotifications.length}</small></Link>
        {filters.map((filter) => {
          const count = allNotifications.filter((item) => inNotificationFilter(item.category, filter)).length;
          const active = selectedFilter?.key === filter.key;
          if (!count && !active) return null; // boş başlık gösterilmez (çekmeceyle aynı)
          return <Link className={active ? "is-active" : undefined} href={adres({ kategori: filter.key })} key={filter.key} aria-current={active ? "page" : undefined}>{filter.label} <small>{count}</small></Link>;
        })}
        <Link className={`ekip-suzgec-dep${yalnizOkunmamis ? " is-active" : ""}`} href={adres({ okunmamis: !yalnizOkunmamis })} aria-current={yalnizOkunmamis ? "true" : undefined}>Yalnızca okunmamış</Link>
      </div>

      <div className="cari-baslik ntf-baslik">
        <div>
          <h2>{selectedFilter?.label ?? "Tüm bildirimler"}{yalnizOkunmamis ? " · okunmamış" : ""}</h2>
          <small>{notifications.length} bildirim{sinirda ? ` · son ${LISTE_SINIRI} bildirimde` : ""}</small>
        </div>
        {selectedFilter && visibleUnread > 0 ? <form action={markAllNotificationsRead}><input type="hidden" name="kategori" value={selectedFilter.key} /><button className="ntf-link" type="submit">Bu başlığı okundu işaretle</button></form> : null}
      </div>

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
          <h3>{yalnizOkunmamis ? "Okunmamış bildirim yok" : selectedFilter ? "Bu başlıkta bildirim yok" : "Henüz bildiriminiz yok"}</h3>
          <p>{yalnizOkunmamis ? "Hepsini okudunuz. Yeni bir iş, müşteri mesajı ya da duyuru gelince burada görünecek." : "Size bir iş atandığında, müşteri mesaj bıraktığında ya da duyuru geldiğinde burada görünecek."}</p>
        </div>
      )}
    </section>
  </main>;
}
