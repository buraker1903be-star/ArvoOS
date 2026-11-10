import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { abonelikDonemi, bitisDamgasi, enYakinBitis, ODEME_UZAMA_KURALI } from "@/lib/abonelik-donemi";

/*
  OS-05 (09.11.2026): kurumun Abonelik ekranında dönem bilgisi.
  Sentetik satırlar organization_licenses / organization_product_licenses
  sütunlarıyla aynı biçimde (durum, current_period_end, trial_ends_at).
*/
const DONEM = "2026-12-01T20:59:59Z";
const DENEME = "2026-11-20T20:59:59Z";

describe("bitiş kaynağı (platform yenileme takviminin kuralı)", () => {
  test("deneme → trial_ends_at; diğerleri → current_period_end", () => {
    assert.equal(bitisDamgasi("trialing", DONEM, DENEME), DENEME);
    for (const durum of ["active", "past_due", "suspended", "canceled", "inactive"]) {
      assert.equal(bitisDamgasi(durum, DONEM, DENEME), DONEM);
    }
  });
});

describe("abonelik dönemi", () => {
  test("tarihli aktif lisans: dönem sonu, açıklama yok", () => {
    const d = abonelikDonemi({ durum: "active", donemSonu: DONEM, denemeSonu: null });
    assert.deepEqual(d, { tarih: DONEM, etiket: "Dönem sonu", aciklama: null, bilinmiyor: false });
  });

  test("deneme: eskiden '—' çıkıyordu; artık deneme sonu ve ödemenin denemeyi bitirdiği", () => {
    const d = abonelikDonemi({ durum: "trialing", donemSonu: null, denemeSonu: DENEME });
    assert.equal(d.tarih, DENEME);
    assert.equal(d.etiket, "Deneme sonu");
    assert.match(d.aciklama ?? "", /deneme biter/);
  });

  test("tarihsiz durumlar: '—' yerine bilinen neden; tarih uydurulmaz", () => {
    assert.match(abonelikDonemi({ durum: "active", donemSonu: null, denemeSonu: null }).aciklama ?? "", /dönem sonu tarihi kayıtlı değil/);
    assert.match(abonelikDonemi({ durum: "trialing", donemSonu: DONEM, denemeSonu: null }).aciklama ?? "", /Deneme süresinin bitiş tarihi kayıtlı değil/);
    assert.equal(abonelikDonemi({ durum: "trialing", donemSonu: DONEM, denemeSonu: null }).tarih, null, "denemede dönem sonu deneme bitişi yerine geçmez");
    assert.match(abonelikDonemi({ durum: "inactive", donemSonu: null, denemeSonu: null }).aciklama ?? "", /kapalı/);
    assert.match(abonelikDonemi({ durum: "canceled", donemSonu: null, denemeSonu: null }).aciklama ?? "", /iptal/);
    for (const durum of ["active", "inactive", "canceled", "suspended", "past_due"]) {
      const d = abonelikDonemi({ durum, donemSonu: null, denemeSonu: null });
      assert.equal(d.tarih, null);
      assert.ok(!/süresiz|demo/i.test(d.aciklama ?? ""), "veride karşılığı olmayan tür yazılmaz");
    }
  });

  test("lisans satırı yok ya da durum tanınmıyor → bilinmiyor; 'Deneme' varsayılmaz", () => {
    const yok = abonelikDonemi({ durum: null, donemSonu: null, denemeSonu: null });
    assert.equal(yok.bilinmiyor, true);
    assert.equal(yok.tarih, null);
    assert.match(yok.aciklama ?? "", /Lisans kaydı bulunamadı/);
    assert.ok(!/deneme/i.test(yok.aciklama ?? ""));
    assert.equal(abonelikDonemi({ durum: "garip", donemSonu: DONEM, denemeSonu: null }).bilinmiyor, true);
  });
});

describe("çoklu lisans: özet kartlarla tutarlı", () => {
  const kart = (name: string, durum: string | null, donemSonu: string | null, denemeSonu: string | null) =>
    ({ name, durum, donem: abonelikDonemi({ durum, donemSonu, denemeSonu }) });

  test("en yakın bitiş açık aboneliklerin türetilmiş tarihinden; iptal edilenin eski tarihi sayılmaz", () => {
    const liste = [
      kart("ArvoOS", "active", DONEM, null),
      kart("ArvoLab", "trialing", null, DENEME),
      kart("ArvoARC", "canceled", "2026-10-01T20:59:59Z", null),
      kart("ArvoCal", "inactive", null, null),
    ];
    const en = enYakinBitis(liste);
    assert.equal(en?.name, "ArvoLab");
    assert.equal(en?.donem.tarih, DENEME);
    assert.equal(en?.donem.etiket, "Deneme sonu");
  });

  test("hiçbir açık abonelikte tarih yoksa özet boş (null), sıfır ya da uydurma tarih değil", () => {
    assert.equal(enYakinBitis([kart("ArvoOS", "active", null, null), kart("X", null, null, null)]), null);
  });
});

test("ödeme sonrası uzama metni arvo_activate_*_period kuralını söylüyor", () => {
  assert.match(ODEME_UZAMA_KURALI, /1 ay uzar/);
  assert.match(ODEME_UZAMA_KURALI, /dönem bitmediyse dönem sonundan/);
  assert.match(ODEME_UZAMA_KURALI, /ödeme gününden/);
});
