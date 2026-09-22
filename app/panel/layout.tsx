import type { Metadata } from "next";
import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { tenantTheme } from "@/lib/tenant-theme";
import { logout } from "./actions";
import { PanelNavigation } from "./panel-navigation";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { PanelBreadcrumb } from "./panel-breadcrumb";
import { ThemeToggle } from "./theme-toggle";
import { NavProgress } from "./nav-progress";
import { GlobalActionFeedback } from "./global-action-feedback";
import { FlashToast } from "./flash-toast";
import { MobileDrawer } from "./mobile-drawer";
import { PresenceHeartbeat } from "./presence-heartbeat";
import { MessagesDrawer } from "./messages-drawer";
import { NotificationsDrawer } from "./notifications-drawer";
import { loadMessagesInit } from "./messages/load-messages";
import { SidebarToggle } from "./sidebar-toggle";
import { cookies, headers } from "next/headers";
import { hostFromHeaders, isManagementHost } from "@/lib/site/host-rules";
import { KonsolNavigasyon } from "./konsol-navigasyon";
import "./panel-tokens.css";
import "./panel.css";
import "./panel-ux.css";
import "./panel-page-system.css";
import "./panel-top-actions.css";
import "./sidebar-workspace-switcher.css";
import "./panel-mobile.css";
import "./mobile-drawer.css";
import "./panel-compact.css";
import "./panel-premium.css";
import "./panel-tables.css";
import "./panel-motion.css";

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

