"use server";

import { runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { PERMISSION_MODULES, PERMISSION_ROLES } from "@/lib/role-permissions";

async function updateModulePermissions__impl(formData: FormData) {
  const { supabase, membership, userId } = await getPanelContext();
  if (!["owner", "admin"].includes(membership.role)) {
    throw new Error("Yetkilendirme ayarlarını değiştirme yetkiniz yok.");
  }

  const rows = PERMISSION_ROLES.flatMap((role) =>
    PERMISSION_MODULES.map((module) => ({
      organization_id: membership.organization_id,
      role: role.key,
      module_key: module.key,
      can_access: formData.get(`perm:${role.key}:${module.key}`) === "on",
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }))
  );

  const { error } = await supabase
    .from("role_module_permissions")
    .upsert(rows, { onConflict: "organization_id,role,module_key" });
  if (error) throw new Error("Yetkilendirme kaydedilemedi: " + error.message);

  revalidatePath("/panel/settings/permissions");
  revalidatePath("/panel");
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function updateModulePermissions(...args: Parameters<typeof updateModulePermissions__impl>) {
  return runPanelAction(() => updateModulePermissions__impl(...args));
}
