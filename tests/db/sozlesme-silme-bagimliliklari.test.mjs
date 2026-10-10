/*
  SÖZLEŞME SİLMENİN VERİTABANI SONUÇLARI.

  Panel, bağlı iş ya da ödeme planı varsa silmeyi engelliyor
  (crm/contract-actions.ts). Bu test o engelin NEDEN gerekli olduğunu
  sabitliyor: veritabanı silmeyi reddetmiyor, sessizce temizliyor.

   - operation_workflows.contract_id → ON DELETE SET NULL: iş kaydı
     kalıyor ama sözleşmesini kaybediyor. Tutar, prim ve tahsilat
     sözleşmeye dayandığı için iş öksüz kalır.
   - payment_plans.contract_id → ON DELETE CASCADE: ödeme planı
     tamamen gidiyor, yani tahsilat takvimi siliniyor.

  10.10.2026'da paneldeki engel AÇIK GEÇİYORDU: bağlı kaydı arayan
  sorgunun hatası okunmuyordu ve sorgu düştüğünde "bağlı kayıt yok"
  sayılıyordu. Engel tek savunma; bu yüzden hatası da okunmalı.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

const KURUM = "00000000-0000-4000-8000-00000000d1a1";
const SAHIP = "00000000-0000-4000-8000-00000000d1b1";
const FIRSAT = "00000000-0000-4000-8000-00000000d1c1";
const SOZLESME = "00000000-0000-4000-8000-00000000d1c2";
const TEKLIF = "00000000-0000-4000-8000-00000000d1c3";

let db;
before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${SAHIP}','sahip@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code)
      values ('${KURUM}','AM','am','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role)
      values ('${KURUM}','${SAHIP}','owner');
    insert into public.crm_opportunities (id,organization_id,title,customer_name,stage,created_by)
      values ('${FIRSAT}','${KURUM}','Tez','Ayşe','won','${SAHIP}');
    insert into public.crm_proposals (id,organization_id,opportunity_id,proposal_no,title,access_token_hash,amount,status,created_by)
      values ('${TEKLIF}','${KURUM}','${FIRSAT}','TKF-1','Tez','x',100000,'accepted','${SAHIP}');
    insert into public.crm_contracts (id,organization_id,opportunity_id,proposal_id,contract_no,title,access_token_hash,amount,status,created_by)
      values ('${SOZLESME}','${KURUM}','${FIRSAT}','${TEKLIF}','SOZ-1','Tez','x',100000,'signed','${SAHIP}');
  `);
});

describe("sözleşme silinince bağlı kayıtlar", () => {
  test("iş kaydı kalıyor ama sözleşmesini kaybediyor (SET NULL)", async () =>
    islem(db, async () => {
      await rol(db, "postgres");
      const { rows: is } = await db.query(
        `insert into public.operation_workflows (organization_id,contract_id,title,status,created_by)
         values ($1,$2,'İş','in_progress',$3) returning id`, [KURUM, SOZLESME, SAHIP]);
      await db.query(`delete from public.crm_contracts where id = $1`, [SOZLESME]);
      const { rows } = await db.query(
        `select contract_id from public.operation_workflows where id = $1`, [is[0].id]);
      assert.equal(rows.length, 1, "iş kaydı da silindi");
      assert.equal(rows[0].contract_id, null, "iş sözleşmeye bağlı kalmış");
    }));

  test("maliyet kalemleri ve ek sözleşme de siliniyor (CASCADE)", async () =>
    islem(db, async () => {
      /* Paneldeki engel bu ikisine de bakıyor (contract-actions.ts).
         Bakmasaydı kurumun girdiği maliyet verisi ve hukuki ek, sözleşme
         silinirken sessizce giderdi. */
      await rol(db, "postgres");
      const { rows: kalem } = await db.query(
        `insert into public.contract_cost_items (organization_id,contract_id,category,description,amount,cost_date,status,created_by)
         values ($1,$2,'Dış hizmet','Çeviri',5000,current_date,'planned',$3) returning id`, [KURUM, SOZLESME, SAHIP]);
      await db.query(`delete from public.crm_contracts where id = $1`, [SOZLESME]);
      const { rows } = await db.query(`select id from public.contract_cost_items where id = $1`, [kalem[0].id]);
      assert.equal(rows.length, 0, "maliyet kalemi silinmedi (kural değişmişse panel engeli gözden geçirilmeli)");
    }));

  test("müşteri yazışması da siliniyor (CASCADE) — panel bu yüzden engelliyor", async () =>
    islem(db, async () => {
      /* Kurum sahibinin kararı (10.10.2026): yazışma silinmemeli, o
         yüzden yazışması olan sözleşme panelden SİLİNEMİYOR
         (contract-actions.ts). Bu test kaskatın hâlâ var olduğunu, yani
         engelin hâlâ gerekli olduğunu sabitliyor. */
      await rol(db, "postgres");
      const { rows: mesaj } = await db.query(
        `insert into public.customer_file_messages (organization_id,contract_id,sender_type,sender_name,body)
         values ($1,$2,'customer','Ayşe','Merhaba') returning id`, [KURUM, SOZLESME]);
      await db.query(`delete from public.crm_contracts where id = $1`, [SOZLESME]);
      const { rows } = await db.query(`select id from public.customer_file_messages where id = $1`, [mesaj[0].id]);
      assert.equal(rows.length, 0, "yazışma silinmedi (kaskat kalktıysa panel engeli gevşetilebilir)");
    }));

  test("ödeme planı tamamen siliniyor (CASCADE)", async () =>
    islem(db, async () => {
      await rol(db, "postgres");
      const { rows: cari } = await db.query(
        `insert into public.account_parties (organization_id,party_type,name,is_active,created_by)
         values ($1,'customer','Ayşe',true,$2) returning id`, [KURUM, SAHIP]);
      const { rows: plan } = await db.query(
        `insert into public.payment_plans (organization_id,contract_id,party_id,total_amount,currency,status,created_by)
         values ($1,$2,$3,100000,'TRY','active',$4) returning id`, [KURUM, SOZLESME, cari[0].id, SAHIP]);
      await db.query(`delete from public.crm_contracts where id = $1`, [SOZLESME]);
      const { rows } = await db.query(`select id from public.payment_plans where id = $1`, [plan[0].id]);
      assert.equal(rows.length, 0, "ödeme planı silinmedi (kural değişmişse panel engeli gözden geçirilmeli)");
    }));
});
