import type { SupabaseClient } from "@supabase/supabase-js";

/*
  Paylaşım kartındaki WhatsApp Web bağlantısının alıcısı.

  Liste sayfaları müşteri bilgisini adres parametrelerinden alıyor (bağlantı
  üretildikten sonra oraya yönlendiriliyor) ama telefon oraya BİLEREK
  taşınmıyor: kişisel veriyi URL'ye yazmak, adresi tarayıcı geçmişine,
  sunucu günlüğüne ve paylaşılan ekran görüntüsüne sokmak demek.

  Bunun yerine paylaşım anahtarından tek bir sorguyla okunuyor. Sorgu
  yalnızca kart görünürken çalışıyor, yani listenin normal yükü değişmiyor.
*/
export async function belgeAliciTelefonu(
  supabase: SupabaseClient,
  organizationId: string,
  kind: "proposal" | "contract",
  shareToken: string | undefined,
): Promise<string | null> {
  if (!shareToken) return null;

  const { data } = await supabase
    .from(kind === "proposal" ? "crm_proposals" : "crm_contracts")
    .select("crm_opportunities!inner(contact_phone)")
    .eq("organization_id", organizationId)
    .eq("share_token", shareToken.slice(0, 200))
    .maybeSingle();

  const musteri = Array.isArray(data?.crm_opportunities) ? data.crm_opportunities[0] : data?.crm_opportunities;
  return (musteri as { contact_phone?: string | null } | undefined)?.contact_phone ?? null;
}
