// Cari hareket düzeltme/silme (20261009110313): güncellemede taksit
// durumları yeniden hesaplanır; sözleşme borcu ve PayTR tahsilatı API'den
// değiştirilemez; hareketin türü/carisi değişmez. Cari silindiğinde
// CASCADE (tablo sahibi olarak) etkilenmez.
//
// Migration anlık görüntüden yeni olduğu için burada AYRICA uygulanıyor.
// Görüntü yenilendiğinde bu satırı kaldırın.
import fs from "node:fs";
import path from "node:path";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20261009110313_cari_hareket_duzeltme.sql");

const SAHIP = "00000000-0000-4000-8000-000000000001";
const KURUM = "00000000-0000-4000-8000-0000000000a1";
const FIRSAT = "00000000-0000-4000-8000-0000000000c1";
const IMZA = "data:image/png;base64," + "A".repeat(300);

let db;
before(async () => {
  db = await veritabani();
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
});

const tek = async (sql, params = []) => (await db.query(sql, params)).rows[0];

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'sahip@example.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code)
      values ('${KURUM}', 'Test Kurum', 'test-kurum', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role) values ('${KURUM}', '${SAHIP}', 'owner');
    insert into public.crm_opportunities (id, organization_id, title, customer_name, contact_phone, created_by)
      values ('${FIRSAT}', '${KURUM}', 'Tez', 'Esra Büyükelhan', '0544 545 23 86', '${SAHIP}');
  `);
}

/** Teklif → kabul → imza: 45.000 TL, 2 × 22.500. Carinin kimliğini döndürür. */
async function imzalat() {
  await rol(db, "authenticated", SAHIP);
  const takvim = JSON.stringify([
    { sequence: 1, amount: 2250000, due_date: "2026-10-05" },
    { sequence: 2, amount: 2250000, due_date: "2026-11-05" },
  ]);
  const teklif = await tek(
    `select * from public.create_crm_proposal_v2($1, 'Tez', 'Kapsam', 4500000, 'included', 'custom', 'İki taksit', $2::jsonb, current_date + 30, null)`,
    [FIRSAT, takvim],
  );
  const { issue_crm_proposal_link: jeton } = await tek(`select public.issue_crm_proposal_link($1)`, [teklif.proposal_id]);
  const sonuc = await tek(`select * from public.respond_to_crm_proposal($1, 'accept')`, [jeton]);
  await rol(db, "anon");
  await db.query(`select public.mark_crm_contract_viewed($1)`, [sonuc.contract_token]);
  await tek(`select * from public.sign_crm_contract_v2($1, 'Esra Büyükelhan', $2, '10.0.0.1', 'Tarayıcı')`, [sonuc.contract_token, IMZA]);
  await rol(db, "postgres");
  return (await tek(`select party_id from public.crm_contracts where id = $1`, [sonuc.contract_id])).party_id;
}

const durumlar = (cari) =>
  db.query(
    `select i.status from public.payment_installments i join public.payment_plans p on p.id = i.payment_plan_id
      where p.party_id = $1 order by i.installment_no`,
    [cari],
  ).then((r) => r.rows.map((x) => x.status));

/** Uygulamanın yolu: kurum sahibi cari penceresinden tahsilat girer (createCollection). */
async function tahsilatGir(cari, tutar) {
  await rol(db, "authenticated", SAHIP);
  const { id } = await tek(
    `insert into public.account_entries (organization_id, party_id, entry_type, amount, source_type, reference_no, description, created_by)
     values ($1, $2, 'credit', $3, 'payment', 'TAH:' || gen_random_uuid(), 'Müşteri tahsilatı', $4) returning id`,
    [KURUM, cari, tutar, SAHIP],
  );
  await rol(db, "postgres");
  return id;
}

describe("cari hareket düzeltme ve silme", () => {
  test("MEŞRU: elle tahsilat düzeltilince taksit yeniden açılır, silinince hepsi açılır", () =>
    islem(db, async () => {
      await tohum();
      const cari = await imzalat();
      const tahsilat = await tahsilatGir(cari, 4500000);
      assert.deepEqual(await durumlar(cari), ["paid", "paid"]);

      await rol(db, "authenticated", SAHIP);
      await db.query(`update public.account_entries set amount = 2250000, description = 'Düzeltildi' where id = $1`, [tahsilat]);
      await rol(db, "postgres");
      assert.deepEqual(await durumlar(cari), ["paid", "pending"], "düzeltmeden sonra ikinci taksit açılmadı");

      // Tekrar artırınca kapanır (yalnızca açmak değil, kapatmak da).
      await rol(db, "authenticated", SAHIP);
      await db.query(`update public.account_entries set amount = 4500000 where id = $1`, [tahsilat]);
      await rol(db, "postgres");
      assert.deepEqual(await durumlar(cari), ["paid", "paid"]);

      await rol(db, "authenticated", SAHIP);
      await db.query(`delete from public.account_entries where id = $1`, [tahsilat]);
      await rol(db, "postgres");
      assert.deepEqual(await durumlar(cari), ["pending", "pending"]);
    }));

  test("sözleşme borcu ve PayTR tahsilatı API'den değiştirilemez; tür değişmez", () =>
    islem(db, async () => {
      await tohum();
      const cari = await imzalat();
      const borc = await tek(`select id from public.account_entries where party_id = $1 and source_type = 'crm_contract'`, [cari]);
      assert.ok(borc, "imzada sözleşme borcu yazılmadı");
      const paytr = await tek(
        `insert into public.account_entries (organization_id, party_id, entry_type, amount, source_type, reference_no, description, created_by)
         values ($1, $2, 'credit', 100000, 'payment', 'PAYTR-ARVO1', 'PayTR tahsilatı · ödeme bağlantısı', $3) returning id`,
        [KURUM, cari, SAHIP],
      );
      const elle = await tahsilatGir(cari, 100000);

      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `update public.account_entries set amount = 1 where id = $1`, [borc.id], /kilitli_cari_hareket/);
      await reddedilir(db, `delete from public.account_entries where id = $1`, [borc.id], /kilitli_cari_hareket/);
      await reddedilir(db, `update public.account_entries set amount = 1 where id = $1`, [paytr.id], /kilitli_cari_hareket/);
      await reddedilir(db, `delete from public.account_entries where id = $1`, [paytr.id], /kilitli_cari_hareket/);
      await reddedilir(db, `update public.account_entries set entry_type = 'debit', source_type = 'crm_contract' where id = $1`, [elle], /cari_hareket_turu_degismez/);
      await rol(db, "postgres");
    }));

  test("MEŞRU: hareketi olan cari silinince hareketler de gider (CASCADE korumaya takılmaz)", () =>
    islem(db, async () => {
      await tohum();
      const { id: cari } = await tek(
        `insert into public.account_parties (organization_id, party_type, name, created_by) values ($1, 'customer', 'Geçici Cari', $2) returning id`,
        [KURUM, SAHIP],
      );
      await tahsilatGir(cari, 50000);
      await rol(db, "authenticated", SAHIP);
      await db.query(`delete from public.account_parties where id = $1`, [cari]);
      await rol(db, "postgres");
      const { sayi } = await tek(`select count(*)::int as sayi from public.account_entries where party_id = $1`, [cari]);
      assert.equal(sayi, 0);
    }));
});
