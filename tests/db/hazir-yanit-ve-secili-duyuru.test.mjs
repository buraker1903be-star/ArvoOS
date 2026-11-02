/*
  HAZIR YANITLAR VE SEÇİLİ KURUMLARA DUYURU (migration 20261102134522).

  Sabitlenen:
   - MEŞRU AKIŞ: kurucu hazır yanıt yazar, okur, siler; "secili"
     hedefli duyuru kaydı yazılabilir;
   - kiracının sahibi hazır yanıtları göremez, yazamaz;
   - tanınmayan hedef hâlâ reddedilir (kısıt genişledi, gevşemedi).
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUCU = "00000000-0000-4000-8000-0000000a0001";
const KIRACI = "00000000-0000-4000-8000-0000000a0002";
const ARVO = "00000000-0000-4000-8000-0000000a0101";
const KURUM = "00000000-0000-4000-8000-0000000a0102";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${KURUCU}', 'h-kurucu@x.co'), ('${KIRACI}', 'h-kiraci@x.co');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '') on conflict do nothing;
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${ARVO}', 'ArvoOS', 'arvo-os', 'active', 'starter'),
      ('${KURUM}', 'Kurum', 'kurum-hazir', 'active', 'starter')
    on conflict (slug) do nothing;
    insert into public.organization_memberships (organization_id, user_id, role) values
      ((select id from public.organizations where slug = 'arvo-os'), '${KURUCU}', 'owner'),
      ('${KURUM}', '${KIRACI}', 'owner');
  `);
}

describe("hazır yanıtlar ve seçili duyuru", () => {
  test("kurucu hazır yanıt yazar, okur, siler", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KURUCU);
      const id = (await db.query(`insert into public.platform_hazir_yanitlar (baslik, metin, olusturan) values ('Şifre', 'Merhaba {kurum}, şifrenizi…', $1) returning id`, [KURUCU])).rows[0].id;
      assert.equal((await db.query(`select 1 from public.platform_hazir_yanitlar`)).rows.length, 1);
      await db.query(`delete from public.platform_hazir_yanitlar where id = $1`, [id]);
      assert.equal((await db.query(`select 1 from public.platform_hazir_yanitlar`)).rows.length, 0);
    }));

  test("kiracının sahibi hazır yanıtları göremez, yazamaz", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KURUCU);
      await db.query(`insert into public.platform_hazir_yanitlar (baslik, metin, olusturan) values ('Şifre', 'Metin', $1)`, [KURUCU]);
      await rol(db, "authenticated", KIRACI);
      assert.equal((await db.query(`select 1 from public.platform_hazir_yanitlar`)).rows.length, 0);
      await reddedilir(db, `insert into public.platform_hazir_yanitlar (baslik, metin, olusturan) values ('Sahte', 'Sahte', $1)`, [KIRACI], /row-level security|policy/i);
    }));

  test("seçili kurumlara duyuru kaydı yazılır; tanınmayan hedef reddedilir", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KURUCU);
      await db.query(`insert into public.platform_duyurulari (baslik, metin, hedef, gonderen) values ('Bakım', 'Gece bakım var.', 'secili', $1)`, [KURUCU]);
      await reddedilir(db, `insert into public.platform_duyurulari (baslik, metin, hedef, gonderen) values ('Bakım', 'Gece bakım var.', 'herkes', $1)`, [KURUCU], /check constraint|hedef/i);
    }));
});
