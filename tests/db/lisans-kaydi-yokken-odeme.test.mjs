// Lisans kaydı yokken ödeme (10.11.2026, 20261110063102).
//
// Ödeme zinciri gerçek işlevlerle: havale onayı (review_bank_transfer_payment)
// ve PayTR bildirimi (arvo_record_paytr_payment, uç noktanın çağırdığı
// işlev). Dış servis yok: PayTR'nin bildirimi işlevin kendisine verilen
// alanlarla taklit ediliyor; ödeme başlatılmıyor, e-posta gitmiyor.
//
// Sabitlenen davranış:
//   - kurum açılınca lisans satırı tetikleyiciyle oluşur (ilk lisans);
//   - normal deneme/aktif lisansta ödeme 1 ay uzatır; aynı bildirimin
//     tekrarı ikinci kez uzatmaz;
//   - lisans satırı yoksa ödeme "onaylandı" görünürken lisans sessizce
//     açılmaz: havale onayı geri alınır ve bekliyor kalır; PayTR olayı
//     'no_license' olarak kurucunun listesine düşer;
//   - lisans oluşturulunca yeniden işlenir, bir kez uygulanır.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUCU = "00000000-0000-4000-8000-000000000001";
const SAHIP = "00000000-0000-4000-8000-000000000002";
const ARVO = "00000000-0000-4000-8000-0000000000a0";
const SALON = "00000000-0000-4000-8000-0000000000a1";
const HESAP = "00000000-0000-4000-8000-0000000000e1";
const BAGLANTI = "00000000-0000-4000-8000-0000000000f1";

