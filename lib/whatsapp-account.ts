import { encryptSecret, decryptSecret } from "@/lib/payment-credentials";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWhatsappNumber, whatsappInputError } from "@/lib/whatsapp-cloud";

/*
  Kurumun WhatsApp numarasını bağlama/doğrulama/kaldırma işinin ortak yeri.

  İki ekran aynı işi yapıyor: ArvoOS panelindeki Ayarlar → Entegrasyonlar ve
  Randevu panelindeki WhatsApp bölümü (köprü üzerinden). Mantığı iki yerde
  yazmak, birinde doğrulamayı unutup diğerinde unutmamak demekti.

  Yetki burada denetlenmez: çağıran taraf (panel işlemi ya da köprü ucu)
  kendi kimlik denetimini yapar. Burada yalnızca Meta doğrulaması ve
  şifreli yazma var.
*/

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export type AccountInput = {
  organizationId: string;
  wabaId: string;
  phoneNumberId: string;
  token: string;
  connectedBy?: string | null;
};

/** Meta'ya sorar, doğruysa şifreli yazar. Hata Türkçe cümle olarak fırlar. */
export async function saveWhatsappAccountRow(admin: Admin, input: AccountInput): Promise<void> {
  const bicimHatasi = whatsappInputError(input.phoneNumberId, input.wabaId, input.token);
  if (bicimHatasi) throw new Error(bicimHatasi);

  // Bağlarken doğruluyoruz: yoksa hata ancak ilk mesaj gönderilirken,
  // yani müşteriye mesaj gitmeyince anlaşılırdı.
  const kontrol = await verifyWhatsappNumber(input.phoneNumberId, input.token);
  if (!kontrol.ok) throw new Error(`Numara doğrulanamadı: ${kontrol.error}`);

  const now = new Date().toISOString();
  const { error } = await admin.from("whatsapp_accounts").upsert({
    organization_id: input.organizationId,
    waba_id: input.wabaId,
    phone_number_id: input.phoneNumberId,
    display_phone: kontrol.number.displayPhone,
    verified_name: kontrol.number.verifiedName,
    access_token_enc: encryptSecret(input.token),
    status: "connected",
    last_verified_at: now,
    last_error: null,
    connected_by: input.connectedBy ?? null,
    updated_at: now,
  }, { onConflict: "organization_id" });
  if (error) throw new Error(`WhatsApp bağlantısı kaydedilemedi: ${error.message}`);
}

/**
 * Anahtar değişmeden numaranın hâlâ çalıştığını sınar (Meta anahtarı iptal
 * etmiş olabilir). Sonuç ne olursa olsun kaydedilir; hata da döndürülür ki
 * ekran sebebini göstersin.
 */
export async function verifyWhatsappAccountRow(admin: Admin, organizationId: string): Promise<{ ok: boolean; error?: string }> {
  const { data } = await admin
    .from("whatsapp_accounts")
    .select("phone_number_id,access_token_enc")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) throw new Error("Bağlı bir WhatsApp numarası yok.");

  // Şifre çözme yalnızca burada; anahtar hiçbir yanıtta dönmez.
  const kontrol = await verifyWhatsappNumber(data.phone_number_id, decryptSecret(data.access_token_enc));
  const now = new Date().toISOString();
  const { error } = await admin.from("whatsapp_accounts").update(
    kontrol.ok
      ? {
          status: "connected",
          display_phone: kontrol.number.displayPhone,
          verified_name: kontrol.number.verifiedName,
          last_verified_at: now,
          last_error: null,
          updated_at: now,
        }
      : { status: "unverified", last_verified_at: now, last_error: kontrol.error, updated_at: now },
  ).eq("organization_id", organizationId);
  if (error) throw new Error(`Durum kaydedilemedi: ${error.message}`);
  return kontrol.ok ? { ok: true } : { ok: false, error: kontrol.error };
}

export async function removeWhatsappAccountRow(admin: Admin, organizationId: string): Promise<void> {
  const { error } = await admin.from("whatsapp_accounts").delete().eq("organization_id", organizationId);
  if (error) throw new Error(`Bağlantı kaldırılamadı: ${error.message}`);
}
