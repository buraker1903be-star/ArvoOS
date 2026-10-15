import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { PanelDrawer } from "../components/panel-drawer";
import { PanelModal } from "../components/panel-modal";
import { deleteReadNotification, dismissReadNotifications, markAllNotificationsRead, markNotificationRead, sendManagementAnnouncement } from "./actions";
import { describeNotifications, type DescribedNotification, type NotificationRow } from "./describe";
import { basliklaraDagit, inNotificationFilter, kategoriParametresi, notificationFilters as filters, type BildirimOzeti, type BildirimOzetSatiri } from "./filters";
import { countUnreadNotifications, loadNotifications } from "./load-notifications";
import { aralikDisiMi, sayfaAraligi, sayfaNumarasi, sayfasizAdres, sonSayfaNo } from "@/lib/liste-sayfalama";
import { redirect } from "next/navigation";
import { NotificationIcon as Icon } from "./notification-icon";
import { DuyuruMetni } from "./duyuru-metni";
import { AnlikBildirimAyari } from "./anlik-bildirim-ayari";
import { pushGenelAnahtar, pushYapilandi } from "@/lib/anlik-bildirim-gonder";
import { istanbulMidnight, todayInIstanbul } from "@/lib/istanbul-date";
// Sayfa düzeni (talep-bas, kayit-serit, ekip-suzgec) panelin öteki sayfalarıyla ortak.
import "../crm/kayit-detay/kayit-detay.css";
import "./notifications.css";
// Ortak kayıt formu düzeni (zorunlu alan işareti, kaydet çubuğu).
import "../components/kayit-formu.css";

const TZ = "Europe/Istanbul";
/** Migration uygulanmadıysa eski yolun okuduğu en çok bildirim. */
const ESKI_SINIR = 100;
const SUTUNLAR = "id,title,message,category,action_url,user_id,read_at,created_at,metadata";
const islevYok = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (["PGRST202", "42883"].includes(error.code ?? "") || /could not find the function/i.test(error.message ?? "")));
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

  SUNUCUDA (13.10.2026, 20261013145720). Eskiden kişinin son 100
  bildirimi çekilip başlık, "okunmamış" süzgeci ve çip sayıları bellekte
  hesaplanıyordu: 100'ü geçen biri eski bildirimlerine ulaşamıyor, çip
  sayıları "son 100'ün içinden" kalıyordu. Artık liste arvo_bildirimler'den
  sayfa sayfa (diğer listelerle aynı sayfa boyu), şerit ve çip sayıları
  AYNI işlevin üstündeki özetten (arvo_bildirim_ozeti). Okunmamış toplamı
  rozetin işleviyle birebir aynı tanım; test eşitliği sabitliyor.

  "Okundu işaretle" seçili başlığa uygulanıyor (actions.ts): eskiden
  "Posta" açıkken basılan "Tümünü okundu işaretle" bütün başlıkları
  okunmuş yapıyordu.
