/*
  RAPOR OKUMASI SAYFALANIR (2026-10-24).

  PostgREST yanıtı **1.000 satırda kesiyor ve bunu söylemiyor**:
  `.limit(4000)` yazmak yetmiyor, hata da dönmüyor. Bir rapor
  tavana çarptığı gün sayıları sessizce EKSİLİR — hem de paranın
  raporlandığı yerde.

  Bu tuzak Arvo'da iki kez kuruldu: ArvoARC'ın arama dizini ile site
  haritası (17.10.2026) ve çeviri betiği (23.10.2026 — 3.090 ürünün
  1.000'ini işleyip "bitti" dedi). İkisinde de hiçbir yerde hata
  görünmedi.

  `tumSatirlar` sayfa sayfa okuyup birleştiriyor. Sorgu bir FABRİKA
  olarak alınıyor, hazır bir zincir olarak değil: PostgREST zinciri
  bir kez beklendikten sonra yeniden aralıklanamıyor, aynı zinciri
  iki kez beklemek de aynı sayfayı iki kez okumak olurdu.

  TAVAN BİLEREK VAR ve sessiz değil: sınıra ulaşıldığında fırlatıyor.
  Sonsuz okuma bir raporu saatlerce açtırmaz, kullanıcıya boş ekran
  gösterir; "veri çok büyük" demek, yanlış bir toplamı göstermekten
  iyidir.
*/
const SAYFA = 1000;

export type SayfaliSonuc<T> = { data: T[] | null; error: { message: string; code?: string } | null };

export async function tumSatirlar<T>(
  /** Hata metninde görünecek ad ("sözleşmeler"). */
  ad: string,
  sayfala: (bas: number, son: number) => PromiseLike<SayfaliSonuc<T>>,
  { tavan = 50_000, sayfaBoyu = SAYFA }: { tavan?: number; sayfaBoyu?: number } = {},
): Promise<T[]> {
  const toplanan: T[] = [];
  for (let bas = 0; ; bas += sayfaBoyu) {
    if (bas >= tavan) {
      throw new Error(
        `${ad} raporu için ${tavan.toLocaleString("tr-TR")} satır sınırına ulaşıldı; `
        + "dönemi daraltın. (Sayı eksik gösterilmesin diye okuma durduruldu.)",
      );
    }
    const { data, error } = await sayfala(bas, bas + sayfaBoyu - 1);
    if (error) throw new Error(`${ad} okunamadı: ${error.message}`);
    if (!data || data.length === 0) break;
    toplanan.push(...data);
    /* Tam sayfa dolmadıysa son sayfa. Boş sayfa beklemek fazladan bir
       gidiş dönüş demek. */
    if (data.length < sayfaBoyu) break;
  }
  return toplanan;
}

/*
  KİMLİK LİSTESİYLE OKUMA.

  Rapor çoğu zaman "bu dönemde imzalanan sözleşmelerin talepleri"ni
  istiyor ve o talepler PENCEREDEN ESKİ olabiliyor: sekiz ay önce
  gelen aday bu ay imzalanır. Pencereyle okumak o satırları hiç
  getirmez ve satış KİMSEYE yazılmaz — personel kırılımı sessizce
  eksilir.

  Bu yüzden kimlikle okunuyor. Tek bir `in(...)` listesi adres
  uzunluğuna takılabildiği (ve 1.000 satır tavanına çarpabildiği)
  için parçalara bölünüyor; parça başına satır sayısı kimlik
  sayısını geçemez, o yüzden parçalar sayfalanmıyor.
*/
export async function kimliklerle<T>(
  ad: string,
  kimlikler: readonly string[],
  oku: (parca: string[]) => PromiseLike<SayfaliSonuc<T>>,
  parcaBoyu = 200,
): Promise<T[]> {
  const tekil = [...new Set(kimlikler.filter(Boolean))];
  if (tekil.length === 0) return [];
  const toplanan: T[] = [];
  for (let i = 0; i < tekil.length; i += parcaBoyu) {
    const { data, error } = await oku(tekil.slice(i, i + parcaBoyu));
    if (error) throw new Error(`${ad} okunamadı: ${error.message}`);
    if (data) toplanan.push(...data);
  }
  return toplanan;
}

/**
 * `tumSatirlar`ın Supabase sonucu biçiminde dönen hâli.
 *
 * Konsol ekranları okuma hatasını YUTMUYOR, o bölümü "okunamadı" diye
 * gösterip gerisini çiziyor (`{ data, error }` ikilisiyle). `tumSatirlar`
 * ise fırlatıyor: sayfalamayı eklemek için fırlatmayı olduğu gibi
 * bırakmak, tek bir okuma yüzünden kurucunun bütün ekranını hata
 * sayfasına çevirirdi.
 *
 * Fırlatma yutulmuyor, ÇEVRİLİYOR: satır tavanına çarpıldığında ekranda
 * görünür bir "okunamadı" çıkıyor — sessizce eksilen bir toplam değil.
 *
 * Sarmalayıcı burada çünkü aynı üç satır konsolda on beş yerde
 * tekrarlanacaktı; biri sapınca o ekran sessizce eski davranışa dönerdi.
 */
export function sayfaliSonuc<T>(
  ad: string,
  sayfala: (bas: number, son: number) => PromiseLike<SayfaliSonuc<T>>,
  secenekler?: { tavan?: number; sayfaBoyu?: number },
): Promise<SayfaliSonuc<T>> {
  return tumSatirlar<T>(ad, sayfala, secenekler)
    .then((data) => ({ data, error: null }))
    .catch((hata: unknown) => {
      /* PostgREST kodu korunuyor: çağıranların bir kısmı koda bakıp
         karar veriyor (42703 "sütun yok" → eski şemayla yeniden dene).
         Yalnızca metni taşımak o kararı öldürürdü. */
      const sebep = hata instanceof Error ? (hata.cause as { code?: string } | undefined) : undefined;
      return {
        data: null,
        error: { message: hata instanceof Error ? hata.message : String(hata), code: sebep?.code },
      };
    });
}
