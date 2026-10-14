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
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { fiyatlariBirlestir, type Fiyatlar } from "./fiyat-kaynagi";

/*
  ÇEREZSİZ İSTEMCİ. Oturum istemcisi (lib/supabase/server) `cookies()`
  okuyor ve bu, sayfayı DİNAMİK yapıyor: derlemede
  "Route /ucretler couldn't be rendered statically because it used
  cookies" hatası atılıyordu. Hata yakalandığı için derleme geçiyor ama
  sayfa koddaki yedek fiyatlarla üretiliyordu — yani konsoldan
  yayımlanan tutar sitede hiç görünmeyecekti (14.10.2026).

  Fiyat KAMUSAL bilgi: yayımlanmış satırı anon rolü okuyabiliyor (RLS
  herkes_yayimlanan_fiyati_okur). Oturuma gerek yok, dolayısıyla çerez
  de gerekmiyor; sayfa statik üretilmeye devam ediyor ve yayımlama
  işlemi revalidatePath ile onu tazeliyor.
*/
function anonIstemci() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function yayimlananFiyatlar(): Promise<Fiyatlar> {
  try {
    const supabase = anonIstemci();
    if (!supabase) return fiyatlariBirlestir([]);
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
