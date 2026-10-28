import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { ADD_ONS, PLANS, SITE_PRODUCTS, YILLIK_ODENEN_AY } from "@/lib/site/pricing";
import { DOVIZ_FIYATLARI, SAYFA_PARA_BIRIMI, paraYaz, sayfaEkKalemTutari, sayfaPlanTutari, sayfaPlanYillikTutari } from "@/lib/site/doviz";
import { LOCALES } from "@/lib/site/routes";

const sitePlanlari = PLANS.filter((p) => (SITE_PRODUCTS as readonly string[]).includes(p.product));

describe("döviz fiyatları", () => {
  test("sitedeki her basamağın ve ek kalemin döviz satırı var", () => {
    for (const kod of [...sitePlanlari.map((p) => p.code), ...ADD_ONS.map((a) => a.code)]) {
      assert.ok(DOVIZ_FIYATLARI[kod], `${kod} için döviz fiyatı yok`);
    }
  });

  test("teklif usulü TL'de neyse dövizde de o (rakam bir yerde var, ötekinde yok olmasın)", () => {
    for (const p of sitePlanlari) {
      for (const kur of ["USD", "EUR"] as const) {
        assert.equal(DOVIZ_FIYATLARI[p.code][kur] === null, p.aylikKurus === null, `${p.code} ${kur}`);
      }
    }
    for (const a of ADD_ONS) {
      for (const kur of ["USD", "EUR"] as const) {
        assert.equal(DOVIZ_FIYATLARI[a.code][kur] === null, a.aylikKurus === null, `${a.code} ${kur}`);
      }
    }
  });

  test("tutarlar tam birim (küsuratsız) tamsayı", () => {
    for (const [kod, t] of Object.entries(DOVIZ_FIYATLARI)) {
      for (const v of [t.USD, t.EUR]) {
        if (v === null) continue;
        assert.ok(Number.isInteger(v) && v > 0 && v % 100 === 0, `${kod}: ${v}`);
      }
    }
  });

  test("sayfa dili para birimini belirler; Türkçe TL listesine bağlı kalır", () => {
    const p = PLANS.find((x) => x.code === "arvoos-baslangic")!;
    assert.equal(sayfaPlanTutari(p, "tr"), p.aylikKurus);
    assert.equal(sayfaPlanTutari(p, "en"), 5900);
    assert.equal(sayfaPlanTutari(p, "de"), 5500);
    assert.equal(sayfaPlanYillikTutari(p, "en"), 5900 * YILLIK_ODENEN_AY);
    assert.equal(sayfaEkKalemTutari("ek-kullanici", "fr"), 800);
    for (const l of LOCALES) assert.ok(SAYFA_PARA_BIRIMI[l]);
  });

  test("para yazımı", () => {
    assert.equal(paraYaz(5900, "en"), "$59");
    assert.match(paraYaz(5500, "de"), /^55\s€$/);
    assert.match(paraYaz(199000, "tr"), /TL$/);
  });
});
