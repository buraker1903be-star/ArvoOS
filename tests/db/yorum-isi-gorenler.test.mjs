/*
  İŞİ GÖREBİLEN, YORUMUNU DA YAZABİLİR.

  Aynı sayfada iki ayrı yetki kuralı vardı: iş detayını açmak
  arvo_can_access_workflow'a, yoruma yazmak arvo_can_access_opportunity'ye
  bakıyordu. İkincisi fazladan sözleşme→fırsat bağlarını şart koştuğu
  için operasyon personeli işi açıyor ama kendi işinin notuna
  yazamıyordu (02.10.2026'da üç kişi).

  TESTİN İKİNCİ YÜZÜ SINIRIN KORUNMASI: "işi görebiliyorum" tek başına
  yetmemeli. Kendi işini context_id olarak gösteren biri, başka bir
  müşterinin kayıt zincirine not düşebilmemeli — yorum o fırsata
  yazılıyor ve orada görünüyor.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATIONLAR = [
  "20261001143617_operasyon_personeli_tutar_gormesin.sql",
  "20261002162556_isi_goren_yorum_yazabilir.sql",
].map((ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad));

const KURUM = "00000000-0000-4000-8000-0000000003a1";
const SAHIP = "00000000-0000-4000-8000-0000000003a2";
const UZMAN = "00000000-0000-4000-8000-0000000003a3";
const YABANCI = "00000000-0000-4000-8000-0000000003a4";

let db;
before(async () => {
  db = await veritabani();
  await db.exec(`drop view if exists public.ops_contracts, public.ops_opportunities, public.ops_proposals cascade;`);
  for (const m of MIGRATIONLAR) await db.exec(fs.readFileSync(m, "utf8"));
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

/** Bir fırsat + sözleşme + iş zinciri; iş sorumlusu verilen personel. */
async function zincir(ad, sorumluPersonelId) {
  const firsat = await tek(
    `insert into public.crm_opportunities (organization_id,title,customer_name,created_by,estimated_value)
     values ($1,$2,$2,$3,1000) returning id`, [KURUM, ad, SAHIP]);
  const teklif = await tek(
    `insert into public.crm_proposals (organization_id,opportunity_id,proposal_no,title,access_token_hash,created_by,status,amount)
     values ($1,$2,$3,$4,$6,$5,'accepted',1000) returning id`, [KURUM, firsat.id, "TKF-" + ad, ad, SAHIP, "hash-" + ad]);
  const sozlesme = await tek(
    `insert into public.crm_contracts (organization_id,opportunity_id,proposal_id,contract_no,title,access_token_hash,amount,status,start_date,created_by)
     values ($1,$2,$3,$4,$5,$7,1000,'signed',current_date,$6) returning id`,
    [KURUM, firsat.id, teklif.id, "SOZ-" + ad, ad, SAHIP, "chash-" + ad]);
  const is = await tek(
    `insert into public.operation_workflows (organization_id,contract_id,title,status,created_by,assigned_employee_id)
     values ($1,$2,$3,'in_progress',$4,$5) returning id`, [KURUM, sozlesme.id, ad, SAHIP, sorumluPersonelId]);
  await db.query(`update public.crm_contracts set workflow_id=$1 where id=$2`, [is.id, sozlesme.id]);
  return { firsat: firsat.id, is: is.id };
}

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values
      ('${SAHIP}','sahip@y.com'),('${UZMAN}','uzman@y.com'),('${YABANCI}','baska@y.com');
    insert into public.plans (code,name,description) values ('starter','Başlangıç','');
    insert into public.organizations (id,name,slug,status,plan_code)
      values ('${KURUM}','Akademik Merkez','akademik-merkez','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${UZMAN}','member'),('${KURUM}','${YABANCI}','member');
  `);
  const uzmanKaydi = await tek(
    `insert into public.hr_employees (organization_id,user_id,full_name,employment_type,employment_status)
     values ($1,$2,'Uzman','full_time','active') returning id`, [KURUM, UZMAN]);
  const yabanciKaydi = await tek(
    `insert into public.hr_employees (organization_id,user_id,full_name,employment_type,employment_status)
     values ($1,$2,'Başka Uzman','full_time','active') returning id`, [KURUM, YABANCI]);
  return {
    kendi: await zincir("Kendi isi", uzmanKaydi.id),
    baskasi: await zincir("Baskasinin isi", yabanciKaydi.id),
  };
}

const yorumYaz = (kisi, firsat, contextId, tur = "operation") =>
  db.query(
    `insert into public.crm_internal_comments (organization_id,opportunity_id,context_type,context_id,body,created_by)
     values ($1,$2,$3,$4,'Not',$5)`, [KURUM, firsat, tur, contextId, kisi]);

describe("işi gören yorum yazabilir", () => {
  test("işin sorumlusu kendi işinin notuna yazabiliyor", () =>
    islem(db, async () => {
      const { kendi } = await tohum();
      await rol(db, "authenticated", UZMAN);
      await yorumYaz(UZMAN, kendi.firsat, kendi.is);
      await rol(db, "postgres");
      const n = await tek(`select count(*)::int as adet from public.crm_internal_comments`);
      assert.equal(n.adet, 1);
    }));

  test("yazdığı notu okuyabiliyor", () =>
    islem(db, async () => {
      const { kendi } = await tohum();
      await rol(db, "authenticated", UZMAN);
      await yorumYaz(UZMAN, kendi.firsat, kendi.is);
      const { rows } = await db.query(`select body from public.crm_internal_comments`);
      await rol(db, "postgres");
      assert.deepEqual(rows.map((r) => r.body), ["Not"]);
    }));

  test("BAŞKA müşterinin zincirine kendi işiyle not düşemiyor", () =>
    islem(db, async () => {
      /* Açılan kapının sınırı: "işi görebiliyorum" tek başına yetmemeli,
         o iş yorumun bağlandığı fırsata ait olmalı. */
      const { kendi, baskasi } = await tohum();
      await rol(db, "authenticated", UZMAN);
      await reddedilir(db,
        `insert into public.crm_internal_comments (organization_id,opportunity_id,context_type,context_id,body,created_by)
         values ($1,$2,'operation',$3,'Not',$4)`,
        [KURUM, baskasi.firsat, kendi.is, UZMAN], /row-level security|policy/i);
      await rol(db, "postgres");
    }));

  test("göremediği işin notuna yazamıyor", () =>
    islem(db, async () => {
      const { baskasi } = await tohum();
      await rol(db, "authenticated", UZMAN);
      await reddedilir(db,
        `insert into public.crm_internal_comments (organization_id,opportunity_id,context_type,context_id,body,created_by)
         values ($1,$2,'operation',$3,'Not',$4)`,
        [KURUM, baskasi.firsat, baskasi.is, UZMAN], /row-level security|policy/i);
      await rol(db, "postgres");
    }));

  test("ÜRETİMDEKİ DURUM: sözleşme→iş bağı kopukken de yazabiliyor", () =>
    islem(db, async () => {
      /*
        Asıl hata buydu. Eski kural crm_contracts.workflow_id'ye bakıyor;
        o sütun boşsa operasyon personelinin fırsat erişimi kopuyor ve
        kendi işinin notuna yazamıyordu. Yeni kural işin KENDİ
        contract_id'sinden gidiyor, o yüzden ayakta kalıyor.
      */
      const { kendi } = await tohum();
      await db.query(`update public.crm_contracts set workflow_id=null where opportunity_id=$1`, [kendi.firsat]);
      await rol(db, "authenticated", UZMAN);
      await yorumYaz(UZMAN, kendi.firsat, kendi.is);
      await rol(db, "postgres");
      const n = await tek(`select count(*)::int as adet from public.crm_internal_comments`);
      assert.equal(n.adet, 1);
    }));

  test("iş dışı bağlamda eski kural sürüyor", () =>
    islem(db, async () => {
      /* Genişletme YALNIZCA iş bağlamı için: bağ kopukken sözleşme
         notuna yazmak hâlâ fırsat erişimi istiyor ve o yok. */
      const { kendi } = await tohum();
      await db.query(`update public.crm_contracts set workflow_id=null where opportunity_id=$1`, [kendi.firsat]);
      await rol(db, "authenticated", UZMAN);
      await reddedilir(db,
        `insert into public.crm_internal_comments (organization_id,opportunity_id,context_type,context_id,body,created_by)
         values ($1,$2,'contract',$3,'Not',$4)`,
        [KURUM, kendi.firsat, kendi.is, UZMAN], /row-level security|policy/i);
      await rol(db, "postgres");
    }));

  test("yönetici her zincirde yazabiliyor", () =>
    islem(db, async () => {
      const { baskasi } = await tohum();
      await rol(db, "authenticated", SAHIP);
      await yorumYaz(SAHIP, baskasi.firsat, baskasi.is);
      await rol(db, "postgres");
      const n = await tek(`select count(*)::int as adet from public.crm_internal_comments`);
      assert.equal(n.adet, 1);
    }));
});
