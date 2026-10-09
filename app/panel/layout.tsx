import type { Metadata } from "next";
import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { tenantTheme } from "@/lib/tenant-theme";
import { logout } from "./actions";
import { PanelBreadcrumb } from "./panel-breadcrumb";
import { ThemeToggle } from "./theme-toggle";
import { NavProgress } from "./nav-progress";
import { GlobalActionFeedback } from "./global-action-feedback";
import { FlashToast } from "./flash-toast";
import { PresenceHeartbeat } from "./presence-heartbeat";
import { MessagesDrawer } from "./messages-drawer";
import { NotificationsDrawer } from "./notifications-drawer";
import { loadMessagesInit } from "./messages/load-messages";
import { SidebarToggle } from "./sidebar-toggle";
import { cookies, headers } from "next/headers";
import { hostFromHeaders, isManagementHost, MANAGEMENT_HOST } from "@/lib/site/host-rules";
import { KonsolNavigasyon } from "./konsol-navigasyon";
import { formatPersonName } from "@/lib/format-name";
import { osUygulamalari } from "./os/os-apps";
import { OsDock } from "./os/os-dock";
import { OsCanli, OsSaat, OsUygulamaAdi } from "./os/os-status";
import { OsAramaDugmesi, OsKomutPaleti } from "./os/os-command-palette";
import { OsKullaniciMenusu } from "./os/os-user-menu";
import { OsMenuKapat } from "./os/os-menu-kapat";
import { OsCanliSayfa } from "./os/os-canli-yenile";
import { CustomerLookupHost } from "./crm/customer-lookup";
import "./panel-tokens.css";
import "./panel.css";
import "./panel-ux.css";
import "./panel-page-system.css";
import "./panel-top-actions.css";
import "./sidebar-workspace-switcher.css";
import "./panel-mobile.css";
import "./panel-compact.css";
import "./panel-premium.css";
import "./panel-tables.css";
import "./panel-motion.css";
import "./os-shell.css";
import "./panel-ui.css";
import { postaDurumu } from "@/lib/posta-hesabi";
import { OsPostaDugmesi } from "./os/os-posta-dugmesi";
import { OsPostaUyarisi } from "./os/os-posta-uyarisi";

export const metadata: Metadata = {
  title: "ArvoOS | Yönetim Merkezi",
  description: "ArvoOS güvenli kurum ve platform çalışma alanı",
};

const roleNames: Record<string, string> = {
  owner: "Kurum Sahibi",
  admin: "Yönetici",
  manager: "Yönetici",
  member: "Satış Personeli",
  operasyoncu: "Operasyon Personeli",
};

/** Konsoldan müşteri paneline geçiş için; proxy'deki adresle aynı. */
const DEFAULT_APP_HOST = "app.arvo-os.com";

/** Çevrimiçi sayılmak için son görülme sınırı (PresenceHeartbeat dakikada bir yazar). */
const cevrimiciEsigi = () => new Date(Date.now() - 3 * 60_000).toISOString();

