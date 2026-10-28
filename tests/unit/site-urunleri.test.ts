import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ARC_APP, LEGACY_REDIRECTS, PRODUCT_APPS, ROUTES, alternatesFor, productList, resolvePath } from "@/lib/site/routes";
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

  test("28.10.2026'ya kadarki her adres yeni yerine iner: Türkçe kökten /tr'ye, /en kökten köke", () => {
    const yonlendir = (from: string) => LEGACY_REDIRECTS.find((r) => r.from === from)?.to;
    assert.equal(ROUTES.home.en, "/");
    assert.equal(ROUTES.home.tr, "/tr");
    assert.equal(yonlendir("/ucretler"), "/tr/ucretler");
    assert.equal(yonlendir("/urunler/arvoos/moduller"), "/tr/urunler/arvoos/moduller");
    assert.equal(yonlendir("/en"), "/");
    assert.equal(yonlendir("/en/pricing"), "/pricing");
    assert.equal(yonlendir("/en/products/arvobook"), "/products/arvobook");
    // Kök yönlendirilmez: artık İngilizce ana sayfa (dil seçimi taşıyor).
    assert.equal(yonlendir("/"), undefined);
    // Her sayfanın iki eski adresi de var (ana sayfanın Türkçesi hariç).
    for (const id of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
      if (id !== "home") assert.ok(LEGACY_REDIRECTS.some((r) => r.to === ROUTES[id].tr), `${id}: eski Türkçe adres yönlenmiyor`);
      assert.ok(LEGACY_REDIRECTS.some((r) => r.to === ROUTES[id].en), `${id}: eski İngilizce adres yönlenmiyor`);
    }
  });

  test("hreflang x-default İngilizce", () => {
    assert.equal(alternatesFor("pricing")["x-default"], "https://arvo-os.com/pricing");
    assert.equal(alternatesFor("pricing")["tr-TR"], "https://arvo-os.com/tr/ucretler");
    assert.equal(alternatesFor("home")["x-default"], "https://arvo-os.com");
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
