/*
  ELLE GİRİLEN CARİ HAREKETİN DÜZELTİLMESİ VE SİLİNMESİ (2026-10).
  Saf: testi tests/unit/cari-hareket.test.ts.

  Cari penceresinden elle girilen üç hareket düzeltilebilir ve silinebilir:
  tahsilat, iade, ek hizmet. Geri kalanı başka bir kayda bağlı ve kilitli:
    - sözleşme borcu (crm_contract) sözleşme tutarının kendisi,
    - PayTR tahsilatı ("PAYTR-…") sağlayıcının ödeme olayına bağlı,
    - finans işleminden ("FIN:…"), faturadan ve taksit tahsilinden gelen
      tahsilatlar o kaydın durumunu da değiştirmişti; hareketi tek başına
      değiştirmek ikisini ayırır.
  Tahsilat formunda referans elle yazılabildiği için elle girilen tahsilat
  "TAH:" önekinden tanınamıyor; otomatik yolların izleri dışarıda bırakılıyor.

  Eskiden hareketi düzelten bir yol yoktu: yanlış girilen tahsilat ancak
  ters kayıtla (iade) dengelenebiliyordu ve döküm kalabalıklaşıyordu.
*/

export type CariHareket = {
  entry_type: "debit" | "credit";
  source_type: string | null;
  reference_no: string | null;
  description: string;
  amount: number;
};

export type ElleHareketTuru = "tahsilat" | "iade" | "ek-hizmet";

/** Elle girilen bir hareketse türü, değilse null (kilitli). */
export function elleGirilenTur(e: CariHareket, saglayiciyaBagli = false): ElleHareketTuru | null {
  if (saglayiciyaBagli) return null;
  const referans = e.reference_no ?? "";
  if (e.entry_type === "credit" && e.source_type === "payment") {
    if (referans.startsWith("PAYTR-") || referans.startsWith("FIN:")) return null;
    if (e.description.startsWith("PayTR tahsilatı") || e.description.startsWith("Tahsilat - ") || e.description.endsWith("fatura tahsilatı")) return null;
    return "tahsilat";
  }
  if (e.entry_type === "debit" && e.source_type === "adjustment") return "iade";
  if (e.entry_type === "debit" && e.source_type === "manual" && e.description.startsWith("Ek hizmet ·")) return "ek-hizmet";
  return null;
}

/** Carinin özetinden ilgili toplamlar (kuruş). borc: sözleşme + ek hizmet. */
export type CariOzet = { borc: number; tahsilat: number; iade: number };

/*
  Düzeltme ya da silmeden sonra cari tutarlı kalmalı; oluşturma
  işlemlerindeki kuralların aynısı:
    - net tahsilat (tahsilat − iade) borcu aşamaz ("açık bakiyeyi aşamaz"),
    - iade net tahsilattan büyük olamaz ("iade net tahsilatı aşamaz").
  yeniTutar null ise hareket siliniyor.
*/
export function degisiklikDenetle(tur: ElleHareketTuru, eskiTutar: number, yeniTutar: number | null, ozet: CariOzet): string | null {
  if (yeniTutar !== null && (!Number.isFinite(yeniTutar) || !Number.isInteger(yeniTutar) || yeniTutar <= 0)) return "Tutar sıfırdan büyük olmalı.";
  const fark = (yeniTutar ?? 0) - eskiTutar;
  const sonra = {
    borc: ozet.borc + (tur === "ek-hizmet" ? fark : 0),
    tahsilat: ozet.tahsilat + (tur === "tahsilat" ? fark : 0),
    iade: ozet.iade + (tur === "iade" ? fark : 0),
  };
  if (sonra.iade > sonra.tahsilat)
    return tur === "iade" ? "İade tutarı net tahsilatı aşamaz." : "Bu değişiklikten sonra iadeler tahsilatı aşıyor; önce iadeyi düzeltin.";
  // Değişiklik bakiyeyi azaltan yöndeyse (tahsilat artıyor, ek hizmet azalıyor, iade azalıyor) borcu aşmamalı.
  const bakiyeAzaliyor = (tur === "tahsilat" && fark > 0) || (tur !== "tahsilat" && fark < 0);
  if (bakiyeAzaliyor && sonra.tahsilat - sonra.iade > sonra.borc)
    return tur === "tahsilat" ? "Tahsilat açık cari bakiyesini aşamaz." : "Bu değişiklikten sonra tahsilat borcu aşıyor; önce tahsilatı düzeltin.";
  return null;
}
