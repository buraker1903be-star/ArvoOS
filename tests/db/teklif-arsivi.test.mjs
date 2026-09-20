// Kabul/ret sonrası teklifin panelde görünmesi (migration 20260920145801).
// Müşteri teklifi onayladığı anda teklif panelden tamamen kayboluyordu:
// tetikleyici durumu 'archived' + archive_reason='accepted' yapıyor, okuma
// politikası ise yalnızca archive_reason='expired' arşivleri geçiriyordu.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20260920145801_kabul_edilen_teklif_panelde_gorunsun.sql");

const SAHIP = "00000000-0000-4000-8000-000000000001";
const KURUM = "00000000-0000-4000-8000-0000000000a1";
const FIRSAT = "00000000-0000-4000-8000-0000000000b1";

let db;
before(async () => {
  db = await veritabani();
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'sahip@example.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code) values ('${KURUM}', 'Kurum', 'kurum', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role) values ('${KURUM}', '${SAHIP}', 'owner');
    insert into public.crm_opportunities (id, organization_id, title, customer_name, stage, estimated_value, probability, created_by, created_at, updated_at, request_details)
      values ('${FIRSAT}', '${KURUM}', 'Danışmanlık', 'Müşteri A.Ş.', 'proposal', 100000, 50, '${SAHIP}', now(), now(), '{}'::jsonb);
  `);
}

/** Verilen durumda teklif; tetikleyici accepted/rejected'ı arşive çevirir. */
async function teklif(durum, gecerlilik = null) {
  await rol(db, "postgres");
  const { rows } = await db.query(
    `insert into public.crm_proposals (id, organization_id, opportunity_id, proposal_no, title, amount, currency, status, valid_until, access_token_hash, created_by, created_at, updated_at, view_count, tax_status)
     values (gen_random_uuid(), $1, $2, 'TEK-' || substr(md5(random()::text), 1, 6), 'Teklif', 100000, 'TRY', $3, $4, md5(random()::text), $5, now(), now(), 0, 'included')
     returning id, status, archive_reason`,
    [KURUM, FIRSAT, durum, gecerlilik, SAHIP],
  );
  return rows[0];
}

const panelde = async (id) => {
  await rol(db, "authenticated", SAHIP);
  return (await db.query(`select id from public.crm_proposals where id = $1`, [id])).rows.length === 1;
};

describe("teklif arşivi panelde görünür", () => {
  test("kabul edilen teklif arşivde görünür", () =>
    islem(db, async () => {
      await tohum();
      const t = await teklif("accepted");
      assert.deepEqual([t.status, t.archive_reason], ["archived", "accepted"], "tetikleyici arşive çevirmeli");
      assert.equal(await panelde(t.id), true);
    }));

  test("reddedilen ve süresi dolan teklif de görünür", () =>
    islem(db, async () => {
      await tohum();
      const red = await teklif("rejected");
      const dolan = await teklif("expired");
      assert.equal(await panelde(red.id), true);
      assert.equal(await panelde(dolan.id), true);
    }));

  test("meşru: taslak ve gönderilmiş teklif görünür, süresi geçmiş 'sent' gizli kalır", () =>
    islem(db, async () => {
      await tohum();
      const taslak = await teklif("draft");
      const gonderilmis = await teklif("sent", "2999-12-31");
      assert.equal(await panelde(taslak.id), true);
      assert.equal(await panelde(gonderilmis.id), true);

      // valid_until geçmişte olursa tetikleyici zaten arşivler; arşivsiz
      // (eski) satırın gizli kalması bilinçli.
      await rol(db, "postgres");
      await db.query(`update public.crm_proposals set valid_until = current_date - 5, status = 'sent', archive_reason = null, archived_at = null where id = $1`, [gonderilmis.id]);
      const { rows } = await db.query(`select status, archive_reason from public.crm_proposals where id = $1`, [gonderilmis.id]);
      if (rows[0].status === "sent") assert.equal(await panelde(gonderilmis.id), false);
    }));

  test("başka kurumun teklifi görünmez", () =>
    islem(db, async () => {
      await tohum();
      const t = await teklif("accepted");
      await rol(db, "postgres");
      await db.exec(`
        insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000009', 'yabanci@example.com');
        insert into public.organizations (id, name, slug, status, plan_code) values ('00000000-0000-4000-8000-0000000000a9', 'Yabancı', 'yabanci', 'active', 'starter');
        insert into public.organization_memberships (organization_id, user_id, role) values ('00000000-0000-4000-8000-0000000000a9', '00000000-0000-4000-8000-000000000009', 'owner');
      `);
      await rol(db, "authenticated", "00000000-0000-4000-8000-000000000009");
      assert.equal((await db.query(`select id from public.crm_proposals where id = $1`, [t.id])).rows.length, 0);
    }));
});