*/
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ kategori?: string; durum?: string; sayfa?: string }> }) {
  const parametreler = await searchParams;
  const { kategori, durum, sayfa } = parametreler;
  const sayfaNo = sayfaNumarasi(sayfa);
  const selectedFilter = filters.find((filter) => filter.key === kategori) ?? null;
  const yalnizOkunmamis = durum === "okunmamis";
  const { supabase, userId, organization, isPlatformOwner, izin } = await getPanelContext();
  const canAnnounce = izin("bildirim.duyuru.gonder") && !isPlatformOwner;

  const bugun = todayInIstanbul();
  const kapsam = { p_org: organization.id, p_kurucu: isPlatformOwner };
  const [listeSonucu, ozetSonucu, { data: employeeRows }] = await Promise.all([
    supabase.rpc("arvo_bildirimler", { ...kapsam, ...kategoriParametresi(selectedFilter), p_okunmamis: yalnizOkunmamis }, { count: "exact" })
      .select(SUTUNLAR)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(sayfaAraligi(sayfaNo)[0], sayfaAraligi(sayfaNo)[1]),
    supabase.rpc("arvo_bildirim_ozeti", { ...kapsam, p_bugun: istanbulMidnight(bugun).toISOString() }),
    canAnnounce ? supabase.from("hr_employees").select("user_id,full_name,job_title").eq("organization_id", organization.id).eq("employment_status", "active").not("user_id", "is", null).order("full_name") : Promise.resolve({ data: [] }),
  ]);

  let notifications: DescribedNotification[];
  let ozet: BildirimOzeti;
  let suzgecSayisi: number | null;
  let eskiYol = false;
  if (islevYok(listeSonucu.error) || islevYok(ozetSonucu.error)) {
    /* Migration henüz uygulanmadıysa eski yol: son 100 bildirim bellekte
       süzülür (çekmeceyle aynı sorgu). Migration'dan sonra bu dal ölü. */
    eskiYol = true;
    const [hepsi, okunmamisSayisi] = await Promise.all([
      loadNotifications({ supabase, userId, organizationId: organization.id, isPlatformOwner }, ESKI_SINIR),
      countUnreadNotifications({ supabase, organizationId: organization.id, isPlatformOwner }),
    ]);
    const satirlar = new Map<string, { kategori: string; adet: number; okunmamis: number; bugun: number }>();
    for (const item of hepsi) {
      const satir = satirlar.get(item.category) ?? { kategori: item.category, adet: 0, okunmamis: 0, bugun: 0 };
      satir.adet += 1;
      if (!item.read_at) satir.okunmamis += 1;
      if (dayKey(item.created_at) === bugun) satir.bugun += 1;
      satirlar.set(item.category, satir);
    }
    ozet = { ...basliklaraDagit([...satirlar.values()]), okunmamis: okunmamisSayisi };
    const suzulmus = hepsi
      .filter((item) => !selectedFilter || inNotificationFilter(item.category, selectedFilter))
      .filter((item) => !yalnizOkunmamis || !item.read_at);
    suzgecSayisi = suzulmus.length;
    notifications = suzulmus.slice(sayfaAraligi(sayfaNo)[0], sayfaAraligi(sayfaNo)[1] + 1);
  } else {
    // Sayfa boş "bildiriminiz yok" demesin: okunamayan liste hata olarak gösterilir.
    /* Aralık dışı sayfa çökme değil: süzgeçler korunur, ilk sayfaya döner. */
    if (aralikDisiMi(listeSonucu.error)) redirect(sayfasizAdres("/panel/notifications", parametreler));
    if (listeSonucu.error) throw new Error("Bildirimler okunamadı: " + listeSonucu.error.message);
    if (ozetSonucu.error) throw new Error("Bildirim sayıları okunamadı: " + ozetSonucu.error.message);
    notifications = await describeNotifications(supabase, organization.id, (listeSonucu.data ?? []) as unknown as NotificationRow[]);
    ozet = basliklaraDagit((ozetSonucu.data ?? []) as BildirimOzetSatiri[]);
    suzgecSayisi = listeSonucu.count ?? null;
  }
  const okunmamisToplam = ozet.okunmamis;
  const visibleUnread = selectedFilter ? ozet.basliklar[selectedFilter.key]?.okunmamis ?? 0 : ozet.okunmamis;
  const duyuruOkunmamis = ozet.basliklar.duyurular?.okunmamis ?? 0;
  const sonSayfa = sonSayfaNo(suzgecSayisi, notifications.length, sayfaNo);
  // Toplu kaldırma seçili başlığa uygulanır; sayısı özetten (okunmuş = toplam − okunmamış).
  const baslikSayisi = selectedFilter ? ozet.basliklar[selectedFilter.key] : { adet: ozet.toplam, okunmamis: ozet.okunmamis };
  const okunmusSayisi = Math.max(0, (baslikSayisi?.adet ?? 0) - (baslikSayisi?.okunmamis ?? 0));

  const groups = groupByDay(notifications);
  /* Süzgeçler adreste birlikte duruyor: başlık + okunmamış. Süzgeç
     değişince sayfa başa dönüyor; numara yalnızca sayfalayıcıdan taşınıyor. */
  const adres = (yeni: { kategori?: string | null; okunmamis?: boolean; sayfa?: number }) => {
    const p = new URLSearchParams();
    const k = yeni.kategori === undefined ? selectedFilter?.key : yeni.kategori;
    if (k) p.set("kategori", k);
    if (yeni.okunmamis ?? yalnizOkunmamis) p.set("durum", "okunmamis");
    if (yeni.sayfa && yeni.sayfa > 1) p.set("sayfa", String(yeni.sayfa));
    const q = p.toString();
    return q ? `/panel/notifications?${q}` : "/panel/notifications";
  };

  const announcementForm = <form className="panel-form notification-compose-form kayit-formu" action={sendManagementAnnouncement}>
    <label className="wide">Alıcı<select name="recipient_user_id" defaultValue="all"><option value="all">Tüm personel</option>{(employeeRows ?? []).map((employee) => <option value={employee.user_id!} key={employee.user_id!}>{employee.full_name}{employee.job_title ? ` · ${employee.job_title}` : ""}</option>)}</select></label>
    <label className="wide"><span>Duyuru başlığı<b className="req" aria-hidden="true">*</b></span><input name="title" required minLength={3} maxLength={120} placeholder="Örn. Haftalık ekip toplantısı" /></label>
    <label className="wide"><span>Duyuru metni<b className="req" aria-hidden="true">*</b></span><textarea name="message" required minLength={3} maxLength={2000} rows={6} placeholder="Personele iletilecek duyuruyu yazın..." /></label>
    <div className="wide panel-form-actions kayit-formu-eylem"><p><b className="req" aria-hidden="true">*</b> işaretli alanlar zorunlu.</p><button className="panel-primary" type="submit">Duyuruyu gönder</button></div>
  </form>;

  /*
    LİSTE SAYFASI DÜZENİ (13.10.2026, işler listesiyle aynı iskelet):
    sayfa ekrana sabit, bildirimler kartın İÇİNDE kayar (os-shell.css,
    .liste-sayfa). Anlık bildirim ayarları sağdaki yan kartta; eskiden
    listenin üstünde tam genişlikte bir blok olarak listeyi ekranın altına
    itiyordu.
  */
  return <main className="talep cari ekip ntf-page liste-sayfa">
    <header className="talep-bas">
      <div className="talep-bas-metin">
        <small className="panel-kicker">BİLDİRİM MERKEZİ</small>
        <h1>Bildirimler</h1>
      </div>
      <div className="talep-bas-eylem">
        {okunmamisToplam > 0 ? <form action={markAllNotificationsRead}><button className="panel-secondary" type="submit">Tümünü okundu işaretle</button></form> : null}
        {okunmusSayisi > 0 && !eskiYol ? (
          <PanelModal
            triggerLabel="Okunanları kaldır"
            kicker="TOPLU KALDIRMA"
            title={`${okunmusSayisi} okunmuş bildirim kaldırılsın mı?`}
            description={selectedFilter ? `Yalnızca "${selectedFilter.label}" başlığındaki okunmuş bildirimler.` : "Bütün başlıklardaki okunmuş bildirimler."}
            basaridaKapan
          >
            <form action={dismissReadNotifications} className="ntf-toplu-kaldir">
              {selectedFilter ? <input type="hidden" name="kategori" value={selectedFilter.key} /> : null}
              <p>Bildirimler yalnızca sizin listenizden kalkar; okunmamışlar ve başka kişilerin listesi olduğu gibi kalır. Geri alınamaz.</p>
              <div className="panel-form-actions"><button className="panel-danger" type="submit">{okunmusSayisi} bildirimi kaldır</button></div>
            </form>
          </PanelModal>
        ) : null}
        {canAnnounce ? <PanelDrawer triggerLabel="+ Duyuru gönder" triggerClassName="panel-primary" kicker="YÖNETİCİ DUYURUSU" title="Yeni duyuru" description="Tüm personele ya da seçtiğiniz kişiye bildirim olarak gider.">{announcementForm}</PanelDrawer> : null}
      </div>
    </header>

    {/* ÖZET ŞERİDİ: sayılar özet işlevinden (sınırsız); okunmamış rozetle aynı tanım. */}
    <nav className="kayit-serit talep-serit" aria-label="Bildirim özeti">
      <dl>
        <div className={yalnizOkunmamis && !selectedFilter ? "is-active" : undefined}><dt>Okunmamış</dt><dd className={okunmamisToplam ? "talep-uyari" : "cari-arti"}><Link href={adres({ kategori: null, okunmamis: true })}>{okunmamisToplam}</Link></dd></div>
        <div><dt>Bugün gelen</dt><dd>{ozet.bugun}</dd></div>
        {duyuruOkunmamis ? <div><dt>Okunmamış duyuru</dt><dd><Link href={adres({ kategori: "duyurular", okunmamis: true })}>{duyuruOkunmamis}</Link></dd></div> : null}
        <div className={!yalnizOkunmamis && !selectedFilter ? "is-active" : undefined}><dt>{eskiYol ? `Son ${ESKI_SINIR} bildirim` : "Toplam"}</dt><dd><Link href={adres({ kategori: null, okunmamis: false })}>{ozet.toplam}</Link></dd></div>
      </dl>
    </nav>

    <div className="talep-izgara ekip-izgara ntf-izgara">
    <section className="panel-card talep-bilgi ntf-card" aria-label="Bildirim listesi">
      <div className="ekip-suzgec talep-suzgec ntf-suzgec">
        <Link className={!selectedFilter ? "is-active" : undefined} href={adres({ kategori: null })} aria-current={!selectedFilter ? "page" : undefined}>Tümü <small>{ozet.toplam}</small></Link>
        {filters.map((filter) => {
          const count = ozet.basliklar[filter.key]?.adet ?? 0;
          const active = selectedFilter?.key === filter.key;
          if (!count && !active) return null; // boş başlık gösterilmez (çekmeceyle aynı)
          return <Link className={active ? "is-active" : undefined} href={adres({ kategori: filter.key })} key={filter.key} aria-current={active ? "page" : undefined}>{filter.label} <small>{count}</small></Link>;
        })}
        <Link className={`ekip-suzgec-dep${yalnizOkunmamis ? " is-active" : ""}`} href={adres({ okunmamis: !yalnizOkunmamis })} aria-current={yalnizOkunmamis ? "true" : undefined}>Yalnızca okunmamış</Link>
        {selectedFilter && visibleUnread > 0 ? <form action={markAllNotificationsRead} className="ntf-baslik-oku"><input type="hidden" name="kategori" value={selectedFilter.key} /><button className="ntf-link" type="submit">Bu başlığı okundu işaretle</button></form> : null}
      </div>

      {/* Kayan alan: gün grupları, sayfalayıcı ve boş durum. */}
      <div className="talep-tablo ntf-akis">
      {eskiYol ? <p className="ntf-not">Son {ESKI_SINIR} bildirim gösteriliyor.</p> : null}
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
      )) : null}
      {/* Sayfalayıcı: talep, teklif, sözleşme ve iş listeleriyle aynı. */}
      {sonSayfa > 1 ? (
        <nav className="liste-sayfalar" aria-label="Sayfalar">
          {sayfaNo > 1
            ? <Link className="panel-secondary" href={adres({ sayfa: sayfaNo - 1 })}>← Önceki</Link>
            : <span className="panel-secondary is-disabled" aria-disabled="true">← Önceki</span>}
          <small>{sayfaNo} / {sonSayfa}{typeof suzgecSayisi === "number" ? ` · ${suzgecSayisi} bildirim` : ""}</small>
          {sayfaNo < sonSayfa
            ? <Link className="panel-secondary" href={adres({ sayfa: sayfaNo + 1 })}>Sonraki →</Link>
            : <span className="panel-secondary is-disabled" aria-disabled="true">Sonraki →</span>}
        </nav>
      ) : null}
      {groups.length ? null : (
        <div className="ntf-empty">
          <span className="ntf-icon" data-tone="neutral"><Icon name="bell" /></span>
          <h3>{yalnizOkunmamis ? "Okunmamış bildirim yok" : selectedFilter ? "Bu başlıkta bildirim yok" : "Henüz bildiriminiz yok"}</h3>
          <p>{yalnizOkunmamis ? "Hepsini okudunuz. Yeni bir iş, müşteri mesajı ya da duyuru gelince burada görünecek." : "Size bir iş atandığında, müşteri mesaj bıraktığında ya da duyuru geldiğinde burada görünecek."}</p>
        </div>
      )}
      </div>
    </section>

    {/* Anlık bildirim: kişinin ayarları ve cihazları (web push). */}
    <AnlikBildirimAyari genelAnahtar={pushYapilandi() ? pushGenelAnahtar() : null} />
    </div>
  </main>;
}
