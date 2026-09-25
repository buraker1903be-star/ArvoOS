import type { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret } from "@/lib/payment-credentials";
import { isProviderCode, isProviderMode, kimlikTam, providerSpec, secretKeys, type ProviderCode, type ProviderMode } from "./saglayicilar";

// Kurumun ödeme sağlayıcısı kimlik bilgilerini okuyup yazan tek yer.
//
// "use server" DEĞİL: buradaki her export tarayıcıdan çağrılabilir bir uca
// dönüşmemeli. Sunucu eylemleri ve API yolları bunu içeriden çağırır.
//
// Sırlar organization_payment_providers.credentials_enc haritasında
// (alan adı → AES-256-GCM şifreli değer). Sütunlaşmış eski PayTR alanları
// (merchant_key_enc / merchant_salt_enc) bu sürümde ARTIK OKUNMUYOR;
// migration onları haritaya taşıdı ve bir sonraki sürümde düşecekler.

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export interface ProviderRecord {
  provider: ProviderCode;
  merchantId: string;
  mode: ProviderMode;
  enabled: boolean;
  /** Haritada kayıtlı alan adları; DEĞERLER değil. Ekrana bunlar gider. */
  storedKeys: string[];
  /** Sağlayıcının istediği bütün zorunlu alanlar kayıtlı mı */
  complete: boolean;
  lastTestPaymentAt: string | null;
  lastPaymentAt: string | null;
  updatedAt: string | null;
}

const SELECT = "provider,merchant_id,mode,is_enabled,credentials_enc,last_test_payment_at,last_payment_at,updated_at";

type Row = {
  provider: string;
  merchant_id: string;
  mode: string;
  is_enabled: boolean;
  credentials_enc: Record<string, string> | null;
  last_test_payment_at: string | null;
  last_payment_at: string | null;
  updated_at: string | null;
};

function toRecord(row: Row): ProviderRecord | null {
  if (!isProviderCode(row.provider)) return null;
  const harita = row.credentials_enc ?? {};
  // Yalnızca sağlayıcının TANIDIĞI alanlar sayılıyor: eski bir sağlayıcıdan
  // kalma artık anahtar "bağlı" izlenimi vermesin.
  const storedKeys = secretKeys(row.provider).filter((key) => typeof harita[key] === "string" && harita[key].length > 0);
  return {
    provider: row.provider,
    merchantId: row.merchant_id,
    mode: isProviderMode(row.mode) ? row.mode : "production",
    enabled: Boolean(row.is_enabled),
    storedKeys,
    complete: kimlikTam(row.provider, storedKeys),
    lastTestPaymentAt: row.last_test_payment_at,
    lastPaymentAt: row.last_payment_at,
    updatedAt: row.updated_at,
  };
}

/** Kurumun bütün sağlayıcı kayıtları (sır içermez). */
export async function kurumSaglayicilari(admin: Admin, organizationId: string): Promise<ProviderRecord[]> {
  const { data, error } = await admin.from("organization_payment_providers").select(SELECT).eq("organization_id", organizationId);
  if (error) {
    // Okunamayan tablo "sağlayıcı yok" sayılmıyor: çağıran tarafın
    // "kartla ödeme kapalı" demesi ile "bilemedik" arasındaki farkı
    // görebilmesi için hata yukarı çıkıyor.
    throw new Error("Ödeme sağlayıcıları okunamadı: " + error.message);
  }
  return (data ?? []).map((row) => toRecord(row as Row)).filter((row): row is ProviderRecord => row !== null);
}

export async function saglayiciKaydi(admin: Admin, organizationId: string, provider: ProviderCode): Promise<ProviderRecord | null> {
  const { data, error } = await admin.from("organization_payment_providers").select(SELECT)
    .eq("organization_id", organizationId).eq("provider", provider).maybeSingle();
  if (error) throw new Error("Ödeme sağlayıcısı okunamadı: " + error.message);
  return data ? toRecord(data as Row) : null;
}

/**
 * Sırları çözer. Eksik bir alan varsa HATA verir, boş metin döndürmez:
 * yarım kimlikle bankaya gidip "imza hatalı" almak, sorunun nerede
 * olduğunu günlerce gizler.
 */
