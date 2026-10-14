/*
  ZAMANLANMIŞ İŞİN KOŞMA KAYDI (14.10.2026) — yazan taraf.

  Tablo ve budama: supabase/migrations/20261014173724_cron_kayitlari.sql.
  Ekranın okuduğu kural: lib/cron-isleri.ts. Gerekçe (hangi iş durursa ne
  olur) iki dosyada da yazılı.

  KAYIT YAZMA İŞİ DÜŞÜRMEZ. Buradaki hiçbir yol fırlatmıyor: günlük
  tutmanın işin kendisini bozması, günlük tutmamaktan kötüdür — posta
  eşitlemesi iki dakikada bir koşuyor ve kayıt tablosundaki bir sorun
  bütün kutuları durdurabilirdi. Yazılamayan kayıt sunucu günlüğüne
  düşüyor; ekranda da "henüz kaydı yok" diye görünür, "sorun yok" diye
  değil (lib/cron-isleri'ndeki "hic" durumu).

  TEK ÇIKIŞ NOKTASI, TİPLE ZORLANIYOR. cronRotasi'nın gövdesi Response
  değil CronKosusu döndürüyor: sonucu ve ayrıntıyı söylemeyen bir çıkış
  derlemede hata veriyor. Rotaların altısı aşkın erken dönüşü var (sunucu
  anahtarı yok, okuma düştü, aday yok) ve bir çıkışta kaydı atlamak işi
  "durmuş" göstermenin en kolay yoluydu — gecikme son BAŞARILI koşmaya
  göre ölçülüyor.
*/
import { createAdminClient } from "./supabase/admin";
import type { CronSonucu } from "./cron-isleri";

export type CronKosusu = {
  yanit: Response;
  sonuc: CronSonucu;
  /** İşin kendi sayaçları; kurum kimliği YAZILMAZ (tablo kiracı verisi tutmuyor). */
  ayrinti?: Record<string, unknown>;
};

async function kaydet(yol: string, basladi: Date, sonuc: CronSonucu, ayrinti: Record<string, unknown>) {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const { error } = await admin.rpc("platform_cron_kaydet", {
      p_is_adi: yol,
      p_basladi: basladi.toISOString(),
      p_sonuc: sonuc,
      p_ayrinti: ayrinti,
    });
    if (error) console.error("[cron] koşma kaydı yazılamadı", yol, error.message);
  } catch (hata) {
    console.error("[cron] koşma kaydı yazılamadı", yol, hata instanceof Error ? hata.message : hata);
  }
}

/**
 * Rotanın gövdesini sarar: tek çıkış noktasından kayıt yazar.
 *
 * Fırlatma da kaydediliyor ve SONRA yeniden fırlatılıyor: Next'in 500'ü
 * değişmiyor ama iş "hiç koşmamış" görünmüyor — kurucu ekranda hata
 * metnini görüyor.
 *
 * @param yol vercel.json'daki yol; işin kimliği bu (lib/cron-isleri).
 */
export async function cronRotasi(yol: string, govde: () => Promise<CronKosusu>): Promise<Response> {
  const basladi = new Date();
  try {
    const { yanit, sonuc, ayrinti } = await govde();
    await kaydet(yol, basladi, sonuc, ayrinti ?? {});
    return yanit;
  } catch (hata) {
    await kaydet(yol, basladi, "hata", { hata: hata instanceof Error ? hata.message : String(hata) });
    throw hata;
  }
}
