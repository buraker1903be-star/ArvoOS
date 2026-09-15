import { isNavigationGroupHiddenForRole } from "@/lib/role-permissions";

export type PanelModule = {
  code: string;
  name: string;
  icon?: string | null;
};

export type NavigationGroup = {
  key: string;
  label: string;
  icon: string;
  codes: string[];
  preferredHref?: string;
};

export const navigationGroups: NavigationGroup[] = [
  // Modül menüsü genel bakış sekmesini açar (operasyonla aynı). Panelin
  // diğer bağlantıları (/panel/crm talepler, /panel/finance cari) değişmez.
  { key: "crm", label: "CRM", icon: "C", codes: ["crm", "requests", "sales", "proposals", "contracts"], preferredHref: "/panel/crm/genel-bakis" },
  { key: "operations", label: "Operasyon", icon: "O", codes: ["operations", "tasks", "calendar", "workflows"], preferredHref: "/panel/operations" },
  { key: "finance", label: "Finans", icon: "F", codes: ["finance", "accounts", "banking", "billing", "payments", "e_invoice"], preferredHref: "/panel/finance/genel-bakis" },
  { key: "hr", label: "İnsan Kaynakları", icon: "İK", codes: ["hr"], preferredHref: "/panel/hr/genel-bakis" },
  { key: "documents", label: "Dokümanlar", icon: "D", codes: ["documents", "files", "templates"] },
  // Raporlar ayrı menü değil: Finans → Raporlar sekmesi (/panel/finance/raporlar).
];

export const normalizeModuleCode = (value: string) => value.replaceAll("-", "_").toLowerCase();

export function resolveNavigationGroups(modules: PanelModule[], role?: string, hiddenModuleKeys?: ReadonlySet<string>) {
  return navigationGroups
    .filter((group) => !role || !isNavigationGroupHiddenForRole(role, group.key, hiddenModuleKeys ?? new Set()))
    .map((group) => ({
      ...group,
      items: modules.filter((module) => group.codes.includes(normalizeModuleCode(module.code))),
    }));
}

export function resolveGroupHref(group: ReturnType<typeof resolveNavigationGroups>[number]) {
  if (group.preferredHref && group.items.some((item) => normalizeModuleCode(item.code) === group.key)) {
    return group.preferredHref;
  }
  const first = group.items[0];
  return first ? `/panel/${first.code}` : group.preferredHref ?? "/panel";
}
