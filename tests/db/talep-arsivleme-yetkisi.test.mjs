/*
  SATIŞÇI KENDİ TALEBİNİ ARŞİVLEYEBİLİR, BAŞKASININKİNİ DEĞİL.

  07.10.2026'da arşivleme ayrı bir yeteneğe alındı ve satış personeline
  açıldı. Arşivleme kaydı silmiyor: aşama "lost", sebep lost_reason'a
  yazılıyor, kayıt geçmişiyle duruyor.

  Uygulama "arşivleyebilir mi" diye soruyor; "HANGİ talebi" sorusunu
  veritabanı yanıtlıyor. Yetenek katalogunda varsayılanı gevşetmek bu
  sınırı gevşetmemeli: satışçı yalnızca kendisine atanmış talebi
  kapatabilir.

  Sınırı İKİ politika birden tutuyor ve ölçüldü: yalnız SELECT'i
  (members_read_assigned_crm_opportunities) ya da yalnız UPDATE'i
  (members_update_assigned_crm_opportunities) gevşetmek yetmiyor, test
  ancak ikisi birden gevşetilince düşüyor. Sebebi, UPDATE'in WHERE'inin
  SELECT politikasından da geçmesi — tek politikaya bakıp "koruma burada"
  demek yanıltıcı olurdu.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

const SAHIP = "00000000-0000-4000-8000-0000000007a1";
const KURUM = "00000000-0000-4000-8000-0000000007a2";
const SATISCI = "00000000-0000-4000-8000-0000000007a3";
const OTEKI = "00000000-0000-4000-8000-0000000007a4";
const CALISAN_SATISCI = "00000000-0000-4000-8000-0000000007a5";
const CALISAN_OTEKI = "00000000-0000-4000-8000-0000000007a6";
const KENDI = "00000000-0000-4000-8000-0000000007a7";
const BASKASININ = "00000000-0000-4000-8000-0000000007a8";

let db;
before(async () => { db = await veritabani(); });

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values
      ('${SAHIP}','sahip@x.com'),('${SATISCI}','satisci@x.com'),('${OTEKI}','oteki@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code)
      values ('${KURUM}','AM','am','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${SATISCI}','member'),('${KURUM}','${OTEKI}','member');
    insert into public.hr_employees (id,organization_id,user_id,full_name,employment_status) values
      ('${CALISAN_SATISCI}','${KURUM}','${SATISCI}','Satışçı','active'),
      ('${CALISAN_OTEKI}','${KURUM}','${OTEKI}','Öteki','active');
    insert into public.crm_opportunities (id,organization_id,title,customer_name,created_by,assigned_employee_id,stage) values
      ('${KENDI}','${KURUM}','Kendi talebi','Ayşe','${SAHIP}','${CALISAN_SATISCI}','lead'),
      ('${BASKASININ}','${KURUM}','Başkasının','Veli','${SAHIP}','${CALISAN_OTEKI}','lead');
  `);
}

/** Uygulamanın arşivleme güncellemesinin aynısı. */
async function arsivle(kisi, firsat) {
  await rol(db, "authenticated", kisi);
  const r = await db.query(
    `update public.crm_opportunities
       set stage = 'lost', probability = 0, lost_reason = 'Müşteri vazgeçti'
     where id = $1 and organization_id = $2
     returning id`, [firsat, KURUM]);
  await rol(db, "postgres");
  return r.rows.length;
}

describe("talep arşivleme yetkisi", () => {
  test("satışçı KENDİ talebini arşivleyebiliyor", () =>
    islem(db, async () => {
      await tohum();
      assert.equal(await arsivle(SATISCI, KENDI), 1);
      const r = await db.query(
        `select stage, lost_reason from public.crm_opportunities where id = $1`, [KENDI]);
      assert.deepEqual(r.rows[0], { stage: "lost", lost_reason: "Müşteri vazgeçti" });
    }));

  test("satışçı BAŞKASININ talebini arşivleyemiyor", () =>
    islem(db, async () => {
      await tohum();
      assert.equal(await arsivle(SATISCI, BASKASININ), 0, "RLS elemeliydi");
      const r = await db.query(
        `select stage from public.crm_opportunities where id = $1`, [BASKASININ]);
      assert.equal(r.rows[0].stage, "lead", "kayıt değişmemeli");
    }));

  test("yönetici her talebi arşivleyebiliyor", () =>
    islem(db, async () => {
      await tohum();
      assert.equal(await arsivle(SAHIP, BASKASININ), 1);
    }));

  test("arşivleme SİLME değil: kayıt ve geçmişi duruyor", () =>
    islem(db, async () => {
      await tohum();
      await arsivle(SATISCI, KENDI);
      const r = await db.query(
        `select count(*)::int as n from public.crm_opportunities where id = $1`, [KENDI]);
      assert.equal(r.rows[0].n, 1, "kayıt silinmemeli");
    }));
});
