/*
  YORUM YAZMA YETKİSİNİ TEK YER SÖYLER: RLS POLİTİKASI.

  addInternalComment yazmadan önce fırsat satırını okuyup "erişebiliyor
  muyum" diye kendi kendine soruyordu. Bu okuma INSERT politikasının
  birebir kopyasıydı (created_by + kurum eşleşmesi +
  arvo_can_access_opportunity), yani güvenliğe hiçbir şey eklemiyordu —
  ama kendi başına kırılabilen fazladan bir kapıydı.

  01–02.10.2026'da tam olarak iki kez kırıldı:
    1) Tutar daraltması crm_opportunities'i operasyon personeline kapattı;
       kapı o tabloyu okuduğu için boş döndü.
    2) ops_* görünümüne çevrildi, veritabanında Gizem için 1 satır
       döndüğü ÖLÇÜLDÜĞÜ hâlde üretimde yine boş döndü.
  Üç operasyon personeli günlerce kendi işine not yazamadı.

  Ders: veritabanının izin verdiği bir işi, elle yazılmış ikinci bir kapı
  sessizce engelleyebiliyor. Yetki tek yerde kalmalı.

  Bu test o kararı sabitliyor: eylem yazmadan önce yetki sorgusu YAPMAZ.
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const KAYNAK = fs.readFileSync(path.join(process.cwd(), "app/panel/crm/actions.ts"), "utf8");

/** addInternalComment__impl gövdesi (bir sonraki fonksiyona kadar). */
function govde(): string {
  const bas = KAYNAK.indexOf("async function addInternalComment__impl");
  assert.notEqual(bas, -1, "addInternalComment__impl bulunamadı");
  const sonra = KAYNAK.indexOf("\nasync function ", bas + 1);
  return KAYNAK.slice(bas, sonra === -1 ? KAYNAK.length : sonra);
}

const yorumsuz = () => govde().replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("kurum içi yorum yazma kapısı", () => {
  test("yazmadan önce fırsat satırı okunmuyor", () => {
    // Politikanın kopyası olan ön kontrol geri gelmesin.
    for (const tablo of ["crm_opportunities", "ops_opportunities"]) {
      assert.equal(
        yorumsuz().includes(`"${tablo}"`),
        false,
        `${tablo} yetki ön kontrolü için okunuyor — yetkiyi INSERT politikası söylemeli`,
      );
    }
  });

  test("tutar taşıyan tablolar hiç okunmuyor", () => {
    // Operasyon personeline kapalı tablolar; bağlam doğrulaması da
    // tutarsız görünümlerden geçmeli.
    for (const tablo of ["crm_contracts", "crm_proposals"]) {
      assert.equal(yorumsuz().includes(`"${tablo}"`), false, `${tablo} okunuyor`);
    }
  });

  test("bağlam doğrulaması duruyor: yorum başka kurumun kaydına bağlanamaz", () => {
    // Bu kontrol politikanın kopyası DEĞİL: INSERT politikası context_id'ye
    // bakmıyor, yani öksüz kayıt ancak burada engelleniyor.
    const g = govde();
    assert.match(g, /proposal:\s*"ops_proposals"/);
    assert.match(g, /contract:\s*"ops_contracts"/);
    assert.match(g, /operation:\s*"operation_workflows"/);
    assert.match(g, /\.eq\("organization_id", membership\.organization_id\)/);
  });

  test("RLS reddi anlaşılır cümleye çevriliyor", () => {
    assert.match(govde(), /error\.code === "42501"/);
    assert.match(govde(), /yorumlarını yazma yetkiniz yok/);
  });

  test("başarısızlıklar iz bırakıyor", () => {
    assert.match(govde(), /reportActionFailure\("addInternalComment\.baglamKapisi"/);
    assert.match(govde(), /reportActionFailure\("addInternalComment\.rlsRed"/);
  });
});
