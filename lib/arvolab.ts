import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// ArvoLab köprüsü.
//
// ArvoLab ayrı bir Supabase projesinde (zpfpocyajnxcketdjbxm). Lisans durumunu
// her istekte ArvoOS'a sormak yerine ArvoOS değişiklik oldukça ArvoLab'a yazar;
// ArvoLab kendi tablosundaki sütuna bakar. Böylece ArvoOS erişilemese bile
// ArvoLab son bilinen duruma göre çalışmaya devam eder.
//
// Kurum kimliği iki tarafta aynı: ArvoLab'ın organizations.id'si ArvoOS'un
// kurum kimliğiyle açılır, ayrı eşleşme tablosu yok. (ArvoLab'ta henüz kurum
// kaydı yoktu; bu yüzden eşleştirilecek geçmiş veri de yok.)

type ArvolabLicense = {
  organizationId: string;
  name: string;
  status: string;
  planCode: string | null;
  currentPeriodEnd: string | null;
};

export const arvolabConfigured = () =>
  Boolean(process.env.ARVOLAB_SUPABASE_URL && process.env.ARVOLAB_SUPABASE_SECRET_KEY);

export function arvolabClient() {
  const url = process.env.ARVOLAB_SUPABASE_URL;
  const key = process.env.ARVOLAB_SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Lisans durumunu ArvoLab'a yazar. Çağıran akışı (ödeme bildirimi, kurucu
 * ekranı) asla düşürmemeli: hata fırlatmaz, sonucu döndürür.
 */
export async function pushArvolabLicense(license: ArvolabLicense): Promise<"synced" | "not_configured" | "failed"> {
  const client = arvolabClient();
  if (!client) return "not_configured";
  const { error } = await client.from("organizations").upsert({
    id: license.organizationId,
    name: license.name,
    license_status: license.status,
    plan_code: license.planCode,
    current_period_end: license.currentPeriodEnd,
    synced_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) {
    console.error("[arvolab] lisans yansıtılamadı", license.organizationId, error.message);
    return "failed";
  }
  return "synced";
}

/**
 * Kurumun güncel ArvoLab lisansını okuyup yansıtır. Lisans satırı yoksa
 * "inactive" yazılır: ArvoLab tarafında erişim kapalı kalır.
 */
export async function syncArvolabLicense(organizationId: string) {
  const admin = createAdminClient();
  if (!admin) return "failed" as const;

  const [{ data: organization }, { data: license }] = await Promise.all([
    admin.from("organizations").select("name,display_name").eq("id", organizationId).maybeSingle(),
    admin.from("organization_product_licenses").select("status,plan_code,current_period_end")
      .eq("organization_id", organizationId).eq("product", "arvolab").maybeSingle(),
  ]);
  if (!organization) return "failed" as const;

  return pushArvolabLicense({
    organizationId,
    name: organization.display_name || organization.name,
    status: license?.status ?? "inactive",
    planCode: license?.plan_code ?? null,
    currentPeriodEnd: license?.current_period_end ?? null,
  });
}
