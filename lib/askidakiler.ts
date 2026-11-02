/*
  ASKIDA BEKLEYEN MÜŞTERİLER (02.11.2026).

  Ödeme gelmeyen kurum tek dokunuşla askıya alınıyor (ürün kartı ve modül
  matrisi, `suspended`). Askı GEÇİCİ bir durum: ya ödeme gelip açılır ya da
  kurucu lisansı İptal edip kayıp nedenini yazar (lib/kapanis-nedeni).
  Ama ikisini de hatırlatan bir yer yoktu; kurum haftalarca askıda
  kalabiliyordu ve aylık rapor onu ne "kayıp" ne "müşteri" sayıyordu.

  Konsol ana sayfasının "Bugünün işleri" kuyruğu bunu listeliyor: kurum
  başına bir satır (çekirdek ve ek ürünler birlikte), en uzun bekleyen
  başta. Saf modül (tests/unit/askidakiler.test.ts).
*/
export type AskiSatiri = { organization_id: string; product: string; suspended_at: string | null; suspension_reason: string | null };
export type AskidakiKurum = { organizationId: string; urunler: string[]; gun: number | null; sebep: string | null; en_eski: string | null };

const GUN = 86_400_000;

/**
 * @param satirlar askıdaki lisanslar (çekirdek için product = "arvoos")
 * @param musteriMi Arvo'nun kendi kurumu ve grup markaları kuyruğa girmez
 */
export function askidakiKurumlar(satirlar: readonly AskiSatiri[], musteriMi: (id: string) => boolean, simdi: number): AskidakiKurum[] {
  const kurumlar = new Map<string, AskidakiKurum>();
  for (const s of satirlar) {
    if (!musteriMi(s.organization_id)) continue;
    const k = kurumlar.get(s.organization_id) ?? { organizationId: s.organization_id, urunler: [], gun: null, sebep: null, en_eski: null };
    k.urunler.push(s.product);
    /* En eski askı kurumu temsil ediyor: "ne zamandır bekliyor" sorusunun yanıtı o.
       Askı anı yazılmamış eski satırlar sırayı bozmasın diye sona düşüyor. */
    if (s.suspended_at && (!k.en_eski || s.suspended_at < k.en_eski)) {
      k.en_eski = s.suspended_at;
      k.sebep = s.suspension_reason || k.sebep;
    } else if (!k.sebep && s.suspension_reason) k.sebep = s.suspension_reason;
    kurumlar.set(s.organization_id, k);
  }
  return [...kurumlar.values()]
    .map((k) => ({ ...k, gun: k.en_eski ? Math.max(0, Math.floor((simdi - Date.parse(k.en_eski)) / GUN)) : null }))
    .sort((a, b) => (b.gun ?? -1) - (a.gun ?? -1) || a.organizationId.localeCompare(b.organizationId));
}
