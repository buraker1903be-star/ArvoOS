import type { SupabaseClient } from "@supabase/supabase-js";

/*
  İletişim kartının ortak yardımcıları (iş, talep, teklif, sözleşme
  detayı). Dört sayfa aynı kısa zamanı ve aynı yorum özetini gösteriyor;
  ayrı yazılsaydı biri başka bir biçim ya da sayı gösterirdi. Sunucuda
  çalışır (Intl, Türkiye saati). Önceki sağdan açılan yazışma çekmecesi
  (akis-cekmecesi) 03.11.2026'da ortada açılan pencerelere bırakıldı.
*/

/* Özet satırında yıl yer kaplıyor ve dar sütunda saati alt satıra itiyordu; tam tarih pencerede. */
const KISA_ZAMAN = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const ozetZamani = (deger?: string | null) => (deger ? KISA_ZAMAN.format(new Date(deger)) : "");

/*
  YORUM ÖZETİ (03.11.2026): İletişim kartının "Kurum içi" satırı için
  yorum sayısı, son yorumun zamanı ve rozetin sayacağı zamanlar. Sayı
  head sayımından (count), satır sınırından değil: 100 satırla sınırlı
  listeden sayı çıkarmak, yorumu çok olan kayıtta sayıyı sessizce
  100'de keserdi. Liste yalnızca rozet için (en yeni 100 yorumun zamanı
  — rozet "son açılıştan beri yeni" sayar, 100'den fazlası zaten "çok").
  Okunamazsa null: kart "yorum yok" yazmaz, "okunamadı" der.
*/
export type YorumOzeti = { sayi: number; son: string | null; baskalari: string[]; benimSon: string };

export async function yorumOzetiOku(supabase: SupabaseClient, organizationId: string, opportunityId: string, userId: string): Promise<YorumOzeti | null> {
  const { data, count, error } = await supabase
    .from("crm_internal_comments")
    .select("created_by,created_at", { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[akis] yorum özeti okunamadı", opportunityId, error.message);
    return null;
  }
  const satirlar = (data ?? []) as { created_by: string | null; created_at: string }[];
  return {
    sayi: count ?? satirlar.length,
    son: satirlar[0]?.created_at ?? null,
    baskalari: satirlar.filter((s) => s.created_by !== userId).map((s) => s.created_at),
    benimSon: satirlar.find((s) => s.created_by === userId)?.created_at ?? "",
  };
}
