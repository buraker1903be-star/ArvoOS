// Gelir kaydı taksitle bağlı (20261024200803).
//
// Müşteri sözleşmeyi imzalayınca "planlı gelir" kaydı açılıyor, taksit
// tahsil edilince 'paid' oluyor. Eşleştirme ÖNCEDEN karşı taraf adı +
// tutar + vade üçlüsüyle yapılıyordu: imzada sözleşmenin TAMAMI için
// tek satır yazılıyor, tahsilat TAKSİT tutarı arıyordu. Çok taksitli
// sözleşmede hiç eşleşmiyor ve `update` hata vermeden geçiyordu —
// canlıda 27 kayıt (₺878.250) "planlı"da takılı kalmıştı.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

const SAHIP = "00000000-0000-4000-8000-000000000012";
const KURUM = "00000000-0000-4000-8000-0000000001b1";
const CARI = "00000000-0000-4000-8000-0000000001c1";
const TALEP = "00000000-0000-4000-8000-0000000001d1";
const TEKLIF = "00000000-0000-4000-8000-0000000001e1";
const SOZLESME = "00000000-0000-4000-8000-0000000001f1";
const JETON = "gizli-imza-jetonu";

let db;
before(async () => { db = await veritabani(); });

const sorgu = async (sql, p = []) => (await db.query(sql, p)).rows;
const tek = async (sql, p = []) => (await sorgu(sql, p))[0];

/** Üç taksitli ödeme takvimi; toplam 30.000 TL (kuruş). */
const TAKVIM = JSON.stringify([
  { sequence: 1, due_date: "2026-11-01", amount: 1000000 },
  { sequence: 2, due_date: "2026-12-01", amount: 1000000 },
  { sequence: 3, due_date: "2027-01-01", amount: 1000000 },
]);

async function tohum({ takvim = TAKVIM } = {}) {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'sahip2@example.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code)
      values ('${KURUM}', 'Kurum', 'kurum-gelir', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role)
      values ('${KURUM}', '${SAHIP}', 'owner');
    insert into public.account_parties (id, organization_id, party_type, name, created_by)
      values ('${CARI}', '${KURUM}', 'customer', 'Akademik Merkez', '${SAHIP}');
    insert into public.crm_opportunities (id, organization_id, title, customer_name, stage, created_by)
      values ('${TALEP}', '${KURUM}', 'Tez', 'Akademik Merkez', 'contract', '${SAHIP}');
  `);
  await db.query(
    `insert into public.crm_proposals
       (id, organization_id, opportunity_id, proposal_no, title, amount, currency,
        status, access_token_hash, payment_schedule, created_by)
     values ($1, $2, $3, 'TKL-1', 'Tez', 3000000, 'TRY', 'sent', 'x', $4::jsonb, $5)`,
    [TEKLIF, KURUM, TALEP, takvim, SAHIP],
  );
  await db.query(
    `insert into public.crm_contracts
       (id, organization_id, opportunity_id, proposal_id, contract_no, title, amount,
        currency, status, access_token_hash, due_date, created_by)
     values ($1, $2, $3, $4, 'SOZ-1', 'Tez', 3000000, 'TRY', 'sent',
             encode(extensions.digest($5, 'sha256'), 'hex'), '2026-11-01', $6)`,
    [SOZLESME, KURUM, TALEP, TEKLIF, JETON, SAHIP],
  );
}

const imzala = () =>
  db.query(`select * from public.sign_crm_contract($1, 'Müşteri Adı', '1.2.3.4', 'test')`, [JETON]);

const gelirler = () => sorgu(
  `select ft.amount, ft.status, ft.due_date, ft.payment_installment_id, i.installment_no
     from public.finance_transactions ft
     left join public.payment_installments i on i.id = ft.payment_installment_id
    where ft.organization_id = $1 and ft.transaction_type = 'income'
    order by i.installment_no nulls last`, [KURUM]);

describe("gelir kaydı taksitle bağlı", () => {
  test("imzada her taksit için ayrı planlı gelir açılıyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      await imzala();
      await rol(db, "postgres");

      const satirlar = await gelirler();
      assert.equal(satirlar.length, 3, "taksit başına bir gelir satırı");
      assert.deepEqual(satirlar.map((s) => Number(s.amount)), [1000000, 1000000, 1000000]);
      assert.ok(satirlar.every((s) => s.status === "planned"));
      assert.ok(satirlar.every((s) => s.payment_installment_id), "hepsi taksite bağlı");
      assert.deepEqual(satirlar.map((s) => s.installment_no), [1, 2, 3]);
    }));

  test("taksit tahsil edilince YALNIZCA o taksidin geliri kapanıyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      await imzala();
      await rol(db, "postgres");

      const ikinci = await tek(
        `select i.id from public.payment_installments i
           join public.payment_plans p on p.id = i.payment_plan_id
          where p.contract_id = $1 and i.installment_no = 2`, [SOZLESME]);
      /* Tahsilat KULLANICI kimliğiyle koşuyor: fonksiyon `created_by`
         için `auth.uid()` kullanıyor ve service_role'da o boş kalıyor
         (NOT NULL ihlali). Kural da owner/admin istiyor. */
      await rol(db, "authenticated", SAHIP);
      await db.query(`select public.collect_payment_installment($1)`, [ikinci.id]);
      await rol(db, "postgres");

      const satirlar = await gelirler();
      assert.deepEqual(
        satirlar.map((s) => [s.installment_no, s.status]),
        [[1, "planned"], [2, "paid"], [3, "planned"]],
        "yalnızca tahsil edilen taksidin geliri kapanmalı",
      );
      const kapanan = satirlar.find((s) => s.installment_no === 2);
      assert.ok(kapanan.paid_at ?? true);
      /* Tahsilat cariye de yazılıyor — gelir ile tahsilat ayrı kavram
         ama ikisi de bu tahsilattan doğuyor. */
      const hareket = await tek(
        `select entry_type, amount from public.account_entries
          where party_id = $1 and entry_type = 'credit'`, [CARI]);
      assert.equal(Number(hareket.amount), 1000000);
    }));

  test("takvimsiz sözleşmede tek taksit ve tek gelir satırı", () =>
    islem(db, async () => {
      await tohum({ takvim: "[]" });
      await rol(db, "service_role");
      await imzala();
      await rol(db, "postgres");

      const satirlar = await gelirler();
      assert.equal(satirlar.length, 1);
      assert.equal(Number(satirlar[0].amount), 3000000, "sözleşmenin tamamı");
      assert.equal(satirlar[0].installment_no, 1);
    }));

  test("bir taksidin ikinci gelir satırı açılamıyor", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      await imzala();
      await rol(db, "postgres");

      const taksit = await tek(
        `select i.id from public.payment_installments i
           join public.payment_plans p on p.id = i.payment_plan_id
          where p.contract_id = $1 and i.installment_no = 1`, [SOZLESME]);
      /* Aynı parayı iki kez gelir saymanın yolu kapalı: kısmi benzersiz
         dizin ikinci satırı reddediyor. */
      await assert.rejects(
        db.query(
          `insert into public.finance_transactions
             (organization_id, transaction_type, status, title, category, amount,
              currency, created_by, payment_installment_id)
           values ($1, 'income', 'planned', 'Kopya', 'Sözleşme Tahsilatı', 1000000,
                   'TRY', $2, $3)`,
          [KURUM, SAHIP, taksit.id],
        ),
      );
    }));
});
