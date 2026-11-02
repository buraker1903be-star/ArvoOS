/*
  PAKET LİMİTLERİ VE KADEMELİ KURUCU YETKİSİ (migration 20261102181453).

  Sabitlenen:
   - MEŞRU AKIŞ: kurucu paket limitini değiştirir ve YENİ kurum yeni
     limitle doğar; tam yetkili kurucu başka bir kurucuyu bir alana
     sınırlar, kısıtı değiştirir ve kaldırır;
   - satır yoksa işlev eski sabit değere düşer (tablo boşalırsa yeni
     kiracı limitsiz doğmasın);
   - kiracının sahibi limiti değiştiremez ve kurucu alanlarını göremez;
   - kısıtlı kurucu kendi kısıtını kaldıramaz, başkasını kısıtlayamaz;
     tam yetkili kurucu kendini kısıtlayamaz (en az bir tam yetkili kalır);
   - tanınmayan alan adı reddedilir.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUCU = "00000000-0000-4000-8000-0000000b0001";
const IKINCI = "00000000-0000-4000-8000-0000000b0002";
const KIRACI = "00000000-0000-4000-8000-0000000b0003";
const ARVO = "00000000-0000-4000-8000-0000000b0101";
const KURUM = "00000000-0000-4000-8000-0000000b0102";
const YENI = "00000000-0000-4000-8000-0000000b0103";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${KURUCU}', 'p-kurucu@x.co'), ('${IKINCI}', 'p-ikinci@x.co'), ('${KIRACI}', 'p-kiraci@x.co');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '') on conflict do nothing;
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${ARVO}', 'ArvoOS', 'arvo-os', 'active', 'starter'),
      ('${KURUM}', 'Kurum', 'kurum-paket', 'active', 'starter')
    on conflict (slug) do nothing;
    insert into public.organization_memberships (organization_id, user_id, role) values
      ((select id from public.organizations where slug = 'arvo-os'), '${KURUCU}', 'owner'),
      ((select id from public.organizations where slug = 'arvo-os'), '${IKINCI}', 'owner'),
      ('${KURUM}', '${KIRACI}', 'owner');
  `);
}

const limit = async (paket) =>
  (await db.query(`select private.default_license_limits($1::public.plan_code) as l`, [paket])).rows[0].l;

describe("paket limitleri", () => {
  test("kurucu limiti değiştirir; yeni kurum yeni limitle doğar", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KURUCU);
      const { rows } = await db.query(
        `update public.platform_paket_limitleri set user_limit = 7, guncelleyen = $1 where plan_code = 'starter' returning user_limit`, [KURUCU]);
      assert.equal(rows.length, 1);
      await rol(db, "postgres");
      assert.equal(Number((await limit("starter")).user_limit), 7);
      await db.query(`insert into public.organizations (id, name, slug, status, plan_code) values ($1, 'Yeni', 'yeni-paket', 'active', 'starter')`, [YENI]);
      const { rows: [lisans] } = await db.query(`select user_limit from public.organization_licenses where organization_id = $1`, [YENI]);
      assert.equal(Number(lisans.user_limit), 7);
    }));

  test("satır yoksa eski sabit değer geçerli", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.query(`delete from public.platform_paket_limitleri where plan_code = 'professional'`);
      assert.equal(Number((await limit("professional")).user_limit), 15);
    }));

  test("kiracının sahibi limiti değiştiremez", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KIRACI);
      const { rows } = await db.query(
        `update public.platform_paket_limitleri set user_limit = 999, guncelleyen = $1 where plan_code = 'starter' returning 1`, [KIRACI]);
      assert.equal(rows.length, 0);
      await rol(db, "postgres");
      assert.equal(Number((await limit("starter")).user_limit), 3);
    }));
});

describe("kademeli kurucu yetkisi", () => {
  test("tam yetkili kurucu başka kurucuyu sınırlar, değiştirir, kaldırır", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KURUCU);
      await db.query(`insert into public.platform_kurucu_alanlari (user_id, alanlar, guncelleyen) values ($1, array['finans'], $2)`, [IKINCI, KURUCU]);
      await db.query(`update public.platform_kurucu_alanlari set alanlar = array['finans','destek'], guncelleyen = $2 where user_id = $1`, [IKINCI, KURUCU]);
      assert.deepEqual((await db.query(`select alanlar from public.platform_kurucu_alanlari where user_id = $1`, [IKINCI])).rows[0].alanlar, ["finans", "destek"]);
      /* Kısıtlı kurucu kendi satırını okuyabiliyor (konsol alanlarını oradan öğreniyor). */
      await rol(db, "authenticated", IKINCI);
      assert.equal((await db.query(`select 1 from public.platform_kurucu_alanlari where user_id = $1`, [IKINCI])).rows.length, 1);
      await rol(db, "authenticated", KURUCU);
      await db.query(`delete from public.platform_kurucu_alanlari where user_id = $1`, [IKINCI]);
      assert.equal((await db.query(`select 1 from public.platform_kurucu_alanlari`)).rows.length, 0);
    }));

  test("kısıtlı kurucu kendi kısıtını kaldıramaz, başkasını kısıtlayamaz", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KURUCU);
      await db.query(`insert into public.platform_kurucu_alanlari (user_id, alanlar, guncelleyen) values ($1, array['destek'], $2)`, [IKINCI, KURUCU]);
      await rol(db, "authenticated", IKINCI);
      const silinen = await db.query(`delete from public.platform_kurucu_alanlari where user_id = $1 returning 1`, [IKINCI]);
      assert.equal(silinen.rows.length, 0);
      const guncellenen = await db.query(`update public.platform_kurucu_alanlari set alanlar = array['musteriler','finans','destek','urunler','sistem'], guncelleyen = $1 where user_id = $1 returning 1`, [IKINCI]);
      assert.equal(guncellenen.rows.length, 0);
      await reddedilir(db, `insert into public.platform_kurucu_alanlari (user_id, alanlar, guncelleyen) values ($1, array['destek'], $2)`, [KURUCU, IKINCI], /row-level security|policy/i);
    }));

  test("tam yetkili kurucu kendini kısıtlayamaz; kiracı göremez; tanınmayan alan reddedilir", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KURUCU);
      await reddedilir(db, `insert into public.platform_kurucu_alanlari (user_id, alanlar, guncelleyen) values ($1, array['finans'], $1)`, [KURUCU], /row-level security|policy/i);
      await reddedilir(db, `insert into public.platform_kurucu_alanlari (user_id, alanlar, guncelleyen) values ($1, array['muhasebe'], $2)`, [IKINCI, KURUCU], /check constraint|alanlar/i);
      await db.query(`insert into public.platform_kurucu_alanlari (user_id, alanlar, guncelleyen) values ($1, array['finans'], $2)`, [IKINCI, KURUCU]);
      await rol(db, "authenticated", KIRACI);
      assert.equal((await db.query(`select 1 from public.platform_kurucu_alanlari`)).rows.length, 0);
      await reddedilir(db, `insert into public.platform_kurucu_alanlari (user_id, alanlar, guncelleyen) values ($1, array['finans'], $1)`, [KIRACI], /row-level security|policy/i);
    }));
});
