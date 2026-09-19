import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { arcOrganizationIds, planArcSync, type ArcSource, type Row } from "@/lib/arc-bridge-plan";

// ARC köprüsü.
//
// ARC kendi Supabase projesine taşınıyor (ArvoARC/AYRILMA.md). Mağazanın
// açık olup olmadığını, kademesini ve personel yetkisini ARC kendi
// veritabanındaki organizations / organization_memberships /
// organization_product_licenses / organization_modules kopyasından okur;
// kopyayı burası yazar. ArvoLab köprüsüyle aynı ilke (lib/arvolab.ts):
// ArvoOS erişilemese bile ARC son bilinen durumla çalışır.
//
// Kimlikler iki tarafta aynı (kurum id, kullanıcı id); eşleştirme tablosu yok.
// Yeni personel ARC'ta aynı uuid ile açılır, şifresiz: ilk girişte şifre
// belirler. Şifreler iki sistemde ayrı yaşar.
//
// Kim çağırır: lisans ve modül ekranı, üye yetkisi değişikliği, ödeme
// bildirimi (anında) ve /api/cron/arc-sync (10 dakikada bir, hepsi). Anında
// çağrı kaçarsa (ör. üyelik bir veritabanı tetikleyicisiyle değişti)
// zamanlanmış eşitleme yakalar.
//
// ARC_SUPABASE_URL tanımlı değilse hiçbir şey yapmaz: taşıma gününe kadar
// ARC eski ortak veritabanında, kopyaya gerek yok.

export type ArcSyncResult = {
  status: "synced" | "not_configured" | "failed";
  organizations: number;
  memberships: number;
  usersCreated: number;
  errors: string[];
};

export const arcConfigured = () =>
  Boolean(process.env.ARC_SUPABASE_URL && process.env.ARC_SUPABASE_SECRET_KEY);

