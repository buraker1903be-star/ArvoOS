/*
  KURUCUYA BİLDİRİM YAZAN TEK YER (14.10.2026).

  Kanal (audience = 'founder') baştan beri kuruluydu — RLS, zil rozeti,
  canlı akış, liste ekranı, okundu işaretleme — ama hiçbir yer satır
  yazmıyordu; zil hep boştu. İlk üreticiler zamanlanmış iş nöbeti
  (lib/cron-kaydi) ve ArvoLab köprü denetimi oldu.

  TEKRAR ENGELİ BURADA, ÇAĞIRANDA DEĞİL. İlk üretici iki dakikada bir
  koşan bir işin içindeydi: anahtarsız bir uyarı aynı arızayı günde 720
  kez bildirir ve zil okunmaz olurdu. İkinci bir üretici eklenirken o
  anahtarı yeniden kurmayı unutmak, aynı hatayı ikinci kez yapmak
  olurdu. Anahtarı çağıran veriyor (neyin tekrarı sayılacağını o bilir),
  sorgulamayı bu dosya yapıyor.

  GÜN ANAHTARI ÇAĞIRANIN İŞİ. Çoğu uyarı "gün içinde bir kez, sorun
  sürerse ertesi gün yine" istiyor ve gün Türkiye gününe göre
  (AGENTS.md); ama bir olayın kendisi tekse (bir kurulumun başarısızlığı)
  anahtar gün içermemeli.

  BİLDİRİM YAZMAK İŞİ DÜŞÜRMEZ: hiçbir yol fırlatmıyor. Bir uyarıyı
  kaçırmak kötü, uyarıyı yazamadığı için eşitlemeyi durdurmak daha kötü.
*/
import type { SupabaseClient } from "@supabase/supabase-js";

export type KurucuBildirimi = {
  /** Bildirim listesindeki görünümü belirliyor (app/panel/notifications/describe). */
  kategori: string;
  /** Tekrar engelinin anahtarı; aynı anahtarla ikinci satır yazılmıyor. */
  anahtar: string;
  baslik: string;
  metin: string;
  /** Zilden tıklanınca açılacak ekran. */
  adres: string;
  /** metadata'ya eklenecek alanlar (anahtar zaten yazılıyor). */
  ek?: Record<string, unknown>;
};

/**
 * Yazdıysa true, zaten varsa ya da yazamadıysa false döner.
 *
 * `admin` service_role istemcisi olmalı: RLS kurucu dışında kimseye
 * yazdırmıyor ve bu çağrı bir cron'un içinden geliyor (oturum yok).
 */
export async function kurucuyaBildir(admin: SupabaseClient, bildirim: KurucuBildirimi): Promise<boolean> {
  try {
    const { data: onceki, error: oncekiHatasi } = await admin.from("notifications")
      .select("id")
      .eq("audience", "founder")
      .eq("category", bildirim.kategori)
      .eq("metadata->>anahtar", bildirim.anahtar)
      .limit(1);
    /* Önceki okunamazsa YAZMIYORUZ: aynı arızayı iki kez bildirmek, bir
       kez geç bildirmekten kötü — zil okunmaz olunca sonraki gerçek uyarı
       da okunmaz. Sorun sürüyorsa bir sonraki tur yeniden deneyecek. */
    if (oncekiHatasi) {
      console.error("[kurucu-bildirimi] önceki okunamadı", bildirim.kategori, oncekiHatasi.message);
      return false;
    }
    if (onceki?.length) return false;

    const { error } = await admin.from("notifications").insert({
      /* Kurucu bildirimi hiçbir kiracıya ait değil: ikisi de nullable ama
         FK'lı, bir kuruma bağlamak onu o kiracının kaydı yapardı. */
      organization_id: null,
      user_id: null,
      audience: "founder",
      category: bildirim.kategori,
      title: bildirim.baslik,
      message: bildirim.metin,
      action_url: bildirim.adres,
      metadata: { anahtar: bildirim.anahtar, ...bildirim.ek },
    });
    if (error) {
      console.error("[kurucu-bildirimi] yazılamadı", bildirim.kategori, error.message);
      return false;
    }
    return true;
  } catch (hata) {
    console.error("[kurucu-bildirimi] yazılamadı", bildirim.kategori, hata instanceof Error ? hata.message : hata);
    return false;
  }
}
