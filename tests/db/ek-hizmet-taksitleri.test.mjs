// Ek hizmeti sözleşme taksitlerine dağıtma (20261027064850): planın
// toplamı ek hizmet kadar büyür, taksitler arvo_taksitleri_kaydet'ten
// geçer; bağlı ek hizmetin tutarı API'den değişmez, silinmez; bağ
// yalnızca fonksiyonla yazılır; ters işlem toplamı geri indirir.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const SAHIP = "00000000-0000-4000-8000-000000000001";
const UYE = "00000000-0000-4000-8000-000000000003";
const KURUM = "00000000-0000-4000-8000-0000000000a1";
const FIRSAT = "00000000-0000-4000-8000-0000000000c1";
const IMZA = "data:image/png;base64," + "A".repeat(300);

let db;
before(async () => {
  db = await veritabani();
});

const tek = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const json = (liste) => JSON.stringify(liste);

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'sahip@example.com'), ('${UYE}', 'uye@example.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code)
      values ('${KURUM}', 'Test Kurum', 'test-kurum', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role) values
      ('${KURUM}', '${SAHIP}', 'owner'), ('${KURUM}', '${UYE}', 'member');
    insert into public.crm_opportunities (id, organization_id, title, customer_name, contact_phone, created_by)
      values ('${FIRSAT}', '${KURUM}', 'Tez', 'Funda Taşdemir', '0544 545 23 86', '${SAHIP}');
  `);
}

/** Teklif → kabul → imza: 45.000 TL, 2 × 22.500. */
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
  await tek(`select * from public.sign_crm_contract_v2($1, 'Funda Taşdemir', $2, '10.0.0.1', 'Tarayıcı')`, [sonuc.contract_token, IMZA]);
  await rol(db, "postgres");
  return tek(`select c.payment_plan_id as plan, c.party_id as cari from public.crm_contracts c where c.id = $1`, [sonuc.contract_id]);
}

/** Uygulamanın yolu: cari penceresinden ek hizmet (createAdditionalService). */
async function ekHizmetGir(cari, tutar) {
  await rol(db, "authenticated", SAHIP);
  const { id } = await tek(
    `insert into public.account_entries (organization_id, party_id, entry_type, amount, source_type, reference_no, description, created_by)
     values ($1, $2, 'debit', $3, 'manual', 'EKH:' || gen_random_uuid(), 'Ek hizmet · Reaction Paper', $4) returning id`,
    [KURUM, cari, tutar, SAHIP],
  );
  await rol(db, "postgres");
  return id;
}

const planDurumu = async (plan) => ({
  toplam: Number((await tek(`select total_amount from public.payment_plans where id = $1`, [plan])).total_amount),
  taksitler: (await db.query(`select installment_no as no, amount::bigint as tutar from public.payment_installments where payment_plan_id = $1 order by installment_no`, [plan])).rows.map((r) => [r.no, Number(r.tutar)]),
});

const DAGITILMIS = [
  { no: 1, vade: "2026-10-05", tutar: 2600000 },
  { no: 2, vade: "2026-11-05", tutar: 2600000 },
];
const ESKI = [
  { no: 1, vade: "2026-10-05", tutar: 2250000 },
  { no: 2, vade: "2026-11-05", tutar: 2250000 },
];

describe("ek hizmeti sözleşme taksitlerine dağıtma", () => {
  test("MEŞRU: kurum sahibi dağıtır, plan büyür; bağlıyken tutar değişmez ve silinmez; çıkarınca eski hâline döner", () =>
    islem(db, async () => {
      await tohum();
      const { plan, cari } = await imzalat();
      const ek = await ekHizmetGir(cari, 700000);

      await rol(db, "authenticated", SAHIP);
      await db.query(`select public.arvo_ek_hizmet_taksitlere($1, $2, $3::jsonb, true)`, [ek, plan, json(DAGITILMIS)]);
      await rol(db, "postgres");
      assert.deepEqual(await planDurumu(plan), { toplam: 5200000, taksitler: [[1, 2600000], [2, 2600000]] });
      assert.equal((await tek(`select payment_plan_id from public.account_entries where id = $1`, [ek])).payment_plan_id, plan);

      await rol(db, "authenticated", SAHIP);
      // İki kez dağıtılamaz.
      await reddedilir(db, `select public.arvo_ek_hizmet_taksitlere($1, $2, $3::jsonb, true)`, [ek, plan, json(DAGITILMIS)], /ek_hizmet_zaten_dagitildi/);
      await reddedilir(db, `update public.account_entries set amount = 1 where id = $1`, [ek], /ek_hizmet_taksitlerde/);
      await reddedilir(db, `delete from public.account_entries where id = $1`, [ek], /ek_hizmet_taksitlerde/);
      await reddedilir(db, `update public.account_entries set payment_plan_id = null where id = $1`, [ek], /ek_hizmet_plan_bagi_dogrudan_yazilmaz/);
      // Açıklama düzeltilebilir (hareketiDuzelt aynı tutarı geri yazar).
      await db.query(`update public.account_entries set amount = 700000, description = 'Ek hizmet · Reaction Paper (düzeltildi)' where id = $1`, [ek]);

      await db.query(`select public.arvo_ek_hizmet_taksitlere($1, $2, $3::jsonb, false)`, [ek, plan, json(ESKI)]);
      await rol(db, "postgres");
      assert.deepEqual(await planDurumu(plan), { toplam: 4500000, taksitler: [[1, 2250000], [2, 2250000]] });

      // Bağ kopunca yine silinebilir.
      await rol(db, "authenticated", SAHIP);
      await db.query(`delete from public.account_entries where id = $1`, [ek]);
      await rol(db, "postgres");
    }));

  test("toplam ek hizmetle tutmazsa her şey geri alınır", () =>
    islem(db, async () => {
      await tohum();
      const { plan, cari } = await imzalat();
      const ek = await ekHizmetGir(cari, 700000);
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `select public.arvo_ek_hizmet_taksitlere($1, $2, $3::jsonb, true)`, [ek, plan, json(ESKI)], /plan_toplami_tutmuyor/);
      await rol(db, "postgres");
      assert.deepEqual(await planDurumu(plan), { toplam: 4500000, taksitler: [[1, 2250000], [2, 2250000]] });
      assert.equal((await tek(`select payment_plan_id from public.account_entries where id = $1`, [ek])).payment_plan_id, null);
    }));

  test("üye dağıtamaz; tahsilat ve başka carinin hareketi ek hizmet sayılmaz; bağ elle yazılamaz", () =>
    islem(db, async () => {
      await tohum();
      const { plan, cari } = await imzalat();
      const ek = await ekHizmetGir(cari, 700000);
      await rol(db, "authenticated", UYE);
      await reddedilir(db, `select public.arvo_ek_hizmet_taksitlere($1, $2, $3::jsonb, true)`, [ek, plan, json(DAGITILMIS)], /forbidden/);

      await rol(db, "authenticated", SAHIP);
      const { id: tahsilat } = await tek(
        `insert into public.account_entries (organization_id, party_id, entry_type, amount, source_type, reference_no, description, created_by)
         values ($1, $2, 'credit', 700000, 'payment', 'TAH:' || gen_random_uuid(), 'Müşteri tahsilatı', $3) returning id`,
        [KURUM, cari, SAHIP],
      );
      await reddedilir(db, `select public.arvo_ek_hizmet_taksitlere($1, $2, $3::jsonb, true)`, [tahsilat, plan, json(DAGITILMIS)], /ek_hizmet_bulunamadi/);
      const { id: baskaCari } = await tek(
        `insert into public.account_parties (organization_id, party_type, name, created_by) values ($1, 'customer', 'Başka Cari', $2) returning id`,
        [KURUM, SAHIP],
      );
      await rol(db, "postgres");
      const baskaEk = await ekHizmetGir(baskaCari, 700000);
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `select public.arvo_ek_hizmet_taksitlere($1, $2, $3::jsonb, true)`, [baskaEk, plan, json(DAGITILMIS)], /ek_hizmet_bulunamadi/);
      await reddedilir(db, `update public.account_entries set payment_plan_id = $2 where id = $1`, [ek, plan], /ek_hizmet_plan_bagi_dogrudan_yazilmaz/);
      await rol(db, "anon");
      await reddedilir(db, `select public.arvo_ek_hizmet_taksitlere($1, $2, $3::jsonb, true)`, [ek, plan, json(DAGITILMIS)], /permission denied/);
      await rol(db, "postgres");
    }));
});