export default async function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { supabase, userId, membership, organization, modules, isPlatformOwner, workspaces, hiddenModuleKeys } = await getPanelContext();

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
  const brandTagline = isPlatformOrg ? "BUSINESS OPERATING SYSTEM" : "YÖNETİM PANELİ";
  const ownEmployeeQuery = supabase.from("hr_employees").select("id").eq("organization_id", membership.organization_id).eq("user_id", userId).maybeSingle();
  // Mesaj çekmecesi ve /panel/messages aynı yükleyiciyi kullanır; okunmamış
  // sayısı sunucuda hesaplanır (eskiden son 1000 mesaj tarayıcıya çekiliyordu).
  const messagesQuery = hasMessages ? loadMessagesInit(supabase, membership.organization_id, userId) : Promise.resolve(null);
  const [{ count: notificationUnreadCount }, { data: ownEmployee }, messagesInit] = await Promise.all([
    notificationQuery,
    ownEmployeeQuery,
    messagesQuery,
  ]);
  const pendingAgreementQuery = ownEmployee ? supabase.from("hr_confidentiality_agreements").select("id").eq("employee_id", ownEmployee.id).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null });
  const { data: pendingAgreement } = await pendingAgreementQuery;
  const messageUnreadCount = messagesInit ? Object.values(messagesInit.unread).reduce((total, count) => total + count, 0) : 0;

  /*
    Kurumun sahip olduğu diğer Arvo ürünleri menünün altında. Panelde
    bunların hiçbir izi yoktu: ArvoLab'ı da alan bir kurum ürüne nasıl
    gideceğini bilmiyordu — adresi bilen elle yazıyor, bilmeyen "bize
    ArvoLab verilmemiş" sanıyordu.

    Konsolda çizilmiyor: orada tek bir kurumun paneli açık değil.
  */
  const { data: urunLisanslari } = konsolHostu
    ? { data: null }
    : await supabase.from("organization_product_licenses")
        .select("product,status").eq("organization_id", membership.organization_id)
        .in("status", ["active", "trialing", "past_due"]);
  const acikUrunler = new Set(((urunLisanslari ?? []) as { product: string }[]).map((satir) => satir.product));
  const digerUygulamalar = [
    // ArvoLab kendi yolundan: tek kullanımlık oturum bağlantısıyla, ikinci
    // bir giriş ekranı görmeden. Aynı sekmede çünkü yönlendirme zinciri
    // yeni sekmede pencere engelleyicilere takılabiliyor.
    { kod: "arvolab", ad: "ArvoLab", href: "/panel/uygulama/arvolab", ayniSekme: true },
    { kod: "arc", ad: "Arc", href: "https://arc.arvo-os.com", ayniSekme: false },
    { kod: "randevu", ad: "Arvo Randevu", href: "https://randevu.arvo-os.com", ayniSekme: false },
  ].filter((uygulama) => acikUrunler.has(uygulama.kod));

  // Beyaz etiket: kurum kendi marka rengini seçtiyse tüm panel vurgusu
  // (buton, aktif menü, rozet, odak halkası) o renge döner. Seçmediyse
  // panel-tokens.css içindeki fallback ArvoOS yeşilini kullanır.
  const tenantStyle = isPlatformOrg ? {} : tenantTheme(organization.brand_color);
  // Daraltılmış menü tercihi (sidebar-toggle.tsx yazar): ilk çizimde doğru genişlik.
  const navCollapsed = (await cookies()).get("arvo_nav")?.value === "collapsed";

  return <div className={navCollapsed ? "panel-root is-nav-collapsed" : "panel-root"} style={tenantStyle}><main className="panel-frame">
    <PresenceHeartbeat />
    <NavProgress />
    <GlobalActionFeedback />
    <FlashToast />
    {konsolHostu ? null : <MobileDrawer modules={modules} organizationName={brandName} roleName={roleName} role={membership.role} brandName={brandName} brandLogoUrl={brandLogoUrl} brandTagline={brandTagline} hiddenModuleKeys={[...hiddenModuleKeys]} notificationUnreadCount={notificationUnreadCount??0} messageUnreadCount={messageUnreadCount} />}
    <aside id="panel-sidebar" className="panel-sidebar">
      {/* Konsolda marka kurumun değil platformun: burada tek bir kurumun
          paneli açılmıyor, hepsinin yönetimi açılıyor. */}
      <Link className="panel-brand" href="/panel">
        {konsolHostu || !brandLogoUrl ? <i>{konsolHostu ? "◇" : brandName.slice(0, 1).toUpperCase()}</i> : <img src={brandLogoUrl} alt={brandName} />}
        <span><b>{konsolHostu ? "Kurucu Konsolu" : brandName}</b><small>{konsolHostu ? "PLATFORM YÖNETİMİ" : brandTagline}</small></span>
      </Link>
      {/* Konsolda çalışma alanı seçici yok: bu alan adında çalışma alanı
          zorla Arvo'nun kendi kurumu (lib/panel-context.ts). */}
      {konsolHostu ? null : (
        <div className="panel-org panel-org-switchable">
          <WorkspaceSwitcher workspaces={workspaces} activeOrganizationId={organization.id} variant="card" />
        </div>
      )}
      {konsolHostu
        ? <KonsolNavigasyon uygulamaAdresi={`https://${DEFAULT_APP_HOST}/panel`} />
        : <PanelNavigation modules={modules} role={membership.role} hiddenModuleKeys={[...hiddenModuleKeys]} digerUygulamalar={digerUygulamalar} />}
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
            {/* Mesaj çekmecesi kurum içi yazışma; konsol tek bir kurumun
                paneli değil. Bildirimler kurucuya ait olduğu için kalıyor. */}
            {messagesInit && !konsolHostu ? <MessagesDrawer init={messagesInit} /> : null}
            <NotificationsDrawer unreadCount={notificationUnreadCount ?? 0} />
          </div>
          <ThemeToggle />
          <div className="panel-user"><span>{brandName[0]}</span><p><b>{roleName}</b><small>{organization.plan_code.toUpperCase()}</small></p></div>
        </div>
      </header>
      <div className="panel-content">{pendingAgreement?<Link href={`/panel/confidentiality/${pendingAgreement.id}`} className="panel-agreement-banner"><span>Gizlilik sözleşmeniz imza bekliyor.</span><b>İncele ve İmzala →</b></Link>:null}{children}</div>
    </section>
  </main></div>;
}
