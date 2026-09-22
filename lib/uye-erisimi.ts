/*
  Kurucu konsolundan üye erişimini açma/kapatma kararı.

  Veritabanındaki arvo_membership_owner_guard son aktif sahibi koruyor ama
  o koruma yalnızca istek bağlamı olan çağrılar için çalışıyor
  (arvo_request_role() null değilse). Konsol service_role ile yazdığı için
  oradan geçmiyor: kural burada da olmazsa kurucu bir kurumu yanlışlıkla
  sahipsiz bırakabilir ve o kuruma kimse giremez.

  Saf: testi tests/unit/uye-erisimi.test.ts.
*/

export function erisimDegisikligiEngeli(girdi: {
  /** Hedef üye, işlemi yapan kişinin kendisi mi. */
  kendisiMi: boolean;
  /** true = erişimi aç, false = kapat. */
  aciliyorMu: boolean;
  hedefRol: string;
  /** Aynı kurumdaki DİĞER aktif sahiplerin sayısı (hedef hariç). */
  digerAktifSahip: number;
}): string | null {
  // Açmak hiçbir zaman kilitlemeye yol açmaz.
  if (girdi.aciliyorMu) return null;

  /*
    Kendi erişimini kapatmak: konsola giren kişi kendini dışarıda bırakır
    ve geri açacak kimse kalmayabilir. Teknik olarak mümkün ama hiçbir
    senaryoda istenen bir şey değil.
  */
  if (girdi.kendisiMi) return "Kendi erişiminizi buradan kapatamazsınız.";

  if (girdi.hedefRol === "owner" && girdi.digerAktifSahip < 1) {
    return "Kurumun en az bir aktif Kurum Sahibi olmalı; son sahibin erişimi kapatılamaz.";
  }

  return null;
}
