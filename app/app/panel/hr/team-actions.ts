"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

async function teamContext() {
  const context = await getPanelContext();
  if (!["owner", "admin"].includes(context.membership.role)) throw new Error("Ekip yönetimi için yönetici yetkisi gerekiyor.");
  return context;
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

  const { error } = await supabase.from("organization_memberships")
    .update({ role, is_active: isActive })
    .eq("organization_id", membership.organization_id)
    .eq("user_id", userId);
  if (error) throw new Error("Kullanıcı güncellenemedi: " + error.message);

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
