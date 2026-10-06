import { getPanelContext } from "@/lib/panel-context";
import { assertModuleAccess } from "@/lib/role-permissions";
import { assertYetki } from "@/lib/yetkiler";

// Kapı sayfa düzeninde: /panel/posta altındaki her ekran buradan geçer.
// Yetki üç yerde (AGENTS.md) — burası sunucu katmanı, RLS tabloda,
// menüde gizleme app/panel/layout.tsx'te.
export default async function PostaLayout({ children }: { children: React.ReactNode }) {
  const { membership, hiddenModuleKeys, yetkiler } = await getPanelContext();
  assertModuleAccess(membership.role, "/panel/posta", hiddenModuleKeys);
  assertYetki(yetkiler, "posta.gor");
  return children;
}
