/*
  DOÇENTLİK PUAN ÇEKİRDEĞİ: KURAL SÜRÜMLERİ (14.11.2026, F6 PR1).

  Hesaplama ArvoLab'dan taşındı. Kuralın kendisi (kategori, birim puan,
  yazar katsayısı, asgari/azami) VERİDİR, kodda değil: kurum ve ÜAK
  tabloları değiştikçe veritabanındaki kriter ve hedef satırları değişir.
  Kodda duran, o verinin NASIL uygulandığıdır (yuvarlama, ortak yazarlık
  bölüşümü, tavanın hangi satırdan okunduğu, dönemin sınırı). Bu dosya o
  "nasıl"ın sürümünü tutar.

  Neden sürüm: hesaplanmış puanlar kayda yazılıyor (computed_points).
  Uygulama kuralı sessizce değişirse eski kayıtlar eski kuralla, yenileri
  yeni kuralla hesaplanmış olur ve toplam ikisinin karışımı olur — hangi
  satırın hangisi olduğu da okunamaz. Bir uygulama kuralı değişecekse yeni
  bir sürüm EKLENİR, mevcut sürüm düzenlenmez; çıktı hangi sürümle
  hesaplandığını taşır.

  Tek sürüm var: ArvoLab main b62bfcf'teki davranışın birebir karşılığı.
  Eşdeğerlik tests/unit/docentlik-esdegerlik.test.ts'te kaynağın kendisine
  karşı sınanıyor.
*/

export type KuralSeti = {
  /** Sürüm kodu; hesap çıktısına yazılır. */
  kod: string;
  /** Davranışın alındığı kaynak; eşdeğerlik testi bu dosyaların özetini denetler. */
  kaynak: { depo: "ArvoLab"; commit: string; dosyalar: readonly string[] };
  /**
   * Puanlar 1e-6'ya yuvarlanır. Kayan noktanın 0.30000000000000004 gibi
   * artıkları kayda yazılıp birikmesin diye; ekranda iki basamak gösterilir.
   */
  yuvarlamaCarpani: number;
  /** Yazar sayısının üst sınırı (ArvoLab'da hem formda hem veritabanı kısıtında 500). */
  azamiYazarSayisi: number;
};

export const KURAL_SURUMLERI = {
  "arvolab-2026-10-27": {
    kod: "arvolab-2026-10-27",
    kaynak: {
      depo: "ArvoLab",
      commit: "b62bfcf698e680b73810cf747cc7355020f95b72",
      dosyalar: ["lib/docentlik-puan.ts", "lib/docentlik-ozeti.ts", "app/actions/scoring.ts"],
    },
    yuvarlamaCarpani: 1e6,
    azamiYazarSayisi: 500,
  },
} as const satisfies Record<string, KuralSeti>;

export type KuralSurumuKodu = keyof typeof KURAL_SURUMLERI;

export const VARSAYILAN_KURAL_SURUMU: KuralSurumuKodu = "arvolab-2026-10-27";
export const VARSAYILAN_KURAL: KuralSeti = KURAL_SURUMLERI[VARSAYILAN_KURAL_SURUMU];

/** Bilinmeyen kod null döner: tahminle başka bir sürüme düşmek sessiz kural değişikliği olurdu. */
export function kuralSeti(kod: string): KuralSeti | null {
  return Object.prototype.hasOwnProperty.call(KURAL_SURUMLERI, kod) ? KURAL_SURUMLERI[kod as KuralSurumuKodu] : null;
}

/** Sürümün yuvarlaması. ArvoLab'daki `Math.round(x * 1e6) / 1e6` ile birebir aynı işlem sırası. */
export const yuvarla = (n: number, kural: KuralSeti = VARSAYILAN_KURAL) =>
  Math.round(n * kural.yuvarlamaCarpani) / kural.yuvarlamaCarpani;
