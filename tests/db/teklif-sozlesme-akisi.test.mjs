// Teklif → sözleşme → iş → tahsilat akışı, canlı şemanın gerçek fonksiyon ve
// tetikleyicileriyle. Her senaryo kendi işleminde çalışır ve geri alınır.
//
// "Meşru" testler müşterinin ve personelin gerçek yolunu izler (uygulamanın
// çağırdığı RPC'ler, aynı rollerle). 19.09.2026'da teklif dondurma tetikleyicisi
// yalnızca saldırı senaryolarıyla sınanmıştı ve müşteri onayını canlıda kırdı;
// bir koruma eklerken ilgili meşru senaryo burada yeşil kalmalı.
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
      values ('${KURUM}', 'Test Kurum', 'test-kurum', 'active', 'starter');
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

async function sozlesme(id) {
  await rol(db, "postgres");
  return tek(`select * from public.crm_contracts where id = $1`, [id]);
}

describe("meşru akış", () => {
  test("müşteri, personelin sözleşmeye dönüştürdüğü teklifi onaylar", () =>
    islem(db, async () => {
      await tohum();
      const { teklifId, teklifJetonu } = await teklifHazirla();

      await rol(db, "anon");
      const ilk = await tek(
        `select * from public.arvo_confirm_proposal_decision($1, 'accept', '10.0.0.1', 'Tarayıcı')`,
        [teklifJetonu],
      );
      assert.equal(ilk.result_status, "accepted");
      const ikinci = await tek(
        `select * from public.arvo_confirm_proposal_decision($1, 'accept', '10.0.0.1', 'Tarayıcı')`,
        [teklifJetonu],
      );
      assert.equal(ikinci.result_status, "already");

      await rol(db, "postgres");
      const teklif = await tek(`select * from public.crm_proposals where id = $1`, [teklifId]);
      assert.ok(teklif.customer_responded_at, "müşteri yanıt zamanı yazılmalı");
      assert.equal(teklif.response_ip, "10.0.0.1");
      assert.equal(teklif.amount, 1200000);
    }));

  test("müşteri sözleşmeyi imzalar; iş, ödeme planı ve cari oluşur", () =>
    islem(db, async () => {
      await tohum();
      const { sozlesmeId, sozlesmeJetonu, teklifJetonu } = await teklifHazirla();
      await rol(db, "anon");
      await db.query(`select * from public.arvo_confirm_proposal_decision($1, 'accept', null, null)`, [
        teklifJetonu,
      ]);
      const isId = await musteriImzalar(sozlesmeJetonu);

      const s = await sozlesme(sozlesmeId);
      assert.equal(s.status, "signed");
      assert.equal(s.signed_name, "Ayşe Yılmaz");
      assert.equal(s.signed_signature_data, IMZA);
      assert.equal(s.legal_text_version, "1.0");
      assert.equal(s.workflow_id, isId);
      assert.ok(s.payment_plan_id && s.party_id);

      const is = await tek(`select * from public.operation_workflows where id = $1`, [isId]);
      assert.equal(is.contract_id, sozlesmeId);
      const taksit = await tek(
        `select count(*)::int as adet, sum(amount)::bigint as toplam from public.payment_installments
          where payment_plan_id = $1 and status = 'pending'`,
        [s.payment_plan_id],
      );
      assert.deepEqual([taksit.adet, taksit.toplam], [1, 1200000]);
      const firsat = await tek(`select stage from public.crm_opportunities where id = $1`, [FIRSAT]);
      assert.equal(firsat.stage, "won");
    }));

  test("müşteri imzadan önce reddederse sözleşme iptal olur, fırsat kaybedilir", () =>
    islem(db, async () => {
      await tohum();
      const { sozlesmeId, teklifJetonu } = await teklifHazirla();
      await rol(db, "anon");
      const sonuc = await tek(
        `select * from public.arvo_confirm_proposal_decision($1, 'reject', null, null)`,
        [teklifJetonu],
      );
      assert.equal(sonuc.result_status, "rejected");
      assert.equal((await sozlesme(sozlesmeId)).status, "cancelled");
      const firsat = await tek(`select stage from public.crm_opportunities where id = $1`, [FIRSAT]);
      assert.equal(firsat.stage, "lost");
    }));

  test("imzalı sözleşmenin teklifi sonradan reddedilemez", () =>
    islem(db, async () => {
      await tohum();
      const { sozlesmeId, sozlesmeJetonu, teklifJetonu } = await teklifHazirla();
      await musteriImzalar(sozlesmeJetonu);
      await rol(db, "anon");
      const sonuc = await tek(
        `select * from public.arvo_confirm_proposal_decision($1, 'reject', null, null)`,
        [teklifJetonu],
      );
      assert.equal(sonuc.result_status, "contract_signed");
      assert.equal((await sozlesme(sozlesmeId)).status, "signed");
    }));

  test("personel iş adımlarını bitirince iş ve sözleşme tamamlanır", () =>
    islem(db, async () => {
      await tohum();
      const { sozlesmeId, sozlesmeJetonu } = await teklifHazirla();
      const isId = await musteriImzalar(sozlesmeJetonu);

      await rol(db, "authenticated", SAHIP);
      const { affectedRows } = await db.query(
        `update public.operation_steps
            set is_completed = true, completed_at = now(), completed_by = $2
          where workflow_id = $1`,
        [isId, SAHIP],
      );
      assert.ok(affectedRows > 0, "iş adımları personele görünmeli");

      await rol(db, "postgres");
      const is = await tek(`select status from public.operation_workflows where id = $1`, [isId]);
      assert.equal(is.status, "completed");
      assert.equal((await sozlesme(sozlesmeId)).status, "completed");
    }));

  test("tahsilat taksiti ve ödeme planını kapatır", () =>
    islem(db, async () => {
      await tohum();
      const { sozlesmeId, sozlesmeJetonu } = await teklifHazirla();
      await musteriImzalar(sozlesmeJetonu);
      const { payment_plan_id: planId } = await sozlesme(sozlesmeId);
      const { id: taksitId } = await tek(
        `select id from public.payment_installments where payment_plan_id = $1`,
        [planId],
      );

      await rol(db, "authenticated", SAHIP);
      await db.query(`select public.collect_payment_installment($1)`, [taksitId]);

      await rol(db, "postgres");
      const taksit = await tek(`select status from public.payment_installments where id = $1`, [taksitId]);
      assert.equal(taksit.status, "paid");
      const plan = await tek(`select status from public.payment_plans where id = $1`, [planId]);
      assert.equal(plan.status, "completed");
    }));

  test("cariye elle girilen tahsilat bekleyen taksiti kapatır", () =>
    islem(db, async () => {
      await tohum();
      const { sozlesmeId, sozlesmeJetonu } = await teklifHazirla();
      await musteriImzalar(sozlesmeJetonu);
      const { payment_plan_id: planId, party_id: cariId } = await sozlesme(sozlesmeId);

      await rol(db, "authenticated", SAHIP);
      await db.query(
        `insert into public.account_entries
           (organization_id, party_id, entry_type, source_type, amount, currency, description, created_by)
         values ($1, $2, 'credit', 'payment', 1200000, 'TRY', 'Havale tahsilatı', $3)`,
        [KURUM, cariId, SAHIP],
      );

      await rol(db, "postgres");
      const taksit = await tek(
        `select status from public.payment_installments where payment_plan_id = $1`,
        [planId],
      );
      assert.equal(taksit.status, "paid");
    }));
});

