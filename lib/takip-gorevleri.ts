/*
  MÜŞTERİ TAKİBİNDE GÖREV AKIŞI.

  Ekran üç parça: tamamlananlar (üstte, üzeri çizili), şu an yapılan iş
  (kalın), sıradaki görev. Bu dosya yalnız o üçe ayırmayı yapar; görünüm
  status-view.tsx'te.

  Burada ayrı bir modül olmasının nedeni DOM SIRASI: tamamlananlar listesi
  CSS'te `flex-direction:column-reverse` ile kuruluyor (kaydırıcıyı JS'siz
  sona dayamanın tek yolu; bu dosya hook kullanamaz). column-reverse'te
  DOM'daki ilk eleman EN ALTTA görünür, yani listeyi ters basmak gerekir.
  Ters basmayı unutmak sessiz bir hata: liste yine dolu görünür ama
  tamamlanan işler tersten sıralanır. Test onu yakalıyor.
*/

export type TakipGorevi = { ad: string; asama: string; durum: "done" | "current" | "upcoming" };

export type GorevAkisiSonucu = {
  /** DOM sırası: column-reverse yüzünden ters; ekranda kronolojik görünür. */
  bitenlerDom: TakipGorevi[];
  simdi: TakipGorevi | null;
  siradaki: TakipGorevi | null;
  /** Sıradakinden sonra kalan görev sayısı. */
  kalan: number;
  tamamlanan: number;
  toplam: number;
};

export function gorevAkisi(gorevler: TakipGorevi[] | undefined | null): GorevAkisiSonucu | null {
  if (!gorevler?.length) return null;
  const bitenler = gorevler.filter((g) => g.durum === "done");
  const siradakiler = gorevler.filter((g) => g.durum === "upcoming");
  return {
    bitenlerDom: [...bitenler].reverse(),
    // Şu anki görevi veritabanı seçiyor; burada yeniden türetilmez.
    simdi: gorevler.find((g) => g.durum === "current") ?? null,
    siradaki: siradakiler[0] ?? null,
    kalan: Math.max(0, siradakiler.length - 1),
    tamamlanan: bitenler.length,
    toplam: gorevler.length,
  };
}
