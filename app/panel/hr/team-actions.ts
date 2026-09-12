"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { isManagementDepartmentName, MANAGEMENT_EMPLOYMENT_STATUSES } from "@/lib/management-department";
import { assertModuleKeyAccess } from "@/lib/role-permissions";

async function teamContext() {
  const context = await getPanelContext();
  if (!["owner", "admin"].includes(context.membership.role)) throw new Error("Ekip yönetimi için yönetici yetkisi gerekiyor.");
  assertModuleKeyAccess(context.membership.role, "hr", context.hiddenModuleKeys);
  return context;
}

// Çalışan Yönetici departmanında ve aktif/izinliyse rolü departmandan gelir
// (veritabanında arvo_sync_management_owner otomatik Kurum Sahibi yapar).
async function isManagementEmployee(
  supabase: Awaited<ReturnType<typeof getPanelContext>>["supabase"],
  organizationId: string,
  column: "id" | "user_id",
  value: string,
) {
  const { data: employees } = await supabase.from("hr_employees")
    .select("department_id,employment_status")
    .eq("organization_id", organizationId)
    .eq(column, value);
  const departmentIds = (employees ?? [])
    .filter((employee) => employee.department_id && MANAGEMENT_EMPLOYMENT_STATUSES.includes(employee.employment_status))
    .map((employee) => employee.department_id as string);
  if (!departmentIds.length) return false;
  const { data: departments } = await supabase.from("hr_departments")
    .select("name")
    .eq("organization_id", organizationId)
    .in("id", departmentIds);
  return (departments ?? []).some((department) => isManagementDepartmentName(department.name));
}

export type InviteTeamMemberState = { error: string | null; success: boolean };

// Supabase JS SDK'sı, Edge Function 2xx dışında bir kod döndürdüğünde
// "error" alanını genel bir sarmalayıcıyla dolduruyor ("Edge Function
// returned a non-2xx status code") — asıl gönderdiğimiz JSON mesajı
// error.context (ham Response nesnesi) içinde kalıyor, onu okumamız
// gerekiyor, yoksa gerçek sebep hiçbir zaman kullanıcıya ulaşmıyor.
async function extractFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = await context.clone().json();
      if (body?.error) return String(body.error);
    } catch {
      // response body wasn't JSON; fall through to fallback
    }
  }
  return (error as { message?: string })?.message || fallback;
}

export async function inviteTeamMember(
  _previousState: InviteTeamMemberState,
  formData: FormData,
): Promise<InviteTeamMemberState> {
  let membership;
  let supabase;
  try {
    ({ supabase, membership } = await teamContext());
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Yetki kontrolü başarısız.", success: false };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "member");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const employeeId = String(formData.get("employee_id") ?? "").trim() || undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Geçerli bir e-posta adresi girin.", success: false };
  if (!["owner", "admin", "manager", "member", "operasyoncu"].includes(role)) return { error: "Geçersiz rol.", success: false };
  // Davet edilen hesap Kurum Sahibi olacağı için (rolü doğrudan veya
  // Yönetici departmanı üzerinden) bu davetleri yalnızca Kurum Sahibi yapabilir.
  if (membership.role !== "owner") {
    if (role === "owner") return { error: "Kurum Sahibi rolüyle yalnızca bir Kurum Sahibi davet edebilir.", success: false };
    if (employeeId && await isManagementEmployee(supabase, membership.organization_id, "id", employeeId))
      return { error: "Yönetici departmanındaki çalışanlar Kurum Sahibi yetkisi alır; bu daveti yalnızca bir Kurum Sahibi gönderebilir.", success: false };
  }

  const requestHeaders = await headers();
  const redirectBase = requestHeaders.get("origin") ?? "https://app.arvo-os.com";

  const { data, error } = await supabase.functions.invoke("invite-team-member", {
    body: { organizationId: membership.organization_id, email, role, fullName, employeeId, redirectBase },
  });
  if (error || data?.error) {
    const message = data?.error || (await extractFunctionErrorMessage(error, "Davet gönderilemedi. En son hatayı 'organization_invitations' tablosundan kontrol edin."));
    return { error: message, success: false };
  }
  revalidatePath("/panel/hr");
  return { error: null, success: true };
}

export async function updateTeamMemberAccess(formData: FormData) {
  const { supabase, membership } = await teamContext();
  const userId = String(formData.get("user_id") ?? "").trim();
  const role = String(formData.get("role") ?? "member");
  const isActive = formData.get("is_active") === "on";
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!userId) throw new Error("Kullanıcı seçilmedi.");
  if (!["owner", "admin", "manager", "member", "operasyoncu"].includes(role)) throw new Error("Geçersiz rol.");

  const { data: target } = await supabase.from("organization_memberships")
    .select("role")
    .eq("organization_id", membership.organization_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!target) throw new Error("Kullanıcı bulunamadı.");
  // Eskiden bir Yönetici (admin) Kurum Sahibi'nin rolünü düşürebiliyor
  // veya hesabını pasife alabiliyordu.
  if ((target.role === "owner" || role === "owner") && membership.role !== "owner")
    throw new Error("Kurum Sahibi rolünü yalnızca bir Kurum Sahibi verebilir veya değiştirebilir.");
  if (role !== "owner" && await isManagementEmployee(supabase, membership.organization_id, "user_id", userId))
    throw new Error("Bu kişi Yönetici departmanında olduğu için Kurum Sahibi yetkisine sahip. Rolünü değiştirmek için önce departmanını değiştirin.");

  const { data: updated, error } = await supabase.from("organization_memberships")
    .update({ role, is_active: isActive })
    .eq("organization_id", membership.organization_id)
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw new Error("Kullanıcı güncellenemedi: " + error.message);
  if (!updated?.length) throw new Error("Kullanıcı güncellenemedi: yetkiniz yok veya kayıt bulunamadı.");

  if (fullName) {
    const { error: nameError } = await supabase.rpc("update_member_display_name", {
      p_organization_id: membership.organization_id,
      p_user_id: userId,
      p_full_name: fullName,
    });
    if (nameError) throw new Error("İsim güncellenemedi: " + nameError.message);
  }

  revalidatePath("/panel/hr");
}

export async function cancelInvitation(formData: FormData) {
  const { supabase, membership } = await teamContext();
  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  if (!invitationId) throw new Error("Davet seçilmedi.");
  const { error } = await supabase.from("organization_invitations")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("organization_id", membership.organization_id);
  if (error) throw new Error("Davet iptal edilemedi: " + error.message);
  revalidatePath("/panel/hr");
}
