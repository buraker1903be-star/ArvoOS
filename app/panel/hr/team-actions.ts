"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

async function teamContext() {
  const context = await getPanelContext();
  if (!["owner", "admin"].includes(context.membership.role)) throw new Error("Ekip yönetimi için yönetici yetkisi gerekiyor.");
  return context;
}

export async function inviteTeamMember(formData: FormData) {
  const { supabase, membership } = await teamContext();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "member");
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Geçerli bir e-posta adresi girin.");
  if (!["owner", "admin", "manager", "member"].includes(role)) throw new Error("Geçersiz rol.");

  const requestHeaders = await headers();
  const redirectBase = requestHeaders.get("origin") ?? "https://app.arvo-os.com";

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (sessionError || !accessToken) throw new Error("Oturum doğrulanamadı, lütfen sayfayı yenileyip tekrar deneyin.");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !anonKey) throw new Error("Supabase yapılandırması eksik (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).");

  const response = await fetch(`${supabaseUrl}/functions/v1/invite-team-member`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ organizationId: membership.organization_id, email, role, fullName, redirectBase }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(result?.error || `Davet gönderilemedi (HTTP ${response.status}).`);
  }
  revalidatePath("/panel/hr");
}

export async function updateTeamMemberAccess(formData: FormData) {
  const { supabase, membership } = await teamContext();
  const userId = String(formData.get("user_id") ?? "").trim();
  const role = String(formData.get("role") ?? "member");
  const isActive = formData.get("is_active") === "on";
  if (!userId) throw new Error("Kullanıcı seçilmedi.");
  if (!["owner", "admin", "manager", "member"].includes(role)) throw new Error("Geçersiz rol.");

  const { error } = await supabase.from("organization_memberships")
    .update({ role, is_active: isActive })
    .eq("organization_id", membership.organization_id)
    .eq("user_id", userId);
  if (error) throw new Error("Kullanıcı güncellenemedi: " + error.message);
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
