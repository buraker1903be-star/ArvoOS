/*
  DOÇENTLİK: KURUMUN SLUG İLE ÇÖZÜLMESİ (F6 PR3, 20261114200939).

  Migration izin listesine kurumu kimlikle değil SLUG ile yazıyor
  (`akademikmerkez`), çünkü kimlik ortamdan ortama farklı. Slug birebir
  aranıyor: benzer adlı bir kurum ("akademikmerkez-test") izin almamalı.
  Büyük harfli slug organizations_slug_check ile zaten yazılamıyor.
  Kurum hiç yoksa izin listesi boş kalır ve modül HİÇBİR kurumda
  açılamaz (fail-closed).

  Migration bütün akış testlerinden önce, kurumlar tohumlanmadan
  uygulanıyor; o yüzden burada canlı şemanın SONUNA kurum satırları
  eklenmiş geçici bir döküm kuruluyor: migration o kurumları görerek
  çalışıyor, canlıdaki gibi.
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SEMA, islem, rol, veritabani } from "./ortam.mjs";

const AKADEMIK = "00000000-0000-4000-8000-00000000e0a1";
const BENZER = "00000000-0000-4000-8000-00000000e0a2";
const BUYUK = "00000000-0000-4000-8000-00000000e0a3";

function semaArtiKurumlar(kurumlar) {
  const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "docentlik-kurum-"));
  const dosya = path.join(dizin, "sema.sql");
  const satirlar = kurumlar.map(([id, slug]) => `('${id}','${slug} kurumu','${slug}','active','starter')`).join(",");
  fs.writeFileSync(dosya, `${fs.readFileSync(SEMA, "utf8")}
insert into public.plans (code, name, description) values ('starter','Başlangıç','');
${kurumlar.length ? `insert into public.organizations (id, name, slug, status, plan_code) values ${satirlar};` : ""}
`);
  return { dosya, temizle: () => fs.rmSync(dizin, { recursive: true, force: true }) };
}

const izinListesi = async (db) =>
  (await db.query("select organization_id from public.ozel_modul_kurumlari where module_code = 'docentlik' order by 1")).rows.map((r) => r.organization_id);

describe("Kurum slug ile çözülüyor", () => {
  test("yalnızca birebir 'akademikmerkez' izin alır; benzer slug'lar (akademikmerkez-test, akademikmerkez2) almaz", async () => {
    const sema = semaArtiKurumlar([[AKADEMIK, "akademikmerkez"], [BENZER, "akademikmerkez-test"], [BUYUK, "akademikmerkez2"]]);
    const db = await veritabani(sema.dosya);
    try {
      assert.deepEqual(await izinListesi(db), [AKADEMIK]);
      await islem(db, async () => {
        await rol(db, "postgres");
        // Benzer kurumda modülü açma girişimi #317 korumasıyla kapalıya çevrilir.
        await db.query("insert into public.organization_modules (organization_id, module_code, is_enabled) values ($1, 'docentlik', true), ($2, 'docentlik', true)", [BENZER, AKADEMIK]);
        const acik = (await db.query("select organization_id, is_enabled from public.organization_modules where module_code = 'docentlik' order by 1")).rows;
        assert.deepEqual(acik, [{ organization_id: AKADEMIK, is_enabled: true }, { organization_id: BENZER, is_enabled: false }]);
      });
      // Migration modülü kendiliğinden hiçbir kurumda açmıyor.
      const satir = (await db.query("select count(*)::int n from public.organization_modules where module_code = 'docentlik'")).rows[0].n;
      assert.equal(satir, 0);
    } finally {
      await db.close();
      sema.temizle();
    }
  });

  test("kurum bulunamazsa izin listesi boş kalır; modül hiçbir kurumda açılamaz (fail-closed)", async () => {
    const sema = semaArtiKurumlar([[BENZER, "akademikmerkez-test"]]);
    const db = await veritabani(sema.dosya);
    try {
      assert.deepEqual(await izinListesi(db), []);
      assert.equal((await db.query("select count(*)::int n from public.ozel_moduller where module_code = 'docentlik'")).rows[0].n, 1, "özel statü yine de ilan edilmeli");
      await islem(db, async () => {
        await rol(db, "postgres");
        await db.query("insert into public.organization_modules (organization_id, module_code, is_enabled) values ($1, 'docentlik', true)", [BENZER]);
        const { is_enabled } = (await db.query("select is_enabled from public.organization_modules where organization_id = $1 and module_code = 'docentlik'", [BENZER])).rows[0];
        assert.equal(is_enabled, false);
      });
    } finally {
      await db.close();
      sema.temizle();
    }
  });
});
