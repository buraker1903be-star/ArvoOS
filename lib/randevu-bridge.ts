import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { planRandevuSync, randevuOrganizationIds, type RandevuSource } from "@/lib/randevu-bridge-plan";
import type { Row } from "@/lib/arc-bridge-plan";

// Randevu köprüsü.
//
// Arvo Randevu (kuaför/güzellik salonu) kendi Supabase projesinde
// (ArvoRandevu deposu). Lisansı ve tahsilatı ArvoOS'ta; salonun online
// randevu sayfasının açık olup olmadığını ve personelin panele girip
// giremeyeceğini Randevu kendi veritabanındaki organizations /
// organization_memberships / organization_product_licenses kopyasından
// okur (rdv_lisans_acik, rdv_uye_mi). Kopyayı burası yazar. ARC köprüsüyle
// (lib/arc-bridge.ts) aynı yapı; ARC'ınkine dokunmamak için ayrı dosya.
//
// Kimlikler iki tarafta aynı (kurum id, kullanıcı id). Yeni personel
// Randevu'da aynı uuid ve e-postayla, şifresiz açılır; ilk girişte şifre
// belirler (Randevu /sifre).
//
// Kim çağırır: lisans ekranı (randevu kaydında), PayTR ödeme bildirimi,
// havale onayı, üye yetkisi değişikliği (anında) ve /api/cron/randevu-sync
// (10 dakikada bir, hepsi).
//
// RANDEVU_SUPABASE_URL tanımlı değilse hiçbir şey yapmaz.

export type RandevuSyncResult = {
  /** "partial": bir kısmı yazıldı, bir kısmı yazılamadı (errors dolu). */
  status: "synced" | "partial" | "not_configured" | "failed";
  organizations: number;
  memberships: number;
  usersCreated: number;
  errors: string[];
};

export const randevuConfigured = () =>
  Boolean(process.env.RANDEVU_SUPABASE_URL && process.env.RANDEVU_SUPABASE_SECRET_KEY);

