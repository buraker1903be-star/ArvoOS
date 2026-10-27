// Bireysel aboneye AI kredisi satışı (20261026183021).
//
// Kredi siparişi ve 'ai_credit' bağlantısı artık kurum YA DA bireysel
// abone taşıyabiliyor; ödeme kaydı bireysel siparişi abonenin ödeme
// geçmişine (dönemsiz) yazıyor. Kurum dalı değişmemeli.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const PLATFORM = "00000000-0000-4000-8000-0000000000e1";
const KURUM = "00000000-0000-4000-8000-0000000000e2";
const ABONE = "00000000-0000-4000-8000-0000000000e3";
const LAB_KULLANICI = "00000000-0000-4000-8000-0000000000e4";
const BAGLANTI = "00000000-0000-4000-8000-0000000000e5";
const YONETICI = "00000000-0000-4000-8000-0000000000e6";

let db;
before(async () => {
  db = await veritabani();
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${YONETICI}', 'yonetici@x.co');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${PLATFORM}', 'ArvoOS', 'arvoos', 'active', 'starter'),
      ('${KURUM}', 'Kurum', 'kurum', 'active', 'starter');
    insert into public.product_subscribers (id, product, external_user_id, email, status, trial_ends_at, created_at, updated_at)
      values ('${ABONE}', 'arvolab', '${LAB_KULLANICI}', 'ogrenci@x.co', 'active', null, now(), now());
  `);
}

const bireyselBaglanti = () =>
  db.query(
    `insert into public.payment_links (id, organization_id, purpose, subscriber_id, product, provider_link_id, url, amount)
     values ($1, $2, 'ai_credit', $3, 'arvolab', 'p-1', 'https://www.paytr.com/link/k', 49900)`,
    [BAGLANTI, PLATFORM, ABONE],
  );
const bireyselSiparis = () =>
  db.query(
    `insert into public.ai_credit_orders (payment_link_id, organization_id, subscriber_id, paket_kodu, kredi, amount)
     values ($1, null, $2, 'k500', 500, 49900)`,
    [BAGLANTI, ABONE],
  );
const ode = (oid, tutar) =>
  tek(`select public.arvo_record_paytr_payment($1, $2, $3, $3, 'TL', false, '{}'::jsonb) as sonuc`, [BAGLANTI, oid, tutar]);

describe("bireysel AI kredisi satışı", () => {
  test("ödenince abonenin ödeme geçmişine dönemsiz yazılır, bağlantı kapanır", () =>
    islem(db, async () => {
      await tohum();
      await bireyselBaglanti();
      await bireyselSiparis();
      await rol(db, "service_role");
      assert.equal((await ode("oid-1", 49900)).sonuc, "recorded");
      await rol(db, "postgres");
      const odeme = await tek(`select amount, merchant_oid, period_start, period_end from public.subscriber_payments where subscriber_id = $1`, [ABONE]);
      // Dönemsiz: kredi satışı abonelik dönemini uzatmaz.
      assert.deepEqual([Number(odeme.amount), odeme.merchant_oid, odeme.period_start, odeme.period_end], [49900, "oid-1", null, null]);
      const abone = await tek(`select current_period_end from public.product_subscribers where id = $1`, [ABONE]);
      assert.equal(abone.current_period_end, null, "abonelik dönemi değişmedi");
      assert.equal((await tek(`select status from public.payment_links where id = $1`, [BAGLANTI])).status, "paid");
      // Kurum tahsilatına yazılmadı: abonenin kurumu yok.
      assert.equal(Number((await tek(`select count(*) as n from public.organization_payment_requests`)).n), 0);
    }));

  test("eksik ödeme kredi siparişini kapatmaz; tekrar bildirim bir kez yazılır", () =>
    islem(db, async () => {
      await tohum();
      await bireyselBaglanti();
      await bireyselSiparis();
      await rol(db, "service_role");
      assert.equal((await ode("oid-2", 100)).sonuc, "amount_mismatch");
      assert.equal((await ode("oid-3", 49900)).sonuc, "recorded");
      assert.equal((await ode("oid-3", 49900)).sonuc, "duplicate");
      await rol(db, "postgres");
      assert.equal(Number((await tek(`select count(*) as n from public.subscriber_payments where subscriber_id = $1`, [ABONE])).n), 1);
    }));

  test("sipariş ve bağlantı kurum ile aboneyi birlikte ya da hiçbirini taşıyamaz", () =>
    islem(db, async () => {
      await tohum();
      await reddedilir(
        db,
        `insert into public.payment_links (id, organization_id, purpose, product, provider_link_id, url, amount, created_by)
         values (gen_random_uuid(), $1, 'ai_credit', 'arvolab', 'p-2', 'https://www.paytr.com/link/x', 1000, $2)`,
        [PLATFORM, YONETICI],
        /payment_links_purpose_check/,
      );
      await reddedilir(
        db,
        `insert into public.payment_links (id, organization_id, purpose, subscriber_id, payer_organization_id, product, provider_link_id, url, amount)
         values (gen_random_uuid(), $1, 'ai_credit', $2, $3, 'arvolab', 'p-3', 'https://www.paytr.com/link/y', 1000)`,
        [PLATFORM, ABONE, KURUM],
        /payment_links_purpose_check/,
      );
      await bireyselBaglanti();
      await reddedilir(
        db,
        `insert into public.ai_credit_orders (payment_link_id, organization_id, subscriber_id, paket_kodu, kredi, amount)
         values ($1, $2, $3, 'k500', 500, 49900)`,
        [BAGLANTI, KURUM, ABONE],
        /ai_credit_orders_sahibi_check/,
      );
    }));

  test("kurum kredisi eskisi gibi: kurum tahsilatına yazılır", () =>
    islem(db, async () => {
      await tohum();
      await db.query(
        `insert into public.payment_links (id, organization_id, purpose, payer_organization_id, product, provider_link_id, url, amount, created_by)
         values ($1, $2, 'ai_credit', $3, 'arvolab', 'p-4', 'https://www.paytr.com/link/z', 49900, $4)`,
        [BAGLANTI, PLATFORM, KURUM, YONETICI],
      );
      await db.query(
        `insert into public.ai_credit_orders (payment_link_id, organization_id, paket_kodu, kredi, amount, created_by) values ($1, $2, 'k500', 500, 49900, $3)`,
        [BAGLANTI, KURUM, YONETICI],
      );
      await rol(db, "service_role");
      assert.equal((await ode("oid-4", 49900)).sonuc, "recorded");
      await rol(db, "postgres");
      const talep = await tek(`select organization_id, amount from public.organization_payment_requests`);
      assert.deepEqual([talep.organization_id, Number(talep.amount)], [KURUM, 49900]);
      assert.equal(Number((await tek(`select count(*) as n from public.subscriber_payments`)).n), 0);
    }));
});
