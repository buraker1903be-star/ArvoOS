import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { kokDilYonlendirmesi, tercihEdilenDil } from "@/lib/site/dil-secimi";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const yon = (o: Partial<Parameters<typeof kokDilYonlendirmesi>[0]>) =>
  kokDilYonlendirmesi({ pathname: "/", userAgent: CHROME, ...o });

describe("kök adreste dil seçimi", () => {
  test("Türkçe tarayıcı köke gelince /tr'ye gider; İngilizce kökte kalır", () => {
    assert.equal(yon({ acceptLanguage: "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7" }), "/tr");
    assert.equal(yon({ acceptLanguage: "en-US,en;q=0.9" }), null);
    // Desteklenmeyen dil → varsayılan (İngilizce), yönlendirme yok.
    assert.equal(yon({ acceptLanguage: "ja-JP,ja;q=0.9" }), null);
    assert.equal(yon({ acceptLanguage: null }), null);
  });

  test("ağırlık sırası başlık sırasından önce gelir", () => {
    assert.equal(tercihEdilenDil("en;q=0.5,tr;q=0.9"), "tr");
    assert.equal(tercihEdilenDil("ja,tr;q=0.8,en;q=0.7"), "tr");
    assert.equal(tercihEdilenDil("tr;q=0"), null);
  });

  test("seçilen dil çerezi tarayıcı dilinden önce gelir", () => {
    // İngilizce'yi bilerek seçen Türk her açılışta Türkçe'ye atılmamalı.
    assert.equal(yon({ acceptLanguage: "tr-TR", cookie: "en" }), null);
    assert.equal(yon({ acceptLanguage: "en-US", cookie: "tr" }), "/tr");
    // Bozuk çerez yok sayılır.
    assert.equal(yon({ acceptLanguage: "tr-TR", cookie: "xx" }), "/tr");
  });

  test("botlar, iç sayfalar ve GET dışı istekler yönlendirilmez", () => {
    for (const ua of ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "facebookexternalhit/1.1", "curl/8.4.0", ""]) {
      assert.equal(yon({ acceptLanguage: "tr-TR", userAgent: ua }), null, ua);
    }
    assert.equal(yon({ acceptLanguage: "tr-TR", pathname: "/pricing" }), null);
    assert.equal(yon({ acceptLanguage: "tr-TR", method: "POST" }), null);
    // İstemci içi gezinme / önceden yükleme: dil bağlantısının önceden
    // yüklenen / adresi /tr'ye yönlenip tıklamayı boşa çıkarıyordu.
    assert.equal(yon({ acceptLanguage: "tr-TR", rsc: true }), null);
  });
});
