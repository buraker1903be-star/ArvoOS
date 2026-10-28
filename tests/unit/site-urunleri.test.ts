import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ARC_APP, LEGACY_REDIRECTS, PRODUCT_APPS, ROUTES, productList, resolvePath } from "@/lib/site/routes";
import { buildLlmsFullTxt, buildLlmsTxt } from "@/lib/site/llms";

/*
  28.10.2026: ArvoARC satıştan kalktı (yalnızca e-ticaret sitesi yaptırana
  panel olarak veriliyor), Arvo Randevu'nun adı ArvoBook oldu. Eski
  adresler dizinde ve paylaşılmış bağlantılarda yaşıyor; 404 vermemeli.
*/
describe("sitedeki ürünler", () => {
  test("ArvoARC'ın sayfası yok, eski adresi web sitesi hizmetine iner", () => {
    assert.equal(resolvePath("/urunler/arc"), null);
    const yonlendir = (from: string) => LEGACY_REDIRECTS.find((r) => r.from === from)?.to;
    assert.equal(yonlendir("/urunler/arc"), ROUTES["web-design"].tr);
    assert.equal(yonlendir("/en/products/arc"), ROUTES["web-design"].en);
  });

  test("Arvo Randevu → ArvoBook: yeni adres, eski adres yönlenir", () => {
    assert.equal(PRODUCT_APPS.randevu.name, "ArvoBook");
    assert.deepEqual(resolvePath(ROUTES.randevu.tr), { id: "randevu", locale: "tr" });
    const yonlendir = (from: string) => LEGACY_REDIRECTS.find((r) => r.from === from)?.to;
    assert.equal(yonlendir("/urunler/randevu"), ROUTES.randevu.tr);
    assert.equal(yonlendir("/en/products/randevu"), ROUTES.randevu.en);
  });

  test("yönlendirmeler döngü kurmaz ve var olan bir sayfaya iner", () => {
    for (const { from, to } of LEGACY_REDIRECTS) {
      assert.notEqual(from, to);
      assert.ok(resolvePath(to), `${from} → ${to}: hedef sayfa yok`);
      assert.equal(resolvePath(from), null, `${from}: hâlâ bir sayfa`);
    }
  });

  test("ürün listesi, hukuki metinler ve llms.txt ArvoARC'ı ürün olarak saymaz", () => {
    assert.equal(productList("tr"), "ArvoOS, ArvoLab ve ArvoBook");
    assert.doesNotMatch(buildLlmsTxt(), /ArvoARC/);
    assert.doesNotMatch(buildLlmsFullTxt(), /ArvoARC/);
    // Paneli yaşıyor: e-ticaret sitesi teslim edilen kurum giriş adresini bulabilmeli.
    assert.equal(ARC_APP.host, "arc.arvo-os.com");
  });
});
