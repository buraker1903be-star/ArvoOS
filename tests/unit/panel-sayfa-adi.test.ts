import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { panelSayfaAdi } from "@/lib/panel-sayfa-adi";

const ID = "45ec0821-1578-4cf8-b86f-62d61d06d59f";

describe("panel sayfa adı", () => {
  test("kimlikli adres kayıt adını ve açılacak adresi verir", () => {
    assert.deepEqual(panelSayfaAdi(`/panel/operations/${ID}`), { ad: "İş kaydı", kayit: `/panel/operations/${ID}` });
  });

  test("en uzun önek kazanır", () => {
    assert.equal(panelSayfaAdi("/panel/operations/isler")?.ad, "İşler");
    assert.equal(panelSayfaAdi("/panel/posta/hazir-cevaplar")?.ad, "Hazır cevaplar");
    assert.equal(panelSayfaAdi("/panel")?.ad, "Ana ekran");
  });

  test("sorgu ve sondaki eğik çizgi adı değiştirmez", () => {
    assert.equal(panelSayfaAdi("/panel/crm/proposals/?durum=acik")?.ad, "Teklifler");
  });

  test("tanınmayan alt sayfa bölüm adını alır, kayıt adresi uydurulmaz", () => {
    assert.deepEqual(panelSayfaAdi(`/panel/crm/proposals/${ID}/revisions`), { ad: "Teklif", kayit: null });
    assert.deepEqual(panelSayfaAdi("/panel/bilinmeyen"), { ad: "Panel", kayit: null });
  });

  test("panel dışı ya da boş adres ad almaz", () => {
    assert.equal(panelSayfaAdi("/login"), null);
    assert.equal(panelSayfaAdi(null), null);
  });
});
