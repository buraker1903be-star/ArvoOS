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

  Karşılaştırma konsolun bildiği değerle ürünün tuttuğu değer arasında:
  "ne zaman yansıtıldı" tek başına yetmez, çünkü zamanı yeni olan bir
  kopya da yanlış olabilir (ve tersi: haftalardır değişmemiş bir kurumda
  eski damga tamamen normaldir). Karar FARKA bakıyor.
*/

export type Yansima = {
  syncedAt: string | null;
  status: string;
  aiCreditLimit: number | null;
};

export type Konsol = {
  status: string;
  aiCreditLimit: number | null;
};

export type YansimaDurumu = {
  /** Kurucunun dikkatini hak ediyor mu: kopya konsolla uyuşmuyor. */
  uyari: boolean;
  /** Kartta "Ürüne yeniden yansıt" düğmesinin üstünde yazan metin. */
  notu: string;
};

const gun = (deger: string | null) =>
  deger ? new Date(deger).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;

const hak = (deger: number | null) =>
  deger === null ? "bildirilmemiş" : `${new Intl.NumberFormat("tr-TR").format(deger)} kredi`;

/**
 * @param yansima Ürün veritabanındaki kopya; okunamadıysa null.
 * @param konsol  ArvoOS'un bildiği doğru değerler.
 * @param urunAdi Kullanıcıya gösterilen ürün adı.
 */
export function yansimaDurumu(yansima: Yansima | null, konsol: Konsol, urunAdi: string): YansimaDurumu {
  /*
    Okunamaması UYARI DEĞİL. Köprü anahtarı tanımlı olmayan bir ortamda
    (yerel geliştirme, önizleme) her kurum "sorunlu" görünürdü ve uyarı
    hızla göz ardı edilen bir süs hâline gelirdi.
  */
  if (!yansima) {
    return { uyari: false, notu: `${urunAdi} kendi veritabanında; oradaki kopya şu an okunamadı.` };
  }

  if (!yansima.syncedAt) {
    return { uyari: true, notu: `${urunAdi}'a hiç yansıtılmamış. Aşağıdaki düğme kopyayı oluşturur.` };
  }

  const farklar: string[] = [];
  if (yansima.status !== konsol.status) {
    farklar.push(`durum "${yansima.status}" (burada "${konsol.status}")`);
  }
  /*
    AI hakkı yalnızca ArvoLab'da anlamlı; diğer ürünlerde iki taraf da
    null olur ve bu dal hiç çalışmaz.
  */
  if (yansima.aiCreditLimit !== konsol.aiCreditLimit) {
    farklar.push(`AI hakkı ${hak(yansima.aiCreditLimit)} (burada ${hak(konsol.aiCreditLimit)})`);
  }

  if (!farklar.length) {
    return { uyari: false, notu: `${urunAdi}'daki kopya güncel. Son yansıtma: ${gun(yansima.syncedAt)}.` };
  }

  return {
    uyari: true,
    notu: `${urunAdi}'daki kopya ESKİ — ${farklar.join(", ")}. `
      + `Son yansıtma: ${gun(yansima.syncedAt)}. Aşağıdaki düğme kopyayı tazeler.`,
  };
}
