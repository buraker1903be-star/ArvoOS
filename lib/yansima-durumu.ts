/*
  Ürün veritabanındaki kopya güncel mi?

  Saf modül; testi tests/unit/yansima-durumu.test.ts.

  NEDEN VAR: 22.09.2026'da AkademikMerkez'in personeli ArvoLab'da
  aboneliği sorulduğu için dışarıda kaldı. Köprü SAĞLIKLIYDI —
  bridge_health "son çağrı başarılı" diyordu. Sorun kopyanın eski
  olmasıydı: yansıtma yalnızca kurucu kaydettiğinde çalışıyor, ve o kurum
  16.09'dan beri kaydedilmemişti. Aradaki altı günde iki yeni alan
  (AI kredi hakkı, üye listesi) eklendi ve hiçbiri gitmedi.

  Kopyanın eski olduğu HİÇBİR YERDE görünmüyordu. Görünmeyen bir bozukluk,
  müşteri şikâyet edene kadar sürer; nitekim öyle oldu.

  Karar "ne zaman yansıtıldı"ya değil FARKA bakıyor: zamanı yeni olan bir
  kopya da yanlış olabilir, ve haftalardır değişmemiş bir kurumda eski
  damga tamamen normaldir.

  Alanları çağıran biçimlendirip veriyor, çünkü üç ürünün kopyası üç ayrı
  şekilde duruyor: ArvoLab kendi organizations satırında (durum + AI
  hakkı), Arc ve Randevu ise ArvoOS'un lisans satırının aynen kopyasında
  (durum + kayıt zamanı). Kural tek, karşılaştırılan alanlar ürüne özgü.
*/

export type YansimaAlani = {
  etiket: string;
  /** Ürün veritabanındaki değer, gösterilecek biçimde. */
  kopya: string;
  /** Konsolun bildiği doğru değer, aynı biçimde. */
  konsol: string;
};

export type YansimaKopyasi = {
  /** Kopyanın tazelik damgası; hiç yansıtılmamışsa null. */
  damga: string | null;
  alanlar: YansimaAlani[];
};

export type YansimaDurumu = {
  /** Kurucunun dikkatini hak ediyor mu: kopya konsolla uyuşmuyor. */
  uyari: boolean;
  /** "Ürüne yeniden yansıt" düğmesinin üstünde yazan metin. */
  notu: string;
};

export const yansimaGunu = (deger: string | null) =>
  deger
    ? new Date(deger).toLocaleString("tr-TR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

/**
 * @param kopya   Ürün veritabanındaki kopya; okunamadıysa null.
 * @param urunAdi Kullanıcıya gösterilen ürün adı.
 */
export function yansimaDurumu(kopya: YansimaKopyasi | null, urunAdi: string): YansimaDurumu {
  /*
    Okunamaması UYARI DEĞİL. Köprü anahtarı tanımlı olmayan bir ortamda
    (yerel geliştirme, önizleme) her kurum "sorunlu" görünürdü ve uyarı
    hızla göz ardı edilen bir süs hâline gelirdi.
  */
  if (!kopya) {
    return { uyari: false, notu: `${urunAdi} kendi veritabanında; oradaki kopya şu an okunamadı.` };
  }

  if (!kopya.damga) {
    return { uyari: true, notu: `${urunAdi}'a hiç yansıtılmamış. Aşağıdaki düğme kopyayı oluşturur.` };
  }

  const farklar = kopya.alanlar
    .filter((alan) => alan.kopya !== alan.konsol)
    .map((alan) => `${alan.etiket} ${alan.kopya} (burada ${alan.konsol})`);

  if (!farklar.length) {
    return { uyari: false, notu: `${urunAdi}'daki kopya güncel. Son yansıtma: ${yansimaGunu(kopya.damga)}.` };
  }

  return {
    uyari: true,
    notu: `${urunAdi}'daki kopya ESKİ — ${farklar.join(", ")}. `
      + `Son yansıtma: ${yansimaGunu(kopya.damga)}. Aşağıdaki düğme kopyayı tazeler.`,
  };
}
