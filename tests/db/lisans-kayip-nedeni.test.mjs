/*
  KAYIP NEDENİ (migration 20261102205003).

  Sabitlenen:
   - MEŞRU: kapatılan lisansa neden ve not yazılır (çekirdek ve ürün);
   - lisans yeniden açılınca neden ve not silinir (geri dönen müşteride
     eski neden kalmasın), kapanış tarihi de silinmeye devam eder —
     işlev yeniden yazıldı, eski davranış korunmalı;
   - listede olmayan neden ve 500 karakteri aşan not reddedilir.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-0000000e0101";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '') on conflict do nothing;
    insert into public.organizations (id, name, slug, status, plan_code) values ('${KURUM}', 'Kurum', 'kurum-kayip', 'active', 'starter');
    update public.organization_licenses set license_status = 'active' where organization_id = '${KURUM}';
    insert into public.organization_product_licenses (organization_id, product, status) values ('${KURUM}', 'randevu', 'active');
  `);
}
const cekirdek = async () => (await db.query(`select license_status, closed_at, kapanis_nedeni, kapanis_notu from public.organization_licenses where organization_id = $1`, [KURUM])).rows[0];
const urun = async () => (await db.query(`select status, closed_at, kapanis_nedeni from public.organization_product_licenses where organization_id = $1 and product = 'randevu'`, [KURUM])).rows[0];

describe("lisans kayıp nedeni", () => {
  test("kapanınca neden yazılır, yeniden açılınca silinir (çekirdek)", () =>
    islem(db, async () => {
      await tohum();
      await db.query(`update public.organization_licenses set license_status = 'canceled', kapanis_nedeni = 'fiyat', kapanis_notu = 'Rakibin teklifi yarı fiyat' where organization_id = $1`, [KURUM]);
      let s = await cekirdek();
      assert.equal(s.kapanis_nedeni, "fiyat");
      assert.equal(s.kapanis_notu, "Rakibin teklifi yarı fiyat");
      assert.ok(s.closed_at);
      await db.query(`update public.organization_licenses set license_status = 'active' where organization_id = $1`, [KURUM]);
      s = await cekirdek();
      assert.equal(s.kapanis_nedeni, null);
      assert.equal(s.kapanis_notu, null);
      assert.equal(s.closed_at, null);
    }));

  test("ürün lisansında da aynı kural", () =>
    islem(db, async () => {
      await tohum();
      await db.query(`update public.organization_product_licenses set status = 'inactive', kapanis_nedeni = 'kullanmiyor' where organization_id = $1 and product = 'randevu'`, [KURUM]);
      assert.equal((await urun()).kapanis_nedeni, "kullanmiyor");
      await db.query(`update public.organization_product_licenses set status = 'trialing' where organization_id = $1 and product = 'randevu'`, [KURUM]);
      assert.equal((await urun()).kapanis_nedeni, null);
    }));

  test("listede olmayan neden ve uzun not reddedilir", () =>
    islem(db, async () => {
      await tohum();
      await reddedilir(db, `update public.organization_licenses set license_status = 'canceled', kapanis_nedeni = 'canim_istedi' where organization_id = $1`, [KURUM], /kapanis_nedeni_check/);
      await reddedilir(db, `update public.organization_licenses set license_status = 'canceled', kapanis_notu = repeat('x', 501) where organization_id = $1`, [KURUM], /kapanis_notu_check/);
    }));
});
