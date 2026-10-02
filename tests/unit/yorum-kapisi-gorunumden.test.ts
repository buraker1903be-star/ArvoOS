/*
  KURUM İÇİ YORUM KAPISI TUTARSIZ GÖRÜNÜMDEN OKUR.

  01.10.2026'da tutar daraltması crm_opportunities / crm_contracts /
  crm_proposals satırlarını operasyon personeline kapattı. RLS tarafında
  yorum politikaları definer yardımcıya çevrilerek korundu — ama
  addInternalComment'in YAZMADAN ÖNCEKİ kendi kontrolü atlandı. O kontrol
  hâlâ tutarlı tabloyu okuduğu için boş dönüyor, personel iş detayından
  not yazamıyordu (02.10.2026 canlı hata: "Talep zinciri bulunamadı veya
  bu kayda erişiminiz yok.").

  Ders: izni RLS veriyorsa, uygulamanın ön kontrolü de AYNI kaynaktan
  sormalı. Bir adım fazlasını soran kapı, veritabanının izin verdiği işi
  sessizce engeller — ve hata mesajı "erişiminiz yok" dediği için yetki
  sorunu sanılır.

  Test, daraltılmış tabloların bu fonksiyonun kontrol yoluna geri
  sızmasını engelliyor.
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const KAYNAK = fs.readFileSync(
  path.join(process.cwd(), "app/panel/crm/actions.ts"),
  "utf8",
);

/** addInternalComment__impl gövdesi (bir sonraki fonksiyona kadar). */
function yorumEklemeGovdesi(): string {
  const bas = KAYNAK.indexOf("async function addInternalComment__impl");
  assert.notEqual(bas, -1, "addInternalComment__impl bulunamadı");
  const sonra = KAYNAK.indexOf("\nasync function ", bas + 1);
  const son = sonra === -1 ? KAYNAK.length : sonra;
  return KAYNAK.slice(bas, son);
}

// Tutar taşıyan, operasyona kapalı tablolar.
const DARALTILMIS = ["crm_opportunities", "crm_contracts", "crm_proposals"];

describe("kurum içi yorum kapısı", () => {
  test("daraltılmış tabloları okumuyor", () => {
    const govde = yorumEklemeGovdesi().replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const bulunan = DARALTILMIS.filter((t) => govde.includes(`"${t}"`));
    assert.deepEqual(
      bulunan,
      [],
      `operasyona kapalı tablo okunuyor: ${bulunan.join(", ")} — ops_* görünümünü kullanın`,
    );
  });

  test("fırsat kontrolü ops_opportunities'ten geliyor", () => {
    assert.match(yorumEklemeGovdesi(), /\.from\("ops_opportunities"\)/);
  });

  test("teklif ve sözleşme bağlamı da görünümden doğrulanıyor", () => {
    const govde = yorumEklemeGovdesi();
    assert.match(govde, /proposal:\s*"ops_proposals"/);
    assert.match(govde, /contract:\s*"ops_contracts"/);
  });
});
