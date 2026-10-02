/*
  YORUM İŞLEMİNİN MODÜL KAPISI YÜZEYE GÖRE.

  Kurum içi yorum kutusu iki yüzeyde duruyor: CRM kayıtlarında ve
  OPERASYONDAKİ iş detayında. Üç yorum işlemi de (ekle, düzenle, sil)
  hepsi için crmContext() çağırıyordu — yani CRM modülü olmayan bir
  operasyon personeli işi açabiliyor ama o sayfadaki yoruma yazamıyordu.
  Hata RLS'e hiç varmadan modül kapısında dönüyordu; 02.10.2026'da üç
  kişi bu yüzden yazamadı ve sebep günlerce RLS'te arandı.

  Bu test kaynağa bakıyor çünkü kapı bir sunucu işleminin içinde ve
  çağrı zinciri (cookie, Supabase, RLS) birim testinde kurulamıyor.
  Tutulan şey davranış değil KARAR: yorum işlemleri yüzeye göre
  kapıdan geçsin, hepsi birden CRM istemesin.
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const kaynak = fs.readFileSync(
  path.join(process.cwd(), "app/panel/crm/actions.ts"),
  "utf8",
);

/** Bir işlevin gövdesi (ilk süslü parantez bloğu, kabaca). */
function govde(ad: string): string {
  const bas = kaynak.indexOf(`async function ${ad}(`);
  assert.ok(bas > -1, `${ad} bulunamadı`);
  return kaynak.slice(bas, bas + 1200);
}

describe("yorum işlemlerinin modül kapısı", () => {
  for (const ad of [
    "addInternalComment__impl",
    "updateInternalComment",
    "deleteInternalComment__impl",
  ]) {
    test(`${ad} yüzeye göre kapıdan geçiyor`, () => {
      const g = govde(ad);
      assert.match(g, /yorumContext\(contextType\)/, `${ad} yorumContext kullanmalı`);
      assert.ok(
        !/await crmContext\(\)/.test(g),
        `${ad} hâlâ crmContext çağırıyor: operasyon personeli kapıda düşer`,
      );
    });
  }

  test("kapı iş bağlamında operasyon modülünü istiyor", () => {
    const g = kaynak.slice(kaynak.indexOf("async function yorumContext("));
    assert.match(g, /contextType === "operation" \? "operations" : "crm"/);
  });
});
