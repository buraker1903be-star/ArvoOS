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

/**
 * Bilinen, gerekçesi yazılı bir gözlemi kusur listesinden düşürür.
 *
 * Deponun üslubu: bir denetimi susturmanın bedeli SEBEBİ YAZMAK
 * (`tuzak-tamam:`, `hata-tamam:` gibi). Burada da işin `bilinen`
 * alanı hem deseni hem gerekçeyi taşıyor; eşleşen gözlem listeden
 * düşer ama ekrana "bilinen" diye basılır, yani kaybolmaz.
 *
 * @returns {{ kusurlar: string[], bilinenler: string[] }}
 */
export function kusurlariAyikla(kusurlar, bilinen) {
  if (!bilinen) return { kusurlar, bilinenler: [] };
  const desen = new RegExp(bilinen.desen);
  const bilinenler = [];
  const kalan = [];
  for (const k of kusurlar) (desen.test(k) ? bilinenler : kalan).push(k);
  return { kusurlar: kalan, bilinenler: bilinenler.map((k) => `${k} — bilinen: ${bilinen.sebep}`) };
}

/** @returns {string[]} boş dizi = kabul. */
export function rotaKusurlari(is, durum, olcum) {
  const k = [];
  if (durum !== 200) k.push(`durum ${durum}`);
  /*
    HEDEF VE İÇERİK AYRI ÖLÇÜLÜYOR (27.11.2026). Yönlendiren bir
    adres "doğru yere gitti" diye kabul edilemez: gidilen sayfanın
    beklenen şeyi gösterdiği de görülmeli. İki ölçüt ayrı, çünkü
    doğru adrese gidip boş/yanlış ekran açmak da bir kusur.
  */
  if (is.hedef && olcum?.adres !== undefined && olcum.adres !== is.hedef) {
    k.push(`hedef adres ${olcum.adres} (beklenen ${is.hedef})`);
  }
  if (is.icerik && olcum?.metin !== undefined && !new RegExp(is.icerik).test(olcum.metin)) {
    k.push(`beklenen içerik yok: /${is.icerik}/`);
  }
  if (!olcum) return k.concat("ölçüm yok");
  if (olcum.tasma > 0) k.push(`düzen ${olcum.tasma}px taşıyor`);
  if (olcum.yatayTasma) k.push("yatay kaydırma var");
  /* `tamSayfa`: liste–panel düzeni OLMAYAN rota (müşteri kartı,
     paylaşılmış görüşme bağlantısı). İki sütun ölçütleri orada
     geçersiz; bayrak AÇIKÇA isteniyor, yoksa liste rotasında düzenin
     hiç çizilmemesi de "kusursuz" sayılırdı. */
  if (is.tamSayfa) {
    if (olcum.liste || olcum.panel) k.push("tam sayfa rotada liste–panel düzeni var");
    return k;
  }
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
