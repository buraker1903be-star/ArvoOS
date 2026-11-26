/*
  SEÇİLEN TEMA YENİLEMEDEN SONRA DA DURUR.

  Görünen hata: panelde koyu tema seçiliyor, sayfa yenilenince aydınlığa
  dönüyordu. localStorage'da değer duruyordu ve kök yerleşimdeki betik de
  doğru çalışıyordu — nitelik hidrasyondan SONRA siliniyordu.

  Sebep ThemeToggle'ın başlangıç durumuydu: `document` sunucuda olmadığı
  için orası hep "light" veriyor, istemci ise gerçek değeri okuyordu.
  Kayıtlı tema koyuysa sunucunun çizdiğiyle istemcinin ilk çizimi
  uyuşmuyor; React kökü baştan çiziyor ve kendi ağacında `data-theme`
  diye bir nitelik olmadığı için betiğin eklediğini siliyor.

  01.10.2026'da yerel üretim derlemesinde iki denekle ölçüldü: aynı depo
  ve aynı sistem temasıyla, düğmesi OLMAYAN sayfada nitelik "dark"
  kalıyor, düğmesi OLAN sayfada null oluyordu. Tek fark bu bileşendi.

  Bu test iki tarafı da tutuyor: düğme ilk çizimde DOM okumayacak, kök
  yerleşim de kayıtlı temayı geri okumaya devam edecek. İkisinden biri
  giderse hata aynen geri gelir.
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const oku = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("tema kalıcılığı", () => {
  test("düğme ilk çizimde DOM okumuyor", () => {
    const kaynak = oku("app/panel/theme-toggle.tsx");
    /*
      Yasak kalıp: useState'in başlangıç değerini document'tan almak.
      Sunucuda document yok; o dal hep "light" veriyor ve uyuşmazlık
      doğuyor.
    */
    assert.ok(
      !/useState\s*[(<][\s\S]{0,300}?document\./.test(kaynak),
      "ThemeToggle başlangıç durumunu document'tan okuyor: hidrasyon uyuşmazlığı tema seçimini siler",
    );
    /* Sunucu/istemci farkının desteklenen yolu: ayrı sunucu anlık görüntüsü. */
    assert.match(kaynak, /useSyncExternalStore/);
  });

  /*
    26.11.2026: ön boyama betiği kök yerleşimin içinden lib/konsol-giris/tema.ts'e
    TAŞINDI (üç tercihli modele geçerken). Kural değişmedi, yeri değişti:
    testler betiği yeni kaynağından okuyor ve yerleşimin onu gömdüğünü
    ayrıca doğruluyor. Betik yerleşime gömülmezse kayıtlı tema geri
    okunmaz ve hata ilk hâliyle geri gelir.
  */
  test("kök yerleşim kayıtlı temayı geri okuyor", () => {
    const yerlesim = oku("app/layout.tsx");
    assert.match(yerlesim, /TEMA_BETIGI/, "kök yerleşim ön boyama betiğini gömmüyor");
    const betik = oku("lib/konsol-giris/tema.ts");
    assert.match(betik, /localStorage\.getItem\(K\)/);
    assert.match(betik, /TEMA_ANAHTARI = "arvoos\.theme"/);
    assert.match(betik, /setAttribute\("data-theme"/);
  });

  test("düğme ve yerleşim aynı anahtarı kullanıyor", () => {
    /* Anahtar iki dosyada ayrı yazılı; biri değişip öteki kalırsa seçim
       yazılır ama hiç geri okunmaz — hatanın ilk hâli tam buydu. */
    const dugme = oku("app/panel/theme-toggle.tsx");
    const betik = oku("lib/konsol-giris/tema.ts");
    const anahtar = dugme.match(/const THEME_KEY = "([^"]+)"/)?.[1];
    assert.equal(anahtar, "arvoos.theme");
    assert.ok(betik.includes(`TEMA_ANAHTARI = "${anahtar}"`));
  });
});
