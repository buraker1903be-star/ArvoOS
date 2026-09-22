// Sözleşme → abonelik isteği kuyruğu.
//
// En kritik kural KAPSAM: yalnızca Arvo'nun kendi kurumunda
// (organizations.kind = 'internal') imzalanan sözleşmeler kuyruğa düşer.
// Kiracının kendi müşterisiyle imzaladığı sözleşme onun işidir; konsola
// düşerse kurucu başkasının satışlarını onaylamaya çalışır. Bu ayrım
// atlanırsa billing_invoices hatasının aynısı olur.
//
// İkinci kural: imza modülü AÇMAZ. Tetikleyici yalnızca kuyruğa yazar,
// hiçbir lisans dokunmaz.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20260922092142_sozlesmeden_abonelik_istegi.sql");

const ARVO = "00000000-0000-4000-8000-0000000000b1";
const KIRACI = "00000000-0000-4000-8000-0000000000b2";
const SAHIP = "00000000-0000-4000-8000-0000000000c1";

let db;
before(async () => {
  db = await veritabani();
  const { rows } = await db.query(`select to_regclass('public.platform_subscription_requests') as t`);
  if (!rows[0].t) await db.exec(fs.readFileSync(MIGRATION, "utf8"));
  /*
    Harness şema yüklendikten SONRA public'teki tüm tablolara varsayılan
    yetkiyi veriyor (Supabase'in davranışını taklit ediyor). Tablo anlık
    görüntüye girdiği andan itibaren migration'daki revoke artık
    çalışmıyor; burada tekrarlıyoruz ki test asıl kapıyı sınasın.
  */
  await db.exec(`
    grant all on public.platform_subscription_requests to service_role;
    revoke all on table public.platform_subscription_requests from anon, authenticated;
  `);
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'kurucu@arvo-os.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code, kind) values
      ('${ARVO}', 'ArvoOS', 'arvo-os', 'active', 'starter', 'internal'),
      ('${KIRACI}', 'Akademik Merkez', 'akademikmerkez', 'active', 'starter', 'customer');
  `);
}

/** Verilen kurumda taslak bir sözleşme açar ve imzalar. */
async function sozlesmeImzala(kurumId, no, niyet) {
  const firsat = (await db.query(
    `insert into public.crm_opportunities (organization_id, title, customer_name, created_by)
     values ($1, 'Test', 'Ayşe Yılmaz', $2) returning id`, [kurumId, SAHIP],
  )).rows[0].id;

  // Sözleşme bir teklife bağlı olmak zorunda (proposal_id not null).
  const teklif = (await db.query(
    `insert into public.crm_proposals (organization_id, opportunity_id, proposal_no, title, amount, status, created_by, access_token_hash)
     values ($1, $2, $3, 'Test teklifi', 450000, 'sent', $4, encode(extensions.digest($3, 'sha256'), 'hex')) returning id`,
    [kurumId, firsat, `TKF-${no}`, SAHIP],
  )).rows[0].id;

  const sozlesme = (await db.query(
    `insert into public.crm_contracts (organization_id, opportunity_id, proposal_id, contract_no, title, amount, currency, status, subscription_intent, access_token_hash, created_by)
     values ($1, $2, $3, $4, 'Test sözleşmesi', 450000, 'TRY', 'draft', $5, encode(extensions.digest($4, 'sha256'), 'hex'), $6) returning id`,
    [kurumId, firsat, teklif, no, niyet ?? null, SAHIP],
  )).rows[0].id;

  await db.query(`update public.crm_contracts set status = 'signed', signed_at = now() where id = $1`, [sozlesme]);
  return sozlesme;
}

const istekler = async () =>
  (await db.query(`select * from public.platform_subscription_requests order by created_at`)).rows;

describe("sözleşmeden abonelik isteği", () => {
  test("Arvo'nun kendi sözleşmesi kuyruğa düşer", async () => {
    await islem(db, async () => {
      await tohum();
      const niyet = JSON.stringify({ modules: [{ product: "arvolab", monthly_fee: 180000, integrated: true }] });
      await sozlesmeImzala(ARVO, "SZL-2026-001", niyet);

      const satirlar = await istekler();
      assert.equal(satirlar.length, 1);
      assert.equal(satirlar[0].status, "pending");
      assert.equal(satirlar[0].contract_no, "SZL-2026-001");
      assert.equal(satirlar[0].customer_name, "Ayşe Yılmaz");
      // Niyet sözleşmeden kopyalanır; sözleşme sonradan değişse bile
      // istek ne talep edildiğini hatırlasın.
      assert.equal(satirlar[0].requested.modules[0].product, "arvolab");
    });
  });

  test("KİRACININ kendi sözleşmesi kuyruğa DÜŞMEZ", async () => {
    /*
      Meşru akış: kiracı kendi müşterisiyle sözleşme imzalar. Bu onun işi;
      konsola düşerse kurucu başkasının satışlarını onaylamaya çalışır.
    */
    await islem(db, async () => {
      await tohum();
      await sozlesmeImzala(KIRACI, "SZL-2026-002");
      assert.deepEqual(await istekler(), []);
    });
  });

  test("kiracının sözleşmesi normal şekilde imzalanmaya devam eder", async () => {
    // Koruma eklerken meşru yolun yeşil kalması şart (AGENTS.md).
    await islem(db, async () => {
      await tohum();
      const id = await sozlesmeImzala(KIRACI, "SZL-2026-003");
      const { rows } = await db.query(`select status, signed_at from public.crm_contracts where id = $1`, [id]);
      assert.equal(rows[0].status, "signed");
      assert.ok(rows[0].signed_at);
    });
  });

  test("imza hiçbir lisans açmaz", async () => {
    /*
      İmza müşterinin taahhüdü, tahsilat bizim alacağımız. Birleştirseydik
      parası gelmemiş her sözleşme çalışan bir kiracı yaratırdı.
    */
    await islem(db, async () => {
      await tohum();
      await sozlesmeImzala(ARVO, "SZL-2026-004");
      const { rows } = await db.query(`select count(*)::int as n from public.organization_product_licenses`);
      assert.equal(rows[0].n, 0);
    });
  });

  test("aynı sözleşme iki kez kuyruğa girmez", async () => {
    await islem(db, async () => {
      await tohum();
      const id = await sozlesmeImzala(ARVO, "SZL-2026-005");
      // İmzalı sözleşmenin durumu yeniden yazılırsa tetikleyici yine çalışır.
      await db.query(`update public.crm_contracts set status = 'signed' where id = $1`, [id]);
      assert.equal((await istekler()).length, 1);
    });
  });

  test("taslak sözleşme kuyruğa düşmez", async () => {
    await islem(db, async () => {
      await tohum();
      const firsat = (await db.query(
        `insert into public.crm_opportunities (organization_id, title, customer_name, created_by)
         values ($1, 'Test', 'Ayşe', $2) returning id`, [ARVO, SAHIP],
      )).rows[0].id;
      const teklif = (await db.query(
        `insert into public.crm_proposals (organization_id, opportunity_id, proposal_no, title, amount, status, created_by, access_token_hash)
         values ($1, $2, 'TKF-006', 'Taslak teklif', 100000, 'sent', $3, 'x') returning id`, [ARVO, firsat, SAHIP],
      )).rows[0].id;
      await db.query(
        `insert into public.crm_contracts (organization_id, opportunity_id, proposal_id, contract_no, title, amount, status, access_token_hash, created_by)
         values ($1, $2, $3, 'SZL-2026-006', 'Taslak', 100000, 'draft', 'y', $4)`, [ARVO, firsat, teklif, SAHIP],
      );
      assert.deepEqual(await istekler(), []);
    });
  });

  test("kuyruk tarayıcıdan okunamaz", async () => {
    /*
      Tabloda başka kurumların ticari bilgisi var. Politikasız RLS zaten
      kapıyı tutuyor ama yetki de açıkça geri alındı; tek savunmaya
      güvenmiyoruz.
    */
    await islem(db, async () => {
      await tohum();
      await sozlesmeImzala(ARVO, "SZL-2026-007");
      await rol(db, "authenticated", SAHIP);
      // Beklenen hata işlemi bozuyor; harness savepoint ile geri alıyor.
      await reddedilir(db, `select * from public.platform_subscription_requests`, [], /permission denied/i);
      await rol(db, "postgres");
    });
  });
});
