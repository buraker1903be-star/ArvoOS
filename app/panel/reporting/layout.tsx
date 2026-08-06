import { getPanelContext } from "@/lib/panel-context";
import { assertModuleAccess } from "@/lib/role-permissions";

export default async function ReportingLayout({ children }: { children: React.ReactNode }) {
  const { membership } = await getPanelContext();
  assertModuleAccess(membership.role, "/panel/reporting");
  return children;
}
