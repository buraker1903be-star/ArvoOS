import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sayfaliSonuc } from "@/lib/rapor-okuma";
import { kurumEtkinligi, type KurumEtkinligi, type VarlikSatiri } from "@/lib/musteri-etkinligi";

/*
  PANEL ETKİNLİĞİNİN OKUNMASI (02.11.2026) — konsolun Müşteriler listesi
  ve ana ekranı aynı okumayı kullanıyor (kural lib/musteri-etkinligi.ts).
  Sunucu anahtarıyla, sayfalı (kurum × kişi başına bir satır; kullanıcı
  sayısı kadar büyüyor). Okunamazsa harita null: çağıran o bölümü boş
  bırakıyor, ekran düşmüyor — etkinlik ekranın asıl verisi değil.
*/
export async function musteriEtkinlikleri(): Promise<{ harita: Map<string, KurumEtkinligi> | null; simdi: number }> {
  const simdi = Date.now();
  const admin = createAdminClient();
  if (!admin) return { harita: null, simdi };
  const sonuc = await sayfaliSonuc<VarlikSatiri>("panel etkinliği", (bas, son) =>
    admin.from("user_presence").select("organization_id,last_seen_at").order("organization_id").order("user_id").range(bas, son));
  if (sonuc.error) {
    console.error("[konsol] panel etkinliği okunamadı", sonuc.error.message);
    return { harita: null, simdi };
  }
  return { harita: kurumEtkinligi(sonuc.data ?? [], simdi), simdi };
}
