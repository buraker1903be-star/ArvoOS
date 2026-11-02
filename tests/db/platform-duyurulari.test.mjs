/*
  KONSOL DUYURULARININ GEÇMİŞİ (migration 20261102083212).

  Sabitlenen:
   - MEŞRU AKIŞ: kurucu duyuru kaydı yazar ve okur;
   - kiracının sahibi bile göremez ve yazamaz (kurucunun iç kaydı);
   - kurucu başkası adına (gonderen) yazamaz;
   - bağlantı yalnızca panel içi bir yol.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUCU = "00000000-0000-4000-8000-0000000d0001";
const KIRACI = "00000000-0000-4000-8000-0000000d0002";
const ARVO = "00000000-0000-4000-8000-0000000d0101";
const KURUM = "00000000-0000-4000-8000-0000000d0102";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${KURUCU}', 'd-kurucu@x.co'), ('${KIRACI}', 'd-kiraci@x.co');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '') on conflict do nothing;
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${ARVO}', 'ArvoOS', 'arvo-os', 'active', 'starter'),
      ('${KURUM}', 'Kurum', 'kurum-d', 'active', 'starter')
    on conflict (slug) do nothing;
    insert into public.organization_memberships (organization_id, user_id, role) values
      ((select id from public.organizations where slug = 'arvo-os'), '${KURUCU}', 'owner'),
      ('${KURUM}', '${KIRACI}', 'owner');
  `);
}

const yaz = (gonderen, baglanti = null) =>
  db.query(`insert into public.platform_duyurulari (baslik, metin, baglanti, hedef, gonderen) values ('Bakım', 'Gece bakım var.', $1, 'tum', $2) returning id`, [baglanti, gonderen]);

describe("konsol duyuruları", () => {
  test("kurucu yazar ve okur", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KURUCU);
      await yaz(KURUCU, "/panel/kilavuz");
      assert.equal((await db.query(`select 1 from public.platform_duyurulari`)).rows.length, 1);
    }));

  test("kiracının sahibi göremez ve yazamaz", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KURUCU);
      await yaz(KURUCU);
      await rol(db, "authenticated", KIRACI);
      assert.equal((await db.query(`select 1 from public.platform_duyurulari`)).rows.length, 0);
      await reddedilir(db, `insert into public.platform_duyurulari (baslik, metin, hedef, gonderen) values ('Sahte', 'Sahte duyuru', 'tum', $1)`, [KIRACI], /row-level security|policy/i);
    }));

  test("kurucu başkası adına yazamaz; bağlantı panel içi olmalı", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KURUCU);
      await reddedilir(db, `insert into public.platform_duyurulari (baslik, metin, hedef, gonderen) values ('Bakım', 'Gece bakım var.', 'tum', $1)`, [KIRACI], /row-level security|policy/i);
      await reddedilir(db, `insert into public.platform_duyurulari (baslik, metin, baglanti, hedef, gonderen) values ('Bakım', 'Gece bakım var.', 'https://x.co', 'tum', $1)`, [KURUCU], /check constraint|baglanti/i);
    }));

  test("anon erişemez", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "anon");
      await reddedilir(db, `select 1 from public.platform_duyurulari`, [], /permission denied/i);
    }));
});
