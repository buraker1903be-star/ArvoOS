/*
  Görünüm seçicide hangi panelin seçili sayılacağı (saf kural; birim testi
  tests/unit/gorunum-secimi.test.ts).

  - Seçili anahtar listede yoksa ilk panel. Eskiden seçim olduğu gibi
    kalıyordu: kısa/dar ekranda "Kurulum" seçiliyken kurulum başka sekmede
    tamamlanınca canlı yenileme paneli kaldırıyor, CSS seçili olmayan her
    paneli gizlediği için ekranda HİÇBİR panel kalmıyordu (10.11.2026).
  - Geniş ekranda (≥761px) telefona özel panel görünmez; seçiliyse ilk
    telefona özel olmayan panele inilir.
*/
export type SecilebilirPanel = { anahtar: string; sadeceTelefon?: boolean };

export function gecerliSecim(paneller: SecilebilirPanel[], secim: string, genis: boolean): string {
  const mevcut = paneller.find((p) => p.anahtar === secim) ?? paneller[0];
  if (!mevcut) return secim;
  if (genis && mevcut.sadeceTelefon) return paneller.find((p) => !p.sadeceTelefon)?.anahtar ?? mevcut.anahtar;
  return mevcut.anahtar;
}
