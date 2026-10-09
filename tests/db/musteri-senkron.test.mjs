// Müşteri bilgisi CRM ⇄ Finans iki yönlü senkron (20261009082529): talep,
// cari ve iş kaydı aynı ad/telefon/e-postayı taşır; imzada cari önce
// telefona, sonra Türkçe harf duyarsız ada göre bulunur.
//
// Migration anlık görüntüden yeni olduğu için burada AYRICA uygulanıyor.
// Görüntü yenilendiğinde bu satırı kaldırın (yeniden uygulamak, sonradan
// değişmiş bir fonksiyonu eskisine döndürebilir).
import fs from "node:fs";
import path from "node:path";
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20261009082529_musteri_iki_yonlu_senkron.sql");

const SAHIP = "00000000-0000-4000-8000-000000000001";
const KURUM = "00000000-0000-4000-8000-0000000000a1";
const FIRSAT = "00000000-0000-4000-8000-0000000000c1";
const FIRSAT2 = "00000000-0000-4000-8000-0000000000c2";
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
    insert into public.crm_opportunities (id, organization_id, title, customer_name, contact_email, contact_phone, created_by) values
      ('${FIRSAT}', '${KURUM}', 'Tez danışmanlığı', 'Emine Çetin', 'emine@example.com', '0534 821 58 01', '${SAHIP}'),
      ('${FIRSAT2}', '${KURUM}', 'Makale', 'EMİNE ÇETİN', 'emine@example.com', '+90 (534) 821 58 01', '${SAHIP}');
  `);
}

/** Personelin teklifi sözleşmeye dönüştürmesi ve müşterinin imzalaması (uygulamanın RPC'leri). */
async function imzalat(firsat) {
  await rol(db, "authenticated", SAHIP);
  const teklif = await tek(
    `select * from public.create_crm_proposal_v2($1, 'İş', 'Kapsam', 1200000, 'included', 'cash', 'Peşin', '[]'::jsonb, current_date + 30, null)`,
    [firsat],
  );
  const { issue_crm_proposal_link: jeton } = await tek(`select public.issue_crm_proposal_link($1)`, [teklif.proposal_id]);
  const sonuc = await tek(`select * from public.respond_to_crm_proposal($1, 'accept')`, [jeton]);
  await rol(db, "anon");
  await db.query(`select public.mark_crm_contract_viewed($1)`, [sonuc.contract_token]);
  const imza = await tek(`select * from public.sign_crm_contract_v2($1, 'Emine Çetin', $2, '10.0.0.1', 'Tarayıcı')`, [sonuc.contract_token, IMZA]);
  assert.equal(imza.result_status, "signed");
  await rol(db, "postgres");
  return tek(`select c.id, c.party_id, c.workflow_id, pp.party_id as plan_cari from public.crm_contracts c left join public.payment_plans pp on pp.contract_id = c.id where c.id = $1`, [sonuc.contract_id]);
}

describe("müşteri bilgisi CRM ⇄ Finans", () => {
  test("imzada cari talepten doğar; talep düzeltilince cari ve iş de düzelir (cari ayrışmış olsa bile)", () =>
    islem(db, async () => {
      await tohum();
      const s = await imzalat(FIRSAT);
      const cari = s.party_id ?? s.plan_cari;
      assert.ok(cari, "imzada cari açılmadı");

      // Cari elle ayrışmış: eskiden bu alan bir daha hiç eşlenmiyordu.
      await db.query(`update public.account_parties set name = 'EMİNE ÇETİN' where id = $1`, [cari]);
      await rol(db, "authenticated", SAHIP);
      await db.query(`update public.crm_opportunities set customer_name = 'Emine Çetin Kaya', contact_email = 'emine.kaya@example.com' where id = $1`, [FIRSAT]);
      await rol(db, "postgres");

      const p = await tek(`select name, email from public.account_parties where id = $1`, [cari]);
      assert.deepEqual([p.name, p.email], ["Emine Çetin Kaya", "emine.kaya@example.com"]);
      assert.ok(s.workflow_id, "imzada iş kaydı açılmadı");
        const w = await tek(`select customer_name from public.operation_workflows where id = $1`, [s.workflow_id]);
        assert.equal(w.customer_name, "Emine Çetin Kaya");
    }));

  test("caride değişen telefon ve ad müşterinin taleplerine ve işine yansır", () =>
    islem(db, async () => {
      await tohum();
      const s = await imzalat(FIRSAT);
      const cari = s.party_id ?? s.plan_cari;
      await db.query(`update public.account_parties set phone = '0532 000 00 00', name = 'Emine Çetin Yıldız' where id = $1`, [cari]);
      const o = await tek(`select customer_name, contact_phone from public.crm_opportunities where id = $1`, [FIRSAT]);
      assert.deepEqual([o.customer_name, o.contact_phone], ["Emine Çetin Yıldız", "0532 000 00 00"]);
      assert.ok(s.workflow_id, "imzada iş kaydı açılmadı");
        const w = await tek(`select customer_name from public.operation_workflows where id = $1`, [s.workflow_id]);
        assert.equal(w.customer_name, "Emine Çetin Yıldız");
    }));

  test("aynı müşterinin ikinci sözleşmesi telefonla aynı cariye bağlanır; ikinci cari açılmaz", () =>
    islem(db, async () => {
      // Eskiden yalnızca birebir ad aranıyordu: "EMİNE ÇETİN" ≠ "Emine Çetin", ikinci cari açılıyordu.
      await tohum();
      const s1 = await imzalat(FIRSAT);
      const s2 = await imzalat(FIRSAT2);
      assert.equal(s2.party_id ?? s2.plan_cari, s1.party_id ?? s1.plan_cari);
      const { n } = await tek(`select count(*)::int as n from public.account_parties where organization_id = $1`, [KURUM]);
      assert.equal(n, 1);

      // Cari artık iki talebe bağlı: caride düzeltilen e-posta ikisine de yansır.
      await db.query(`update public.account_parties set email = 'yeni@example.com' where id = $1`, [s1.party_id ?? s1.plan_cari]);
      const { rows } = await db.query(`select contact_email from public.crm_opportunities where id in ($1, $2)`, [FIRSAT, FIRSAT2]);
      assert.deepEqual(rows.map((r) => r.contact_email), ["yeni@example.com", "yeni@example.com"]);
    }));

  test("telefon yoksa ad Türkçe harf ve büyük/küçük harf farkı gözetmeden eşleşir", () =>
    islem(db, async () => {
      await tohum();
      await db.exec(`update public.crm_opportunities set contact_phone = null where organization_id = '${KURUM}'`);
      const s1 = await imzalat(FIRSAT);
      const s2 = await imzalat(FIRSAT2);
      assert.equal(s2.party_id ?? s2.plan_cari, s1.party_id ?? s1.plan_cari);
    }));
});
