// Müşteri cari bakiyeleri. Cari Hesaplar sekmesi ile Finans genel bakış aynı
// kuralla hesaplasın diye tek yerde (eskiden finance/page.tsx içindeydi).
//
// Kural: carinin imzalı sözleşmesi varsa borç = sözleşme toplamı + "Ek
// hizmet ·" kayıtları; yoksa defterdeki borç kayıtları (düzeltmeler hariç).
// Tahsilat, borç + iade toplamını aşamaz; bakiye eksiye düşmez.
//
// İŞLEV ARTIK TOPLAM ALIYOR, HAREKET DEĞİL (11.10.2026). Liste sayfaları
// toplamları veritabanından okuyor (cari_liste görünümü); her carinin
// yüzlerce hareketini yalnızca dört toplam için taşımak, defter
// büyüdükçe panelin en pahalı okuması oluyordu. KURAL değişmedi:
// hangi hareketin neye sayıldığı hâlâ burada (hareketToplamlari) ve
// karar hâlâ burada — SQL yalnızca topluyor.
//
// Birim testi: tests/unit/cari-bakiye.test.ts (kural) ve ortak örnek
// tablosu tests/fixtures/cari-hareketleri.json (toplamlar; aynı tablo
// tests/db/cari-liste-gorunumu.test.mjs'te görünüme uygulanıyor).

export type CariToplam = {
  /** Düzeltme DIŞINDAKİ borç kayıtları. */
  defter_borc: number;
  /** "Ek hizmet ·" ile başlayan elle girilmiş borçlar. */
  ek_hizmet: number;
  /** Alacak (tahsilat) kayıtları. */
  tahsilat: number;
  /** Düzeltme türündeki borç kayıtları: iade. */
  iade: number;
};

type EntryLike = { entry_type: string; amount: number; source_type: string | null; description: string };

/**
 * Hareket listesinden dört toplam. Hareketleri elinde tutan çağıranlar
 * (müşteri detayı gibi tek cari okuyan ekranlar) bunu kullanıyor;
 * listeler aynı toplamları veritabanından alıyor.
 */
export function hareketToplamlari(entries: EntryLike[] | null | undefined): CariToplam {
  const liste = entries ?? [];
  const topla = (secici: (e: EntryLike) => boolean) =>
    liste.filter(secici).reduce((s, e) => s + Number(e.amount), 0);
  return {
    defter_borc: topla((e) => e.entry_type === "debit" && e.source_type !== "adjustment"),
    ek_hizmet: topla((e) => e.entry_type === "debit" && e.source_type === "manual" && e.description.startsWith("Ek hizmet ·")),
    tahsilat: topla((e) => e.entry_type === "credit"),
    iade: topla((e) => e.entry_type === "debit" && e.source_type === "adjustment"),
  };
}

/** Net tahsilat: tahsilattan iade düşülmüş, eksiye düşmeyen. */
export function netTahsilatToplamdan(toplam: CariToplam): number {
  return Math.max(0, Math.round(Number(toplam.tahsilat) - Number(toplam.iade)));
}

export function buildAccountBalances<P extends { id: string } & CariToplam>(
  parties: P[],
  contracts: { party_id: string | null; amount: number }[],
) {
  const contractTotals = new Map<string, number>();
  for (const contract of contracts)
    if (contract.party_id)
      contractTotals.set(contract.party_id, (contractTotals.get(contract.party_id) ?? 0) + Number(contract.amount));

  const accounts = parties.map((party) => {
    /* Sözleşme imzalanınca deftere de borç kaydı düşüyor; ikisini
       toplamak borcu iki katına çıkarırdı. Sözleşmeli caride defter
       borcu yerine sözleşme toplamı + ek hizmetler. */
    const debt = contractTotals.has(party.id)
      ? (contractTotals.get(party.id) ?? 0) + Number(party.ek_hizmet)
      : Number(party.defter_borc);
    const refunds = Number(party.iade);
    /* Fazla kaydedilmiş tahsilat (çift giriş) bakiyeyi eksiye düşürüp
       "kurum müşteriye borçlu" gibi gösterirdi. */
    const collections = Math.min(Number(party.tahsilat), debt + refunds);
    return {
      ...party,
      debt,
      collections,
      refunds,
      balance: Math.max(0, debt + refunds - collections),
    };
  });

  const totals = accounts.reduce(
    (r, a) => ({
      debt: r.debt + a.debt,
      collections: r.collections + a.collections,
      refunds: r.refunds + a.refunds,
      balance: r.balance + a.balance,
    }),
    { debt: 0, collections: 0, refunds: 0, balance: 0 },
  );

  return { accounts, totals };
}
