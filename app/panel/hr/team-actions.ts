"use server";

import { flashSuccess, runPanelAction } from "@/lib/panel-action";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { isManagementDepartmentName, MANAGEMENT_EMPLOYMENT_STATUSES } from "@/lib/management-department";
import { syncArcTenantQuietly } from "@/lib/arc-bridge";
import { syncRandevuTenantQuietly } from "@/lib/randevu-bridge";
import { syncArvolabMembers } from "@/lib/arvolab";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { davetEngeli } from "@/lib/kota-durumu";

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

  /*
    Kullanıcı kotası. user_limit yıllardır yazılıyor ve lisans ekranında
    yüzde çubuğuyla gösteriliyordu ama hiçbir yerde denetlenmiyordu:
    Başlangıç paketindeki bir kurum istediği kadar kullanıcı ekleyebiliyordu.

    Denetim burada, veritabanında değil: üyelikler auth.users üzerindeki bir
    tetikleyiciden yazılıyor, yani orada "bu yazma istemciden mi geliyor"
    ayrımı yapılamıyor ve konacak bir koruma kurucunun kendi davetlerini de
    keserdi. Davet ise tek bir kapıdan geçiyor — burası.

    Mevcut durumu kilitlemiyor: limiti zaten aşmış kurum çalışmaya devam
    eder, yalnızca YENİ davet duraklar.
  */
  const [{ count: aktifKullanici }, { data: lisans }] = await Promise.all([
    supabase.from("organization_memberships").select("user_id", { count: "exact", head: true })
      .eq("organization_id", membership.organization_id).eq("is_active", true),
    supabase.from("organization_licenses").select("user_limit")
      .eq("organization_id", membership.organization_id).maybeSingle(),
  ]);
  const engel = davetEngeli(aktifKullanici ?? 0, lisans?.user_limit ?? null);
  if (engel) return { error: engel, success: false };

  const requestHeaders = await headers();
  const redirectBase = requestHeaders.get("origin") ?? "https://app.arvo-os.com";

  const { data, error } = await supabase.functions.invoke("invite-team-member", {
    body: { organizationId: membership.organization_id, email, role, fullName, employeeId, redirectBase },
  });
  if (error || data?.error) {
    const message = data?.error || (await extractFunctionErrorMessage(error, "Davet gönderilemedi. En son hatayı 'organization_invitations' tablosundan kontrol edin."));
    return { error: message, success: false };
  }
  await flashSuccess("Davet gönderildi");
  revalidatePath("/panel/hr");
  return { error: null, success: true };
}

export type TeamInviteLinkState = { error: string | null; link: string | null; email: string | null };

