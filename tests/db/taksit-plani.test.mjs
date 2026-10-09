// Taksit planını kaydetme (20261009100718): tutar/vade/taksit seçeneği
// değişikliği arvo_taksitleri_kaydet ile; toplam sözleşme tutarına eşit
// olmalı, yalnızca kurum yöneticisi, ödenmiş/bağlantılı taksit silinmez.
// Ayrıca rebuild_payment_plan_installments oturumsuz çağrıya kapatıldı.
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
      values ('${FIRSAT}', '${KURUM}', 'Tez', 'Esra Büyükelhan', '0544 545 23 86', '${SAHIP}');
  `);
}

/** Uygulamanın yolu: teklif → kabul → imza. 45.000 TL, iki taksit (2 × 22.500). */
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
  return tek(`select c.payment_plan_id as plan, p.total_amount::bigint as toplam from public.crm_contracts c join public.payment_plans p on p.id = c.payment_plan_id where c.id = $1`, [sonuc.contract_id]);
}

const taksitler = (plan) => db.query(`select id, installment_no as no, due_date::text as vade, amount::bigint as tutar, status from public.payment_installments where payment_plan_id = $1 order by installment_no`, [plan]).then((r) => r.rows);
const json = (liste) => JSON.stringify(liste);

describe("taksit planını kaydetme", () => {
  test("MEŞRU: kurum sahibi tutarı değiştirir, fark sonraki taksite gider; kimlikler korunur, yeni taksit eklenir", () =>
    islem(db, async () => {
      await tohum();
      const { plan, toplam } = await imzalat();
      assert.equal(Number(toplam), 4500000);
      const once = await taksitler(plan);

      await rol(db, "authenticated", SAHIP);
      await db.query(`select public.arvo_taksitleri_kaydet($1, $2::jsonb)`, [plan, json([
        { no: 1, vade: "2026-10-05", tutar: 1000000 },
        { no: 2, vade: "2026-11-05", tutar: 2000000 },
        { no: 3, vade: "2026-12-05", tutar: 1500000 },
      ])]);
      await rol(db, "postgres");

      const sonra = await taksitler(plan);
      assert.deepEqual(sonra.map((t) => [t.no, t.vade, Number(t.tutar)]), [[1, "2026-10-05", 1000000], [2, "2026-11-05", 2000000], [3, "2026-12-05", 1500000]]);
      assert.equal(sonra[0].id, once[0].id, "taksit kimliği korunmadı");
    }));

  test("toplam sözleşme tutarını tutmazsa reddedilir", () =>
    islem(db, async () => {
      await tohum();
      const { plan } = await imzalat();
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `select public.arvo_taksitleri_kaydet($1, $2::jsonb)`, [plan, json([
        { no: 1, vade: "2026-10-05", tutar: 2750000 },
        { no: 2, vade: "2026-11-05", tutar: 2750000 },
      ])], /plan_toplami_tutmuyor/);
      await rol(db, "postgres");
    }));

  test("üye planı kaydedemez; oturumsuz çağrı eski yeniden kurmaya da erişemez", () =>
    islem(db, async () => {
      await tohum();
      const { plan } = await imzalat();
      await rol(db, "authenticated", UYE);
      await reddedilir(db, `select public.arvo_taksitleri_kaydet($1, $2::jsonb)`, [plan, json([{ no: 1, vade: "2026-10-05", tutar: 4500000 }])], /forbidden/);
      await rol(db, "anon");
      await reddedilir(db, `select public.rebuild_payment_plan_installments($1, 1, '2026-10-05', 1)`, [plan], /permission denied/);
      await reddedilir(db, `select public.arvo_taksitleri_kaydet($1, $2::jsonb)`, [plan, json([{ no: 1, vade: "2026-10-05", tutar: 4500000 }])], /permission denied/);
      await rol(db, "postgres");
    }));

  test("etkin ödeme bağlantısı olan taksit plandan silinemez", () =>
    islem(db, async () => {
      await tohum();
      const { plan } = await imzalat();
      const ikinci = (await taksitler(plan))[1];
      await db.query(
        `insert into public.payment_links (id, organization_id, installment_id, provider_link_id, url, amount, created_by)
         values (gen_random_uuid(), $1, $2, 'p-1', 'https://www.paytr.com/link/x', 2250000, $3)`,
        [KURUM, ikinci.id, SAHIP],
      );
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `select public.arvo_taksitleri_kaydet($1, $2::jsonb)`, [plan, json([{ no: 1, vade: "2026-10-05", tutar: 4500000 }])], /silinemeyen_taksit/);
      await rol(db, "postgres");
    }));
});
