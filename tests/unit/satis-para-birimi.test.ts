import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  acikKanallar,
  birimDurumu,
  kanalDurumlari,
  secimKarsilanabilir,
  urunParaDurumu,
  type UrunGirdisi,
} from "../../lib/satis-para-birimi";

/*
  Satış para birimi kararı. Sınanan asıl kural tek cümle: para birimi
  SESSİZCE düşmez. Fiyat ya da kanal eksikse işlem TRY'ye çevrilmez,
  sebep gösterilir.
*/

const kanalsiz = { havaleHesabiVar: false, kartDogrulandi: false };
const havaleli = { havaleHesabiVar: true, kartDogrulandi: false };
const tamKanal = { havaleHesabiVar: true, kartDogrulandi: true };

const girdi = (ek: Partial<UrunGirdisi> = {}): UrunGirdisi => ({
  urun: "arvolab",
  fiyatliBirimler: ["TRY", "USD"],
  kanal: { TRY: tamKanal, USD: havaleli },
  usdAcik: false,
  usdVarsayilanAday: true,
  ...ek,
});

describe("kanal durumu", () => {
  test("kart doğrulanmadıysa otomatik yenileme de kapalı", () => {
    /* Kayıtlı karttan çekim aynı uçtan yapılıyor; kart kapalıyken
       yenilemeyi açık göstermek, yenileme gününde sessiz bir hata. */
    const k = kanalDurumlari("USD", havaleli);
    assert.equal(k.find((x) => x.kanal === "kart")!.kullanilabilir, false);
    assert.equal(k.find((x) => x.kanal === "otomatik_yenileme")!.kullanilabilir, false);
    assert.match(k.find((x) => x.kanal === "kart")!.neden ?? "", /PayTR hesabında doğrulanmadı/);
  });

  test("havale hesabı yoksa sebebi yazılıyor", () => {
    const k = kanalDurumlari("USD", kanalsiz);
    assert.match(k.find((x) => x.kanal === "havale")!.neden ?? "", /doğrulanmış banka hesabı tanımlı değil/);
  });
});

describe("birim satılabilirliği", () => {
  test("fiyat var + kanal var = satılabilir", () => {
    const d = birimDurumu("USD", true, kanalDurumlari("USD", havaleli));
    assert.equal(d.satilabilir, true);
    assert.equal(d.neden, null);
  });

  test("fiyat yoksa satılamaz", () => {
    const d = birimDurumu("USD", false, kanalDurumlari("USD", tamKanal));
    assert.equal(d.satilabilir, false);
    assert.match(d.neden ?? "", /USD fiyatı yayımlanmadı/);
  });

  test("kanal yoksa satılamaz ve sebep kanalları sayıyor", () => {
    const d = birimDurumu("USD", true, kanalDurumlari("USD", kanalsiz));
    assert.equal(d.satilabilir, false);
    assert.match(d.neden ?? "", /tahsilat kanalı yok/);
    assert.match(d.neden ?? "", /banka hesabı/);
  });
});

describe("ürün varsayılanı", () => {
  test("ArvoLab: fiyat ve kanal hazırsa USD varsayılan", () => {
    const d = urunParaDurumu(girdi());
    assert.equal(d.varsayilan, "USD");
    assert.match(d.varsayilanNedeni, /USD fiyatı yayımlandı ve USD tahsilat kanalı doğrulandı/);
  });

  test("USD fiyatı yoksa varsayılan TRY kalıyor ve sebebi yazılıyor", () => {
    const d = urunParaDurumu(girdi({ fiyatliBirimler: ["TRY"] }));
    assert.equal(d.varsayilan, "TRY");
    assert.match(d.varsayilanNedeni, /USD varsayılan olamadı.*fiyatı yayımlanmadı/);
  });

  test("USD kanalı yoksa varsayılan TRY kalıyor", () => {
    const d = urunParaDurumu(girdi({ kanal: { TRY: tamKanal, USD: kanalsiz } }));
    assert.equal(d.varsayilan, "TRY");
    assert.match(d.varsayilanNedeni, /tahsilat kanalı yok/);
  });

  test("öteki ürünlerde USD ancak yönetici açarsa varsayılan olur", () => {
    const kapali = urunParaDurumu(girdi({ urun: "arvoos", usdVarsayilanAday: false }));
    assert.equal(kapali.varsayilan, "TRY");
    assert.match(kapali.varsayilanNedeni, /USD satışı açılmadı/);

    const acik = urunParaDurumu(girdi({ urun: "arvoos", usdVarsayilanAday: false, usdAcik: true }));
    assert.equal(acik.varsayilan, "USD");
    assert.match(acik.varsayilanNedeni, /Yönetici bu ürün için USD satışını açtı/);
  });

  test("yönetici açsa bile koşul sağlanmazsa USD varsayılan olmuyor", () => {
    const d = urunParaDurumu(girdi({ urun: "arvoos", usdVarsayilanAday: false, usdAcik: true, fiyatliBirimler: ["TRY"] }));
    assert.equal(d.varsayilan, "TRY");
  });
});

describe("müşterinin açık seçimi", () => {
  test("karşılanamıyorsa SESSİZCE TRY'ye düşmüyor, sebep dönüyor", () => {
    const d = urunParaDurumu(girdi({ fiyatliBirimler: ["TRY"] }));
    const sonuc = secimKarsilanabilir(d, "USD");
    assert.equal(sonuc.uygun, false);
    assert.match(sonuc.uygun === false ? sonuc.neden : "", /USD fiyatı yayımlanmadı/);
  });

  test("karşılanabiliyorsa uygun", () => {
    assert.deepEqual(secimKarsilanabilir(urunParaDurumu(girdi()), "USD"), { uygun: true });
    assert.deepEqual(secimKarsilanabilir(urunParaDurumu(girdi()), "TRY"), { uygun: true });
  });
});

describe("açık kanallar", () => {
  test("USD'de bugün yalnızca havale açık", () => {
    /* Kart ve otomatik yenileme PayTR hesabında doğrulanana kadar
       kapalı (28.11.2026). */
    assert.deepEqual(acikKanallar(urunParaDurumu(girdi()), "USD"), ["havale"]);
  });

  test("TRY'de üç kanal da açık", () => {
    assert.deepEqual(acikKanallar(urunParaDurumu(girdi()), "TRY"), ["havale", "kart", "otomatik_yenileme"]);
  });
});
