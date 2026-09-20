// Randevu panelinden kullanıcı yönetimi: isteğin saf denetimi.
// Uç: app/api/bridge/randevu/members/route.ts. Testi:
// tests/unit/randevu-members.test.ts.
//
// Salon yöneticisi kullanıcıyı Randevu panelinden ekler ama üyeliğin asıl
// kaydı ArvoOS'ta kalır: köprü (lib/randevu-bridge.ts) ArvoOS'ta olmayan
// üyeliği Randevu'da pasife alır, orada doğrudan yazılan üyelik 10 dakika
// içinde kapanırdı.

export const RANDEVU_MEMBER_ACTIONS = ["list", "add", "link", "deactivate", "activate"] as const;
export type RandevuMemberAction = (typeof RANDEVU_MEMBER_ACTIONS)[number];

/**
 * Randevu panelinden verilebilecek roller. Kurum Sahibi verilemez:
 * veritabanı (arvo_membership_owner_guard) sahipliği yalnızca bir sahibin
 * oturumuyla verir, bu uç ise servis rolüyle çalışır.
 */
export const RANDEVU_MEMBER_ROLES = ["admin", "member"] as const;

/** ArvoOS'ta ekip yönetimi yetkisi olan roller (hr/team-actions ile aynı). */
export const canManageMembers = (role: string | null | undefined) => role === "owner" || role === "admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RandevuMemberRequest = {
  action: RandevuMemberAction;
  actorId: string;
  organizationId: string;
  email: string;
  fullName: string;
  role: string;
  userId: string;
};

export function parseRandevuMemberRequest(body: unknown): { ok: true; value: RandevuMemberRequest } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const text = (key: string, max = 200) => String(b[key] ?? "").trim().slice(0, max);
  const action = text("action") as RandevuMemberAction;
  const value: RandevuMemberRequest = {
    action,
    actorId: text("actorId"),
    organizationId: text("organizationId"),
    email: text("email", 254).toLowerCase(),
    fullName: text("fullName", 120),
    role: text("role") || "member",
    userId: text("userId"),
  };
  if (!RANDEVU_MEMBER_ACTIONS.includes(action)) return { ok: false, error: "invalid_action" };
  if (!UUID.test(value.actorId) || !UUID.test(value.organizationId)) return { ok: false, error: "invalid_ids" };
  if (action === "add") {
    if (!EMAIL.test(value.email)) return { ok: false, error: "invalid_email" };
    if (!(RANDEVU_MEMBER_ROLES as readonly string[]).includes(value.role)) return { ok: false, error: "invalid_role" };
  }
  if (["link", "deactivate", "activate"].includes(action) && !UUID.test(value.userId)) return { ok: false, error: "invalid_user" };
  return { ok: true, value };
}

/**
 * Pasife alma/geri açma kuralı. Kurum Sahibi bu uçtan kapatılamaz (sahip
 * hiçbir zaman kısıtlanamaz; AGENTS.md) ve yönetici kendini kapatamaz,
 * yoksa salon panelinden kilitlenip dışarıda kalır.
 */
export function accessChangeError(actorId: string, target: { user_id: string; role: string } | null): string | null {
  if (!target) return "not_member";
  if (target.role === "owner") return "owner_protected";
  if (target.user_id === actorId) return "self";
  return null;
}

/**
 * Şifre belirleme bağlantısı verilebilir mi?
 *
 * Bağlantı, hesabın kontrolünü ele geçirmeye yeter. Salon yöneticisi başka
 * bir salonun (ya da ArvoOS müşterisinin) e-postasını yazarak o hesabın
 * bağlantısını alabiliyordu: kurbanın kendi panelini ele geçirmek için
 * yeterliydi. Artık yalnızca iki durumda verilir:
 *   - hesabı bu istekle biz açtıysak (kişinin başka yerde kullandığı bir
 *     hesap değildir), ya da
 *   - kişinin ArvoOS'taki tek aktif üyeliği bu kurumsa (zaten bu salonun
 *     kullanıcısı; yönetici onun erişimini yönetiyor).
 * ArvoOS'un ekip davetindeki kuralın aynısı (app/panel/hr/team-actions.ts).
 */
export function canIssuePasswordLink(input: {
  createdNow: boolean;
  memberships: { organization_id: string; is_active: boolean }[];
  organizationId: string;
}): boolean {
  if (input.createdNow) return true;
  return input.memberships
    .filter((m) => m.is_active)
    .every((m) => m.organization_id === input.organizationId);
}