let db;
before(async () => {
  db = await veritabani();
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

const lisans = () => tek(
  `select license_status, trial_ends_at, current_period_end,
          extract(epoch from current_period_end) as son, extract(epoch from now()) as simdi
     from public.organization_licenses where organization_id = $1`,
  [SALON],
);
const birAySonra = async (sn) => Number((await tek(`select extract(epoch from to_timestamp($1) + interval '1 month') as s`, [sn])).s);
const ayniAn = (a, b) => assert.equal(Math.round(Number(a)), Math.round(Number(b)));

async function lisansiSil() {
  await rol(db, "postgres");
  await db.query(`delete from public.organization_licenses where organization_id = $1`, [SALON]);
}

/** Kurucunun Platform → Lisanslar formunun yaptığı: paket, ücret, limitle satırı yeniden açar. */
async function lisansiOlustur() {
  await rol(db, "postgres");
  await db.query(
    `insert into public.organization_licenses
       (organization_id, plan_code, license_status, trial_started_at, user_limit, storage_limit_mb, ai_credit_limit, monthly_fee)
     values ($1, 'starter', 'trialing', now(), 3, 5120, 500, 150000)`,
    [SALON],
  );
}

async function dekont() {
  await rol(db, "authenticated", SAHIP);
  return (await tek(
    `insert into public.organization_payment_requests
       (organization_id, bank_account_id, plan_code, product, amount, payment_method, receipt_path, submitted_by)
     values ($1, $2, 'starter', 'arvoos', 150000, 'bank_transfer', 'x/y/z.pdf', $3) returning id`,
    [SALON, HESAP, SAHIP],
  )).id;
}

async function onayla(id) {
  await rol(db, "authenticated", KURUCU);
  await db.query(`select public.review_bank_transfer_payment($1, 'approved', 'Dekont görüldü')`, [id]);
  await rol(db, "postgres");
}

async function baglanti() {
  await rol(db, "postgres");
  await db.query(
    `insert into public.payment_links
       (id, organization_id, provider, provider_link_id, url, amount, status, purpose, payer_organization_id, plan_code, product, created_by)
     values ($1, $2, 'paytr', 'L1', 'https://paytr.example/l1', 150000, 'active', 'subscription', $3, 'starter', 'arvoos', $4)`,
    [BAGLANTI, ARVO, SALON, SAHIP],
  );
}

/** /api/paytr/callback'in imza doğrulamasından sonra yaptığı çağrı. */
async function bildirim(oid = "OID-1") {
  await rol(db, "service_role");
  const r = await tek(
    `select public.arvo_record_paytr_payment($1, $2, 150000, 150000, 'TL', false, '{"payment_type":"card"}'::jsonb) as sonuc`,
    [BAGLANTI, oid],
  );
  await rol(db, "postgres");
  return r.sonuc;
}

const onayliOdemeSayisi = async () =>
  Number((await tek(`select count(*) as n from public.organization_payment_requests where organization_id = $1 and status = 'approved' and product = 'arvoos'`, [SALON])).n);

describe("ilk lisans ve normal ödeme", () => {
  test("kurum açılınca deneme lisansı tetikleyiciyle oluşur", () =>
    islem(db, async () => {
      await tohum();
      const l = await lisans();
      assert.equal(l.license_status, "trialing");
      assert.ok(l.trial_ends_at, "deneme bitişi yazılı");
    }));

  test("deneme lisansında PayTR ödemesi 1 ay açar; aynı bildirimin tekrarı ikinci kez uzatmaz", () =>
    islem(db, async () => {
      await tohum();
      await baglanti();
      assert.equal(await bildirim(), "recorded");
      const ilk = await lisans();
      assert.equal(ilk.license_status, "active");
      assert.equal(ilk.trial_ends_at, null);
      ayniAn(ilk.son, await birAySonra(Number(ilk.simdi)));

      assert.equal(await bildirim(), "duplicate");
      const tekrar = await lisans();
      ayniAn(tekrar.son, ilk.son);
      assert.equal(await onayliOdemeSayisi(), 1, "tek onaylı ödeme kaydı");
    }));

  test("aktif lisansta havale onayı dönem sonundan 1 ay uzatır; aynı ödeme ikinci kez onaylanamaz", () =>
    islem(db, async () => {
      await tohum();
      await db.query(`update public.organization_licenses set license_status = 'active', trial_ends_at = null, current_period_end = now() + interval '10 days' where organization_id = $1`, [SALON]);
      const once = await lisans();
      const id = await dekont();
      await onayla(id);
      const sonra = await lisans();
      ayniAn(sonra.son, await birAySonra(Number(once.son)));
      await rol(db, "authenticated", KURUCU);
      await reddedilir(db, `select public.review_bank_transfer_payment($1, 'approved', null)`, [id], /Pending payment not found/);
    }));
});

describe("lisans kaydı yokken", () => {
  test("havale onayı geri alınır: ödeme bekliyor kalır, onaylı görünmez; lisans oluşturulunca onaylanır", () =>
    islem(db, async () => {
      await tohum();
      await lisansiSil();
      const id = await dekont();
      await rol(db, "authenticated", KURUCU);
      await reddedilir(db, `select public.review_bank_transfer_payment($1, 'approved', 'Dekont görüldü')`, [id], /license_missing/);
      await rol(db, "postgres");
      const odeme = await tek(`select status from public.organization_payment_requests where id = $1`, [id]);
      assert.equal(odeme.status, "pending", "eskiden 'approved' olup lisansı açmıyordu");
      assert.equal(await lisans(), undefined);

      await lisansiOlustur();
      await onayla(id);
      const l = await lisans();
      assert.equal(l.license_status, "active");
      ayniAn(l.son, await birAySonra(Number(l.simdi)));
    }));

  test("PayTR bildirimi 'no_license': onaylı ödeme ve 'ödendi' yazılmaz, olay kurucunun listesine düşer", () =>
    islem(db, async () => {
      await tohum();
      await baglanti();
      await lisansiSil();
      assert.equal(await bildirim(), "no_license");
      assert.equal(await onayliOdemeSayisi(), 0);
      const link = await tek(`select status from public.payment_links where id = $1`, [BAGLANTI]);
      assert.equal(link.status, "active");
      const olay = await tek(`select result from public.payment_provider_events where merchant_oid = 'OID-1'`);
      assert.equal(olay.result, "no_license");
      // PayTR yeniden bildirse de aynı olay; ikinci kez işlenmez.
      assert.equal(await bildirim(), "duplicate");
    }));

  test("kurucu lisansı oluşturup olayı yeniden işler: bir kez uygulanır, tekrar işlenemez", () =>
    islem(db, async () => {
      await tohum();
      await baglanti();
      await lisansiSil();
      await bildirim();
      const { id } = await tek(`select id from public.payment_provider_events where merchant_oid = 'OID-1'`);

      // Lisans hâlâ yokken yeniden işleme: yine 'no_license', olay kaybolmaz.
      await rol(db, "authenticated", KURUCU);
      assert.equal((await tek(`select public.arvo_reprocess_paytr_event($1) as s`, [id])).s, "no_license");
      await rol(db, "postgres");
      const yeniOlay = await tek(`select id, result from public.payment_provider_events where merchant_oid = 'OID-1'`);
      assert.equal(yeniOlay.result, "no_license");

      await lisansiOlustur();
      await rol(db, "authenticated", KURUCU);
      assert.equal((await tek(`select public.arvo_reprocess_paytr_event($1) as s`, [yeniOlay.id])).s, "recorded");
      await rol(db, "postgres");
      const l = await lisans();
      assert.equal(l.license_status, "active");
      ayniAn(l.son, await birAySonra(Number(l.simdi)));
      assert.equal(await onayliOdemeSayisi(), 1);
      const son = await tek(`select id, result from public.payment_provider_events where merchant_oid = 'OID-1'`);
      assert.equal(son.result, "recorded");

      await rol(db, "authenticated", KURUCU);
      await reddedilir(db, `select public.arvo_reprocess_paytr_event($1)`, [son.id], /event_not_reprocessable/);
      await rol(db, "postgres");
      assert.equal(await bildirim(), "duplicate", "PayTR tekrarı ikinci kez uzatmaz");
      ayniAn((await lisans()).son, l.son);
    }));

  test("yeniden işleme yalnızca kurucuya açık; anon hiç çağıramaz", () =>
    islem(db, async () => {
      await tohum();
      await baglanti();
      await lisansiSil();
      await bildirim();
      const { id } = await tek(`select id from public.payment_provider_events where merchant_oid = 'OID-1'`);
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `select public.arvo_reprocess_paytr_event($1)`, [id], /Founder authorization required/);
      await rol(db, "anon");
      await reddedilir(db, `select public.arvo_reprocess_paytr_event($1)`, [id], /permission denied/);
    }));

  test("ek ürün ödemesi ArvoOS lisansı olmasa da kendi satırını açar (değişmedi)", () =>
    islem(db, async () => {
      await tohum();
      await lisansiSil();
      await rol(db, "postgres");
      await db.query(
        `insert into public.payment_links
           (id, organization_id, provider, provider_link_id, url, amount, status, purpose, payer_organization_id, plan_code, product, created_by)
         values ($1, $2, 'paytr', 'L2', 'https://paytr.example/l2', 150000, 'active', 'subscription', $3, 'starter', 'arc', $4)`,
        [BAGLANTI, ARVO, SALON, SAHIP],
      );
      assert.equal(await bildirim("OID-ARC"), "recorded");
      const u = await tek(`select status from public.organization_product_licenses where organization_id = $1 and product = 'arc'`, [SALON]);
      assert.equal(u.status, "active");
    }));
});
