"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  normalizeModuleCode,
  PanelModule,
  resolveGroupHref,
  resolveNavigationGroups,
} from "./panel-navigation-config";

export function PanelNavigation({ modules, isPlatformOwner, role, hiddenModuleKeys }: { modules: PanelModule[]; isPlatformOwner: boolean; role?: string; hiddenModuleKeys?: string[] }) {
  const pathname = usePathname();
  const resolved = resolveNavigationGroups(modules, role, new Set(hiddenModuleKeys ?? []));

  return <nav className="panel-nav panel-nav-v2" aria-label="Ana menü">
    <Link className={pathname === "/panel" ? "panel-nav-home active" : "panel-nav-home"} href="/panel" title="Ana Sayfa"><i>⌂</i><span>Ana Sayfa</span></Link>
    <div className="panel-nav-groups">
      {resolved.filter((group) => group.items.length > 0).map((group) => {
        const groupHref = resolveGroupHref(group);
        const active = pathname === groupHref || pathname.startsWith(`${groupHref}/`) || group.items.some((item) => pathname.startsWith(`/panel/${item.code}`));

        if (["crm", "operations"].includes(group.key)) {
          return <Link className={active ? "panel-nav-group-link active" : "panel-nav-group-link"} key={group.key} href={groupHref} title={group.label}><i>{group.icon}</i><span>{group.label}</span></Link>;
        }

        const visibleItems = group.key === "finance"
          ? group.items.filter((item) => !["accounts", "banking"].includes(normalizeModuleCode(item.code)))
          : group.items;

        // Grubun ana modülü (ör. finance, hr) genel bakış sayfasını açar
        // (resolveGroupHref → preferredHref). Eskiden tek öğeli gruplar
        // doğrudan /panel/<kod>'a gidiyor, Finans ve İK genel bakışı hiç açılmıyordu.
        const itemHref = (code: string) => (normalizeModuleCode(code) === group.key ? groupHref : `/panel/${code}`);

        if (visibleItems.length <= 1) {
          const href = visibleItems[0] ? itemHref(visibleItems[0].code) : groupHref;
          return <Link className={active ? "panel-nav-group-link active" : "panel-nav-group-link"} key={group.key} href={href} title={group.label}><i>{group.icon}</i><span>{group.label}</span></Link>;
        }

        return <details className={active ? "panel-nav-group active" : "panel-nav-group"} key={group.key} open={active}>
          <summary title={group.label}><i>{group.icon}</i><span>{group.label}</span><em>{visibleItems.length}</em></summary>
          <div className="panel-nav-children">
            {visibleItems.map((item) => <Link className={pathname.startsWith(`/panel/${item.code}`) ? "active" : ""} href={itemHref(item.code)} key={item.code}><span>{item.name}</span></Link>)}
          </div>
        </details>;
      })}
    </div>
    <Link className={pathname.startsWith("/panel/settings") ? "panel-nav-group-link active" : "panel-nav-group-link"} href="/panel/settings" title="Ayarlar"><i>A</i><span>Ayarlar</span></Link>
    {isPlatformOwner ? <Link className={pathname.startsWith("/panel/platform") ? "panel-nav-group-link owner-link active" : "panel-nav-group-link owner-link"} href="/panel/platform" title="Platform Yönetimi"><i>◇</i><span>Platform Yönetimi</span><b>OWNER</b></Link> : null}
  </nav>;
}
