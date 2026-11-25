import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error — betik modülü düz JS (scripts/stil-sinif-ayikla.mjs ile aynı kalıp).
import { tekEkranHukmu } from "../../scripts/tek-ekran-kabulu.mjs";

/*
  Kör kalan bir kabul, kabul ettiği hatadan farksızdır: aşağıdaki sayılar
  uydurma değil, 25.11.2026'da kurucu konsolunda GERÇEKTEN ölçülen "önce"
  değerleri (scripts/genel-bakis-yerlesim-tarayici.mjs). Hüküm bunları
  geçirirse düzeltme sessizce geri alınabilir.
*/

/** 768×600, düzeltmeden önce: sayfa taşması sıfır ama kuyruk paneli 0 px. */
const ONCE_768x600 = {
  sayfaDikey: "600/600", sayfaYatay: "768/768", dockOrtuyor: false, icerikAlt: 510, dockUstu: 524,
  erisim: { panelH: 0, sonLiYuk: 65, sonKayitPanelde: false, dokunma: false, klavye: true, dockUstunde: true },
  secimler: {
    "Bugünün İşleri": { sayfaDikey: "600/600", dockOrtuyor: false, govde: { kabul: false } },
    Tahsilat: { sayfaDikey: "657/600", dockOrtuyor: true, govde: { kabul: false } },
  },
};

/** 768×600, düzeltmeden sonra ölçülen değerler. */
const SONRA_768x600 = {
  sayfaDikey: "600/600", sayfaYatay: "768/768", dockOrtuyor: false, icerikAlt: 510, dockUstu: 524,
  erisim: { panelH: 139, sonLiYuk: 65, sonKayitPanelde: true, dokunma: true, klavye: true, dockUstunde: true,
    icSekme: { sonGorunur: true } },
  secimler: {
    "Bugünün İşleri": { sayfaDikey: "600/600", dockOrtuyor: false, govde: { kabul: true } },
    Tahsilat: { sayfaDikey: "600/600", dockOrtuyor: false, govde: { kabul: true } },
    "Sistem sağlığı": { sayfaDikey: "600/600", dockOrtuyor: false, govde: { kabul: true } },
    "Son hareketler": { sayfaDikey: "600/600", dockOrtuyor: false, govde: { kabul: true } },
  },
};

test("taşması sıfır olan ama kaydına erişilemeyen ekran KABUL EDİLMEZ", () => {
  const h = tekEkranHukmu("768x600 acik konsol", ONCE_768x600);
  assert.equal(h.gecti, false);
  // Hangi ölçütün düştüğü tek tek söylenmeli: "geçmedi" demek bir sonraki
  // kişiye nereye bakacağını söylemez.
  assert.ok(h.eksik.some((m: string) => m.includes("son kayıt panele sığmıyor")), h.eksik.join(" | "));
  assert.ok(h.eksik.some((m: string) => m.includes("tıklanamıyor")), h.eksik.join(" | "));
  assert.ok(h.eksik.some((m: string) => m.includes("Tahsilat: sayfa kayıyor (657/600)")), h.eksik.join(" | "));
  assert.ok(h.eksik.some((m: string) => m.includes("Tahsilat: dock içeriği örtüyor")), h.eksik.join(" | "));
});

test("düzeltmeden sonraki ölçüm geçer", () => {
  assert.deepEqual(tekEkranHukmu("768x600 acik konsol", SONRA_768x600), {
    ad: "768x600 acik konsol", gecti: true, eksik: [],
  });
});

test("ölçülemeyen dock örtmesi GEÇMİŞ sayılmaz", () => {
  /* Görünür kart bulunamayınca Math.max(...[]) -Infinity dönüyor ve örtme
     hiçbir şey ölçmeden "yok" çıkıyordu; null artık düşürür. */
  const h = tekEkranHukmu("390x844 acik konsol", {
    ...SONRA_768x600, dockOrtuyor: null, icerikAlt: null,
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("ölçülemedi")), h.eksik.join(" | "));
});

test("yatay taşma da düşürür", () => {
  const h = tekEkranHukmu("390x844", { ...SONRA_768x600, sayfaYatay: "401/390" });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("yatay kayıyor (401/390)")), h.eksik.join(" | "));
});

test("klavyeyle odaklanılamayan eylem düşürür", () => {
  const h = tekEkranHukmu("1440x600", {
    ...SONRA_768x600, erisim: { ...SONRA_768x600.erisim, klavye: false },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("klavyeyle odaklanamıyor")), h.eksik.join(" | "));
});

test("iç sekme şeridinin sonuna ulaşılamıyorsa düşer", () => {
  const h = tekEkranHukmu("390x844", {
    ...SONRA_768x600, erisim: { ...SONRA_768x600.erisim, icSekme: { sonGorunur: false } },
  });
  assert.equal(h.gecti, false);
  assert.ok(h.eksik.some((m: string) => m.includes("iç sekme")), h.eksik.join(" | "));
});
