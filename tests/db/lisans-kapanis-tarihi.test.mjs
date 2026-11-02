/*
  LİSANSIN KAPANDIĞI AN (migration 20261102101259).

  Sabitlenen:
   - açık → kapalı geçişte closed_at yazılıyor (çekirdek ve ürün lisansı);
   - durumu değişmeyen düzenleme tarihi ellemiyor;
   - kapalıdan kapalıya (askıda → iptal) ilk kapanış anı korunuyor;
   - yeniden açılınca boşalıyor (geri dönen müşteri kayıp sayılmasın);
   - kapalı açılan ürün lisansının kapanışı yok.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-0000000c0101";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '') on conflict do nothing;
    insert into public.organizations (id, name, slug, status, plan_code) values ('${KURUM}', 'Kurum', 'kurum-kapanis', 'active', 'starter');
    -- Lisans satırını kurum eklenince tetikleyici açıyor (create_default_organization_license).
    update public.organization_licenses set license_status = 'active' where organization_id = '${KURUM}';
  `);
}
const cekirdek = async () => (await db.query(`select license_status, closed_at from public.organization_licenses where organization_id = $1`, [KURUM])).rows[0];
const urun = async () => (await db.query(`select status, closed_at from public.organization_product_licenses where organization_id = $1 and product = 'randevu'`, [KURUM])).rows[0];

describe("lisans kapanış tarihi", () => {
  test("çekirdek lisans: kapanınca yazılır, düzenleme ellemez, yeniden açılınca boşalır", () =>
    islem(db, async () => {
      await tohum();
      assert.equal((await cekirdek()).closed_at, null);

      await db.query(`update public.organization_licenses set license_status = 'suspended' where organization_id = $1`, [KURUM]);
      const ilk = (await cekirdek()).closed_at;
      assert.ok(ilk, "askıya alınınca kapanış anı yazılmalı");

      // Kapalıdan kapalıya ve durumsuz düzenleme: ilk an korunur.
      await db.query(`update public.organization_licenses set closed_at = now() - interval '9 days', license_status = 'canceled' where organization_id = $1`, [KURUM]);
      await db.query(`update public.organization_licenses set monthly_fee = 123400 where organization_id = $1`, [KURUM]);
      assert.equal((await cekirdek()).closed_at.getTime(), ilk.getTime());

      await db.query(`update public.organization_licenses set license_status = 'active' where organization_id = $1`, [KURUM]);
      assert.equal((await cekirdek()).closed_at, null);
    }));

  test("ürün lisansı: kapalı açılan ürünün kapanışı yok, açık → iptal yazılır", () =>
    islem(db, async () => {
      await tohum();
      await db.query(`insert into public.organization_product_licenses (organization_id, product, status, closed_at) values ($1, 'randevu', 'inactive', now())`, [KURUM]);
      assert.equal((await urun()).closed_at, null);

      await db.query(`update public.organization_product_licenses set status = 'active' where organization_id = $1 and product = 'randevu'`, [KURUM]);
      assert.equal((await urun()).closed_at, null);
      await db.query(`update public.organization_product_licenses set status = 'canceled' where organization_id = $1 and product = 'randevu'`, [KURUM]);
      assert.ok((await urun()).closed_at);
    }));
});
