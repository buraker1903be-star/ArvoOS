/**
 * MÜŞTERİ KÜNYESİ — operasyonun gördüğü akademik kimlik bilgileri.
 *
 * Operasyon personeli sözleşmeyi ve teklifi göremiyor (tutar orada
 * duruyor, satır erişimi 20261001143617 ile bilerek daraltıldı). Ama işi
 * yapan kişinin müşterinin üniversitesini, fakültesini ve bölümünü
 * bilmesi gerekiyor; bu bilgi fırsat kaydında `request_details` içinde
 * duruyor ve operasyona `ops_opportunities.kunye` ile açılıyor.
 *
 * Alan listesi burada, tek yerde: kart da bu listeden çiziliyor, düzenleme
 * formu da. İki yerde ayrı yazılsaydı biri eklenip öteki unutulduğunda
 * alan kaydedilir ama ekranda hiç görünmezdi.
 *
 * `service_type` (çalışma türü) BİLEREK YOK: görev şablonunu o seçiyor
 * (tez, makale, ödev ayrı şablonlar) ve fırsatta belirleniyor. Kartta
 * gösteriliyor ama düzenlenmiyor; veritabanı fonksiyonu da kabul etmiyor.
 */
export type KunyeAlani = {
  anahtar: string;
  etiket: string;
  /** Form alanının örnek metni; boş bırakılabilir. */
  ornek?: string;
};

export const KUNYE_ALANLARI: KunyeAlani[] = [
  { anahtar: "university", etiket: "Üniversite", ornek: "Ege Üniversitesi" },
  { anahtar: "faculty", etiket: "Fakülte", ornek: "Tıp Fakültesi" },
  { anahtar: "department", etiket: "Bölüm", ornek: "Biyokimya" },
  { anahtar: "program", etiket: "Program", ornek: "Yüksek lisans programı" },
  { anahtar: "academic_level", etiket: "Akademik düzey", ornek: "Doktora" },
  { anahtar: "advisor", etiket: "Danışman", ornek: "Prof. Dr. ..." },
  { anahtar: "language", etiket: "Dil", ornek: "Türkçe" },
];

/** Tek bir alana sığacak en uzun metin; veritabanı da aynı sınırı uyguluyor. */
export const KUNYE_EN_UZUN = 160;

export type Kunye = Record<string, string | undefined>;

/**
 * Formdan gelen değerleri künyeye çevirir.
 *
 * Alanların TAMAMI her zaman gönderiliyor; boş gelen alan "bu bilgiyi
 * sil" demek. Yalnızca dolu olanları göndermek "boş bıraktım" ile
 * "dokunmadım"ı aynı şey yapardı ve yanlış bir bölüm adı asla
 * silinemezdi.
 */
export function kunyeyiDerle(oku: (anahtar: string) => string | null | undefined): Kunye {
  const kunye: Kunye = {};
  for (const alan of KUNYE_ALANLARI) {
    const ham = String(oku(alan.anahtar) ?? "").trim();
    kunye[alan.anahtar] = ham ? ham.slice(0, KUNYE_EN_UZUN) : "";
  }
  return kunye;
}

/** Kartta gösterilecek dolu alanlar, liste sırasıyla. */
export function doluAlanlar(kunye: Kunye | null | undefined): Array<KunyeAlani & { deger: string }> {
  if (!kunye) return [];
  return KUNYE_ALANLARI.flatMap((alan) => {
    const deger = String(kunye[alan.anahtar] ?? "").trim();
    return deger ? [{ ...alan, deger }] : [];
  });
}
