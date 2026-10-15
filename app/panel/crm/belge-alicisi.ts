import type { SupabaseClient } from "@supabase/supabase-js";

/*
  Paylaşım kartındaki gönderim bağlantılarının alıcısı: WhatsApp için
  telefon, e-posta için adres.

  Liste sayfaları müşteri bilgisini adres parametrelerinden alıyor (bağlantı
  üretildikten sonra oraya yönlendiriliyor) ama iletişim bilgisi oraya
  BİLEREK taşınmıyor: kişisel veriyi URL'ye yazmak, adresi tarayıcı
  geçmişine, sunucu günlüğüne ve paylaşılan ekran görüntüsüne sokmak demek.

  Bunun yerine paylaşım anahtarından tek bir sorguyla okunuyor. Sorgu
  yalnızca kart görünürken çalışıyor, yani listenin normal yükü değişmiyor.

  E-POSTA DA BURAYA ALINDI (15.10.2026). Telefon buradan okunurken e-posta
  hâlâ adres parametresinden (`?customer_email=`) bekleniyordu — ve
  yönlendirme onu hiç eklemiyor. Sonuç: "E-posta ile gönder" bağlantısı
  `mailto:?subject=…` olarak üretiliyor, ALICI BOŞ geliyordu; teklifte
  müşterinin adresi kayıtlı olduğu hâlde personel her seferinde elle
  yazmak zorundaydı. Canlıda deneme kurumunda yakalandı. Aynı gerekçe
  e-posta için de geçerliydi zaten: adresi URL'ye yazmamalıyız.
*/
export type BelgeAlicisi = { telefon: string | null; eposta: string | null };

export async function belgeAlicisi(
  supabase: SupabaseClient,
  organizationId: string,
  kind: "proposal" | "contract",
  shareToken: string | undefined,
): Promise<BelgeAlicisi> {
  if (!shareToken) return { telefon: null, eposta: null };

  const { data } = await supabase
    .from(kind === "proposal" ? "crm_proposals" : "crm_contracts")
    .select("crm_opportunities!inner(contact_phone,contact_email)")
    .eq("organization_id", organizationId)
    .eq("share_token", shareToken.slice(0, 200))
    .maybeSingle();

  const musteri = Array.isArray(data?.crm_opportunities) ? data.crm_opportunities[0] : data?.crm_opportunities;
  const satir = musteri as { contact_phone?: string | null; contact_email?: string | null } | undefined;
  return { telefon: satir?.contact_phone ?? null, eposta: satir?.contact_email ?? null };
}
