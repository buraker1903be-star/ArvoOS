// 20.09.2026 denetiminin düzeltmeleri (migration 20260920145013): imza,
// belge numarası, erişim günlüğü ve tahsilat. Her saldırı senaryosunun
// yanında meşru akış da sınanır: koruma müşteriyi ve paneli kırmamalı.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20260920145013_guvenlik_denetimi_duzeltmeleri.sql");

const SAHIP = "00000000-0000-4000-8000-000000000001";
const PERSONEL = "00000000-0000-4000-8000-000000000002";
const YABANCI = "00000000-0000-4000-8000-000000000003";
const KURUM = "00000000-0000-4000-8000-0000000000a1";
const BASKA_KURUM = "00000000-0000-4000-8000-0000000000a2";
const FIRSAT = "00000000-0000-4000-8000-0000000000b1";
const TEKLIF = "00000000-0000-4000-8000-0000000000b2";

let db;
before(async () => {
  db = await veritabani();
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${SAHIP}', 'sahip@example.com'), ('${PERSONEL}', 'personel@example.com'), ('${YABANCI}', 'yabanci@example.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${KURUM}', 'Müşteri Kurum', 'musteri-kurum', 'active', 'starter'),
      ('${BASKA_KURUM}', 'Başka Kurum', 'baska-kurum', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role) values
      ('${KURUM}', '${SAHIP}', 'owner'), ('${KURUM}', '${PERSONEL}', 'member'),
      ('${BASKA_KURUM}', '${YABANCI}', 'owner');
    insert into public.crm_opportunities (id, organization_id, title, customer_name, stage, estimated_value, probability, created_by, created_at, updated_at, request_details)
      values ('${FIRSAT}', '${KURUM}', 'Danışmanlık', 'Müşteri A.Ş.', 'proposal', 100000, 50, '${SAHIP}', now(), now(), '{}'::jsonb);
    insert into public.crm_proposals (id, organization_id, opportunity_id, proposal_no, title, amount, currency, status, access_token_hash, created_by, created_at, updated_at, view_count, tax_status)
      values ('${TEKLIF}', '${KURUM}', '${FIRSAT}', 'TEK-1', 'Teklif', 100000, 'TRY', 'accepted', 'x', '${SAHIP}', now(), now(), 0, 'included');
  `);
}

/**
 * Verilen durumda bir sözleşme (kendi teklifiyle; proposal_id tekil).
 * Müşteri imzası canlıda v2 ile atılıyor: v1 yalnızca service_role'e açık.
 */
async function sozlesme(durum, jeton) {
  await rol(db, "postgres");
  const { id: teklif } = await tek(
    `insert into public.crm_proposals (id, organization_id, opportunity_id, proposal_no, title, amount, currency, status, access_token_hash, created_by, created_at, updated_at, view_count, tax_status)
     values (gen_random_uuid(), $1, $2, 'TEK-' || substr(md5(random()::text), 1, 6), 'Teklif', 100000, 'TRY', 'accepted', md5(random()::text), $3, now(), now(), 0, 'included') returning id`,
    [KURUM, FIRSAT, SAHIP],
  );
  const { id } = await tek(
    `insert into public.crm_contracts (id, organization_id, opportunity_id, proposal_id, contract_no, title, amount, currency, status, access_token_hash, created_by, created_at, updated_at)
     values (gen_random_uuid(), $1, $2, $3, 'SOZ-' || substr(md5(random()::text), 1, 6), 'Sözleşme', 100000, 'TRY', $4,
             encode(extensions.digest($5, 'sha256'), 'hex'), $6, now(), now()) returning id`,
    [KURUM, FIRSAT, teklif, durum, jeton, SAHIP],
  );
  return id;
}

const GORSEL = (ek) => `data:image/png;base64,${"A".repeat(300)}${ek}`;

describe("sözleşme imzası", () => {
  test("iptal edilmiş sözleşme eski bağlantıdan imzalanamaz", () =>
    islem(db, async () => {
      await tohum();
      await sozlesme("cancelled", "jeton-iptal");
      await rol(db, "anon");
      await reddedilir(db, `select * from public.sign_crm_contract_v2($1, 'Müşteri Adı', $2)`, ["jeton-iptal", GORSEL("x")], /contract_closed/);
      await rol(db, "postgres");
      const c = await tek(`select status, workflow_id from public.crm_contracts where access_token_hash = encode(extensions.digest('jeton-iptal','sha256'),'hex')`);
      assert.deepEqual([c.status, c.workflow_id], ["cancelled", null]);
    }));

  test("reddedilmiş ve tamamlanmış sözleşme de imzalanamaz", () =>
    islem(db, async () => {
      await tohum();
      await sozlesme("rejected", "jeton-red");
      await sozlesme("completed", "jeton-bitti");
      await rol(db, "anon");
      await reddedilir(db, `select * from public.sign_crm_contract_v2($1, 'Müşteri', $2)`, ["jeton-red", GORSEL("x")], /contract_closed/);
      await reddedilir(db, `select * from public.sign_crm_contract_v2($1, 'Müşteri', $2)`, ["jeton-bitti", GORSEL("x")], /contract_closed/);
    }));

  test("meşru: gönderilmiş sözleşme imzalanır, iş akışı açılır", () =>
    islem(db, async () => {
      await tohum();
      await sozlesme("sent", "jeton-acik");
      await rol(db, "anon");
      const sonuc = await tek(`select * from public.sign_crm_contract_v2($1, 'Müşteri Adı', $2, '1.2.3.4', 'test')`, ["jeton-acik", GORSEL("ilk")]);
      assert.equal(sonuc.result_status, "signed");
      await rol(db, "postgres");
      const c = await tek(`select status, signed_at is not null as imzali, workflow_id from public.crm_contracts where access_token_hash = encode(extensions.digest('jeton-acik','sha256'),'hex')`);
      assert.deepEqual([c.status, c.imzali], ["signed", true]);
      assert.ok(c.workflow_id, "iş akışı oluşmalı");
    }));

  test("imzalı sözleşmenin imza görseli ikinci çağrıda değiştirilemez", () =>
    islem(db, async () => {
      await tohum();
      await sozlesme("sent", "jeton-imza");
      await rol(db, "anon");
      await db.query(`select * from public.sign_crm_contract_v2($1, 'Müşteri Adı', $2)`, ["jeton-imza", GORSEL("ilk")]);
      await db.query(`select * from public.sign_crm_contract_v2($1, 'Saldırgan', $2)`, ["jeton-imza", GORSEL("sahte")]);
      await rol(db, "postgres");
      const c = await tek(`select signed_signature_data, signed_name from public.crm_contracts where access_token_hash = encode(extensions.digest('jeton-imza','sha256'),'hex')`);
      assert.ok(c.signed_signature_data.endsWith("ilk"), "imza görseli değişmemeli");
      assert.equal(c.signed_name, "Müşteri Adı");
    }));
});

describe("belge numarası", () => {
  test("başka kurumun sayacı ilerletilemez; kendi kurumunda çalışır", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `select public.next_document_number($1, 'invoice', 'XXX')`, [BASKA_KURUM], /forbidden/);
      const no = await tek(`select public.next_document_number($1, 'invoice', 'FAT') as n`, [KURUM]);
      assert.match(no.n, /^FAT-\d{4}-000001$/);
      await rol(db, "postgres");
      const yok = await tek(`select count(*)::int as n from public.document_number_sequences where organization_id = $1`, [BASKA_KURUM]);
      assert.equal(yok.n, 0);
    }));

  test("sunucu (servis rolü) eskisi gibi serbest", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      const no = await tek(`select public.next_document_number($1, 'invoice', 'FAT') as n`, [BASKA_KURUM]);
      assert.match(no.n, /^FAT-\d{4}-000001$/);
    }));
});

describe("belge erişim günlüğü", () => {
  test("oturumsuz çağrı yazamaz; kurum üyesi yazar, yabancı yazamaz", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      const { id } = await tek(`select id from public.crm_proposals where id = $1`, [TEKLIF]);
      await rol(db, "anon");
      await reddedilir(db, `select public.log_document_access('proposal', $1, 'pdf_print', '1.2.3.4')`, [id], /forbidden/);
      await rol(db, "authenticated", YABANCI);
      await reddedilir(db, `select public.log_document_access('proposal', $1, 'pdf_print')`, [id], /forbidden/);
      await rol(db, "authenticated", PERSONEL);
      const kayit = await tek(`select public.log_document_access('proposal', $1, 'panel_preview') as id`, [id]);
      assert.ok(kayit.id);
    }));
});

describe("tahsilat", () => {
  async function taksit() {
    const sozlesmeId = await sozlesme("signed", "jeton-tahsilat");
    await rol(db, "postgres");
    const { id: parti } = await tek(
      `insert into public.account_parties (organization_id, name, party_type, created_by) values ($1, 'Müşteri A.Ş.', 'customer', $2) returning id`,
      [KURUM, SAHIP],
    );
    const { id: plan } = await tek(
      `insert into public.payment_plans (organization_id, contract_id, party_id, total_amount, currency, created_by) values ($1, $2, $3, 100000, 'TRY', $4) returning id`,
      [KURUM, sozlesmeId, parti, SAHIP],
    );
    return (await tek(
      `insert into public.payment_installments (organization_id, payment_plan_id, installment_no, amount, due_date, status) values ($1, $2, 1, 100000, current_date, 'pending') returning id`,
      [KURUM, plan],
    )).id;
  }

  test("satış personeli tahsilat yapamaz ve planı yeniden kuramaz; yönetici yapar", () =>
    islem(db, async () => {
      await tohum();
      const id = await taksit();
      const { payment_plan_id: plan } = await tek(`select payment_plan_id from public.payment_installments where id = $1`, [id]);

      await rol(db, "authenticated", PERSONEL);
      await reddedilir(db, `select public.collect_payment_installment($1)`, [id], /forbidden/);
      await reddedilir(db, `select public.rebuild_payment_plan_installments($1, 3, current_date)`, [plan], /forbidden/);

      await rol(db, "authenticated", SAHIP);
      await db.query(`select public.collect_payment_installment($1)`, [id]);
      await rol(db, "postgres");
      const t = await tek(`select status from public.payment_installments where id = $1`, [id]);
      assert.equal(t.status, "paid");
    }));
});
