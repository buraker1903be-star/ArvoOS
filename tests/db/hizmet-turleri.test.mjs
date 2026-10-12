/*
  KURUMUN HİZMET TÜRLERİ (20261012110702).

  Sınananlar:
  1. Kurum Sahibi listeyi yazıyor (MEŞRU yol: ilk kayıt ve güncelleme,
     ekranın kullandığı upsert ile); üye okuyor ama yazamıyor.
  2. Başka kurum göremiyor; anon tabloya erişemiyor.
  3. Sınır ve boş öğe denetimleri veritabanında da var.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = ["20261012110702_hizmet_turleri.sql"];

const KURUM = "00000000-0000-4000-8000-00000000c501";
const OTEKI = "00000000-0000-4000-8000-00000000c502";
const SAHIP = "00000000-0000-4000-8000-00000000c511";
const SATISCI = "00000000-0000-4000-8000-00000000c512";
const YABANCI = "00000000-0000-4000-8000-00000000c513";

let db;
before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values
      ('${SAHIP}','sahip@x.com'),('${SATISCI}','satis@x.com'),('${YABANCI}','yabanci@y.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${KURUM}','AM','am','active','starter'),('${OTEKI}','Öteki','oteki','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${SATISCI}','member'),('${OTEKI}','${YABANCI}','owner');
  `);
});

// Ekranın yazdığı biçim (settings/hizmet-turu-actions.ts): upsert.
const listeYaz = (turler, kullanici = null) => db.query(
  `insert into public.organization_service_types (organization_id, turler, updated_by)
   values ($1, $2::text[], $3)
   on conflict (organization_id) do update set turler = excluded.turler, updated_at = now(), updated_by = excluded.updated_by`,
  [KURUM, turler, kullanici]);

describe("yetki", () => {
  test("Kurum Sahibi ilk kaydı açıp güncelliyor, üye okuyor ama yazamıyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await listeYaz(["Web Tasarım"], SAHIP);
      await listeYaz(["Web Tasarım", "SEO"], SAHIP);
      await rol(db, "authenticated", SATISCI);
      const { rows } = await db.query(`select turler from public.organization_service_types where organization_id = $1`, [KURUM]);
      assert.deepEqual(rows[0]?.turler, ["Web Tasarım", "SEO"], "üye listeyi okuyamadı");
      const { affectedRows } = await db.query(`update public.organization_service_types set turler = '{}' where organization_id = $1`, [KURUM]);
      assert.equal(affectedRows, 0, "üye listeyi değiştirebildi");
      await reddedilir(db, `insert into public.organization_service_types (organization_id, turler) values ($1, '{X1}')`, [OTEKI], /row-level security/);
    }));

  test("başka kurum göremiyor, anon erişemiyor", async () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await listeYaz(["Web Tasarım"]);
      await rol(db, "authenticated", YABANCI);
      const { rows } = await db.query(`select 1 from public.organization_service_types where organization_id = $1`, [KURUM]);
      assert.equal(rows.length, 0, "yabancı listeyi gördü");
      await rol(db, "anon");
      await reddedilir(db, `select 1 from public.organization_service_types`, [], /permission denied/);
    }));
});

describe("denetimler", () => {
  test("altmıştan fazla öğe ve boş öğe yazılamıyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `insert into public.organization_service_types (organization_id, turler) values ($1, $2::text[])`,
        [KURUM, Array.from({ length: 61 }, (_, i) => `H${i}`)], /organization_service_types_sinir/);
      await reddedilir(db, `insert into public.organization_service_types (organization_id, turler) values ($1, array['A1', null])`,
        [KURUM], /organization_service_types_bos_yok/);
    }));
});
