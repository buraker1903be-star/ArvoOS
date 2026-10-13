/*
  SON TEMAS TEK ÇAĞRIDA (20261013120208).

  arvo_son_temaslar security definer; güvenliği RLS'le DENK olmalı. Her
  kişi için aynı yorumlar hem RLS'li doğrudan okumayla (bugünkü yol) hem
  işlevle sayılıp karşılaştırılıyor:
  1. Kurum sahibi: bütün yorumlar; en sonuncusu ve yazarının adı.
  2. Talebe tam erişimi olmayan ama işin sorumlusu olan personel: yalnızca
     RLS'in ona açtığı (iş bağlamındaki) yorumlar.
  3. İlgisiz personel ve başka kurum: hiçbir şey.
  4. anon çağıramaz.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20261013120208_son_temaslar.sql");
const KURUM = "00000000-0000-4000-8000-000000009701";
const OTEKI = "00000000-0000-4000-8000-000000009702";
const SAHIP = "00000000-0000-4000-8000-000000009711";
const SAHACI = "00000000-0000-4000-8000-000000009712";
const ILGISIZ = "00000000-0000-4000-8000-000000009713";
const YABANCI = "00000000-0000-4000-8000-000000009714";
const FIRSAT = "00000000-0000-4000-8000-000000009721";
const TEKLIF = "00000000-0000-4000-8000-000000009722";
const SOZLESME = "00000000-0000-4000-8000-000000009723";
const IS = "00000000-0000-4000-8000-000000009724";

let db;

before(async () => {
  db = await veritabani();
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${SAHIP}','s@x.com'),('${SAHACI}','h@x.com'),('${ILGISIZ}','i@x.com'),('${YABANCI}','y@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values ('${KURUM}','AM','am','active','starter'),('${OTEKI}','Öteki','oteki','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${SAHACI}','member'),('${KURUM}','${ILGISIZ}','member'),('${OTEKI}','${YABANCI}','owner');
    insert into public.hr_employees (organization_id,user_id,full_name,employment_status) values ('${KURUM}','${SAHIP}','Sahip Kişi','active');
    insert into public.crm_opportunities (id, organization_id, title, customer_name, created_by) values ('${FIRSAT}','${KURUM}','Tez','Meral','${SAHIP}');
    insert into public.crm_proposals (id, organization_id, opportunity_id, proposal_no, title, access_token_hash, created_by, status)
      values ('${TEKLIF}','${KURUM}','${FIRSAT}','TKF-1','Tez','x','${SAHIP}','accepted');
    insert into public.crm_contracts (id, organization_id, opportunity_id, proposal_id, contract_no, title, access_token_hash, amount, status, start_date, created_by)
      values ('${SOZLESME}','${KURUM}','${FIRSAT}','${TEKLIF}','SOZ-1','Tez','x',100,'sent',current_date,'${SAHIP}');
  `);
  const sahaci = (await db.query(`insert into public.hr_employees (organization_id,user_id,full_name,employment_status) values ($1,$2,'Saha Kişi','active') returning id`, [KURUM, SAHACI])).rows[0].id;
  await db.query(`insert into public.operation_workflows (id, organization_id, title, status, created_by, contract_id, assigned_employee_id) values ($1,$2,'Tez işi','in_progress',$3,$4,$5)`, [IS, KURUM, SAHIP, SOZLESME, sahaci]);
  // İş açıldığında sözleşmeye bağlanır; operasyoncu talebe tam erişmesin diye bağlantıyı koparıyoruz
  // (arvo_can_access_opportunity sözleşme.workflow_id üzerinden işin sorumlusunu da kabul ediyor).
  await db.query(`update public.crm_contracts set workflow_id = null where id = $1`, [SOZLESME]);
  await db.exec(`
    insert into public.crm_internal_comments (id, organization_id, opportunity_id, context_type, context_id, body, created_by, created_at) values
      (gen_random_uuid(),'${KURUM}','${FIRSAT}','request','${FIRSAT}','Talep notu',  '${SAHIP}', now() - interval '3 hours'),
      (gen_random_uuid(),'${KURUM}','${FIRSAT}','operation',  '${IS}',     'İş notu',     '${SAHIP}', now() - interval '2 hours'),
      (gen_random_uuid(),'${KURUM}','${FIRSAT}','contract',   '${SOZLESME}','En son not', '${SAHIP}', now() - interval '1 hour');
  `);
});

const ikiYol = async (kim, kurum = KURUM) => {
  await rol(db, "authenticated", kim);
  const rls = (await db.query(
    `select count(*)::int as n, max(created_at) as son from public.crm_internal_comments where organization_id = $1 and opportunity_id = $2`, [kurum, FIRSAT])).rows[0];
  const fn = (await db.query(`select * from public.arvo_son_temaslar($1, $2::uuid[])`, [kurum, [FIRSAT]])).rows;
  return { rls, fn };
};

describe("son temas, RLS'le denk", () => {
  test("kurum sahibi: bütün yorumlar, en sonuncusu ve yazarı", async () =>
    islem(db, async () => {
      const { rls, fn } = await ikiYol(SAHIP);
      assert.equal(rls.n, 3);
      assert.equal(fn.length, 1);
      assert.equal(fn[0].sayi, 3);
      assert.equal(fn[0].son_govde, "En son not");
      assert.equal(fn[0].yazar, "Sahip Kişi");
    }));

  test("işin sorumlusu (talebe tam erişimi yok): yalnızca RLS'in açtığı iş yorumu", async () =>
    islem(db, async () => {
      const { rls, fn } = await ikiYol(SAHACI);
      assert.equal(fn.length ? fn[0].sayi : 0, rls.n, "işlev RLS'ten farklı sayıyor");
      // Senaryo boş geçmesin: işin sorumlusu iş bağlamındaki yorumu görmeli.
      assert.equal(rls.n, 1, "senaryo kurulamadı: işin sorumlusu iş yorumunu görmüyor");
      assert.equal(fn[0].son_govde, "İş notu");
    }));

  test("ilgisiz personel ve başka kurum hiçbir şey görmez", async () =>
    islem(db, async () => {
      const ilgisiz = await ikiYol(ILGISIZ);
      assert.equal(ilgisiz.rls.n, 0);
      assert.equal(ilgisiz.fn.length, 0);
      const yabanci = await ikiYol(YABANCI);
      assert.equal(yabanci.fn.length, 0);
    }));

  test("anon çağıramaz", async () =>
    islem(db, async () => {
      await rol(db, "anon");
      await reddedilir(db, `select * from public.arvo_son_temaslar($1, $2::uuid[])`, [KURUM, [FIRSAT]], /permission denied/);
    }));
});
