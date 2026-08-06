import { getPanelContext } from "@/lib/panel-context";
import { assertModuleAccess } from "@/lib/role-permissions";

export default async function BankingLayout({ children }: { children: React.ReactNode }) {
  const { membership } = await getPanelContext();
  assertModuleAccess(membership.role, "/panel/banking");
  return children;
}
