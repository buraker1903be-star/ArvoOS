"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type PanelModule = {
  code: string;
  name: string;
  icon?: string | null;
};

type NavigationGroup = {
  key: string;
  label: string;
  icon: string;
  codes: string[];
};

const groups: NavigationGroup[] = [
  { key: "crm", label: "CRM", icon: "C", codes: ["crm", "requests", "sales", "proposals", "contracts"] },
  { key: "operations", label: "Operasyon", icon: "O", codes: ["operations", "tasks", "calendar", "workflows"] },
  { key: "finance", label: "Finans", icon: "F", codes: ["finance", "accounts", "banking", "billing", "payments", "e_invoice"] },
  { key: "hr", label: "İnsan Kaynakları", icon: "İK", codes: ["hr"] },
  { key: "documents", label: "Dokümanlar", icon: "D", codes: ["documents", "files", "templates"] },
  { key: "reports", label: "Raporlar", icon: "R", codes: ["reporting", "reports", "analytics"] },
  { key: "settings", label: "Ayarlar", icon: "A", codes: ["settings", "users", "roles", "integrations", "domains", "packages", "support"] },
];

const normalize = (value: string) => value.replaceAll("-", "_").toLowerCase();

export function PanelNavigation({ modules, isPlatformOwner }: { modules: PanelModule[]; isPlatformOwner: boolean }) {
  const pathname = usePathname();
  const assigned = new Set<string>();

  const resolved = groups.map((group) => {
    const items = modules.filter((module) => group.codes.includes(normalize(module.code)));
    items.forEach((item) => assigned.add(item.code));
    return { ...group, items };
  });

  const unmatched = modules.filter((module) => !assigned.has(module.code));
  if (unmatched.length) {
    const settings = resolved.find((group) => group.key === "settings");
    settings?.items.push(...unmatched);
  }

  return (
    <nav className="panel-nav panel-nav-v2" aria-label="Ana menü">
      <Link className={pathname === "/panel" ? "panel-nav-home active" : "panel-nav-home"} href="/panel">
        <i>⌂</i><span>Ana Sayfa</span>
      </Link>

      <div className="panel-nav-groups">
        {resolved.filter((group) => group.items.length > 0).map((group) => {
          const active = group.items.some((item) => pathname.startsWith(`/panel/${item.code}`));
          const first = group.items[0];

          if (group.items.length === 1) {
            return (
              <Link className={active ? "panel-nav-group-link active" : "panel-nav-group-link"} key={group.key} href={`/panel/${first.code}`}>
                <i>{group.icon}</i><span>{group.label}</span>
              </Link>
            );
          }

          return (
            <details className={active ? "panel-nav-group active" : "panel-nav-group"} key={group.key} open={active}>
              <summary><i>{group.icon}</i><span>{group.label}</span><em>{group.items.length}</em></summary>
              <div className="panel-nav-children">
                {group.items.map((item) => (
                  <Link className={pathname.startsWith(`/panel/${item.code}`) ? "active" : ""} href={`/panel/${item.code}`} key={item.code}>
                    <span>{item.name}</span>
                  </Link>
                ))}
              </div>
            </details>
          );
        })}
      </div>

      {isPlatformOwner ? (
        <Link className={pathname.startsWith("/panel/platform") ? "panel-nav-group-link owner-link active" : "panel-nav-group-link owner-link"} href="/panel/platform">
          <i>◇</i><span>Platform Yönetimi</span><b>OWNER</b>
        </Link>
      ) : null}
    </nav>
  );
}
