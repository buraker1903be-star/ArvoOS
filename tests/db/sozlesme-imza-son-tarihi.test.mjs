/*
  SÖZLEŞME İMZA SON TARİHİ (migration 20261103142231).

  Sabitlenen:
   - MEŞRU AKIŞ: personel son tarihi panelden yazar (RLS'in açtığı
     UPDATE), müşteri sayfası tarihi okur, süresi geçmemiş sözleşme
     imzalanır;
   - süresi geçmiş sözleşme imzalanamaz ve hiçbir şey üretmez (iş, plan);
   - son tarih yoksa (NULL) eskisi gibi imzalanır.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const SAHIP = "00000000-0000-4000-8000-000000000001";
const UYE = "00000000-0000-4000-8000-000000000002";
const KURUM = "00000000-0000-4000-8000-0000000000a1";
const UYE_CALISAN = "00000000-0000-4000-8000-0000000000b1";
const FIRSAT = "00000000-0000-4000-8000-0000000000c1";
const IMZA = "data:image/png;base64," + "A".repeat(300);

let db;
before(async () => {
  db = await veritabani();
});

async function tek(sql, params = []) {
  const { rows } = await db.query(sql, params);
  return rows[0];
}

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${SAHIP}', 'sahip@example.com'), ('${UYE}', 'uye@example.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code)
      values ('${KURUM}', 'Test Kurum', 'imza-son-kurum', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role) values
      ('${KURUM}', '${SAHIP}', 'owner'), ('${KURUM}', '${UYE}', 'member');
    insert into public.hr_employees (id, organization_id, user_id, full_name, can_receive_sales_requests)
      values ('${UYE_CALISAN}', '${KURUM}', '${UYE}', 'Satış Temsilcisi', true);
    insert into public.crm_opportunities
      (id, organization_id, title, customer_name, contact_email, created_by, assigned_employee_id)
      values ('${FIRSAT}', '${KURUM}', 'Tez danışmanlığı', 'Ayşe Yılmaz', 'ayse@example.com',
              '${SAHIP}', '${UYE_CALISAN}');
  `);
}

/** Personelin paneldeki yolu: teklif oluştur → bağlantı ver → sözleşmeye dönüştür. */
async function teklifHazirla({ donustur = true } = {}) {
  await rol(db, "authenticated", SAHIP);
  const teklif = await tek(
    `select * from public.create_crm_proposal_v2($1, 'Tez danışmanlığı', 'Kapsam', 1200000,
       'included', 'cash', 'Peşin', '[]'::jsonb, current_date + 30, null)`,
    [FIRSAT],
  );
  const { issue_crm_proposal_link: teklifJetonu } = await tek(
    `select public.issue_crm_proposal_link($1)`,
    [teklif.proposal_id],
  );
  if (!donustur) return { teklifId: teklif.proposal_id, teklifJetonu };
  const sonuc = await tek(`select * from public.respond_to_crm_proposal($1, 'accept')`, [teklifJetonu]);
  assert.equal(sonuc.result_status, "accepted");
  // Senaryo tek işlemde koştuğu için now() sabit: müşterinin onayı personelin
  // yazdığı responded_at'i aynı değerle ezer ve değişiklik görünmez. Gerçekte
  // onay ayrı bir işlemde, sonra gelir; dönüştürmeyi bir gün geriye alıyoruz
  // (tetikleyicisiz, geçmiş bir işlemmiş gibi). Bu olmadan 19.09 olayına yol
  // açan dondurma kuralı bu testlerden geçiyordu.
  await rol(db, "postgres");
  await db.exec("set local session_replication_role = replica");
  await db.query(
    `update public.crm_proposals set responded_at = responded_at - interval '1 day' where id = $1`,
    [teklif.proposal_id],
  );
  await db.exec("set local session_replication_role = origin");
  return {
    teklifId: teklif.proposal_id,
    teklifJetonu,
    sozlesmeId: sonuc.contract_id,
    sozlesmeJetonu: sonuc.contract_token,
  };
}

/** Müşterinin sözleşme sayfasındaki yolu: görüntüle → imzala → onayları kaydet. */
async function musteriImzalar(sozlesmeJetonu) {
  await rol(db, "anon");
  await db.query(`select public.mark_crm_contract_viewed($1)`, [sozlesmeJetonu]);
  const imza = await tek(
    `select * from public.sign_crm_contract_v2($1, 'Ayşe Yılmaz', $2, '10.0.0.1', 'Tarayıcı')`,
    [sozlesmeJetonu, IMZA],
  );
  assert.equal(imza.result_status, "signed");
  const onay = await tek(
    `select public.arvo_record_contract_consents($1, '1.0', '{"kvkk": true}'::jsonb) as kaydedildi`,
    [sozlesmeJetonu],
  );
  assert.equal(onay.kaydedildi, true);
  return imza.workflow_id;
}


describe("imza son tarihi", () => {
  test("personel tarihi yazar, müşteri okur ve süresi geçmeden imzalar", () =>
    islem(db, async () => {
      await tohum();
      const { sozlesmeId, sozlesmeJetonu } = await teklifHazirla();
      await rol(db, "authenticated", SAHIP);
      const { rows } = await db.query(
        `update public.crm_contracts set imza_son_tarihi = (now() at time zone 'Europe/Istanbul')::date + 1 where id = $1 returning imza_son_tarihi`,
        [sozlesmeId],
      );
      assert.equal(rows.length, 1, "kurum sahibi son tarihi yazabilmeli");
      await rol(db, "anon");
      const okunan = await tek(`select public.arvo_public_contract_deadline($1) as t`, [sozlesmeJetonu]);
      assert.ok(okunan.t, "müşteri sayfası tarihi okuyabilmeli");
      const workflowId = await musteriImzalar(sozlesmeJetonu);
      assert.ok(workflowId);
    }));

  test("süresi geçmiş sözleşme imzalanamaz, iş açılmaz", () =>
    islem(db, async () => {
      await tohum();
      const { sozlesmeId, sozlesmeJetonu } = await teklifHazirla();
      await rol(db, "postgres");
      await db.query(`update public.crm_contracts set imza_son_tarihi = (now() at time zone 'Europe/Istanbul')::date - 1 where id = $1`, [sozlesmeId]);
      await rol(db, "anon");
      await reddedilir(db, `select * from public.sign_crm_contract_v2($1, 'Ayşe Yılmaz', $2, '10.0.0.1', 'Tarayıcı')`, [sozlesmeJetonu, IMZA], /contract_expired/);
      await rol(db, "postgres");
      const { rows: [s] } = await db.query(`select status, signed_at, workflow_id from public.crm_contracts where id = $1`, [sozlesmeId]);
      assert.equal(s.signed_at, null);
      assert.equal(s.workflow_id, null);
    }));

  test("son tarih yoksa eskisi gibi imzalanır", () =>
    islem(db, async () => {
      await tohum();
      const { sozlesmeJetonu } = await teklifHazirla();
      const workflowId = await musteriImzalar(sozlesmeJetonu);
      assert.ok(workflowId);
    }));
});
