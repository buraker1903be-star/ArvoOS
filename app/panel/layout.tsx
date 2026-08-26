import type { Metadata } from "next";
import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { logout } from "./actions";
import { PanelNavigation } from "./panel-navigation";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { ThemeToggle } from "./theme-toggle";
import { NavProgress } from "./nav-progress";
import { GlobalActionFeedback } from "./global-action-feedback";
import { MobileDrawer } from "./mobile-drawer";
import { PresenceHeartbeat } from "./presence-heartbeat";
import "./panel-tokens.css";
import "./panel.css";
import "./panel-ux.css";
import "./panel-page-system.css";
import "./panel-top-actions.css";
import "./sidebar-workspace-switcher.css";
import "./panel-mobile.css";
import "./mobile-drawer.css";

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
  const { membership, organization, modules, isPlatformOwner, workspaces, hiddenModuleKeys } = await getPanelContext();
  const roleName = isPlatformOwner ? "Kurucu / Owner" : roleNames[membership.role] ?? "Kurum Kullanıcısı";
  const hasMessages = modules.some((module) => module.code.replaceAll("-", "_").toLowerCase() === "messages");

  // Beyaz etiket (white-label) deneyimi: platformun kendi kurumu (arvo-os)
  // dışında, panel navigasyonu artık sabit "ArvoOS" markası yerine
  // kurumun kendi logosunu ve tabela unvanını gösteriyor.
  const isPlatformOrg = organization.slug === "arvo-os";
  const brandName = isPlatformOrg ? "ArvoOS" : (organization.display_name || organization.name);
  const brandLogoUrl = isPlatformOrg ? null : organization.logo_url;
  const brandTagline = isPlatformOrg ? "BUSINESS OPERATING SYSTEM" : "YÖNETİM PANELİ";

  return <div className="panel-root"><main className="panel-frame">
    <PresenceHeartbeat />
    <NavProgress />
    <GlobalActionFeedback />
    <MobileDrawer modules={modules} organizationName={organization.name} roleName={roleName} isPlatformOwner={isPlatformOwner} role={membership.role} brandName={brandName} brandLogoUrl={brandLogoUrl} brandTagline={brandTagline} hiddenModuleKeys={[...hiddenModuleKeys]} />
    <aside id="panel-sidebar" className="panel-sidebar">
      <Link className="panel-brand" href="/panel">{brandLogoUrl?<img src={brandLogoUrl} alt={brandName}/>:<i>{brandName.slice(0,1).toUpperCase()}</i>}<span><b>{brandName}</b><small>{brandTagline}</small></span></Link>
      <div className="panel-org panel-org-switchable">
        <WorkspaceSwitcher workspaces={workspaces} activeOrganizationId={organization.id} variant="card" />
      </div>
      <PanelNavigation modules={modules} isPlatformOwner={isPlatformOwner} role={membership.role} hiddenModuleKeys={[...hiddenModuleKeys]} />
      <div className="panel-sidebar-footer">
        <div className="panel-security"><i>✓</i><span><b>Güvenli oturum</b><small>Kurumsal veriler korunuyor</small></span></div>
        <form className="panel-logout" action={logout}><button type="submit">↪ <span>Çıkış yap</span></button></form>
      </div>
    </aside>
    <section className="panel-workspace">
      <header className="panel-topbar">
        <div className="panel-breadcrumb"><small>{isPlatformOwner ? "KURUCU MERKEZİ" : "KURUM PANELİ"}</small><b>{organization.name}</b></div>
        <div className="panel-top-actions">
          <div className="panel-quick-actions" aria-label="Hızlı erişim">
            {hasMessages ? <Link className="panel-quick-action" href="/panel/messages" aria-label="Mesajlar"><span className="panel-quick-icon" aria-hidden="true">◇</span><b>Mesajlar</b></Link> : null}
            <Link className="panel-quick-action" href="/panel/notifications" aria-label="Bildirimler"><span className="panel-quick-icon" aria-hidden="true">♢</span><b>Bildirimler</b></Link>
          </div>
          <ThemeToggle />
          <div className="panel-user"><span>{organization.name[0]}</span><p><b>{roleName}</b><small>{organization.plan_code.toUpperCase()}</small></p></div>
        </div>
      </header>
      <div className="panel-content">{children}</div>
    </section>
  </main></div>;
}
