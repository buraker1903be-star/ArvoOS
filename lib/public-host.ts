import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Müşteriye gönderilen bağlantıların hangi alan adını kullanacağı.
 *
 * Kurum kendi alan adını doğrulattıysa onu, doğrulatmadıysa platformun
 * ortak alan adını kullanırız. Doğrulanmamış bir alan adına bağlantı
 * üretmek müşteriye açılmayan bir link göndermek demek.
 *
 * Bu mantık teklif ve sözleşme sayfalarında dört kez kopyalanmıştı;
 * biri değişince diğerleri sessizce sapıyordu.
 */

export const PLATFORM_HOST = "app.arvo-os.com";

export async function resolvePublicHost(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string> {
  const { data } = await supabase
    .from("organizations")
    .select("custom_domain,custom_domain_status")
    .eq("id", organizationId)
    .maybeSingle();

  return data?.custom_domain_status === "verified" && data.custom_domain
    ? data.custom_domain
    : PLATFORM_HOST;
}
