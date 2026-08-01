import type { Metadata } from "next";
import Link from "next/link";
import { getPanelContext } from "@/lib/panel-context";
import { logout } from "./actions";
import "./panel.css";

export const metadata: Metadata = { title: "ArvoOS Panel", description: "ArvoOS güvenli kurum çalışma alanı" };

export default async function PanelLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { membership, organization, modules } = await getPanelContext();
  return <div className="panel-root"><main className="panel-frame">
    <aside className="panel-sidebar">
      <Link className="panel-brand" href="/panel"><i>A</i><b>ArvoOS</b></Link>
      <nav className="panel-nav">
        <Link href="/panel"><i>GB</i><span>Genel Bakış</span></Link>
        {modules.map((module) => <Link key={module.code} href={"/panel/" + module.code}><i>{module.icon}</i><span>{module.name}</span></Link>)}
      </nav>
      <form className="panel-logout" action={logout}><button>↪ <span>Güvenli çıkış</span></button></form>
    </aside>
    <section className="panel-workspace">
      <header className="panel-topbar"><div><small>{organization.plan_code.toUpperCase()} PAKET</small><b>{organization.name}</b></div><div className="panel-user"><span>{organization.name[0]}</span><p><b>Kurum kullanıcısı</b><small>{membership.role}</small></p></div></header>
      <div className="panel-content">{children}</div>
    </section>
  </main></div>;
}