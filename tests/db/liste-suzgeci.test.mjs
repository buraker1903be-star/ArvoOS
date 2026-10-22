/*
  LİSTE SÜZGECİ TEK TANIMDA (20261013141922).

  Liste (crm_talep_suz / operasyon_is_suz) ve şerit (crm_talep_serit /
  operasyon_is_serit) aynı süzgeç işlevinden okuyor. Sınananlar:
  1. Şeridin her sayısı, listenin aynı süzgeçle saydığıyla AYNI.
  2. Süzgecin anlamı bugünkü PostgREST süzgeciyle aynı: arama müşteri,
     konu, e-posta, hizmet türü, temsilci adı ve telefon rakamlarında;
     "atanmamis" ve temsilci kimliği; işlerde iptal/arşiv hariç.
  3. RLS çağıranın yetkisiyle: başka kurum hiçbir şey görmez.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
// İşlevleri yeniden yazan migration SONDA (satır içi: SET search_path yok).
const MIGRATIONLAR = [
  "20261013141922_liste_suzgeci_tek_tanim.sql",
  "20261013143144_liste_suzgeci_satir_ici.sql",
  /* operasyon_is_suz ek sorumluyu da tanıyor (yeni tablo da burada kuruluyor). */
  "20261022081123_is_ek_sorumlular.sql",
];
const KURUM = "00000000-0000-4000-8000-000000007701";
const OTEKI = "00000000-0000-4000-8000-000000007702";
const SAHIP = "00000000-0000-4000-8000-000000007711";
const YABANCI = "00000000-0000-4000-8000-000000007712";

let db;
let gizemId;
before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${SAHIP}','s@x.com'),('${YABANCI}','y@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values ('${KURUM}','AM','am','active','starter'),('${OTEKI}','Öteki','oteki','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values ('${KURUM}','${SAHIP}','owner'),('${OTEKI}','${YABANCI}','owner');
  `);
  gizemId = (await db.query(`insert into public.hr_employees (organization_id, full_name, employment_status) values ($1,'Gizem Atar','active') returning id`, [KURUM])).rows[0].id;
  await db.query(`
    insert into public.crm_opportunities (organization_id, title, customer_name, contact_email, contact_phone, stage, assigned_employee_id, request_details, created_by) values
      ($1,'Tez desteği','Meral Aydaç','meral@x.com','0532 111 22 33','lead',$2,'{"service_type":"Tez Danışmanlığı"}',$3),
      ($1,'Makale','Ali Can','ali@x.com','0505 999 88 77','lead',null,'{"service_type":"Makale Danışmanlığı"}',$3),
      ($1,'Çeviri','Ayşe Nur','ayse@x.com',null,'lost',$2,'{"service_type":"Akademik Çeviri"}',$3)`, [KURUM, gizemId, SAHIP]);
  await db.query(`
    insert into public.operation_workflows (organization_id, title, customer_name, status, due_date, assigned_employee_id, created_by) values
      ($1,'Tez işi','Meral Aydaç','in_progress', current_date - 3, $2, $3),
      ($1,'Makale işi','Ali Can','planned', current_date + 5, null, $3),
      ($1,'Biten iş','Ayşe Nur','completed', current_date - 10, $2, $3),
      ($1,'İptal iş','Veli','cancelled', null, null, $3)`, [KURUM, gizemId, SAHIP]);
});

const talepSay = async (desen, telefon, temsilci) => {
  const serit = (await db.query(`select public.crm_talep_serit($1,$2,$3,$4) as s`, [KURUM, desen, telefon, temsilci])).rows[0].s;
  const liste = (await db.query(`select stage, count(*)::int as n from public.crm_talep_suz($1,$2,$3,$4) group by stage`, [KURUM, desen, telefon, temsilci])).rows;
  return { serit, liste: Object.fromEntries(liste.map((r) => [r.stage, r.n])) };
};

describe("talepler: liste ve şerit aynı süzgeçten", () => {
  test("şerit sayıları listenin saydığıyla aynı (süzgeçsiz, aramalı, temsilcili)", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      for (const [desen, telefon, temsilci] of [[null, null, null], ["Meral", null, null], [null, null, "atanmamis"], [null, null, gizemId]]) {
        const { serit, liste } = await talepSay(desen, telefon, temsilci);
        assert.deepEqual(Object.fromEntries(Object.entries(serit).map(([k, v]) => [k, Number(v)])), liste, `süzgeç: ${desen}/${temsilci}`);
      }
    }));

  test("arama anlamı: müşteri, temsilci adı, hizmet türü ve telefon rakamları", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      const say = async (d, t = null) => (await db.query(`select count(*)::int as n from public.crm_talep_suz($1,$2,$3,null)`, [KURUM, d, t])).rows[0].n;
      assert.equal(await say("Meral"), 1, "müşteri adı");
      assert.equal(await say("Gizem"), 2, "temsilci adı");
      assert.equal(await say("Çeviri"), 1, "hizmet türü / konu");
      assert.equal(await say("0532 111", "532111"), 1, "telefon rakamları");
      assert.equal(await say(null), 3, "süzgeçsiz");
    }));

  test("temsilci süzgeci: atanmamış ve kişi", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      const say = async (t) => (await db.query(`select count(*)::int as n from public.crm_talep_suz($1,null,null,$2)`, [KURUM, t])).rows[0].n;
      assert.equal(await say("atanmamis"), 1);
      assert.equal(await say(gizemId), 2);
    }));

  test("başka kurum hiçbir şey görmez (RLS)", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", YABANCI);
      assert.deepEqual((await talepSay(null, null, null)).serit, {});
    }));
});

describe("işler: liste ve şerit aynı süzgeçten", () => {
  test("toplam, geciken, durumlar listenin saydığıyla aynı; iptal hariç", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      const s = (await db.query(`select public.operasyon_is_serit($1,null,null,current_date) as s`, [KURUM])).rows[0].s;
      const liste = (await db.query(`select status, count(*)::int as n from public.operasyon_is_suz($1,null,null) group by status`, [KURUM])).rows;
      assert.equal(Number(s.tum), 3, "iptal sayılmamalı");
      assert.equal(Number(s.geciken), 1, "tamamlanmış iş gecikmiş sayılmaz");
      assert.deepEqual(Object.fromEntries(Object.entries(s.durumlar).map(([k, v]) => [k, Number(v)])), Object.fromEntries(liste.map((r) => [r.status, r.n])));
    }));

  test("sorumlu ve arama süzgeci", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      const say = async (d, sorumlu) => (await db.query(`select count(*)::int as n from public.operasyon_is_suz($1,$2,$3)`, [KURUM, d, sorumlu])).rows[0].n;
      assert.equal(await say(null, "atanmamis"), 1);
      assert.equal(await say(null, gizemId), 2);
      assert.equal(await say("Makale", null), 1);
    }));
});
