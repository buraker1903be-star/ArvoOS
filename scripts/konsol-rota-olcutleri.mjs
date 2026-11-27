/*
  GERÇEK ROTA ÖLÇÜTLERİ (27.11.2026). Saf: ölçümü alır, kabul/ret
  verir. Ayrı dosya, çünkü tarayıcı betiğinin içinde yazılsaydı
  sınanamazdı — kör kalan bir denetim, denetlediği hatadan farksız
  (tests/unit/konsol-rota-olcutleri.test.ts).

  Ölçütler bu turda ÇIKAN hataların karşılığı; hiçbiri varsayım değil:
  - taşma: telefonda düzen 406 piksel aşağı taşıyor, listenin sonuna
    ulaşılamıyordu.
  - sütun sırası: araya giren bir not ızgaranın ilk gözünü kapınca
    liste ile panel yer değiştiriyordu.
  - yatay taşma: süzgeç satırı sütuna sığmayınca içerik sol gezinmenin
    altına kayıyordu.
  - telefonda tek sütun: detay açıkken liste gizli, "Listeye dön" var.
  - seçili satır: adresle seçilen kayıt listede işaretli.
*/

/** @returns {string[]} boş dizi = kabul. */
export function rotaKusurlari(is, durum, olcum) {
  const k = [];
  if (durum !== 200) k.push(`durum ${durum}`);
  if (!olcum) return k.concat("ölçüm yok");
  if (olcum.tasma > 0) k.push(`düzen ${olcum.tasma}px taşıyor`);
  if (olcum.yatayTasma) k.push("yatay kaydırma var");
  const telefon = is.w <= 860;
  const secimVar = Boolean(is.yol.includes("secili="));
  if (telefon) {
    if (secimVar && olcum.listeGorunur) k.push("telefonda detay açıkken liste gizlenmiyor");
    if (secimVar && !olcum.geriGorunur) k.push("telefonda 'Listeye dön' yok");
    if (!secimVar && olcum.panelGorunur) k.push("telefonda seçim yokken panel görünüyor");
  } else {
    if (!olcum.listeGorunur || !olcum.panelGorunur) k.push("masaüstünde iki sütun yan yana değil");
    /* Liste SOLDA: ızgaranın ilk gözünü başka bir çocuk kapınca
       sütunlar yer değiştiriyordu. */
    if (olcum.liste && olcum.panel && olcum.liste.x >= olcum.panel.x) k.push("liste panelin sağında");
  }
  /* Seçim adreste ve kayıt çözülüyorsa (panel başlığı var) satır
     işaretli olmalı — süzgeç dışındaki kayıt listede yok, orada
     işaret beklenmez. */
  if (secimVar && olcum.panelBaslik && !is.suzgecDisi && olcum.secili !== 1) {
    k.push(`seçili satır işareti ${olcum.secili}`);
  }
  return k;
}
