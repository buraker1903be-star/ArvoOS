/*
  KONSOLUN MÜŞTERİ NOTLARI (migration 20261102131114).

  Sabitlenen:
   - MEŞRU AKIŞ: kurucu not yazar, takip tarihi verir, tamamlar, siler;
   - notun metni sonradan değiştirilemez;
   - kiracının sahibi (kendi kurumu hakkındaki not dahil) göremez, yazamaz;
   - anon erişemez.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUCU = "00000000-0000-4000-8000-0000000b0001";
const KIRACI = "00000000-0000-4000-8000-0000000b0002";
const ARVO = "00000000-0000-4000-8000-0000000b0101";
const KURUM = "00000000-0000-4000-8000-0000000b0102";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${KURUCU}', 'n-kurucu@x.co'), ('${KIRACI}', 'n-kiraci@x.co');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '') on conflict do nothing;
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${ARVO}', 'ArvoOS', 'arvo-os', 'active', 'starter'),
      ('${KURUM}', 'Kurum', 'kurum-not', 'active', 'starter')
    on conflict (slug) do nothing;
    insert into public.organization_memberships (organization_id, user_id, role) values
      ((select id from public.organizations where slug = 'arvo-os'), '${KURUCU}', 'owner'),
      ('${KURUM}', '${KIRACI}', 'owner');
  `);
}
const yaz = () => db.query(`insert into public.platform_musteri_notlari (organization_id, metin, takip_tarihi, yazan) values ($1, 'Aradım, ödemeyi haftaya yapacak.', current_date + 7, $2) returning id`, [KURUM, KURUCU]);

describe("konsolun müşteri notları", () => {
  test("kurucu yazar, takibi tamamlar ve siler", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KURUCU);
      const id = (await yaz()).rows[0].id;
      await db.query(`update public.platform_musteri_notlari set takip_tarihi = current_date + 1 where id = $1`, [id]);
      await db.query(`update public.platform_musteri_notlari set tamamlandi_at = now() where id = $1`, [id]);
      assert.ok((await db.query(`select tamamlandi_at from public.platform_musteri_notlari where id = $1`, [id])).rows[0].tamamlandi_at);
      await db.query(`delete from public.platform_musteri_notlari where id = $1`, [id]);
      assert.equal((await db.query(`select 1 from public.platform_musteri_notlari`)).rows.length, 0);
    }));

  test("notun metni değiştirilemez", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KURUCU);
      const id = (await yaz()).rows[0].id;
      await reddedilir(db, `update public.platform_musteri_notlari set metin = 'Başka bir şey dedi.' where id = $1`, [id], /değiştirilemez/);
    }));

  test("kiracının sahibi kendi kurumu hakkındaki notu bile göremez, yazamaz", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KURUCU);
      await yaz();
      await rol(db, "authenticated", KIRACI);
      assert.equal((await db.query(`select 1 from public.platform_musteri_notlari`)).rows.length, 0);
      await reddedilir(db, `insert into public.platform_musteri_notlari (organization_id, metin, yazan) values ($1, 'Sahte not', $2)`, [KURUM, KIRACI], /row-level security|policy/i);
    }));

  test("anon erişemez", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      await reddedilir(db, `select 1 from public.platform_musteri_notlari`, [], /permission denied/i);
    }));
});
