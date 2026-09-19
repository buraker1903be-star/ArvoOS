import { createAdminClient } from "@/lib/supabase/admin";
import { randevuBridgeAuthorized } from "@/lib/randevu-bridge-auth";
import { createRandevuPasswordToken, syncRandevuTenants } from "@/lib/randevu-bridge";
import { accessChangeError, canManageMembers, parseRandevuMemberRequest } from "@/lib/randevu-members";

// Randevu panelindeki "Kullanıcılar" bölümünün arka ucu.
//
// Salon yöneticisi Randevu'dan kullanıcı ekler, pasife alır ya da şifre
// bağlantısı ister; üyelik yine ArvoOS'ta yazılır ve köprü Randevu'ya
// aktarır (lib/randevu-bridge.ts). Randevu sunucusu bu uca sunucudan
// sunucuya çağırır; paylaşılan gizli anahtar RANDEVU_BRIDGE_SECRET (ArvoLab'ın
// PRODUCT_BRIDGE_SECRET'ından ayrı: biri sızarsa diğer ürün açılmasın).
//
// actorId'yi Randevu kendi oturumundan doğrular; burada o kişinin ArvoOS'ta
// bu kurumda sahip/yönetici olduğu ayrıca denetlenir.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/** E-postası verilen hesabı bulur, yoksa şifresiz açar (davet e-postası gitmez). */
async function findOrCreateUser(admin: Admin, email: string, fullName: string): Promise<string> {
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : {},
  });
  if (created.data.user) return created.data.user.id;
  if (!/already.*registered|already exists|email_exists/i.test(created.error?.message ?? "")) {
    throw new Error(`hesap açılamadı: ${created.error?.message ?? "bilinmeyen hata"}`);
  }
  // invite-team-member ile aynı yol: Auth API e-postayla arama sunmuyor.
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    const match = data.users.find((user) => (user.email ?? "").toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  throw new Error("bu e-posta kayıtlı görünüyor ama hesap bulunamadı");
}

/** Köprüyü çalıştırır; kullanıcı Randevu'ya geçmediyse nedenini döner. */
async function syncOrError(organizationId: string): Promise<string | null> {
  const result = await syncRandevuTenants(organizationId);
  if (result.status === "not_configured") return "Randevu köprüsü tanımlı değil";
  if (result.status === "failed" || result.errors.length) return result.errors[0] ?? "köprü başarısız";
  return null;
}

export async function POST(request: Request) {
  if (!randevuBridgeAuthorized(request)) return json(401, { error: "unauthorized" });
  const parsed = parseRandevuMemberRequest(await request.json().catch(() => null));
  if (!parsed.ok) return json(400, { error: parsed.error });
  const { action, actorId, organizationId, email, fullName, role, userId } = parsed.value;

  const admin = createAdminClient();
  if (!admin) return json(503, { error: "unavailable" });

  const [license, actor] = await Promise.all([
    admin.from("organization_product_licenses").select("status").eq("organization_id", organizationId).eq("product", "randevu").maybeSingle(),
    admin.from("organization_memberships").select("role,is_active").eq("organization_id", organizationId).eq("user_id", actorId).maybeSingle(),
  ]);
  if (!license.data) return json(404, { error: "no_license" });
  if (!actor.data?.is_active || !canManageMembers(actor.data.role)) return json(403, { error: "forbidden" });

  try {
    if (action === "list") {
      const { data: rows, error } = await admin.from("organization_memberships")
        .select("user_id,role,is_active,joined_at").eq("organization_id", organizationId).order("joined_at");
      if (error) throw new Error(error.message);
      const members = await Promise.all((rows ?? []).map(async (row) => {
        const { data } = await admin.auth.admin.getUserById(row.user_id);
        const metadata = (data.user?.user_metadata ?? {}) as { full_name?: string; name?: string };
        return {
          userId: row.user_id,
          email: data.user?.email ?? null,
          name: metadata.full_name ?? metadata.name ?? null,
          role: row.role,
          isActive: row.is_active,
        };
      }));
      return json(200, { members });
    }

    if (action === "add") {
      const newUserId = await findOrCreateUser(admin, email, fullName);
      const { data: existing } = await admin.from("organization_memberships")
        .select("is_active").eq("organization_id", organizationId).eq("user_id", newUserId).maybeSingle();
      // Mevcut üyeliğin rolü ezilmez (invite-team-member'daki gibi): bir
      // yönetici, sahibin e-postasını yazarak onu personele düşüremesin.
      if (existing) return json(409, { error: existing.is_active ? "already_member" : "inactive_member" });
      const { error } = await admin.from("organization_memberships")
        .insert({ organization_id: organizationId, user_id: newUserId, role, is_active: true });
      if (error) throw new Error(`üyelik yazılamadı: ${error.message}`);
      const syncError = await syncOrError(organizationId);
      if (syncError) return json(502, { error: "sync_failed", detail: syncError });
      return json(200, { userId: newUserId, tokenHash: await createRandevuPasswordToken(email) });
    }

    const { data: target } = await admin.from("organization_memberships")
      .select("user_id,role,is_active").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle();

    if (action === "link") {
      if (!target?.is_active) return json(404, { error: "not_member" });
      const { data } = await admin.auth.admin.getUserById(userId);
      if (!data.user?.email) return json(404, { error: "not_member" });
      // Hesap Randevu'ya henüz geçmemiş olabilir (10 dakikalık eşitleme).
      const syncError = await syncOrError(organizationId);
      if (syncError) return json(502, { error: "sync_failed", detail: syncError });
      return json(200, { userId, tokenHash: await createRandevuPasswordToken(data.user.email) });
    }

    const refused = accessChangeError(actorId, target ?? null);
    if (refused) return json(409, { error: refused });
    const { error } = await admin.from("organization_memberships")
      .update({ is_active: action === "activate" }).eq("organization_id", organizationId).eq("user_id", userId);
    if (error) throw new Error(`üyelik güncellenemedi: ${error.message}`);
    const syncError = await syncOrError(organizationId);
    if (syncError) return json(502, { error: "sync_failed", detail: syncError });
    return json(200, { ok: true });
  } catch (error) {
    console.error("[randevu] kullanıcı yönetimi", action, organizationId, error);
    return json(500, { error: "failed", detail: error instanceof Error ? error.message : String(error) });
  }
}
