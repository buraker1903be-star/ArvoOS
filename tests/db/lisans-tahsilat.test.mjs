// Ek ürün lisansı ve tahsilat: havale onayı doğru lisansı uzatır, "randevu"
// ürünü lisans/ödeme tablolarına girebilir. 20260919132725 canlı şema
// dökümünden yeni olduğu için burada ayrıca uygulanır (döküm yenilenince de
// zararsız: kısıtlar düşürülüp yeniden ekleniyor, fonksiyonlar değiştiriliyor).
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20260919132725_randevu_urunu_ve_havale_urune_gore.sql");

const KURUCU = "00000000-0000-4000-8000-000000000001";
const SAHIP = "00000000-0000-4000-8000-000000000002";
const ARVO = "00000000-0000-4000-8000-0000000000a0";
const SALON = "00000000-0000-4000-8000-0000000000a1";
const HESAP = "00000000-0000-4000-8000-0000000000e1";

let db;
before(async () => {
  db = await veritabani();
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${KURUCU}', 'kurucu@example.com'), ('${SAHIP}', 'salon@example.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${ARVO}', 'Arvo', 'arvo-os', 'active', 'starter'),
      ('${SALON}', 'Güzel Salon', 'guzel-salon', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role) values
      ('${ARVO}', '${KURUCU}', 'owner'), ('${SALON}', '${SAHIP}', 'owner');
    insert into public.platform_bank_accounts (id, bank_name, iban) values ('${HESAP}', 'Banka', 'TR000000000000000000000000');
  `);
}

async function dekont(urun) {
  await rol(db, "authenticated", SAHIP);
  return (await tek(
    `insert into public.organization_payment_requests
       (organization_id, bank_account_id, plan_code, product, amount, payment_method, receipt_path, submitted_by)
     values ($1, $2, 'starter', $3, 150000, 'bank_transfer', 'x/y/z.pdf', $4) returning id`,
    [SALON, HESAP, urun, SAHIP],
  )).id;
}

async function onayla(id) {
  await rol(db, "authenticated", KURUCU);
  await db.query(`select public.review_bank_transfer_payment($1, 'approved', 'Dekont görüldü')`, [id]);
  await rol(db, "postgres");
}

describe("havale onayı ürüne göre lisans uzatır", () => {
  test("randevu dekontu randevu lisansını açar, ArvoOS lisansına dokunmaz", () =>
    islem(db, async () => {
      await tohum();
      const oncekiArvoos = await tek(`select current_period_end from public.organization_licenses where organization_id = $1`, [SALON]);
      await onayla(await dekont("randevu"));

      const l = await tek(
        `select status, current_period_end > now() + interval '27 days' as bir_ay from public.organization_product_licenses where organization_id = $1 and product = 'randevu'`,
        [SALON],
      );
      assert.deepEqual([l.status, l.bir_ay], ["active", true]);
      const sonraArvoos = await tek(`select current_period_end from public.organization_licenses where organization_id = $1`, [SALON]);
      assert.deepEqual(sonraArvoos, oncekiArvoos);
      const fatura = await tek(`select product, provider, status, total from public.billing_invoices where organization_id = $1`, [SALON]);
      assert.deepEqual([fatura.product, fatura.provider, fatura.status, Number(fatura.total)], ["randevu", "manual", "paid", 150000]);
    }));

  test("arc dekontu artık arc lisansını uzatır (önceden ArvoOS'u uzatıyordu)", () =>
    islem(db, async () => {
      await tohum();
      await onayla(await dekont("arc"));
      const l = await tek(`select status from public.organization_product_licenses where organization_id = $1 and product = 'arc'`, [SALON]);
      assert.equal(l?.status, "active");
    }));

  test("ArvoOS dekontu eskisi gibi ArvoOS lisansını uzatır", () =>
    islem(db, async () => {
      await tohum();
      await onayla(await dekont("arvoos"));
      const l = await tek(`select license_status, current_period_end > now() + interval '27 days' as bir_ay from public.organization_licenses where organization_id = $1`, [SALON]);
      assert.deepEqual([l.license_status, l.bir_ay], ["active", true]);
      const ek = await tek(`select count(*)::int as n from public.organization_product_licenses where organization_id = $1`, [SALON]);
      assert.equal(ek.n, 0);
    }));

  test("kurucu olmayan onaylayamaz", () =>
    islem(db, async () => {
      await tohum();
      const id = await dekont("randevu");
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `select public.review_bank_transfer_payment($1, 'approved', null)`, [id], /Founder authorization required/);
    }));
});

describe("randevu ürünü tablolara girebilir", () => {
  test("randevu lisansı ve abonelik ödeme bağlantısı kabul edilir; bilinmeyen ürün edilmez", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await db.query(
        `insert into public.organization_product_licenses (organization_id, product, status, trial_ends_at) values ($1, 'randevu', 'trialing', now() + interval '14 days')`,
        [SALON],
      );
      await db.query(
        `insert into public.payment_links (id, organization_id, provider, provider_link_id, url, amount, purpose, payer_organization_id, plan_code, product, created_by)
         values (gen_random_uuid(), $1, 'paytr', 'L1', 'https://paytr.com/l1', 150000, 'subscription', $2, 'starter', 'randevu', $3)`,
        [ARVO, SALON, KURUCU],
      );
      await reddedilir(db,
        `insert into public.organization_product_licenses (organization_id, product, status) values ($1, 'bilinmeyen', 'active')`,
        [SALON], /organization_product_licenses_product_check/);
    }));
});

describe("kartla (PayTR) ödeme ürün lisansını otomatik uzatır", () => {
  // Randevu panelindeki "Kartla öde" bu bağlantıyı açar (lib/license-checkout.ts);
  // PayTR bildirimi /api/paytr/callback → arvo_record_paytr_payment.
  async function baglanti() {
    await rol(db, "postgres");
    return (await tek(
      `insert into public.payment_links (id, organization_id, provider, provider_link_id, url, amount, purpose, payer_organization_id, plan_code, product, created_by)
       values (gen_random_uuid(), $1, 'paytr', 'L' || gen_random_uuid(), 'https://paytr.com/x', 75000, 'subscription', $2, 'starter', 'randevu', $3) returning id`,
      [ARVO, SALON, SAHIP],
    )).id;
  }
  const ode = async (id, oid, tutar = 75000) =>
    (await tek(`select public.arvo_record_paytr_payment($1, $2, $3, $3, 'TL', false, '{}'::jsonb) as sonuc`, [id, oid, tutar])).sonuc;
  const bitis = async () =>
    (await tek(`select status, current_period_end from public.organization_product_licenses where organization_id = $1 and product = 'randevu'`, [SALON]));

  test("ödeme 1 ay açar; ikinci ödeme dönem sonuna 1 ay daha ekler; aynı bildirim iki kez sayılmaz", () =>
    islem(db, async () => {
      await tohum();
      assert.notEqual(await ode(await baglanti(), "OID1"), "not_found");
      const ilk = await bitis();
      assert.equal(ilk.status, "active");
      const ilkGun = (new Date(ilk.current_period_end) - Date.now()) / 86_400_000;
      assert.ok(ilkGun > 27 && ilkGun < 32, `ilk dönem ${ilkGun} gün`);

      const ikinci = await baglanti();
      await ode(ikinci, "OID2");
      assert.equal(await ode(ikinci, "OID2"), "duplicate");
      const son = await bitis();
      const fark = (new Date(son.current_period_end) - new Date(ilk.current_period_end)) / 86_400_000;
      assert.ok(fark > 27 && fark < 32, `ikinci ödeme ${fark} gün ekledi`);

      const kayit = await tek(`select count(*)::int as n from public.organization_payment_requests where organization_id = $1 and product = 'randevu' and payment_method = 'paytr' and status = 'approved'`, [SALON]);
      assert.equal(kayit.n, 2);
    }));

  test("eksik tutar lisans açmaz", () =>
    islem(db, async () => {
      await tohum();
      assert.equal(await ode(await baglanti(), "OID3", 1000), "amount_mismatch");
      assert.equal(await bitis(), undefined);
    }));
});
