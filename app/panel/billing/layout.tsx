import { getPanelContextErisimdenBagimsiz as getPanelContext } from "@/lib/panel-context";
import { assertModuleAccess } from "@/lib/role-permissions";

export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const { membership, hiddenModuleKeys } = await getPanelContext();
  assertModuleAccess(membership.role, "/panel/billing", hiddenModuleKeys);
  return children;
}
