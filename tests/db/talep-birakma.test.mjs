/*
  SATIŞÇI TALEBİ LİSTESİNDEN KALDIRIR, YÖNETİCİ GÖRÜR (20261022135951).

  Kanıtlanan:
    - Satışçı yalnızca KENDİSİNE atanmış açık talebi, SEBEP YAZARAK bırakır.
    - Bırakılan talep satışçının listesinden düşer, yöneticinin listesinde
      bırakanın adı ve sebebiyle durur.
    - Sütunlar panelden doğrudan yazılamaz.
    - Başkasına atanınca ya da talep kapanınca işaret temizlenir; yönetici
      uyarıyı kaldırıp aynı kişiye geri verebilir, satışçı veremez.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20261022135951_talebi_listeden_kaldir.sql");
// Yöneticiye bildirim (aynı işlevin yeni gövdesi); SONDAN uygulanır.
const MIGRATION_BILDIRIM = path.resolve(import.meta.dirname, "../../supabase/migrations/20261022142724_talep_birakma_bildirimi.sql");
const YONETICI = "00000000-0000-4000-8000-00000000d114";
const KURUM = "00000000-0000-4000-8000-00000000d101";
const SAHIP = "00000000-0000-4000-8000-00000000d111";
const SATISCI = "00000000-0000-4000-8000-00000000d112";
const DIGER = "00000000-0000-4000-8000-00000000d113";
const TALEP = "00000000-0000-4000-8000-00000000d121";

let db;
let satisciId;
let digerId;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const liste = async (kim) => {
  await rol(db, "authenticated", kim);
  const { rows } = await db.query(`select id, birakan_adi, birakma_sebebi from public.crm_talep_suz($1, null, null, null)`, [KURUM]);
  await rol(db, "postgres");
  return rows;
};
const birak = async (kim, sebep) => {
  await rol(db, "authenticated", kim);
  await db.query(`select public.crm_talebi_birak($1, $2)`, [TALEP, sebep]);
  await rol(db, "postgres");
};

before(async () => {
  db = await veritabani();
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
  await db.exec(fs.readFileSync(MIGRATION_BILDIRIM, "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${SAHIP}','s@x.com'),('${SATISCI}','a@x.com'),('${DIGER}','d@x.com'),('${YONETICI}','y@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values ('${KURUM}','Akademik Merkez','am','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${SATISCI}','member'),('${KURUM}','${DIGER}','member'),('${KURUM}','${YONETICI}','manager');
  `);
  satisciId = (await tek(`insert into public.hr_employees (organization_id,user_id,full_name,employment_status) values ($1,$2,'Ali Cengizhan','active') returning id`, [KURUM, SATISCI])).id;
  digerId = (await tek(`insert into public.hr_employees (organization_id,user_id,full_name,employment_status) values ($1,$2,'Gizem Atar','active') returning id`, [KURUM, DIGER])).id;
  await db.query(
    `insert into public.crm_opportunities (id, organization_id, title, customer_name, stage, assigned_employee_id, created_by)
     values ($1, $2, 'Tez danışmanlığı', 'Ayşe Yılmaz', 'lead', $3, $4)`,
    [TALEP, KURUM, satisciId, SAHIP],
  );
});

describe("talebi listeden kaldırma", () => {
  test("satışçı sebepsiz kaldıramaz", () =>
    islem(db, async () => {
      await rol(db, "authenticated", SATISCI);
      await reddedilir(db, `select public.crm_talebi_birak($1, '')`, [TALEP], /Sebep yazmadan/);
      await reddedilir(db, `select public.crm_talebi_birak($1, 'yok')`, [TALEP], /Sebep yazmadan/);
    }));

  test("kendisine atanmamış talebi kaldıramaz", () =>
    islem(db, async () => {
      await rol(db, "authenticated", DIGER);
      await reddedilir(db, `select public.crm_talebi_birak($1, 'Müşteri vazgeçti')`, [TALEP], /size atanmış/);
    }));

  test("kaldırınca satışçının listesinden düşer, yönetici adıyla ve sebebiyle görür", () =>
    islem(db, async () => {
      assert.equal((await liste(SATISCI)).length, 1);
      await birak(SATISCI, "Fiyatı yüksek buldu, başka yerle anlaştı");
      assert.equal((await liste(SATISCI)).length, 0, "satışçının listesinden düşmeli");
      const yonetici = await liste(SAHIP);
      assert.equal(yonetici.length, 1, "yöneticinin listesinde kalmalı");
      assert.equal(yonetici[0].birakan_adi, "Ali Cengizhan");
      assert.equal(yonetici[0].birakma_sebebi, "Fiyatı yüksek buldu, başka yerle anlaştı");
      const kayit = await tek(`select stage from public.crm_opportunities where id = $1`, [TALEP]);
      assert.equal(kayit.stage, "lead", "talep silinmez, arşivlenmez");
    }));

  /*
    20261022142724: kaldırınca yöneticilere (owner/admin/manager) kişiye
    özel bildirim; satışçıya ve diğer satış personeline gitmez.
  */
  test("kaldırınca yöneticilere bildirim gider, satışçılara gitmez", () =>
    islem(db, async () => {
      await db.query(`delete from public.notifications where organization_id = $1`, [KURUM]);
      await birak(SATISCI, "Fiyatı yüksek buldu, başka yerle anlaştı");
      const { rows } = await db.query(
        `select user_id, category, message, action_url from public.notifications where organization_id = $1 and category = 'talep_birakildi' order by user_id`, [KURUM]);
      assert.deepEqual(rows.map((r) => r.user_id).sort(), [SAHIP, YONETICI].sort());
      assert.match(rows[0].message, /Ali Cengizhan, Ayşe Yılmaz talebini listesinden kaldırdı: Fiyatı yüksek/);
      assert.equal(rows[0].action_url, `/panel/crm/requests/${TALEP}`);
    }));

  test("sütunlar panelden doğrudan yazılamaz", () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `update public.crm_opportunities set birakma_sebebi = 'elle yazıldı', birakildi_at = now() where id = $1`, [TALEP], /Listemden kaldır/);
    }));

  test("başkasına atanınca uyarı temizlenir", () =>
    islem(db, async () => {
      await birak(SATISCI, "Müşteri telefonu açmıyor, üç kez arandı");
      await rol(db, "authenticated", SAHIP);
      await db.query(`update public.crm_opportunities set assigned_employee_id = $1 where id = $2`, [digerId, TALEP]);
      await rol(db, "postgres");
      const kayit = await tek(`select birakildi_at, birakma_sebebi from public.crm_opportunities where id = $1`, [TALEP]);
      assert.equal(kayit.birakildi_at, null);
      assert.equal(kayit.birakma_sebebi, null);
    }));

  test("arşivlenince uyarı temizlenir", () =>
    islem(db, async () => {
      await birak(SATISCI, "Olumsuz döndü, ilgilenmiyor");
      await rol(db, "authenticated", SAHIP);
      await db.query(`update public.crm_opportunities set stage = 'lost', lost_reason = 'Olumsuz' where id = $1`, [TALEP]);
      await rol(db, "postgres");
      assert.equal((await tek(`select birakildi_at from public.crm_opportunities where id = $1`, [TALEP])).birakildi_at, null);
    }));

  test("yönetici uyarıyı kaldırıp aynı kişiye geri verir; satışçı veremez", () =>
    islem(db, async () => {
      await birak(SATISCI, "Yanlışlıkla kaldırdım sanırım");
      await rol(db, "authenticated", SATISCI);
      await reddedilir(db, `select public.crm_talep_birakmayi_geri_al($1)`, [TALEP], /yalnızca yönetici/);
      await rol(db, "authenticated", SAHIP);
      await db.query(`select public.crm_talep_birakmayi_geri_al($1)`, [TALEP]);
      await rol(db, "postgres");
      assert.equal((await liste(SATISCI)).length, 1, "satışçının listesine geri dönmeli");
    }));

  test("anon çağıramaz", () =>
    islem(db, async () => {
      await rol(db, "anon");
      await reddedilir(db, `select public.crm_talebi_birak($1, 'Müşteri vazgeçti')`, [TALEP], /permission denied/);
    }));
});
