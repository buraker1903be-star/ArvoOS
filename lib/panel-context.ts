import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type PanelModule = { code: string; name: string; description: string };
export const panelModules: Record<string, PanelModule & { icon: string }> = {
  crm: { code: "crm", name: "Müşteri ve Satış", description: "Talep, teklif ve satış süreçleri", icon: "MS" },
  operations: { code: "operations", name: "Operasyon ve İş Akışları", description: "Görevler, terminler ve ilerleme", icon: "OP" },
  finance: { code: "finance", name: "Finans", description: "Gelir, gider ve tahsilat görünümü", icon: "FN" },
  reporting: { code: "reporting", name: "Raporlama", description: "Yetkiye bağlı kurum raporları", icon: "RP" },
  hr: { code: "hr", name: "Ekip ve İnsan Kaynakları", description: "Ekip ve organizasyon yönetimi", icon: "İK" },
  documents: { code: "documents", name: "Belgeler", description: "Kurumsal belge merkezi", icon: "BL" },
  support: { code: "support", name: "Destek Merkezi", description: "Destek talepleri ve çözüm takibi", icon: "DS" },
};

export const WORKSPACE_COOKIE = "arvo_workspace_v2";

type PanelOrganization = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan_code: string;
  sector: string;
  custom_domain: string | null;
  logo_url: string | null;
  brand_color: string | null;
  display_name: string | null;
};

type WorkspaceRpcRow = PanelOrganization & {
  organization_id: string;
  role: string;
};

export type PanelWorkspace = {
  organizationId: string;
  role: string;
  organization: PanelOrganization;
};

export const getPanelContext = cache(async () => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: rows, error } = await supabase.rpc("get_my_workspaces");
  if (error) throw new Error("Çalışma alanları okunamadı: " + error.message);

  const workspaces = ((rows ?? []) as WorkspaceRpcRow[]).map((row) => ({
    organizationId: row.organization_id,
    role: row.role,
    organization: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      plan_code: row.plan_code,
      sector: row.sector,
      custom_domain: row.custom_domain,
      logo_url: row.logo_url,
      brand_color: row.brand_color ?? null,
      display_name: row.display_name,
    },
  })) as PanelWorkspace[];

  if (!workspaces.length) redirect("/kurulum");

  const cookieStore = await cookies();
  const requestedOrganizationId = cookieStore.get(WORKSPACE_COOKIE)?.value;
  const selectedWorkspace = workspaces.find((item) => item.organizationId === requestedOrganizationId)
    ?? workspaces.find((item) => item.organization.slug === "akademikmerkez")
    ?? workspaces.find((item) => item.organization.slug === "arvo-os")
    ?? workspaces[0];

  const membership = {
    organization_id: selectedWorkspace.organizationId,
    role: selectedWorkspace.role,
  };
  const organization = selectedWorkspace.organization;

  const { data: moduleRows, error: moduleError } = await supabase.from("organization_modules")
    .select("module_code,arvo_modules(name,description,sort_order)")
    .eq("organization_id", membership.organization_id)
    .eq("is_enabled", true);
  if (moduleError) throw new Error("Modül yetkileri okunamadı.");

  const modules = (moduleRows ?? []).map((row) => {
    const relation = row.arvo_modules as { name?: string; description?: string; sort_order?: number } | { name?: string; description?: string; sort_order?: number }[] | null;
    const item = Array.isArray(relation) ? relation[0] : relation;
    const fallback = panelModules[row.module_code];
    return { code: row.module_code, name: fallback?.name ?? item?.name ?? row.module_code, description: fallback?.description ?? item?.description ?? "", sortOrder: item?.sort_order ?? 0, icon: fallback?.icon ?? "•" };
  }).sort((a, b) => a.sortOrder - b.sortOrder);

  const isPlatformOwner = membership.role === "owner" && organization.slug === "arvo-os";

  // Panelden ayarlanabilir, rol bazlı modül yetkilendirmesi. Kurum Sahibi
  // hiçbir zaman kısıtlanamaz; diğer roller için açıkça can_access=false
  // olarak işaretlenmiş modüller gizli kabul edilir.
  let hiddenModuleKeys = new Set<string>();
  if (membership.role !== "owner") {
    const { data: permissionRows } = await supabase
      .from("role_module_permissions")
      .select("module_key,can_access")
      .eq("organization_id", membership.organization_id)
      .eq("role", membership.role)
      .eq("can_access", false);
    hiddenModuleKeys = new Set((permissionRows ?? []).map((row) => row.module_key as string));
  }

  return { supabase, userId, membership, organization, modules, isPlatformOwner, workspaces, hiddenModuleKeys };
});
