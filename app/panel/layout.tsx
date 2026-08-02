import type { Metadata } from "next";
import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { logout } from "./actions";
import { PanelNavigation } from "./panel-navigation";
import "./panel.css";
import "./panel-ux.css";
import "./panel-page-system.css";

export const metadata: Metadata = {
  title: "ArvoOS | Yönetim Merkezi",
  description: "ArvoOS güvenli kurum ve platform çalışma alanı",
};

const roleNames: Record<string, string> = {
  owner: "Kurum Sahibi",
  admin: "Kurum Yöneticisi",
  manager: "Birim Yöneticisi",
  member: "Ekip Üyesi",
};

export default async function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { membership, organization, modules, isPlatformOwner } = await getPanelContext();
  const roleName = isPlatformOwner ? "Kurucu / Owner" : roleNames[membership.role] ?? "Kurum Kullanıcısı";

  return <div className="panel-root"><main className="panel-frame">
    <aside className="panel-sidebar">
      <Link className="panel-brand" href="/panel"><i>A</i><span><b>ArvoOS</b><small>BUSINESS OPERATING SYSTEM</small></span></Link>
      <div className="panel-org"><small>ÇALIŞMA ALANI</small><b>{organization.name}</b><span>{organization.plan_code} paket</span></div>
      <PanelNavigation modules={modules} isPlatformOwner={isPlatformOwner} />
      <div className="panel-sidebar-footer">
        <div className="panel-security"><i>✓</i><span><b>Güvenli oturum</b><small>Kurumsal veriler korunuyor</small></span></div>
        <form className="panel-logout" action={logout}><button type="submit">↪ <span>Çıkış yap</span></button></form>
      </div>
    </aside>
    <section className="panel-workspace">
      <header className="panel-topbar">
        <div className="panel-breadcrumb"><small>{isPlatformOwner ? "KURUCU MERKEZİ" : "KURUM PANELİ"}</small><b>{organization.name}</b></div>
        <div className="panel-top-actions"><button className="panel-icon-button" aria-label="Bildirimler">◌</button><div className="panel-user"><span>{organization.name[0]}</span><p><b>{roleName}</b><small>{organization.plan_code.toUpperCase()}</small></p></div></div>
      </header>
      <div className="panel-content">{children}</div>
    </section>
  </main></div>;
}
