/*
  ÇEVRİMİÇİ SİNYALİ TEK ÇAĞRIDA (20261022130643).

  Eskiden presence-actions.recordPresence'ın beş ayrı PostgREST çağrısıyla
  yaptığı iş artık arvo_varlik_kaydet'te. Kanıtlanan: davranış aynı —
  oturum açılır, sürer, kurum değişince kapanıp yenisi açılır; yazılar
  çağıranın RLS'iyle, yani üyesi olmadığı kuruma sinyal yazılamaz.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20261022130643_varlik_tek_cagri.sql");
const KURUM = "00000000-0000-4000-8000-00000000c101";
const IKINCI = "00000000-0000-4000-8000-00000000c102";
const YABANCI_KURUM = "00000000-0000-4000-8000-00000000c103";
const UYE = "00000000-0000-4000-8000-00000000c111";

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const sinyal = async (org, oturum, yol = "/panel") => {
  await rol(db, "authenticated", UYE);
  const { id } = await tek(`select public.arvo_varlik_kaydet($1, $2, $3, '10.0.0.1', 'UA') as id`, [org, oturum, yol]);
  await rol(db, "postgres");
  return id;
};

before(async () => {
  db = await veritabani();
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${UYE}','u@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${KURUM}','Birinci Kurum','birinci','active','starter'),('${IKINCI}','İkinci Kurum','ikinci','active','starter'),('${YABANCI_KURUM}','Yabancı Kurum','yabanci','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${UYE}','member'),('${IKINCI}','${UYE}','member');
    insert into public.hr_employees (organization_id, user_id, full_name) values ('${KURUM}','${UYE}','Üye');
  `);
});

describe("çevrimiçi sinyali", () => {
  test("ilk sinyal oturum açar; sonraki aynı oturumu sürdürür", () =>
    islem(db, async () => {
      const ilk = await sinyal(KURUM, null, "/panel/crm");
      assert.ok(ilk);
      const oturum = await tek(`select organization_id, employee_id, ip_address::text as ip, current_path, logout_at from public.user_session_logs where id = $1`, [ilk]);
      assert.equal(oturum.organization_id, KURUM);
      assert.ok(oturum.employee_id, "personel kimliği yazılmalı");
      assert.equal(oturum.ip, "10.0.0.1/32");
      assert.equal(oturum.current_path, "/panel/crm");
      const varlik = await tek(`select session_id from public.user_presence where organization_id = $1 and user_id = $2`, [KURUM, UYE]);
      assert.equal(varlik.session_id, ilk);

      const ikinci = await sinyal(KURUM, ilk, "/panel/operations");
      assert.equal(ikinci, ilk, "aynı oturum sürmeli");
      assert.equal((await tek(`select current_path from public.user_session_logs where id = $1`, [ilk])).current_path, "/panel/operations");
      assert.equal(Number((await tek(`select count(*) as n from public.user_session_logs where user_id = $1`, [UYE])).n), 1);
    }));

  test("kurum değişince eski oturum kapanır, yenisi açılır", () =>
    islem(db, async () => {
      const ilk = await sinyal(KURUM, null);
      const yeni = await sinyal(IKINCI, ilk);
      assert.notEqual(yeni, ilk);
      const eski = await tek(`select logout_reason, logout_at from public.user_session_logs where id = $1`, [ilk]);
      assert.equal(eski.logout_reason, "workspace_switch");
      assert.ok(eski.logout_at);
    }));

  test("bozuk IP başlığı oturumu düşürmez", () =>
    islem(db, async () => {
      await rol(db, "authenticated", UYE);
      const { id } = await tek(`select public.arvo_varlik_kaydet($1, null, '/panel', 'bozuk-ip', 'UA') as id`, [KURUM]);
      await rol(db, "postgres");
      assert.equal((await tek(`select ip_address from public.user_session_logs where id = $1`, [id])).ip_address, null);
    }));

  test("üyesi olmadığı kuruma sinyal yazamaz", () =>
    islem(db, async () => {
      await rol(db, "authenticated", UYE);
      await reddedilir(db, `select public.arvo_varlik_kaydet($1, null, '/panel', null, null)`, [YABANCI_KURUM], /row-level security|permission denied/);
    }));

  test("anon çağıramaz", () =>
    islem(db, async () => {
      await rol(db, "anon");
      await reddedilir(db, `select public.arvo_varlik_kaydet($1, null, '/panel', null, null)`, [KURUM], /permission denied/);
    }));
});
