/*
  KURULUM, SAHİP KATILINCA TAMAMLANIR (20261014062943).

  Sınananlar:
  1. Kurum sahibi etkin üye olunca (davet kabulü) kurulum 'active'.
  2. Çalışan katılınca kurulum durumu değişmiyor.
  3. Askıya alınmış kurum, sahibin yeniden etkinleşmesiyle açılmıyor.
  4. Migration'ın düzeltmesi: sahibi zaten katılmış ama "devam ediyor"da
     kalan kurum 'active' oluyor; sahibi gelmemiş olan beklemede kalıyor.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = [
  "20261014062943_kurulum_sahip_katilinca_aktif.sql",
];

const BEKLEYEN = "00000000-0000-4000-8000-00000000c101";
const ASKIDA = "00000000-0000-4000-8000-00000000c102";
const ESKI = "00000000-0000-4000-8000-00000000c103";
const GELMEYEN = "00000000-0000-4000-8000-00000000c104";
const SAHIP = "00000000-0000-4000-8000-00000000c111";
const CALISAN = "00000000-0000-4000-8000-00000000c112";
const ESKI_SAHIP = "00000000-0000-4000-8000-00000000c113";

let db;
const durum = async (id) => (await db.query(`select provisioning_state as d from public.organizations where id = $1`, [id])).rows[0].d;

before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  // Migration'dan ÖNCEKİ durum: sahibi katılmış ama beklemede kalan kurum.
  await db.exec(`
    insert into auth.users (id,email) values ('${SAHIP}','s@x.com'),('${CALISAN}','c@x.com'),('${ESKI_SAHIP}','e@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code,provisioning_state) values
      ('${BEKLEYEN}','Bekleyen','bekleyen','trial','starter','waiting_owner'),
      ('${ASKIDA}','Askıda','askida','suspended','starter','suspended'),
      ('${ESKI}','Eski','eski','trial','starter','waiting_owner'),
      ('${GELMEYEN}','Gelmeyen','gelmeyen','trial','starter','waiting_owner');
    insert into public.organization_memberships (organization_id,user_id,role,is_active) values ('${ESKI}','${ESKI_SAHIP}','owner',true);
  `);
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
});

test("sahibi önceden katılmış kurum migration'la düzeliyor, gelmeyen beklemede kalıyor", async () => {
  await rol(db, "postgres");
  assert.equal(await durum(ESKI), "active");
  assert.equal(await durum(GELMEYEN), "waiting_owner");
});

test("çalışan katılınca kurulum değişmiyor, sahip katılınca tamamlanıyor", async () =>
  islem(db, async () => {
    await rol(db, "postgres");
    await db.query(`insert into public.organization_memberships (organization_id,user_id,role,is_active) values ($1,$2,'member',true)`, [BEKLEYEN, CALISAN]);
    assert.equal(await durum(BEKLEYEN), "waiting_owner");
    await db.query(`insert into public.organization_memberships (organization_id,user_id,role,is_active) values ($1,$2,'owner',true)`, [BEKLEYEN, SAHIP]);
    assert.equal(await durum(BEKLEYEN), "active");
  }));

test("askıya alınmış kurum sahibin katılmasıyla açılmıyor", async () =>
  islem(db, async () => {
    await rol(db, "postgres");
    await db.query(`insert into public.organization_memberships (organization_id,user_id,role,is_active) values ($1,$2,'owner',true)`, [ASKIDA, SAHIP]);
    assert.equal(await durum(ASKIDA), "suspended");
  }));
