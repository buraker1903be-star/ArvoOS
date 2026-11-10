/*
  ANA EKRAN KURULUM İLERLEMESİ (OS-03, 09.11.2026).

  Kurulum kartında beş adım vardı ve biri (ekip daveti) isteğe bağlıydı.
  Sayaç doğru biçimde yalnızca zorunlu adımlardan hesaplanıyordu ama kart
  listesi isteğe bağlı adımı zorunluların ARASINA, aynı numaralı kart ve
  aynı "Tamamlandı" rozetiyle diziyordu: ekip davet edilmiş bir kurumda
  iki kart tamamlanmış görünürken sayaç "1/4" diyordu ve hangisinin
  sayılmadığı anlaşılmıyordu.

  Sayaç, çubuk, "kaç adım kaldı" metni ve kartın kapanması artık AYNI
  zorunlu listeden türüyor; isteğe bağlı adımlar ayrı dönüyor ve
  ilerlemeye girmiyor. Bütün zorunlu adımlar bitince kurulum tamamdır,
  isteğe bağlı davet yapılmamış olsa da.

  Saf modül: tests/unit/kurulum-ilerlemesi.test.ts.
*/

export type KurulumAdimi = { key: string; done: boolean; optional?: boolean };

export type KurulumIlerlemesi<T extends KurulumAdimi> = {
  zorunlu: T[];
  istegeBagli: T[];
  tamamlanan: number;
  toplam: number;
  /** 0–100, zorunlu adımlardan. */
  yuzde: number;
  /** Bütün zorunlu adımlar tamam (zorunlu adım yoksa da gösterilecek bir şey yok). */
  bitti: boolean;
  /** "4 zorunlu adımdan 1 tanesi tamamlandı" */
  ozet: string;
};

export function kurulumIlerlemesi<T extends KurulumAdimi>(adimlar: readonly T[]): KurulumIlerlemesi<T> {
  const zorunlu = adimlar.filter((adim) => !adim.optional);
  const istegeBagli = adimlar.filter((adim) => adim.optional);
  const tamamlanan = zorunlu.filter((adim) => adim.done).length;
  const toplam = zorunlu.length;
  return {
    zorunlu,
    istegeBagli,
    tamamlanan,
    toplam,
    yuzde: toplam ? Math.round((tamamlanan / toplam) * 100) : 100,
    bitti: tamamlanan >= toplam,
    ozet: `${toplam} zorunlu adımdan ${tamamlanan} tanesi tamamlandı`,
  };
}