export default async function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { supabase, userId, membership, organization, modules, isPlatformOwner, workspaces, hiddenModuleKeys, izin, yetkiler } = await getPanelContext();

  /*
    Kurucu konsolu (yonetim.arvo-os.com) normal panel kabuğunu KULLANMAZ.

    Eskiden bu alan adında da müşteri menüsü (CRM, Operasyon, Finans…)
    çiziliyordu; hepsi uygulama alan adına sıçradığı için kurucu menüye
    her tıkladığında konsoldan çıkıyordu. Ayrıca çalışma alanı seçici,
    bildirim çekmecesi ve mesaj çekmecesi buraya ait değil: konsol tek bir
    kurumun paneli değil, platformun kendisi.
  */
  const konsolHostu = isManagementHost(hostFromHeaders(await headers()));

  /*
    Konsola yalnızca kurucu girebilir. Yetkisi olmayan biri giriş yaparsa
    normal paneli BURADA göstermiyoruz: bu alan adının tamamı platform
    yönetimi, müşteri paneli için uygulama alan adı var.
  */
  if (konsolHostu && !isPlatformOwner) {
    return <div className="panel-root"><main className="panel-frame konsol-red">
      <section>
        <h1>Bu adres kurucu yönetimi içindir</h1>
        <p>Hesabınızın platform yönetimine erişimi yok. Kendi panelinize aşağıdaki adresten girebilirsiniz.</p>
        <div className="panel-page-actions">
          <a className="panel-primary" href={`https://${DEFAULT_APP_HOST}/panel`}>ArvoOS paneline git</a>
          <form action={logout}><button className="panel-secondary" type="submit">Çıkış yap</button></form>
        </div>
      </section>
    </main></div>;
  }

  const roleName = isPlatformOwner ? "Kurucu / Owner" : roleNames[membership.role] ?? "Kurum Kullanıcısı";
  const hasMessages = modules.some((module) => module.code.replaceAll("-", "_").toLowerCase() === "messages");
  // Toplu bildirimlerde okundu bilgisi kişiye özel; kurum sayacı veritabanı
  // fonksiyonunda hesaplanıyor (arvo_unread_notification_count).
  const notificationQuery = isPlatformOwner
    ? supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).eq("audience", "founder")
    : supabase.rpc("arvo_unread_notification_count", { p_organization_id: membership.organization_id })
        .then(({ data }) => ({ count: Number(data ?? 0) }));
  // Beyaz etiket (white-label) deneyimi: platformun kendi kurumu (arvo-os)
  // dışında, panel navigasyonu artık sabit "ArvoOS" markası yerine
  // kurumun kendi logosunu ve tabela unvanını gösteriyor.
  const isPlatformOrg = organization.slug === "arvo-os";
  const brandName = organization.display_name || organization.name;
  const brandLogoUrl = isPlatformOrg ? null : organization.logo_url;
  const ownEmployeeQuery = supabase.from("hr_employees").select("id,full_name").eq("organization_id", membership.organization_id).eq("user_id", userId).maybeSingle();
  // Mesaj çekmecesi ve /panel/messages aynı yükleyiciyi kullanır; okunmamış
  // sayısı sunucuda hesaplanır (eskiden son 1000 mesaj tarayıcıya çekiliyordu).
  const messagesQuery = hasMessages ? loadMessagesInit(supabase, membership.organization_id, userId) : Promise.resolve(null);
  /*
    Bekleyen gizlilik sözleşmesi personel kaydı üzerinden TEK sorguda
    (hr_employees!inner): eskiden önce personel kaydı okunuyor, sonra onun
    kimliğiyle sözleşme aranıyordu — her sayfada fazladan bir tur.
  */
  const pendingAgreementQuery = supabase.from("hr_confidentiality_agreements").select("id,hr_employees!inner(user_id)")
    .eq("organization_id", membership.organization_id).eq("hr_employees.user_id", userId).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  /*
    YERLEŞİMİN SORGULARI TEK ADIMDA (2026-10). Eskiden altı ayrı aşamada,
    her biri bir öncekini bekleyerek çalışıyordu (bildirim+personel+mesaj →
    gizlilik → ürün lisansları → posta durumu → okunmamış posta → çevrimiçi
    ekip). Yerleşim her sayfanın kritik yolunda; birbirine bağlı olmayan
    sorguların sırayla beklenmesi her tıklamaya birkaç veritabanı turu
    ekliyordu. Okunmamış posta sayısı kutu bağlı olmasa da (yetkisi olana)
    okunuyor: sayım ucuz, beklemekten hızlı; bağlı değilse kullanılmıyor.
  */
  const postaYetkisi = !konsolHostu && izin("posta.gor");
  /*
    Okunmamış konuşma sayısı menüdeki rozette. Sayı KUTUNUN tamamı için,
    kişinin kendisine göre değil: kutu ortak, bir konuşmayı kim açarsa
    ekibin tamamı için okundu oluyor. Süzgeç yok — /panel/posta'nın
    varsayılan görünümü de süzgeçsiz; rozete basan kişi tam o sayıyı görsün.
  */
  const postaSayimSorgusu = postaYetkisi
    /* Çöptekiler sayılmıyor: silinen bir yazışmanın okunmamış rozeti
       kapatılamaz bir sayı bırakıyordu. */
    ? supabase.from("mail_threads").select("thread_id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).eq("okunmamis", true).is("silindi_at", null)
    : Promise.resolve({ count: 0 });
  const ucDakikaOnce = cevrimiciEsigi();
  const [
    { count: notificationUnreadCount },
    { data: ownEmployee },
    messagesInit,
    { data: pendingAgreement },
    { data: urunLisanslari },
    postaBilgisi,
    postaSayimi,
    { data: varlikSatirlari },
    { data: ekipSatirlari },
  ] = await Promise.all([
    notificationQuery,
    ownEmployeeQuery,
    messagesQuery,
    pendingAgreementQuery,
    konsolHostu
      ? Promise.resolve({ data: null })
      : supabase.from("organization_product_licenses")
          .select("product,status").eq("organization_id", membership.organization_id)
          .in("status", ["active", "trialing", "past_due"]),
    postaYetkisi ? postaDurumu(membership.organization_id) : Promise.resolve(null),
    postaSayimSorgusu,
    /* Çevrimiçi ekip (yalnızca uygulama kabuğunda): son 3 dakikada görülenler
       ve adları. Çalışan listesini görme yetkisi olmayan rolde RLS boş döner;
       avatarlar "Ekip üyesi" olur, kabuk bozulmaz. */
    konsolHostu
      ? Promise.resolve({ data: null })
      : supabase.from("user_presence").select("user_id,last_seen_at").eq("organization_id", membership.organization_id).gte("last_seen_at", ucDakikaOnce),
    konsolHostu
      ? Promise.resolve({ data: null })
      : supabase.from("hr_employees").select("user_id,full_name").eq("organization_id", membership.organization_id).not("user_id", "is", null).limit(300),
  ]);
  const messageUnreadCount = messagesInit ? Object.values(messagesInit.unread).reduce((total, count) => total + count, 0) : 0;

  /*
    Kurumun sahip olduğu diğer Arvo ürünleri menünün altında. Panelde
    bunların hiçbir izi yoktu: ArvoLab'ı da alan bir kurum ürüne nasıl
    gideceğini bilmiyordu — adresi bilen elle yazıyor, bilmeyen "bize
    ArvoLab verilmemiş" sanıyordu.

    Konsolda çizilmiyor: orada tek bir kurumun paneli açık değil.
  */
  const acikUrunler = new Set(((urunLisanslari ?? []) as { product: string }[]).map((satir) => satir.product));
  const lisansliUrunler = [
    /* ArvoLab kendi yolundan: tek kullanımlık oturum bağlantısıyla, ikinci
       bir giriş ekranı görmeden. Yeni sekmede — kişi ArvoOS'taki işini
       kaybetmesin. Kullanıcı tıklamasıyla açıldığı için yönlendirme
       zinciri pencere engelleyicisine takılmıyor. */
    { kod: "arvolab", ad: "ArvoLab", href: "/panel/uygulama/arvolab", ayniSekme: false, marka: "arvolab" as const },
    { kod: "arc", ad: "ArvoARC", href: "https://arc.arvo-os.com", ayniSekme: false, marka: "arc" as const },
    { kod: "randevu", ad: "Arvo Randevu", href: "https://randevu.arvo-os.com", ayniSekme: false },
  ].filter((uygulama) => acikUrunler.has(uygulama.kod));

  /*
    KURUCU KONSOLU (yonetim.arvo-os.com) uygulama ızgarasında, ama yalnızca
    oraya GERÇEKTEN girebilenlere. Koşul konsolun kendi kapısıyla birebir
    aynı: isPlatformOwner, yani Arvo'nun kendi kurumunda (arvo-os) owner
    rolü. Başkasına yetki vermek, o kişiyi arvo-os çalışma alanına owner
    olarak eklemek demek.

    Burası YETKİ VERMİYOR, yalnızca gösteriyor. Asıl kapı bu dosyanın
    yukarısında: konsol alan adına yetkisiz giren "Bu adres kurucu
    yönetimi içindir" ekranıyla karşılaşıyor. Menüde gizlemek üçüncü
    katman (AGENTS.md: RLS + sunucu + menü); tek başına koruma değil.

    Bağlantı yeni sekmede: konsol tek bir kurumun paneli değil, platformun
    kendisi — kurum panelindeki işin üstüne açılmamalı.
  */
  /*
    ORTAK POSTA KUTUSU MENÜDE, "UYGULAMALAR" PENCERESİNDE DEĞİL.

    Önce diğer ürünlerle aynı ızgaradaydı; ama o pencere ayrı ürünlere
    geçmek için ve ArvoOS'un kendi ekranı değil. Okunmamış sayısı da orada
    hiç işe yaramıyordu: rozetin bütün anlamı hiçbir şey açmadan görünmek,
    pencerenin içindeki rozeti görmek içinse pencereyi açmak gerekiyordu.

    Yalnızca kutu bağlıyken ve yetkisi olana görünür: bağlanacak bir şey
    yokken menüye boş bir girdi koymak, tıklayana "burada ne var" diye
    sordurup geri döndürürdü.
  */
  const postaGorunur = postaYetkisi && postaBilgisi?.durum === "bagli";

  // Okunmamış posta sayısı: sorgu ve gerekçesi yukarıda (postaSayimSorgusu).
  const postaOkunmamis = postaGorunur ? postaSayimi.count ?? 0 : 0;

  const digerUygulamalar = [
    ...lisansliUrunler,
    ...(isPlatformOwner
      ? [{ kod: "yonetim", ad: "Kurucu Konsolu", href: `https://${MANAGEMENT_HOST}/panel`, ayniSekme: false, marka: "yonetim" as const }]
      : []),
  ];

  // Beyaz etiket: kurum kendi marka rengini seçtiyse tüm panel vurgusu
  // (buton, aktif menü, rozet, odak halkası) o renge döner. Seçmediyse
  // panel-tokens.css içindeki fallback ArvoOS yeşilini kullanır.
  const tenantStyle = isPlatformOrg ? {} : tenantTheme(organization.brand_color);
  // Daraltılmış menü tercihi (sidebar-toggle.tsx yazar): ilk çizimde doğru genişlik.
  const navCollapsed = (await cookies()).get("arvo_nav")?.value === "collapsed";

  const agreementBanner = pendingAgreement
    ? <Link href={`/panel/confidentiality/${pendingAgreement.id}`} className="panel-agreement-banner"><span>Gizlilik sözleşmeniz imza bekliyor.</span><b>İncele ve İmzala →</b></Link>
    : null;

  /*
    ŞİRKET İŞLETİM SİSTEMİ KABUĞU (2026-10).

    Kenar menüsü + üst çubuk yerine: üstte durum çubuğu (kurum, açık
    uygulama, Ctrl+K araması, canlı bağlantı, çevrimiçi ekip, saat,
    mesajlar, bildirimler, hesap), altta uygulama dock'u. Her modül bir
    uygulama; liste os/os-apps.ts'te eski menünün yetki kuralıyla aynı.
    Kurucu konsolu aşağıdaki eski kabukta kalıyor: orası tek bir kurumun
    çalışma alanı değil.
  */
  if (!konsolHostu) {
    const uygulamalar = osUygulamalari({
      modules,
      role: membership.role,
      hiddenModuleKeys,
      posta: postaGorunur ? { okunmamis: postaOkunmamis } : null,
      mesajlar: messagesInit ? { okunmamis: messageUnreadCount } : null,
      erisim: { yetkiler, isPlatformOwner },
    });
    const varlik = Object.fromEntries(((varlikSatirlari ?? []) as { user_id: string; last_seen_at: string }[]).map((s) => [s.user_id, s.last_seen_at]));
    const ekip = ((ekipSatirlari ?? []) as { user_id: string; full_name: string | null }[])
      .map((s) => ({ userId: s.user_id, ad: formatPersonName(s.full_name) || "Ekip üyesi" }));
    const benimAdim = formatPersonName((ownEmployee as { full_name?: string | null } | null)?.full_name) || roleName;

    return <div className="panel-root os-root" style={tenantStyle}><main className="panel-frame os-frame">
      <PresenceHeartbeat />
      <NavProgress />
      <GlobalActionFeedback />
      <FlashToast />
      <header className="os-bar">
        <Link className="os-brand" href="/panel" aria-label={`${brandName} ana ekran`}>
          {brandLogoUrl ? <img src={brandLogoUrl} alt="" /> : <i aria-hidden="true">{brandName.slice(0, 1).toLocaleUpperCase("tr")}</i>}
          <span><b>{brandName}</b><OsUygulamaAdi uygulamalar={uygulamalar} /></span>
        </Link>
        <OsAramaDugmesi />
        <div className="os-bar-right">
          <OsCanli organizationId={membership.organization_id} benimId={userId} ekip={ekip} baslangic={varlik} />
          <OsSaat />
          <div className="os-bar-actions">
            {postaGorunur ? <OsPostaDugmesi okunmamis={postaOkunmamis} /> : null}
            {/* Yeni posta anlık uyarısı rozetin yanında doğuyor; kutusu
                üst çubuğun altına, sağa çıkıyor (os-shell.css). */}
            {postaGorunur ? <OsPostaUyarisi organizationId={membership.organization_id} /> : null}
            {messagesInit ? <MessagesDrawer init={messagesInit} /> : null}
            <NotificationsDrawer unreadCount={notificationUnreadCount ?? 0} />
            <ThemeToggle />
          </div>
          <OsMenuKapat />
          <OsKullaniciMenusu ad={benimAdim} rol={roleName} kurum={brandName} paket={organization.plan_code} workspaces={workspaces} aktifKurumId={organization.id} cikis={logout} />
        </div>
      </header>
      <section className="os-workspace">
        <div className="panel-content">{agreementBanner}{children}</div>
      </section>
      <OsDock uygulamalar={uygulamalar} digerUygulamalar={digerUygulamalar} />
      <OsKomutPaleti uygulamalar={uygulamalar} cikis={logout} />
      <OsCanliSayfa organizationId={membership.organization_id} />
      {/* Ctrl+K'daki müşteri araması bu pencereyi açar; yalnızca CRM'i görene. */}
      {uygulamalar.some((u) => u.key === "crm") ? <CustomerLookupHost /> : null}
    </main></div>;
  }

  /* Buradan sonrası yalnızca kurucu konsolu (yonetim.arvo-os.com): marka
     platformun, çalışma alanı seçici ve mesaj çekmecesi yok. */
  return <div className={navCollapsed ? "panel-root is-nav-collapsed" : "panel-root"} style={tenantStyle}><main className="panel-frame">
    <PresenceHeartbeat />
    <NavProgress />
    <GlobalActionFeedback />
    <FlashToast />
    <aside id="panel-sidebar" className="panel-sidebar">
      <Link className="panel-brand" href="/panel">
        <i>◇</i>
        <span><b>Kurucu Konsolu</b><small>PLATFORM YÖNETİMİ</small></span>
      </Link>
      <KonsolNavigasyon uygulamaAdresi={`https://${DEFAULT_APP_HOST}/panel`} />
      <div className="panel-sidebar-footer">
        <SidebarToggle initialCollapsed={navCollapsed} />
        <div className="panel-security"><i>✓</i><span><b>Güvenli oturum</b><small>Kurumsal veriler korunuyor</small></span></div>
        <form className="panel-logout" action={logout}><button type="submit">↪ <span>Çıkış yap</span></button></form>
      </div>
    </aside>
    <section className="panel-workspace">
      <header className="panel-topbar">
        <PanelBreadcrumb brandName={isPlatformOwner ? "Kurucu Merkezi" : brandName} />
        <div className="panel-top-actions">
          <div className="panel-quick-actions" aria-label="Hızlı erişim">
            <NotificationsDrawer unreadCount={notificationUnreadCount ?? 0} />
          </div>
          <ThemeToggle />
          <div className="panel-user"><span>{brandName[0]}</span><p><b>{roleName}</b><small>{organization.plan_code.toUpperCase()}</small></p></div>
        </div>
      </header>
      <div className="panel-content">{agreementBanner}{children}</div>
    </section>
  </main></div>;
}