describe("istemciden yasak değişiklikler", () => {
  test("personel sözleşmeyi imzalı yapamaz, imza bilgisi yazamaz", () =>
    islem(db, async () => {
      await tohum();
      const { sozlesmeId } = await teklifHazirla();
      await rol(db, "authenticated", SAHIP);
      await reddedilir(
        db,
        `update public.crm_contracts set status = 'signed' where id = $1`,
        [sozlesmeId],
        /yalnızca müşteri imzasıyla/,
      );
      await reddedilir(
        db,
        `update public.crm_contracts set signed_name = 'Sahte' where id = $1`,
        [sozlesmeId],
        /yalnızca müşteri imzasıyla/,
      );
    }));

  test("imzalı sözleşmenin durumu ve tutarı değiştirilemez", () =>
    islem(db, async () => {
      await tohum();
      const { sozlesmeId, sozlesmeJetonu } = await teklifHazirla();
      await musteriImzalar(sozlesmeJetonu);
      await rol(db, "authenticated", SAHIP);
      await reddedilir(
        db,
        `update public.crm_contracts set status = 'sent' where id = $1`,
        [sozlesmeId],
        /geri alınamaz/,
      );
      await reddedilir(
        db,
        `update public.crm_contracts set amount = 1 where id = $1`,
        [sozlesmeId],
        /imzalandı/,
      );
      await reddedilir(
        db,
        `update public.crm_contracts set status = 'completed' where id = $1`,
        [sozlesmeId],
        /iş akışı tamamlanınca/,
      );
    }));

  test("iş, sözleşmeye istemciden bağlanamaz", () =>
    islem(db, async () => {
      await tohum();
      const { sozlesmeId } = await teklifHazirla();
      await rol(db, "authenticated", SAHIP);
      await reddedilir(
        db,
        `insert into public.operation_workflows (organization_id, title, contract_id, created_by)
         values ($1, 'Sahte iş', $2, $3)`,
        [KURUM, sozlesmeId, SAHIP],
        /yalnızca müşteri imzasıyla/,
      );
    }));

  test("teklif personel tarafından kabul edilmiş yapılamaz", () =>
    islem(db, async () => {
      await tohum();
      const { teklifId } = await teklifHazirla({ donustur: false });
      await rol(db, "authenticated", SAHIP);
      await reddedilir(
        db,
        `update public.crm_proposals set status = 'accepted' where id = $1`,
        [teklifId],
        /yalnızca müşteri yanıtıyla/,
      );
      await reddedilir(
        db,
        `update public.crm_proposals set customer_responded_at = now() where id = $1`,
        [teklifId],
        /yalnızca müşteri yanıtıyla/,
      );
    }));

  test("kabul edilmiş teklifin tutarı değişmez", () =>
    islem(db, async () => {
      await tohum();
      const { teklifId } = await teklifHazirla();
      await rol(db, "authenticated", SAHIP);
      // Kabul edilmiş teklif personelin RLS görünümünden düşer; güncelleme ya
      // satır bulamaz ya da dondurma tetikleyicisine takılır. İkisinde de tutar
      // değişmemeli.
      await db.exec("savepoint tutar");
      try {
        await db.query(`update public.crm_proposals set amount = 1 where id = $1`, [teklifId]);
        await db.exec("release savepoint tutar");
      } catch {
        await db.exec("rollback to savepoint tutar");
      }
      await rol(db, "postgres");
      const teklif = await tek(`select amount from public.crm_proposals where id = $1`, [teklifId]);
      assert.equal(teklif.amount, 1200000);
    }));

  test("satış temsilcisi kendi fırsatının atamasını değiştiremez", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", UYE);
      await reddedilir(
        db,
        `update public.crm_opportunities set assigned_employee_id = null where id = $1`,
        [FIRSAT],
        /yalnızca yöneticiler/,
      );
    }));
});
