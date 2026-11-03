/*
  SAYFA SÜRE ÖLÇÜMÜ (03.11.2026, hızlandırma).

  Vercel rota başına toplam süreyi veriyor ama o sürenin HANGİ okumada
  geçtiğini söylemiyor. Konsol ana sayfası okumaları paralelleştirdikten
  sonra da p75 ~0,9 sn kaldı: süre tek bir yavaş okumada, hangisi olduğu
  ölçmeden bilinemiyordu. Bu yardımcı okuma başına süreyi tutuyor ve sayfa
  eşiği aşınca tek satırlık bir uyarı yazıyor ("[süre] konsol-ana 912 ms
  {kiracilar: 640, kopyalar: 410, …}") — sunucu günlüğünde aranabilir.

  Eşik altında hiçbir şey yazmıyor: hızlı sayfanın günlüğü kirletmesi,
  yavaşın satırını bulmayı zorlaştırırdı. Okumanın sonucunu ve hatasını
  olduğu gibi geçiriyor; ölçüm akışı değiştirmez.

  Saf modül (zaman kaynağı dışarıdan verilebiliyor): tests/unit/sure-olcumu.test.ts.
*/
export type SureOlcer = {
  olc<T>(ad: string, is: PromiseLike<T>): Promise<T>;
  /** Eşiği aşan ölçümü yazar; ölçüm sonucunu döndürür (test için). */
  bitir(): { toplam: number; okumalar: Record<string, number> } | null;
};

export function sureOlcer(
  sayfa: string,
  { esikMs = 400, simdi = () => performance.now(), yaz = (m: string) => console.warn(m) }: { esikMs?: number; simdi?: () => number; yaz?: (m: string) => void } = {},
): SureOlcer {
  const baslangic = simdi();
  const okumalar: Record<string, number> = {};
  return {
    olc(ad, is) {
      const t = simdi();
      const kaydet = () => { okumalar[ad] = Math.round(simdi() - t); };
      return Promise.resolve(is).then(
        (deger) => { kaydet(); return deger; },
        (hata: unknown) => { kaydet(); throw hata; },
      );
    },
    bitir() {
      const toplam = Math.round(simdi() - baslangic);
      if (toplam < esikMs) return null;
      /* En yavaş önce: satırın başında suçlu dursun. */
      const sirali = Object.fromEntries(Object.entries(okumalar).sort((a, b) => b[1] - a[1]));
      yaz(`[süre] ${sayfa} ${toplam} ms ${JSON.stringify(sirali)}`);
      return { toplam, okumalar: sirali };
    },
  };
}