function randevuClient() {
  const url = process.env.RANDEVU_SUPABASE_URL;
  const key = process.env.RANDEVU_SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Client = NonNullable<ReturnType<typeof createAdminClient>>;

async function loadSource(admin: Client, organizationId?: string): Promise<RandevuSource> {
  let licenses = admin.from("organization_product_licenses").select("*").eq("product", "randevu");
  if (organizationId) licenses = licenses.eq("organization_id", organizationId);
  const licenseResult = await licenses;
  if (licenseResult.error) throw new Error("lisanslar okunamadı: " + licenseResult.error.message);

  const ids = randevuOrganizationIds(licenseResult.data ?? []);
  if (!ids.length) return { organizations: [], memberships: [], licenses: [] };

  const [organizations, memberships] = await Promise.all([
    admin.from("organizations").select("*").in("id", ids),
    admin.from("organization_memberships").select("*").in("organization_id", ids),
  ]);
  if (organizations.error) throw new Error("kurumlar okunamadı: " + organizations.error.message);
  if (memberships.error) throw new Error("üyelikler okunamadı: " + memberships.error.message);
  return { organizations: organizations.data ?? [], memberships: memberships.data ?? [], licenses: licenseResult.data ?? [] };
}

/** Randevu'da hesabı olmayan kullanıcıyı aynı uuid ve e-postayla, şifresiz açar. */
async function ensureUser(admin: Client, hedef: Client, userId: string): Promise<"exists" | "created"> {
  const existing = await hedef.auth.admin.getUserById(userId);
  if (existing.data.user) return "exists";
  const source = await admin.auth.admin.getUserById(userId);
  const email = source.data.user?.email;
  if (!email) throw new Error(`kullanıcı ${userId}: ArvoOS'ta e-postası yok`);
  const created = await hedef.auth.admin.createUser({
    id: userId,
    email,
    email_confirm: true,
    user_metadata: source.data.user?.user_metadata ?? {},
  });
  if (created.error) throw new Error(`kullanıcı ${userId}: ${created.error.message}`);
  return "created";
}

// "Kim değiştirdi" sütunu ArvoOS kullanıcısına bakıyor; kurucu Randevu'da
// olmayabilir. (Randevu'da bu sütunda yabancı anahtar yok; yine de tutarlı.)
const withoutActor = (rows: Row[]) => rows.map((row) => ({ ...row, updated_by: null }));

/**
 * Randevu salonlarını Randevu veritabanına aktarır. `organizationId`
 * verilirse yalnız o kurum. Hata fırlatmaz, sonucu döner.
 */
export async function syncRandevuTenants(organizationId?: string): Promise<RandevuSyncResult> {
  const result: RandevuSyncResult = { status: "synced", organizations: 0, memberships: 0, usersCreated: 0, errors: [] };
  const hedef = randevuClient();
  if (!hedef) return { ...result, status: "not_configured" };
  const admin = createAdminClient();
  if (!admin) return { ...result, status: "failed", errors: ["ArvoOS servis anahtarı yok"] };

  try {
    const source = await loadSource(admin, organizationId);
    const ids = randevuOrganizationIds(source.licenses);
    if (!ids.length) return result;

    const target = await hedef.from("organization_memberships").select("organization_id,user_id").in("organization_id", ids);
    if (target.error) throw new Error("Randevu üyelikleri okunamadı: " + target.error.message);
    const plan = planRandevuSync(source, target.data ?? []);

    // Sıra yabancı anahtarlara göre: kurum → lisans → hesap → üyelik.
    const organizations = await hedef.from("organizations").upsert(plan.organizations, { onConflict: "id" });
    if (organizations.error) throw new Error("kurumlar yazılamadı: " + organizations.error.message);
    result.organizations = plan.organizations.length;

    if (plan.licenses.length) {
      const { error } = await hedef.from("organization_product_licenses").upsert(withoutActor(plan.licenses), { onConflict: "organization_id,product" });
      if (error) result.errors.push("lisanslar: " + error.message);
    }

    const ready = new Set<string>();
    for (const userId of plan.userIds) {
      try {
        if ((await ensureUser(admin, hedef, userId)) === "created") result.usersCreated += 1;
        ready.add(userId);
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    const memberships = plan.memberships.filter((m) => ready.has(String(m.user_id)));
    if (memberships.length) {
      const { error } = await hedef.from("organization_memberships").upsert(memberships, { onConflict: "organization_id,user_id" });
      if (error) result.errors.push("üyelikler: " + error.message);
      else result.memberships = memberships.length;
    }
    for (const gone of plan.deactivate) {
      const { error } = await hedef.from("organization_memberships").update({ is_active: false })
        .eq("organization_id", gone.organization_id).eq("user_id", gone.user_id);
      if (error) result.errors.push(`üyelik pasife alınamadı ${gone.user_id}: ${error.message}`);
    }
  } catch (error) {
    result.status = "failed";
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  /*
    Kısmi hata "başarılı" sayılmaz. Eskiden yalnızca fırlatılan hata status'ü
    "failed" yapıyordu; bir kurumun lisansı ya da bir personelin üyeliği
    yazılamadığında sonuç "synced" dönüyor, sessiz aktarım hiç uyarmıyor ve
    zamanlanmış eşitleme HTTP 200 ile "sorun yok" bildiriyordu.
  */
  if (result.status === "synced" && result.errors.length) result.status = "partial";
  if (result.errors.length) console.error("[randevu] köprü", organizationId ?? "tümü", result.errors);
  return result;
}

/** Tek kurum için anında aktarım; çağıranı düşürmez. Kaçarsa 10 dakikalık eşitleme yakalar. */
export async function syncRandevuTenantQuietly(organizationId: string) {
  if (!randevuConfigured()) return;
  const result = await syncRandevuTenants(organizationId);
  if (result.status === "failed" || result.status === "partial")
    console.error(`[randevu] anında aktarım ${result.status === "partial" ? "eksik kaldı" : "başarısız"}; zamanlanmış eşitleme tekrar deneyecek`, organizationId, result.errors);
}

export interface RandevuBridgeHealth {
  missing: string[];
  ok: boolean;
  organizations: number | null;
  error: string | null;
}

/** Köprünün durumu, Platform ekranı için (bkz. getArcBridgeHealth). */
export async function getRandevuBridgeHealth(): Promise<RandevuBridgeHealth> {
  const missing = ["RANDEVU_SUPABASE_URL", "RANDEVU_SUPABASE_SECRET_KEY"].filter((name) => !process.env[name]);
  const hedef = randevuClient();
  if (!hedef) return { missing, ok: false, organizations: null, error: null };
  const { count, error, status } = await hedef.from("organizations").select("id", { count: "exact", head: true });
  if (error) {
    const neden = status === 401 || status === 403
      ? `anahtar reddedildi (HTTP ${status}); anahtar silinmiş ya da başka projeye ait`
      : error.message || error.code || `HTTP ${status}`;
    return { missing, ok: false, organizations: null, error: neden };
  }
  return { missing, ok: true, organizations: count ?? 0, error: null };
}

/**
 * Randevu'da şifre belirleme bağlantısının jetonu (kurtarma türünde, Supabase
 * varsayılanıyla 1 saat geçerli). Randevu projesinde e-posta servisi yok;
 * bağlantıyı salon yöneticisi kişiye WhatsApp ya da kendi e-postasıyla
 * iletir. Jeton saklanmaz, yalnızca çağırana döner.
 */
export async function createRandevuPasswordToken(email: string): Promise<string> {
  const hedef = randevuClient();
  if (!hedef) throw new Error("Randevu bağlantısı tanımlı değil");
  const { data, error } = await hedef.auth.admin.generateLink({ type: "recovery", email });
  const token = data?.properties?.hashed_token;
  if (error || !token) throw new Error(`şifre bağlantısı oluşturulamadı: ${error?.message ?? "jeton yok"}`);
  return token;
}
