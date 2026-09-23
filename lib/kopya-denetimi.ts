/*
  Hangi kiracının ürün kopyası eski? Saf modül; testi
  tests/unit/kopya-denetimi.test.ts.

  Lisans sayfası bu soruyu TEK kiracı için yanıtlıyor
  (lib/yansima-durumu.ts). Ama kurucu sorunu ancak o kiracının sayfasını
  açarsa görüyor — AkademikMerkez'de olan da buydu: kopya altı gün eski
  kaldı, kimse o sayfayı açmadı, müşteri şikâyet etti.

  Burası aynı soruyu HEPSİ için yanıtlıyor; konsol ana sayfası sonucu
  uyarı olarak gösteriyor.

  YALNIZCA DURUM KARŞILAŞTIRILIYOR. Tek kiracı ekranında dönem sonu ve AI
  hakkı da bakılıyor, burada bakılmıyor: ana sayfadaki uyarı "birinin
  erişimi yanlış" demek için var. Her küçük farkı buraya taşımak listeyi
  sürekli dolu tutardı ve sürekli dolu liste okunmaz.
*/

export type KonsolUrunu = { organization_id: string; product: string; status: string };

export type EskiKopya = {
  organizationId: string;
  product: string;
  /** Kopyadaki durum; konsoldakinden farklı olan. */
  kopyaDurumu: string;
  konsolDurumu: string;
};

/** Erişimi açık sayan durumlar; üç ürünün kapısı da bunu kullanıyor. */
const ACIK = new Set(["active", "trialing", "past_due"]);

/**
 * @param konsolSatirlari ArvoOS'un bildiği ürün lisansları.
 * @param kopyalar        Ürün başına kopya haritası; okunamayan ürün null.
 */
export function eskiKopyalar(
  konsolSatirlari: KonsolUrunu[],
  kopyalar: Record<string, Map<string, { status: string }> | null>,
): EskiKopya[] {
  const bulunanlar: EskiKopya[] = [];

  for (const satir of konsolSatirlari) {
    const harita = kopyalar[satir.product];
    // Okunamayan ürün atlanıyor: "okunamadı" bir fark değil, bilgisizlik.
    if (!harita) continue;

    const kopya = harita.get(satir.organization_id);
    const kopyaDurumu = kopya?.status ?? "yok";

    /*
      Fark ERİŞİM DÜZEYİNDE aranıyor, durum adında değil. "trialing" ile
      "active" iki ayrı ad ama ikisi de kapıyı açıyor; onu uyarı saymak
      deneme süresi biten her kurumu listeye sokardı. Asıl önemli olan
      kopyanın kapıyı konsoldan FARKLI açıp kapatması: kapalı olması
      gerekirken açıksa müşteri ödemediği ürünü kullanıyor, açık olması
      gerekirken kapalıysa ödeyen müşteri dışarıda.
    */
    if (ACIK.has(kopyaDurumu) === ACIK.has(satir.status)) continue;

    bulunanlar.push({
      organizationId: satir.organization_id,
      product: satir.product,
      kopyaDurumu,
      konsolDurumu: satir.status,
    });
  }

  return bulunanlar;
}
