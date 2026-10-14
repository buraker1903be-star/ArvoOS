/*
  Konsol okumalarında HATA YUTULMAZ.

  PostgREST sorgusu düştüğünde `data` null geliyor; `?? []` ile boş diziye
  çevrilince ekran "kayıt yok" diyor. Bu deponun iki kez yaşadığı hata:
  Platform → Ödemeler yanlış sütun adı yüzünden iki gün "sorun yok"
  gösterdi, teklif silme engeli de sorgu düştüğünde AÇIK GEÇİYORDU.

  Bir konsol ekranında "abonelik yok" ile "abonelikler okunamadı" aynı
  şey değil: birincisi iş yok demek, ikincisi bilgisizlik. Kurucu
  birincisine bakıp geçiyor.

  İki yardımcı, iki ayrı niyet:
   - `zorunlu`: sayfanın ASIL verisi. Düşerse sayfa hata veriyor; yarım
     bir ekran göstermektense hiç göstermemek doğru.
   - `ikincil`: yan bilgi (son hareketler, denetim kaydı). Düşerse sayfa
     ayakta kalıyor ama çağıran `okunamadi` bayrağını ekranda YAZMALI —
     sessizce boş göstermek yasak.

  Saf: birim testi tests/unit/konsol-oku.test.ts.
*/

export type SorguSonucu<T> = { data: T | null; error: { message: string } | null };

/** Sayfanın asıl verisi; okunamazsa sayfa hata verir. */
export function zorunlu<T>(sonuc: SorguSonucu<T>, ne: string): T {
  if (sonuc.error) throw new Error(`${ne} okunamadı: ${sonuc.error.message}`);
  /* data null + error null: PostgREST'in `maybeSingle` sonucu ya da boş
     tablo. Boş dizi/null çağıranın işi, burada hata yok. */
  return sonuc.data as T;
}

/** Yan bilgi; okunamazsa sayfa ayakta kalır ama bunu EKRANDA yazmalı. */
export function ikincil<T>(sonuc: SorguSonucu<T>, ne: string): { veri: T | null; okunamadi: boolean } {
  if (sonuc.error) {
    console.error(`[konsol] ${ne} okunamadı`, sonuc.error.message);
    return { veri: null, okunamadi: true };
  }
  return { veri: sonuc.data, okunamadi: false };
}
