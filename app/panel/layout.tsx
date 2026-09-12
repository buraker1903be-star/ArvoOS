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
import { cookies } from "next/headers";
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

export default async function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { supabase, userId, membership, organization, modules, isPlatformOwner, workspaces, hiddenModuleKeys } = await getPanelContext();
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
    <MobileDrawer modules={modules} organizationName={brandName} roleName={roleName} isPlatformOwner={isPlatformOwner} role={membership.role} brandName={brandName} brandLogoUrl={brandLogoUrl} brandTagline={brandTagline} hiddenModuleKeys={[...hiddenModuleKeys]} notificationUnreadCount={notificationUnreadCount??0} messageUnreadCount={messageUnreadCount} />
    <aside id="panel-sidebar" className="panel-sidebar">
      <Link className="panel-brand" href="/panel">{brandLogoUrl?<img src={brandLogoUrl} alt={brandName}/>:<i>{brandName.slice(0,1).toUpperCase()}</i>}<span><b>{brandName}</b><small>{brandTagline}</small></span></Link>
      <div className="panel-org panel-org-switchable">
        <WorkspaceSwitcher workspaces={workspaces} activeOrganizationId={organization.id} variant="card" />
      </div>
      <PanelNavigation modules={modules} isPlatformOwner={isPlatformOwner} role={membership.role} hiddenModuleKeys={[...hiddenModuleKeys]} />
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
            {messagesInit ? <MessagesDrawer init={messagesInit} /> : null}
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
