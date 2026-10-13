/*
  MÜŞTERİYE HAZIR YANITLAR (13.10.2026). Telefonda müşteri mesajına
  yanıt yazmak sahadaki personel için en yavaş adımdı: aynı birkaç
  cümle ("aldık, döneceğiz", "dosya yüklendi") her seferinde küçük
  klavyede yeniden yazılıyordu. Düğmeye dokunmak cümleyi yazma alanına
  KOYAR, göndermez: personel düzeltip öyle gönderir.

  Hitap cinsiyetsiz ("Merhaba Ayşe,"): "Hanım/Bey" için ad yetmez,
  yanlış tahmin müşteriye giden bir mesajda kalır.
*/

export type HazirYanit = { etiket: string; metin: string };

export const HAZIR_YANITLAR: readonly HazirYanit[] = [
  { etiket: "Mesajı aldık", metin: "Mesajınızı aldık, inceleyip size dönüş yapacağız." },
  { etiket: "Bugün dönüş", metin: "Bugün gün içinde size dönüş yapacağız." },
  { etiket: "Çalışma sürüyor", metin: "Çalışmanız devam ediyor; ilerlemeyi bu ekrandan takip edebilirsiniz." },
  { etiket: "Dosya yüklendi", metin: "İstediğiniz dosyayı takip ekranınıza yükledik, inceleyebilirsiniz." },
  { etiket: "Belge rica", metin: "Devam edebilmemiz için gereken belgeyi bize iletebilir misiniz?" },
  { etiket: "Teşekkürler", metin: "Teşekkür ederiz, iyi çalışmalar dileriz." },
];

/** "Ayşe Nur Yılmaz" → "Ayşe". Kurum içi iş ya da boş ad için null. */
export function hitapAdi(musteriAdi: string | null | undefined): string | null {
  const ad = (musteriAdi ?? "").trim();
  if (!ad || ad === "Kurum içi iş" || ad.toLocaleLowerCase("tr") === "müşteri") return null;
  return ad.split(/\s+/)[0];
}

/*
  Hazır cümleyi yazma alanındaki metne ekler. Alan boşsa hitapla başlar;
  doluysa cümle sona eklenir (personelin yazdığı silinmez). Aynı cümle
  zaten varsa ikinci kez eklenmez: telefonda düğmeye iki kez dokunmak
  kolay.
*/
export function yanitaEkle(mevcut: string, metin: string, musteriAdi?: string | null): string {
  const simdiki = mevcut.trimEnd();
  // Hitaptan sonra cümlenin baş harfi küçülüyor; ikisi de "zaten var" sayılır.
  const kucukBasli = `${metin.charAt(0).toLocaleLowerCase("tr")}${metin.slice(1)}`;
  if (simdiki.includes(metin) || simdiki.includes(kucukBasli)) return mevcut;
  if (!simdiki) {
    const ad = hitapAdi(musteriAdi);
    return ad ? `Merhaba ${ad}, ${kucukBasli}` : metin;
  }
  return `${simdiki} ${metin}`;
}
