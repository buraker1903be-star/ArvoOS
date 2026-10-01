/*
  MÜŞTERİ TAKİBİNDE GÖREV AKIŞI.

  Ekran üç parça: tamamlananlar (üstte, üzeri çizili), şu an yapılan iş
  (kalın), sıradaki görev. Bu dosya yalnız o üçe ayırmayı yapar; görünüm
  status-view.tsx'te.

  Kurumun çizimine göre ekranda ÜÇ satır var ve bunlar ilerleme halkasının
  yanından oklarla açılıyor: en son biten iş (üzeri çizili), şu an yapılan
  iş (kalın), sıradaki iş. İş ilerledikçe üç satır yukarı kayar — "kayan
  sistem" budur.

  Üç satırı burada seçiyoruz çünkü seçim göründüğünden incelikli:
  "en son biten" listenin SONUNCU done kaydıdır, ilki değil; ters alırsak
  müşteri haftalar önce biten işi güncel sanır. Sessiz bir hata, ekranda
  dolu görünür. Test onu yakalıyor.
*/

export type TakipGorevi = { ad: string; asama: string; durum: "done" | "current" | "upcoming" };

export type GorevAkisiSonucu = {
  /** Halkanın yanındaki üç satırın ilki: EN SON biten iş. */
  sonBiten: TakipGorevi | null;
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
    sonBiten: bitenler.length ? bitenler[bitenler.length - 1] : null,
    // Şu anki görevi veritabanı seçiyor; burada yeniden türetilmez.
    simdi: gorevler.find((g) => g.durum === "current") ?? null,
    siradaki: siradakiler[0] ?? null,
    kalan: Math.max(0, siradakiler.length - 1),
    tamamlanan: bitenler.length,
    toplam: gorevler.length,
  };
}
