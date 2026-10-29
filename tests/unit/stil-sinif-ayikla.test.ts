import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error — denetim betiği düz JS; tipi yok, davranışı burada sabitleniyor.
import { gomuluCss, siniflar } from "../../scripts/stil-sinif-ayikla.mjs";

/*
  TANIMSIZ SINIF DENETİMİNİN BEYNİ.

  Denetim 29.10.2026'da eklendi çünkü `check:css` yalnızca "tanımlı
  ama rotaya girmiyor" hâlini görüyordu; hiçbir CSS'te karşılığı
  olmayan ad sessizce geçiyordu ve o boşluktan kartsız bir sayfa
  canlıya çıktı.

  Burada sınanan, denetimin yanlış alarm vermemesi. Yanlış alarm
  veren bir denetim susturuluyor; susturulan denetim yok sayılıyor.
*/

const sinif = (metin: string) => [...(siniflar(metin) as Set<string>)].sort();
const css = (metin: string) => [...(gomuluCss(metin) as Set<string>)].sort();

describe("JSX'ten sınıf ayıklama", () => {
  it("düz dizgideki sınıfları okuyor", () => {
    assert.deepEqual(sinif('<div className="talep-bas hedefler-kart">'), ["hedefler-kart", "talep-bas"]);
  });

  it("şablon dizgisindeki yazılı sınıfları okuyor", () => {
    assert.deepEqual(sinif("<div className={`os-menu talep-menu`}>"), ["os-menu", "talep-menu"]);
  });

  /*
    EN ÖNEMLİ KURAL. `${dragging ? "is-dragging" : ""}` yazımında
    değişken adı sınıf sanılıyordu: ilk ölçümde 64 adayın 24'ü
    böyleydi (dragging, first, last, checked, unread…).
  */
  it("şablon ifadesinin içindeki değişken adını sınıf saymıyor", () => {
    const ayiklanan = sinif('<div className={`msg-line${first ? " is-first" : ""}${dragging ? " is-dragging" : ""}`}>');
    assert.ok(ayiklanan.includes("msg-line"));
    assert.ok(!ayiklanan.includes("first"), "değişken adı sınıf sayılmamalı");
    assert.ok(!ayiklanan.includes("dragging"), "değişken adı sınıf sayılmamalı");
    /* Bedeli: ifadenin İÇİNDEKİ gerçek sınıf da denetlenmiyor. */
    assert.ok(!ayiklanan.includes("is-first"));
  });

  it("dinamik önek tek başına sınıf sayılmıyor", () => {
    // `is-${durum}` → "is-" kalıyor; sondaki tire kebab kalıbına uymuyor.
    assert.deepEqual(sinif("<span className={`os-live-pill is-${durum}`}>"), ["os-live-pill"]);
  });

  it("kebab olmayan adlar elenir (JS tanımlayıcıları, nokta taşıyanlar)", () => {
    const ayiklanan = sinif('<div className="kart isWeak m.aylik.length Kart 2xl">');
    assert.deepEqual(ayiklanan, ["kart"]);
  });

  it("className olmayan dizgilere bakmıyor", () => {
    assert.deepEqual(sinif('<a href="/panel/hr" title="talep-bas">'), []);
  });
});

describe("gömülü CSS", () => {
  it("şablon içindeki stil bloğunun sınıflarını tanım sayıyor", () => {
    const metin = "const stil = `.doc-sheet{padding:10px} .doc-title{font-size:18px}`;";
    assert.deepEqual(css(metin), ["doc-sheet", "doc-title"]);
  });

  it("CSS olmayan şablonu stil sanmıyor", () => {
    assert.deepEqual(css("const yol = `/panel/hr/${id}`;"), []);
    assert.deepEqual(css("const cumle = `Merhaba ${ad}, bugün 3 işin var`;"), []);
  });

  it("seçicisi olmayan nesne şablonunu stil saymıyor", () => {
    assert.deepEqual(css("const q = `select * from x where y:1;`;"), []);
  });
});
