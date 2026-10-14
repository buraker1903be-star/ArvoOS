import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ikincil, zorunlu } from "@/app/panel/platform/konsol-oku";

/*
  Sorgu düştüğünde `data` null geliyor ve `?? []` ile boş diziye
  çevrilince ekran "kayıt yok" diyor. Platform → Ödemeler yanlış sütun
  adı yüzünden iki gün "sorun yok" gösterdi; bu testler o sessizliği
  engelleyen iki yardımcıyı sabitliyor.
*/
describe("konsol okuması", () => {
  test("zorunlu: hata sayfayı düşürüyor, sebebi mesajda", () => {
    assert.throws(
      () => zorunlu({ data: null, error: { message: 'column "x" does not exist' } }, "Abonelikler"),
      /Abonelikler okunamadı: column "x" does not exist/,
    );
  });

  test("zorunlu: hata yoksa veri olduğu gibi geçiyor", () => {
    assert.deepEqual(zorunlu({ data: [1, 2], error: null }, "Liste"), [1, 2]);
  });

  test("zorunlu: BOŞ SONUÇ hata değil", () => {
    /* Boş tablo ile okunamayan tablo ayrı şeyler; boş liste çağıranın
       işi, burada hata yok. */
    assert.deepEqual(zorunlu({ data: [], error: null }, "Liste"), []);
    assert.equal(zorunlu({ data: null, error: null }, "Kayıt"), null);
  });

  test("ikincil: hata sayfayı düşürmüyor ama İŞARETLİYOR", () => {
    const sonuc = ikincil({ data: null, error: { message: "timeout" } }, "Son hareketler");
    assert.equal(sonuc.veri, null);
    assert.equal(sonuc.okunamadi, true, "çağıran bunu ekranda yazmalı");
  });

  test("ikincil: başarılı okuma işaretlenmiyor", () => {
    const sonuc = ikincil({ data: [{ id: 1 }], error: null }, "Son hareketler");
    assert.deepEqual(sonuc.veri, [{ id: 1 }]);
    assert.equal(sonuc.okunamadi, false);
  });
});
