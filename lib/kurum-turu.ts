/*
  KURUMUN KONSOLDAKİ TÜRÜ (14.10.2026) — saf kural.

  Üç tür var ve raporlama her birini ayrı sayıyor:
   - "arvo":    Arvo'nun kendisi (kind = 'internal'). İşleyişi değiştiren
                işaret: WhatsApp gelen kutusu, platform abonelik istekleri
                ve belge gönderim yolu ona bakıyor.
   - "grup":    aynı şirketin öteki markaları (grup_markasi; AkademikMerkez,
                ArvoCulture). Normal kiracı gibi çalışır, ücreti girilir ama
                müşteri gelirine ve tahsilata KARIŞMAZ; ayrıca "grup içi
                değer" olarak gösterilir. Hatırlatma ve otomatik gecikme yok.
   - "musteri": geri kalan herkes.

  Eskiden konsol yalnızca kind'a bakıyordu ve grup markaları müşteri
  gibi sayılıyordu (beklenen aylık gelir, müşteri listesi, hatırlatma).
  Birim testi tests/unit/kurum-turu.test.ts.
*/
export type KurumTuru = "arvo" | "grup" | "musteri";

/*
  İKİ ALAN DA ZORUNLU (14.10.2026).

  Eskiden ikisi de isteğe bağlıydı ve bu, sütunu SEÇMEYİ unutan çağıranı
  sessizce yanıltıyordu: grup_markasi gelmeyince grup markası "müşteri"
  sayılıyor, ekran da emin emin yanlış söylüyordu. Modül matrisi tam
  böyle "Grup markası 0" dedi — sorgusu o sütunu hiç istemiyordu.

  Zorunlu olunca TypeScript çağıranı durduruyor: kendi tipine alanı
  eklemek zorunda, o da sorguya eklemeyi hatırlatıyor. Sütunun varlığını
  zaten npm run check:schema denetliyor.
*/
export function kurumTuru(kurum: { kind: string | null; grup_markasi: boolean | null } | null | undefined): KurumTuru {
  if (kurum?.kind === "internal") return "arvo";
  if (kurum?.grup_markasi) return "grup";
  return "musteri";
}

/** Gelir, tahsilat ve hatırlatma hesabına giren gerçek müşteri mi? */
export const musteriMi = (kurum: { kind: string | null; grup_markasi: boolean | null } | null | undefined) =>
  kurumTuru(kurum) === "musteri";
