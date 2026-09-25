import { createAdminClient } from "@/lib/supabase/admin";
import { paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { saglayiciKaydi } from "@/lib/payments/kimlik";

// Kurumun PayTR bağlantı durumu (ayarlar ve finans ekranları için).
// "use server" dosyasında değil: tarayıcıdan çağrılabilir bir sunucu
// işlemi olmasın. Anahtarları hiç döndürmez; mağaza numarasının yalnızca
// son 4 hanesini verir.

export type PaytrStatus = {
  available: boolean;          // sunucu anahtarları (service role + şifreleme) tanımlı mı
  connected: boolean;          // kurum mağaza bilgilerini girmiş mi
  enabled: boolean;
  merchantId: string | null;   // mağaza numarası gizli değil (formda önceden dolu gelir)
  merchantHint: string | null; // "••••1234"
  lastTestPaymentAt: string | null;
  lastPaymentAt: string | null;
  updatedAt: string | null;
};

/** ArvoOS'un kendi kurumu: abonelik ödemeleri onun PayTR mağazasıyla alınır. */
export async function getPlatformOrganizationId(): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("organizations").select("id").eq("slug", "arvo-os").maybeSingle();
  return data?.id ?? null;
}

export async function getPaytrStatus(organizationId: string): Promise<PaytrStatus> {
  const admin = createAdminClient();
  const available = Boolean(admin) && paymentCredentialsConfigured();
  const empty: PaytrStatus = { available, connected: false, enabled: false, merchantId: null, merchantHint: null, lastTestPaymentAt: null, lastPaymentAt: null, updatedAt: null };
  if (!admin) return empty;
  // Kimlik bilgileri artık credentials_enc haritasında; okuma tek yerde
  // (lib/payments/kimlik.ts). Bu sarmalayıcı, PayTR'ye özel ekranlar
  // (Finans, Ödemeler) değişmesin diye duruyor.
  const kayit = await saglayiciKaydi(admin, organizationId, "paytr");
  if (!kayit) return empty;
  return {
    available,
    connected: true,
    enabled: kayit.enabled,
    merchantId: kayit.merchantId,
    merchantHint: `••••${kayit.merchantId.slice(-4)}`,
    lastTestPaymentAt: kayit.lastTestPaymentAt,
    lastPaymentAt: kayit.lastPaymentAt,
    updatedAt: kayit.updatedAt,
  };
}
