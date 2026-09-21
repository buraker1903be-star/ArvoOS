import { createAdminClient } from "@/lib/supabase/admin";
import { paymentCredentialsConfigured } from "@/lib/payment-credentials";

/*
  Kurumun WhatsApp bağlantı durumu (Ayarlar → Entegrasyonlar).

  PayTR durumuyla aynı gerekçe: "use server" dosyasında değil, tarayıcıdan
  çağrılabilir bir sunucu işlemi olmasın. Erişim anahtarını hiç döndürmez;
  ekranda yalnızca Meta'dan okunan görünen numara ve işletme adı gösterilir.

  Şifreleme anahtarı PayTR ile ortak (PAYMENT_CREDENTIALS_KEY): iki sır da
  aynı yolla saklanıyor, ikinci bir anahtar yönetmeye gerek yok.
*/

export type WhatsappStatus = {
  /** Sunucu anahtarları (service role + şifreleme) tanımlı mı. */
  available: boolean;
  connected: boolean;
  status: "connected" | "unverified" | "disabled" | null;
  displayPhone: string | null;
  verifiedName: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

const bos = (available: boolean): WhatsappStatus => ({
  available, connected: false, status: null, displayPhone: null, verifiedName: null,
  wabaId: null, phoneNumberId: null, lastVerifiedAt: null, lastError: null, updatedAt: null,
});

export async function getWhatsappStatus(organizationId: string): Promise<WhatsappStatus> {
  const admin = createAdminClient();
  const available = Boolean(admin) && paymentCredentialsConfigured();
  if (!admin) return bos(available);

  const { data } = await admin
    .from("whatsapp_accounts")
    .select("waba_id,phone_number_id,display_phone,verified_name,status,last_verified_at,last_error,updated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) return bos(available);

  return {
    available,
    connected: true,
    status: data.status as WhatsappStatus["status"],
    displayPhone: data.display_phone ?? null,
    verifiedName: data.verified_name ?? null,
    wabaId: data.waba_id ?? null,
    phoneNumberId: data.phone_number_id ?? null,
    lastVerifiedAt: data.last_verified_at ?? null,
    lastError: data.last_error ?? null,
    updatedAt: data.updated_at ?? null,
  };
}
