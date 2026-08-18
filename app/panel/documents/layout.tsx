import { getPanelContext } from "@/lib/panel-context";
import { assertModuleAccess } from "@/lib/role-permissions";

export default async function DocumentsLayout({ children }: { children: React.ReactNode }) {
  const { membership, hiddenModuleKeys } = await getPanelContext();
  assertModuleAccess(membership.role, "/panel/documents", hiddenModuleKeys);
  return children;
}
