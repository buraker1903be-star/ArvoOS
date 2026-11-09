// OS-01 (09.11.2026): talebin iç notu müşteriye giden hiçbir çıktıya girmemeli.
//
// Hata panelde, teklif formunun kapsam varsayılanındaydı (iç not "Hizmet
// kapsamı" kutusunda hazır geliyordu; lib/teklif-kapsami.ts). Bu dosya
// zincirin VERİTABANI ucunu sabitliyor: teklif ve sözleşme müşteriye
// yalnızca kendi kapsamlarıyla gidiyor; talebin notu müşteri sayfasının
// okuduğu işlevlerin hiçbirinde (teklif, sözleşme, belge metni) yok.
// Bir gün bu işlevlerden biri talebin notunu "açıklama" diye döndürmeye
// başlarsa test düşer.
//
// Dış servis yok: PGlite'ta canlı şemanın kendi işlevleri, anon rolüyle
// (müşterinin sayfası) çağrılıyor. Hiçbir e-posta ya da bildirim gitmez.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

const SAHIP = "00000000-0000-4000-8000-000000000001";
const UYE = "00000000-0000-4000-8000-000000000002";
const KURUM = "00000000-0000-4000-8000-0000000000a1";
const UYE_CALISAN = "00000000-0000-4000-8000-0000000000b1";
const FIRSAT = "00000000-0000-4000-8000-0000000000c1";
const ISARET = "OS01-IC-NOT-ISARETI";
const IC_NOT = `Yalnızca kullanıcı deneyimi incelemesi için sentetik kayıt. Dış iletişim gönderilmeyecek. ${ISARET}`;
const KAPSAM = "Üç bölüm literatür taraması ve analiz raporu";

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
  `);
  // Kapsamı boş, iç notu dolu talep (gözlenen durum).
  await db.query(
    `insert into public.crm_opportunities
       (id, organization_id, title, customer_name, contact_email, created_by, assigned_employee_id, notes, request_details)
     values ($1, $2, 'Tez danışmanlığı', 'Ayşe Yılmaz', 'ayse@example.com', $3, $4, $5, '{}'::jsonb)`,
    [FIRSAT, KURUM, SAHIP, UYE_CALISAN, IC_NOT],
  );
}

/** Personelin paneldeki yolu: kapsamı açıkça yazılmış teklif → bağlantı. */
async function teklifVer() {
  await rol(db, "authenticated", SAHIP);
  const teklif = await tek(
    `select * from public.create_crm_proposal_v2($1, 'Tez danışmanlığı', $2, 1200000,
       'included', 'cash', 'Peşin', '[]'::jsonb, current_date + 30, null)`,
    [FIRSAT, KAPSAM],
  );
  const { issue_crm_proposal_link: jeton } = await tek(`select public.issue_crm_proposal_link($1)`, [teklif.proposal_id]);
  return { teklifId: teklif.proposal_id, jeton };
}

const metin = (deger) => JSON.stringify(deger ?? null);

describe("OS-01: iç not müşteri çıktılarında yok", () => {
  test("teklifin müşteri sayfası ve belge metni yalnızca teklif kapsamını taşır", async () => {
    await islem(db, async () => {
      await tohum();
      const { jeton } = await teklifVer();

      await rol(db, "anon");
      const sayfa = await tek(`select * from public.get_public_crm_proposal($1)`, [jeton]);
      assert.ok(sayfa, "müşteri teklif sayfası verisi gelmeli");
      assert.equal(sayfa.scope, KAPSAM);
      assert.ok(!metin(sayfa).includes(ISARET), "teklif sayfası iç notu taşımamalı");

      const belge = await tek(`select public.arvo_public_document_text($1, 'proposal') as icerik`, [jeton]);
      assert.ok(!metin(belge?.icerik).includes(ISARET), "teklif belge metni iç notu taşımamalı");
    });
  });

  test("onaylanan tekliften doğan sözleşme de iç notu taşımaz; talebin notu yerinde kalır", async () => {
    await islem(db, async () => {
      await tohum();
      const { jeton } = await teklifVer();

      await rol(db, "anon");
      const yanit = await tek(`select * from public.respond_to_crm_proposal($1, 'accept')`, [jeton]);
      assert.equal(yanit.result_status, "accepted");

      const sozlesme = await tek(`select * from public.get_public_crm_contract($1)`, [yanit.contract_token]);
      assert.ok(sozlesme, "müşteri sözleşme sayfası verisi gelmeli");
      assert.equal(sozlesme.scope, KAPSAM);
      assert.ok(!metin(sozlesme).includes(ISARET), "sözleşme sayfası iç notu taşımamalı");

      const belge = await tek(`select public.arvo_public_document_text($1, 'contract') as icerik`, [yanit.contract_token]);
      assert.ok(!metin(belge?.icerik).includes(ISARET), "sözleşme belge metni iç notu taşımamalı");

      // İç not silinmedi, değişmedi: ayrım bir veri kaybı değil.
      await rol(db, "postgres");
      const talep = await tek(`select notes from public.crm_opportunities where id = $1`, [FIRSAT]);
      assert.equal(talep.notes, IC_NOT);
    });
  });
});
