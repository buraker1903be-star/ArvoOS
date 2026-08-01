import { cache } from "react";
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
};

type PanelOrganization = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan_code: string;
  sector: string;
  custom_domain: string | null;
};

export const getPanelContext = cache(async () => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");
  const { data: rows, error } = await supabase.from("organization_memberships")
    .select("organization_id,role,organizations(id,name,slug,status,plan_code,sector,custom_domain)")
    .eq("user_id", userId).eq("is_active", true).limit(1);
  if (error) throw new Error("Kurum üyeliği okunamadı.");
  const membership = rows?.[0] as { organization_id: string; role: string; organizations: PanelOrganization | PanelOrganization[] | null } | undefined;
  const organization = Array.isArray(membership?.organizations) ? membership.organizations[0] : membership?.organizations;
  if (!membership || !organization) redirect("/kurulum");
  const { data: moduleRows, error: moduleError } = await supabase.from("organization_modules")
    .select("module_code,arvo_modules(name,description,sort_order)")
    .eq("organization_id", membership.organization_id).eq("is_enabled", true);
  if (moduleError) throw new Error("Modül yetkileri okunamadı.");
  const modules = (moduleRows ?? []).map((row) => {
    const relation = row.arvo_modules as { name?: string; description?: string; sort_order?: number } | { name?: string; description?: string; sort_order?: number }[] | null;
    const item = Array.isArray(relation) ? relation[0] : relation;
    const fallback = panelModules[row.module_code];
    return { code: row.module_code, name: fallback?.name ?? item?.name ?? row.module_code, description: fallback?.description ?? item?.description ?? "", sortOrder: item?.sort_order ?? 0, icon: fallback?.icon ?? "•" };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
  const isPlatformOwner = membership.role === "owner" && organization.slug === "arvo-os";
  return { supabase, userId, membership, organization, modules, isPlatformOwner };
});
