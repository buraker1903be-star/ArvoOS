"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type PanelModule = { code: string; name: string; icon?: string | null };
type NavigationGroup = { key: string; label: string; icon: string; codes: string[] };

const groups: NavigationGroup[] = [
  { key: "crm", label: "CRM", icon: "C", codes: ["crm", "requests", "sales", "proposals", "contracts"] },
  { key: "operations", label: "Operasyon", icon: "O", codes: ["operations", "tasks", "calendar", "workflows"] },
  { key: "finance", label: "Finans", icon: "F", codes: ["finance", "accounts", "banking", "billing", "payments", "e_invoice"] },
  { key: "hr", label: "İnsan Kaynakları", icon: "İK", codes: ["hr"] },
  { key: "documents", label: "Dokümanlar", icon: "D", codes: ["documents", "files", "templates"] },
  { key: "reports", label: "Raporlar", icon: "R", codes: ["reporting", "reports", "analytics"] },
];

const normalize = (value: string) => value.replaceAll("-", "_").toLowerCase();

export function PanelNavigation({ modules, isPlatformOwner }: { modules: PanelModule[]; isPlatformOwner: boolean }) {
  const pathname = usePathname();
  const resolved = groups.map((group) => ({ ...group, items: modules.filter((module) => group.codes.includes(normalize(module.code))) }));

  return <nav className="panel-nav panel-nav-v2" aria-label="Ana menü">
    <Link className={pathname === "/panel" ? "panel-nav-home active" : "panel-nav-home"} href="/panel"><i>⌂</i><span>Ana Sayfa</span></Link>
    <div className="panel-nav-groups">
      {resolved.filter((group) => group.items.length > 0).map((group) => {
        if (group.key === "crm") {
          const active = pathname.startsWith("/panel/crm");
          return <Link className={active ? "panel-nav-group-link active" : "panel-nav-group-link"} key={group.key} href="/panel/crm"><i>{group.icon}</i><span>{group.label}</span></Link>;
        }
        if (group.key === "operations") {
          const active = pathname.startsWith("/panel/operations");
          return <Link className={active ? "panel-nav-group-link active" : "panel-nav-group-link"} key={group.key} href="/panel/operations"><i>{group.icon}</i><span>{group.label}</span></Link>;
        }
        if (group.key === "finance") {
          const visibleItems = group.items.filter((item) => !["accounts", "banking"].includes(normalize(item.code)));
          const active = pathname.startsWith("/panel/finance") || pathname.startsWith("/panel/accounts") || pathname.startsWith("/panel/banking") || visibleItems.some((item) => pathname.startsWith(`/panel/${item.code}`));
          if (visibleItems.length <= 1) {
            const only = visibleItems[0] ?? { code: "finance", name: group.label };
            return <Link className={active ? "panel-nav-group-link active" : "panel-nav-group-link"} key={group.key} href={`/panel/${only.code}`}><i>{group.icon}</i><span>{group.label}</span></Link>;
          }
          return <details className={active ? "panel-nav-group active" : "panel-nav-group"} key={group.key} open={active}>
            <summary><i>{group.icon}</i><span>{group.label}</span><em>{visibleItems.length}</em></summary>
            <div className="panel-nav-children">{visibleItems.map((item) => <Link className={pathname.startsWith(`/panel/${item.code}`) ? "active" : ""} href={`/panel/${item.code}`} key={item.code}><span>{item.name}</span></Link>)}</div>
          </details>;
        }
        const active = group.items.some((item) => pathname.startsWith(`/panel/${item.code}`));
        const first = group.items[0];
        if (group.items.length === 1) return <Link className={active ? "panel-nav-group-link active" : "panel-nav-group-link"} key={group.key} href={`/panel/${first.code}`}><i>{group.icon}</i><span>{group.label}</span></Link>;
        return <details className={active ? "panel-nav-group active" : "panel-nav-group"} key={group.key} open={active}>
          <summary><i>{group.icon}</i><span>{group.label}</span><em>{group.items.length}</em></summary>
          <div className="panel-nav-children">{group.items.map((item) => <Link className={pathname.startsWith(`/panel/${item.code}`) ? "active" : ""} href={`/panel/${item.code}`} key={item.code}><span>{item.name}</span></Link>)}</div>
        </details>;
      })}
    </div>
    <Link className={pathname.startsWith("/panel/settings") ? "panel-nav-group-link active" : "panel-nav-group-link"} href="/panel/settings"><i>A</i><span>Ayarlar</span></Link>
    {isPlatformOwner ? <Link className={pathname.startsWith("/panel/platform") ? "panel-nav-group-link owner-link active" : "panel-nav-group-link owner-link"} href="/panel/platform"><i>◇</i><span>Platform Yönetimi</span><b>OWNER</b></Link> : null}
  </nav>;
}
