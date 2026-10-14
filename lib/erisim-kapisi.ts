/*
  ArvoOS erişim kapısının kuralı (14.10.2026). lib/panel-context her panel
  isteğinde bunu soruyor; kural tek yerde ve birim testli
  (tests/unit/erisim-kapisi.test.ts).

  Yalnızca 'suspended' kilitler — kurucunun bilerek verdiği karar.
  'past_due' konsolda açık sayılıyor; 'canceled' çekirdeği kapalı ama ek
  ürünü (Randevu) ödenen kurumlar var. İkisini kilitlemek, verilmemiş bir
  kararı koda gömmek olurdu. Arvo'nun kendi kurumu hiçbir koşulda
  kilitlenmez: konsol oradan çalışıyor.
*/
export function erisimKapaliMi(kurumSlug: string, lisansDurumu: string | null | undefined): boolean {
  return kurumSlug !== "arvo-os" && lisansDurumu === "suspended";
}
