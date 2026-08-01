import type { Metadata } from "next";
import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { logout } from "./actions";
import "./panel.css";

export const metadata: Metadata = {
  title: "ArvoOS | Yönetim Merkezi",
  description: "ArvoOS güvenli kurum ve platform çalışma alanı",
};

const roleNames: Record<string, string> = {
  owner: "Kurucu / Owner",
  admin: "Kurum Yöneticisi",
  manager: "Birim Yöneticisi",
  member: "Ekip Üyesi",
};

export default async function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { membership, organization, modules } = await getPanelContext();
  const isOwner = membership.role === "owner";

  return <div className="panel-root"><main className="panel-frame">
    <aside className="panel-sidebar">
      <Link className="panel-brand" href="/panel"><i>A</i><span><b>ArvoOS</b><small>BUSINESS OPERATING SYSTEM</small></span></Link>
      <div className="panel-org"><small>AKTİF ÇALIŞMA ALANI</small><b>{organization.name}</b><span>{organization.plan_code} paket</span></div>
      <nav className="panel-nav" aria-label="Ana menü">
        <small className="panel-nav-title">ÇALIŞMA ALANI</small>
        <Link href="/panel"><i>⌂</i><span>Genel Bakış</span></Link>
        {modules.map((module) => <Link key={module.code} href={"/panel/" + module.code}><i>{module.icon}</i><span>{module.name}</span></Link>)}
        {isOwner ? <><small className="panel-nav-title panel-nav-separator">YÖNETİM</small><Link className="owner-link" href="/panel/platform"><i>◇</i><span>Platform Yönetimi</span><em>OWNER</em></Link></> : null}
      </nav>
      <div className="panel-sidebar-footer">
        <div className="panel-security"><i>✓</i><span><b>Güvenli oturum</b><small>Kurumsal veriler korunuyor</small></span></div>
        <form className="panel-logout" action={logout}><button type="submit">↪ <span>Güvenli çıkış</span></button></form>
      </div>
    </aside>
    <section className="panel-workspace">
      <header className="panel-topbar">
        <div className="panel-breadcrumb"><small>ARVOOS / {isOwner ? "KURUCU MERKEZİ" : "KURUM PANELİ"}</small><b>{organization.name}</b></div>
        <div className="panel-top-actions"><button className="panel-icon-button" aria-label="Bildirimler">◌</button><div className="panel-user"><span>{organization.name[0]}</span><p><b>{roleNames[membership.role] ?? "Kurum Kullanıcısı"}</b><small>{organization.plan_code.toUpperCase()}</small></p></div></div>
      </header>
      <div className="panel-content">{children}</div>
    </section>
  </main></div>;
}