function arcClient() {
  const url = process.env.ARC_SUPABASE_URL;
  const key = process.env.ARC_SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Client = NonNullable<ReturnType<typeof createAdminClient>>;

async function loadSource(admin: Client, organizationId?: string): Promise<ArcSource> {
  let licenses = admin.from("organization_product_licenses").select("*").eq("product", "arc");
  let modules = admin.from("organization_modules").select("*").eq("module_code", "commerce");
  if (organizationId) {
    licenses = licenses.eq("organization_id", organizationId);
    modules = modules.eq("organization_id", organizationId);
  }
  const [licenseResult, moduleResult] = await Promise.all([licenses, modules]);
  if (licenseResult.error) throw new Error("lisanslar okunamadı: " + licenseResult.error.message);
  if (moduleResult.error) throw new Error("modüller okunamadı: " + moduleResult.error.message);

  const ids = arcOrganizationIds({ licenses: licenseResult.data ?? [], modules: moduleResult.data ?? [] });
  if (!ids.length) return { organizations: [], memberships: [], licenses: licenseResult.data ?? [], modules: moduleResult.data ?? [] };

  const [organizations, memberships] = await Promise.all([
    admin.from("organizations").select("*").in("id", ids),
    admin.from("organization_memberships").select("*").in("organization_id", ids),
  ]);
  if (organizations.error) throw new Error("kurumlar okunamadı: " + organizations.error.message);
  if (memberships.error) throw new Error("üyelikler okunamadı: " + memberships.error.message);
  return {
    organizations: organizations.data ?? [],
    memberships: memberships.data ?? [],
    licenses: licenseResult.data ?? [],
    modules: moduleResult.data ?? [],
  };
}

/** ARC'ta hesabı olmayan kullanıcıyı aynı uuid ve e-postayla, şifresiz açar. */
async function ensureUser(admin: Client, arc: Client, userId: string): Promise<"exists" | "created"> {
  const existing = await arc.auth.admin.getUserById(userId);
  if (existing.data.user) return "exists";

  const source = await admin.auth.admin.getUserById(userId);
  const email = source.data.user?.email;
  if (!email) throw new Error(`kullanıcı ${userId}: ArvoOS'ta e-postası yok`);
  const created = await arc.auth.admin.createUser({
    id: userId,
    email,
    email_confirm: true,
    user_metadata: source.data.user?.user_metadata ?? {},
  });
  if (created.error) throw new Error(`kullanıcı ${userId}: ${created.error.message}`);
  return "created";
}

// ARC'ta ArvoOS kullanıcılarına bağlı "kim değiştirdi" sütunları: kullanıcı
// ARC'ta olmayabilir (kurucu ARC personeli değil), yabancı anahtar düşmesin.
const withoutActor = (rows: Row[]) => rows.map((row) => ({ ...row, updated_by: null }));

/**
 * ARC kurumlarını ARC veritabanına aktarır. `organizationId` verilirse yalnız
 * o kurum; verilmezse hepsi. Çağıranı düşürmez: hata fırlatmaz, sonucu döner.
 */
export async function syncArcTenants(organizationId?: string): Promise<ArcSyncResult> {
  const result: ArcSyncResult = { status: "synced", organizations: 0, memberships: 0, usersCreated: 0, errors: [] };
  const arc = arcClient();
  if (!arc) return { ...result, status: "not_configured" };
  const admin = createAdminClient();
  if (!admin) return { ...result, status: "failed", errors: ["ArvoOS servis anahtarı yok"] };

  try {
    const source = await loadSource(admin, organizationId);
    const ids = arcOrganizationIds(source);
    if (!ids.length) return result;

    const target = await arc.from("organization_memberships").select("organization_id,user_id").in("organization_id", ids);
    if (target.error) throw new Error("ARC üyelikleri okunamadı: " + target.error.message);
    const plan = planArcSync(source, target.data ?? []);

    // Sıra yabancı anahtarlara göre: kurum → hesap → üyelik.
    const organizations = await arc.from("organizations").upsert(plan.organizations, { onConflict: "id" });
    if (organizations.error) throw new Error("kurumlar yazılamadı: " + organizations.error.message);
    result.organizations = plan.organizations.length;

    if (plan.modules.length) {
      const { error } = await arc.from("organization_modules").upsert(plan.modules, { onConflict: "organization_id,module_code" });
      if (error) result.errors.push("modüller: " + error.message);
    }
    if (plan.licenses.length) {
      const { error } = await arc.from("organization_product_licenses").upsert(withoutActor(plan.licenses), { onConflict: "organization_id,product" });
      if (error) result.errors.push("lisanslar: " + error.message);
    }

    // Hesabı açılamayan kullanıcının üyeliği yazılmaz; diğerleri yazılır.
    const ready = new Set<string>();
    for (const userId of plan.userIds) {
      try {
        if ((await ensureUser(admin, arc, userId)) === "created") result.usersCreated += 1;
        ready.add(userId);
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    const memberships = plan.memberships.filter((m) => ready.has(String(m.user_id)));
    if (memberships.length) {
      const { error } = await arc.from("organization_memberships").upsert(memberships, { onConflict: "organization_id,user_id" });
      if (error) result.errors.push("üyelikler: " + error.message);
      else result.memberships = memberships.length;
    }
    for (const gone of plan.deactivate) {
      const { error } = await arc.from("organization_memberships").update({ is_active: false })
        .eq("organization_id", gone.organization_id).eq("user_id", gone.user_id);
      if (error) result.errors.push(`üyelik pasife alınamadı ${gone.user_id}: ${error.message}`);
    }
  } catch (error) {
    result.status = "failed";
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  if (result.errors.length) console.error("[arc] köprü", organizationId ?? "tümü", result.errors);
  return result;
}

/**
 * Tek kurum için anında aktarım; çağıran işlemi hiçbir koşulda düşürmez.
 * Başarısız olursa 10 dakikalık eşitleme tekrar dener.
 */
export async function syncArcTenantQuietly(organizationId: string) {
  if (!arcConfigured()) return;
  const result = await syncArcTenants(organizationId);
  if (result.status === "failed") console.error("[arc] anında aktarım başarısız; zamanlanmış eşitleme tekrar deneyecek", organizationId);
}

export interface ArcBridgeHealth {
  /** Bu dağıtımda görünen değişkenlerin adları (değerleri değil). */
  missing: string[];
  ok: boolean;
  /** ARC veritabanındaki kurum sayısı; bağlanılamadıysa null. */
  organizations: number | null;
  error: string | null;
}

/**
 * Köprünün durumu, Platform ekranı için. Köprü hata durumunda çağıranı
 * düşürmemek için sessiz kalıyor; bu yüzden "değişken bu dağıtıma ulaşmadı"
 * ile "bağlandı ama yazamadı" ayrımı ancak burada görünüyor. (18.09.2026:
 * değişkenler girildi, köprü hiçbir iz bırakmadan hiçbir şey yazmadı.)
 */
export async function getArcBridgeHealth(): Promise<ArcBridgeHealth> {
  const missing = ["ARC_SUPABASE_URL", "ARC_SUPABASE_SECRET_KEY"].filter((name) => !process.env[name]);
  const arc = arcClient();
  if (!arc) return { missing, ok: false, organizations: null, error: null };
  const { count, error } = await arc.from("organizations").select("id", { count: "exact", head: true });
  if (error) return { missing, ok: false, organizations: null, error: error.message || error.code || "bilinmeyen hata" };
  return { missing, ok: true, organizations: count ?? 0, error: null };
}