// Davet e-postası ulaşmadığında yönetici tek kullanımlık bağlantıyı WhatsApp
// ya da kendi e-postasıyla gönderir. Bağlantı saklanmaz, yalnızca ekranda
// gösterilir; kişi açınca e-postası doğrulanır ve mevcut tetikleyici
// (activate_organization_owner_invitation) daveti kabul eder.
export async function createTeamInviteLink(_previous: TeamInviteLinkState, formData: FormData): Promise<TeamInviteLinkState> {
  const empty: TeamInviteLinkState = { error: null, link: null, email: null };
  let context;
  try {
    context = await teamContext();
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : "Yetki kontrolü başarısız." };
  }
  const { supabase, membership } = context;

  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  if (!invitationId) return { ...empty, error: "Davet seçilmedi." };

  const { data: invitation } = await supabase.from("organization_invitations")
    .select("id,email,role,status,auth_user_id,expires_at")
    .eq("id", invitationId)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (!invitation) return { ...empty, error: "Davet bulunamadı." };
  if (!["pending", "sent"].includes(invitation.status) || Date.parse(invitation.expires_at) <= Date.now()) {
    return { ...empty, error: "Bu davet artık geçerli değil. Personel kartından yeniden davet gönderin." };
  }
  if (invitation.role === "owner" && membership.role !== "owner") {
    return { ...empty, error: "Kurum Sahibi davetinin bağlantısını yalnızca bir Kurum Sahibi oluşturabilir." };
  }
  if (!invitation.auth_user_id) {
    return { ...empty, error: "Davet henüz tamamlanmamış görünüyor. Daveti iptal edip yeniden gönderin." };
  }

  const admin = createAdminClient();
  if (!admin) return { ...empty, error: "Sunucu anahtarı tanımlı olmadığı için bağlantı oluşturulamadı." };

  // Yalnızca davet bağlantısı üretilir. Hesap zaten açılmışsa şifre yenileme
  // bağlantısına DÜŞÜLMEZ: aksi halde bir kurum yöneticisi, başka bir kurumda
  // da kullanılan mevcut bir hesaba giriş bağlantısı alabilirdi.
  const origin = (await headers()).get("origin") ?? "https://app.arvo-os.com";
  const generated = await admin.auth.admin.generateLink({
    type: "invite",
    email: invitation.email,
    options: { redirectTo: `${origin}/auth/callback?next=/panel` },
  });
  const hashedToken = generated.data?.properties?.hashed_token;
  if (generated.error || !hashedToken) {
    const exists = /already|registered|exists/i.test(generated.error?.message ?? "");
    return {
      ...empty,
      error: exists
        ? "Bu kişinin hesabı zaten açılmış. Mevcut şifresiyle giriş yapabilir; şifresini unuttuysa giriş ekranındaki “Şifremi unuttum” bağlantısını kullanabilir."
        : `Giriş bağlantısı oluşturulamadı: ${generated.error?.message ?? "bilinmeyen hata"}`,
    };
  }
  // Bağlantı, davet sırasında oluşturulan hesaba ait olmalı.
  if (generated.data.user?.id !== invitation.auth_user_id) {
    return { ...empty, error: "Bağlantı davet edilen hesapla eşleşmedi; güvenlik nedeniyle oluşturulmadı. Daveti iptal edip yeniden gönderin." };
  }

  const link = `${origin}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=invite&next=${encodeURIComponent("/panel")}`;
  return { error: null, link, email: invitation.email };
}

async function updateTeamMemberAccess__impl(formData: FormData) {
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
  // Pasife alınan personel ARC'a, Randevu'ya ve ArvoLab'a da hemen
  // giremesin (lib/arc-bridge.ts, lib/randevu-bridge.ts, lib/arvolab.ts).
  // ArvoLab'da bağlanmış profil bağlı kalır; tazelenen şey, HENÜZ girmemiş
  // kişinin ilk girişte kuruma bağlanıp bağlanmayacağı.
  await Promise.all([
    syncArcTenantQuietly(membership.organization_id),
    syncRandevuTenantQuietly(membership.organization_id),
    syncArvolabMembers(membership.organization_id),
  ]);

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

async function cancelInvitation__impl(formData: FormData) {
  const { supabase, membership } = await teamContext();
  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  if (!invitationId) throw new Error("Davet seçilmedi.");
  // RLS elerse hata değil 0 satır döner; doğrulanmazsa davet listede
  // "gönderildi" kalır ama kullanıcı iptal ettiğini sanır. Aynı dosyadaki
  // updateMember bu doğrulamayı zaten yapıyor.
  const { data: cancelled, error } = await supabase.from("organization_invitations")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("organization_id", membership.organization_id)
    .select("id");
  if (error) throw new Error("Davet iptal edilemedi: " + error.message);
  if (!cancelled?.length) throw new Error("Davet iptal edilemedi: kayıt bulunamadı veya yetkiniz yok.");
  revalidatePath("/panel/hr");
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function updateTeamMemberAccess(...args: Parameters<typeof updateTeamMemberAccess__impl>) {
  return runPanelAction(() => updateTeamMemberAccess__impl(...args));
}
export async function cancelInvitation(...args: Parameters<typeof cancelInvitation__impl>) {
  return runPanelAction(() => cancelInvitation__impl(...args));
}
