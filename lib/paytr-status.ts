import { createAdminClient } from "@/lib/supabase/admin";
import { paymentCredentialsConfigured } from "@/lib/payment-credentials";

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
  const { data } = await admin
    .from("organization_payment_providers")
    .select("merchant_id,is_enabled,last_test_payment_at,last_payment_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("provider", "paytr")
    .maybeSingle();
  if (!data) return empty;
  return {
    available,
    connected: true,
    enabled: Boolean(data.is_enabled),
    merchantId: String(data.merchant_id),
    merchantHint: `••••${String(data.merchant_id).slice(-4)}`,
    lastTestPaymentAt: data.last_test_payment_at ?? null,
    lastPaymentAt: data.last_payment_at ?? null,
    updatedAt: data.updated_at ?? null,
  };
}
