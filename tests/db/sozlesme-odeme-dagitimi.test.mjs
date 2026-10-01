/*
  AYNI MÜŞTERİNİN İKİ SÖZLEŞMESİ: PARA İKİ KEZ SAYILMASIN.

  Canlıda görülen hata: aynı kişinin SOZ-...040 ve SOZ-...041 sözleşmeleri
  vardı; 041 için hiç ödeme yapılmadığı hâlde müşteri takip portalında
  "ödendi" görünüyordu.

  Nedeni private.arvo_contract_payment_summary: tahsilatı CARİ düzeyinde
  topluyor, sözleşme süzgeci yok. Aynı carinin bütün tahsilatını her
  sözleşme için ayrı ayrı sayıp sözleşme tutarında kırpıyordu. 040 için
  ödenen para 041'i de kapatmış gösteriyordu.

  Bu yalnız bir görüntü hatası değildi: aynı fonksiyon
  "ödeme tamamlanınca açılır" kuralındaki müşteri dosyalarının kilidini de
  açıyor (arvo_portal_download). Yani ödenmemiş işin teslim dosyaları
  indirilebiliyordu.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);

const SAHIP = "00000000-0000-4000-8000-0000000001a1";
const KURUM = "00000000-0000-4000-8000-0000000001a2";
const CARI = "00000000-0000-4000-8000-0000000001a3";
const FIRSAT = "00000000-0000-4000-8000-0000000001a4";
const TEKLIF40 = "00000000-0000-4000-8000-0000000001a7";
const TEKLIF41 = "00000000-0000-4000-8000-0000000001a8";
const SOZ40 = "00000000-0000-4000-8000-0000000001a5";
const SOZ41 = "00000000-0000-4000-8000-0000000001a6";

let db;
before(async () => {
  db = await veritabani();
  await db.exec(fs.readFileSync(migration("20261001180311_sozlesme_odemesi_kendi_sozlesmesinden.sql"), "utf8"));
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

/** İki sözleşme, tek cari. 040 eski, 041 yeni. */
async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'sahip@ornek.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code)
      values ('${KURUM}', 'Akademi', 'akademi', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role)
      values ('${KURUM}', '${SAHIP}', 'owner');
    insert into public.account_parties (id, organization_id, party_type, name, is_active, created_by)
      values ('${CARI}', '${KURUM}', 'customer', 'Mehmet Demir', true, '${SAHIP}');
    insert into public.crm_opportunities (id, organization_id, title, customer_name, created_by)
      values ('${FIRSAT}', '${KURUM}', 'Tez', 'Mehmet Demir', '${SAHIP}');
    insert into public.crm_proposals
      (id, organization_id, opportunity_id, proposal_no, title, access_token_hash, created_by, status)
      values
      ('${TEKLIF40}', '${KURUM}', '${FIRSAT}', 'TKF-40', 'Birinci iş', 'p1', '${SAHIP}', 'accepted'),
      ('${TEKLIF41}', '${KURUM}', '${FIRSAT}', 'TKF-41', 'İkinci iş', 'p2', '${SAHIP}', 'accepted');
    insert into public.crm_contracts
      (id, organization_id, opportunity_id, proposal_id, contract_no, title, access_token_hash, amount, status,
       start_date, created_by, party_id, signed_at, tracking_code)
      values
      ('${SOZ40}', '${KURUM}', '${FIRSAT}', '${TEKLIF40}', 'SOZ-2026-000040', 'Birinci iş', 'x', 1000000, 'signed',
       current_date, '${SAHIP}', '${CARI}', now() - interval '30 days', 'TRK040'),
      ('${SOZ41}', '${KURUM}', '${FIRSAT}', '${TEKLIF41}', 'SOZ-2026-000041', 'İkinci iş', 'y', 600000, 'signed',
       current_date, '${SAHIP}', '${CARI}', now() - interval '2 days', 'TRK041');
  `);
}

const ozet = async (sozlesme) =>
  tek(`select * from private.arvo_contract_payment_summary($1)`, [sozlesme]);

async function tahsilat(tutar, aciklama = "Tahsilat") {
  await rol(db, "postgres");
  await db.query(
    `insert into public.account_entries
       (organization_id, party_id, entry_type, source_type, amount, currency, description,
        transaction_date, created_by)
     values ($1, $2, 'credit', 'payment', $3, 'TRY', $4, current_date, $5)`,
    [KURUM, CARI, tutar, aciklama, SAHIP]);
}

describe("sözleşme ödemesi kendi sözleşmesinden sayılır", () => {
  test("040'a yapılan ödeme 041'i kapatmıyor", () =>
    islem(db, async () => {
      await tohum();
      // Müşteri yalnızca birinci işin tamamını ödedi (10.000 TL).
      await tahsilat(1000000);

      const kirkinci = await ozet(SOZ40);
      assert.deepEqual(
        [Number(kirkinci.paid_amount), Number(kirkinci.remaining_amount), kirkinci.settled],
        [1000000, 0, true],
        "ödenen sözleşme kapanmalı");

      const kirkbirinci = await ozet(SOZ41);
      assert.deepEqual(
        [Number(kirkbirinci.paid_amount), Number(kirkbirinci.remaining_amount), kirkbirinci.settled],
        [0, 600000, false],
        "ödenmemiş sözleşme açık kalmalı");
    }));

  test("artan para sırayla bir sonraki sözleşmeye geçer", () =>
    islem(db, async () => {
      await tohum();
      // 10.000 + 2.500: birinci iş kapanır, ikinciye 2.500 düşer.
      await tahsilat(1250000);
      assert.equal(Number((await ozet(SOZ40)).paid_amount), 1000000);
      const k41 = await ozet(SOZ41);
      assert.deepEqual([Number(k41.paid_amount), Number(k41.remaining_amount)], [250000, 350000]);
      assert.equal(k41.settled, false);
    }));

  test("toplam dağıtım tahsilatı aşmıyor", () =>
    islem(db, async () => {
      await tohum();
      await tahsilat(1300000);
      const toplam = Number((await ozet(SOZ40)).paid_amount) + Number((await ozet(SOZ41)).paid_amount);
      assert.equal(toplam, 1300000, "aynı para iki sözleşmede birden sayılamaz");
    }));

  test("kendi ödeme planında kapanan taksit o sözleşmeye yazılır", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      // 041'in kendi planında 6.000 TL'lik taksit ödenmiş; 040'ın planı yok.
      const plan = await tek(
        `insert into public.payment_plans
           (organization_id, contract_id, party_id, total_amount, currency, status, created_by)
         values ($1,$2,$3,600000,'TRY','active',$4) returning id`,
        [KURUM, SOZ41, CARI, SAHIP]);
      await db.query(
        `insert into public.payment_installments
           (organization_id, payment_plan_id, installment_no, amount, due_date, status, paid_at)
         values ($1,$2,1,600000,current_date,'paid',now())`,
        [KURUM, plan.id]);
      await tahsilat(600000);

      // Para 041'in taksidine bağlı: eski sözleşme onu yutmamalı.
      assert.equal(Number((await ozet(SOZ41)).paid_amount), 600000);
      assert.equal(Number((await ozet(SOZ40)).paid_amount), 0);
    }));

  test("tek sözleşmeli caride davranış değişmiyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.query(`delete from public.crm_contracts where id = $1`, [SOZ41]);
      await tahsilat(400000);
      const k = await ozet(SOZ40);
      assert.deepEqual([Number(k.paid_amount), Number(k.remaining_amount)], [400000, 600000]);
    }));

  test("iade dağıtılan parayı geri alır", () =>
    islem(db, async () => {
      await tohum();
      await tahsilat(1250000);
      await rol(db, "postgres");
      await db.query(
        `insert into public.account_entries
           (organization_id, party_id, entry_type, source_type, amount, currency, description,
            transaction_date, created_by)
         values ($1,$2,'debit','adjustment',250000,'TRY','İade',current_date,$3)`,
        [KURUM, CARI, SAHIP]);
      assert.equal(Number((await ozet(SOZ40)).paid_amount), 1000000);
      assert.equal(Number((await ozet(SOZ41)).paid_amount), 0, "iade önce son sözleşmeden düşer");
    }));

  test("ödeme kilidi de düzeliyor: ödenmemiş işin dosyası kilitli kalır", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      const is = await tek(
        `insert into public.operation_workflows (organization_id, contract_id, title, status, created_by)
         values ($1,$2,'İkinci iş','in_progress',$3) returning id`, [KURUM, SOZ41, SAHIP]);
      // Müşteri yalnız 040'ı ödedi.
      await tahsilat(1000000);
      /*
        portal_payment_settled "ödeme tamamlanınca açılır" kuralındaki
        teslim dosyalarının kilidini açıyor. Eskiden 040'ın parası 041'i
        kapalı gösterdiği için ödenmemiş işin dosyaları indirilebiliyordu.
      */
      const { s: kilit } = await tek(
        `select public.portal_payment_settled($1) as s`, [is.id]);
      assert.equal(kilit, false, "ödenmemiş işin dosyaları açılmamalı");
    }));

  test("iptal edilen sözleşme para yutmuyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.query(`update public.crm_contracts set status='cancelled' where id=$1`, [SOZ40]);
      await tahsilat(600000);
      assert.equal(Number((await ozet(SOZ41)).paid_amount), 600000);
    }));
});
