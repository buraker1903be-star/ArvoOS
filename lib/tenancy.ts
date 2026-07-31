export const ARVOOS_PLANS = ["starter", "growth", "enterprise"] as const;
export const ARVOOS_MODULES = ["crm", "workflows", "finance", "hr", "reports", "integrations"] as const;

export type ArvoPlan = (typeof ARVOOS_PLANS)[number];
export type ArvoModule = (typeof ARVOOS_MODULES)[number];

export type TenantContext = {
  organizationId: string;
  slug: string;
  name: string;
  plan: ArvoPlan;
  modules: ArvoModule[];
  customDomain?: string;
  branding: { logoUrl?: string; primaryColor: string; accentColor: string };
};

export function hasModule(context: TenantContext, module: ArvoModule) {
  return context.modules.includes(module);
}

export function resolveTenantHost(host: string) {
  return host.trim().toLowerCase().split(":")[0];
}
