/*
  SÖZLEŞMEYE ÖZEL MADDE METİNLERİ (migration 20261103144006).

  Sabitlenen:
   - MEŞRU AKIŞ: kurum sahibi taslak sözleşmenin bir maddesini değiştirir;
     müşteri sayfası kurum metni + özel maddeyi birlikte görür; imzada
     ikisi birlikte document_text'e donar;
   - imzalanan sözleşmenin özel maddeleri değiştirilemez;
   - özel madde yoksa belge eskisi gibi kurum metniyle çizilir.
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
      values ('${KURUM}', 'Test Kurum', 'ozel-madde-kurum', 'active', 'starter');
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



const OZEL = { gizlilik: { baslik: "Gizlilik", metin: "Bu sözleşmeye özel gizlilik hükmü." } };
const KURUM_METNI = { surum: 1, maddeler: { tebligat: { baslik: "Tebligat", metin: "Kurumun tebligat metni." } } };

describe("sözleşmeye özel maddeler", () => {
  test("kurum sahibi maddeyi değiştirir, müşteri görür, imzada donar", () =>
    islem(db, async () => {
      await tohum();
      const { sozlesmeId, sozlesmeJetonu } = await teklifHazirla();
      await rol(db, "authenticated", SAHIP);
      await db.query(
        `insert into public.organization_document_texts (organization_id, document_type, content, updated_by) values ($1, 'contract', $2, $3)`,
        [KURUM, JSON.stringify(KURUM_METNI), SAHIP],
      );
      const { rows } = await db.query(
        `update public.crm_contracts set ozel_maddeler = $2 where id = $1 returning id`,
        [sozlesmeId, JSON.stringify(OZEL)],
      );
      assert.equal(rows.length, 1, "kurum sahibi taslağın maddesini yazabilmeli");

      await rol(db, "anon");
      const { metin } = await tek(`select public.arvo_public_document_text($1, 'contract') as metin`, [sozlesmeJetonu]);
      assert.equal(metin.maddeler.gizlilik.metin, OZEL.gizlilik.metin, "özel madde müşteri sayfasında");
      assert.equal(metin.maddeler.tebligat.metin, KURUM_METNI.maddeler.tebligat.metin, "kurum metni de duruyor");

      await musteriImzalar(sozlesmeJetonu);
      await rol(db, "postgres");
      const { document_text } = await tek(`select document_text from public.crm_contracts where id = $1`, [sozlesmeId]);
      assert.equal(document_text.maddeler.gizlilik.metin, OZEL.gizlilik.metin, "imzada özel madde dondu");
      assert.equal(document_text.maddeler.tebligat.metin, KURUM_METNI.maddeler.tebligat.metin);

      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `update public.crm_contracts set ozel_maddeler = '{}'::jsonb where id = $1`, [sozlesmeId], /maddeleri değiştirilemez/);
    }));

  test("özel madde yoksa kurum metni olduğu gibi", () =>
    islem(db, async () => {
      await tohum();
      const { sozlesmeJetonu } = await teklifHazirla();
      await rol(db, "authenticated", SAHIP);
      await db.query(
        `insert into public.organization_document_texts (organization_id, document_type, content, updated_by) values ($1, 'contract', $2, $3)`,
        [KURUM, JSON.stringify(KURUM_METNI), SAHIP],
      );
      await rol(db, "anon");
      const { metin } = await tek(`select public.arvo_public_document_text($1, 'contract') as metin`, [sozlesmeJetonu]);
      assert.deepEqual(metin, KURUM_METNI);
    }));
});