export async function sirlariCoz(
  admin: Admin,
  organizationId: string,
  provider: ProviderCode,
  /*
    Kapalı sağlayıcı da çözülebilmeli.

    Bildirim (callback) yolu bunu KAPATMAMALI: bağlantı oluşturulduktan
    sonra sağlayıcı ayarlardan kapatılmış olabilir ama para çoktan
    hareket etmiştir. Kapalıyı reddetseydik bildirim 503 döner, sağlayıcı
    sonsuza kadar yeniden dener ve gerçek bir ödeme hiç kaydedilmezdi.
    "Kapalı" kuralı yalnızca YENİ tahsilat açan yollara ait.
  */
  { acikOlmali = true }: { acikOlmali?: boolean } = {},
): Promise<Record<string, string>> {
  const { data, error } = await admin.from("organization_payment_providers").select("credentials_enc,is_enabled")
    .eq("organization_id", organizationId).eq("provider", provider).maybeSingle();
  if (error) throw new Error("Ödeme sağlayıcısı okunamadı: " + error.message);
  const spec = providerSpec(provider);
  if (!data || !spec) throw new Error(`${providerSpec(provider)?.name ?? provider} bağlı değil.`);
  if (acikOlmali && !data.is_enabled) throw new Error(`${spec.name} bağlantısı kapalı. Ayarlar → Entegrasyonlar'dan açın.`);

  const harita = (data.credentials_enc ?? {}) as Record<string, string>;
  const cozulmus: Record<string, string> = {};
  for (const secret of spec.secrets) {
    const sifreli = harita[secret.key];
    if (!sifreli) {
      if (secret.required) throw new Error(`${spec.name} kimlik bilgisi eksik: ${secret.label}. Ayarlar'dan yeniden girin.`);
      continue;
    }
    cozulmus[secret.key] = decryptSecret(sifreli);
  }
  return cozulmus;
}

/**
 * Kimlik bilgilerini yazar. Boş bırakılan alan KORUNUR: sırlar ekranda hiç
 * gösterilmediği için kullanıcı yalnızca değiştirmek istediğini yazıyor;
 * boşu "sil" saymak, tek alanı güncelleyeni diğerlerini kaybettirirdi.
 */
export async function kimlikYaz(admin: Admin, input: {
  organizationId: string;
  provider: ProviderCode;
  merchantId: string;
  mode: ProviderMode;
  enabled: boolean;
  /** Yalnızca DEĞİŞTİRİLEN alanlar; boş/eksik olanlar mevcut değerini korur */
  secrets: Record<string, string>;
  actorId: string | null;
}): Promise<void> {
  const { data: existing, error: readError } = await admin.from("organization_payment_providers")
    .select("credentials_enc").eq("organization_id", input.organizationId).eq("provider", input.provider).maybeSingle();
  if (readError) throw new Error("Mevcut kimlik bilgileri okunamadı: " + readError.message);

  const harita: Record<string, string> = { ...((existing?.credentials_enc ?? {}) as Record<string, string>) };
  for (const key of secretKeys(input.provider)) {
    const value = (input.secrets[key] ?? "").trim();
    if (value) harita[key] = encryptSecret(value);
  }
  // Sağlayıcının tanımadığı artık anahtarlar temizleniyor; veritabanında
  // kime ait olduğu belirsiz bir sır kalmasın.
  for (const key of Object.keys(harita)) {
    if (!secretKeys(input.provider).includes(key)) delete harita[key];
  }

  const { error } = await admin.from("organization_payment_providers").upsert({
    organization_id: input.organizationId,
    provider: input.provider,
    merchant_id: input.merchantId,
    mode: input.mode,
    credentials_enc: harita,
    is_enabled: input.enabled,
    updated_by: input.actorId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,provider" });
  if (error) throw new Error("Ödeme bilgileri kaydedilemedi: " + error.message);
}

export async function kimlikSil(admin: Admin, organizationId: string, provider: ProviderCode): Promise<void> {
  const { error } = await admin.from("organization_payment_providers").delete()
    .eq("organization_id", organizationId).eq("provider", provider);
  if (error) throw new Error("Ödeme bağlantısı kaldırılamadı: " + error.message);
}

/**
 * PayTR'nin beklediği biçim; çağıranlar sırları elle dizmesin.
 *
 * `acikOlmali: false` yalnızca bildirim yolunda kullanılır (gerekçe
 * sirlariCoz'da).
 */
export async function paytrKimligi(admin: Admin, organizationId: string, opts: { acikOlmali?: boolean } = {}) {
  const [kayit, sirlar] = await Promise.all([
    saglayiciKaydi(admin, organizationId, "paytr"),
    sirlariCoz(admin, organizationId, "paytr", opts),
  ]);
  if (!kayit) throw new Error("PayTR bağlı değil.");
  return { merchantId: kayit.merchantId, merchantKey: sirlar.merchant_key, merchantSalt: sirlar.merchant_salt };
}
