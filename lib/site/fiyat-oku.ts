/*
  Yayımlanmış fiyatları okuyan SUNUCU yardımcısı.

  Hiçbir koşulda fırlatmıyor: veritabanı okunamazsa boş liste dönüyor ve
  çağıran koddaki değerlerle çalışmaya devam ediyor. Ücretler sayfası bir
  pazarlama yüzeyi; oradaki bir hata "fiyat yok" demek olurdu.

  Yalnızca YAYIMLANMIŞ satır okunuyor. RLS de aynı kuralı uyguluyor
  (anon yalnızca yayimlandi_at dolu satırı görüyor); iki katman da aynı
  şeyi söylüyor çünkü taslak tutarın dışarıya sızması, hazırlanan zammı
  yayımlanmadan okunur kılardı.
*/
import { createClient } from "@/lib/supabase/server";
import { fiyatlariBirlestir, type Fiyatlar } from "./fiyat-kaynagi";

export async function yayimlananFiyatlar(): Promise<Fiyatlar> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("platform_fiyat_listesi")
      .select("kod,aylik_kurus")
      .not("yayimlandi_at", "is", null);
    if (error) {
      console.error("[fiyat] yayımlanmış liste okunamadı", error.message);
      return fiyatlariBirlestir([]);
    }
    return fiyatlariBirlestir(
      ((data ?? []) as { kod: string; aylik_kurus: number | null }[])
        .map((satir) => ({ kod: satir.kod, aylikKurus: satir.aylik_kurus === null ? null : Number(satir.aylik_kurus) })),
    );
  } catch (hata) {
    console.error("[fiyat] yayımlanmış liste okunamadı", hata instanceof Error ? hata.message : hata);
    return fiyatlariBirlestir([]);
  }
}
