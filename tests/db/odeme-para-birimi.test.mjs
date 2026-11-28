/*
  ÖDEME ONAYINDA PARA BİRİMİ (28.11.2026, migration 20261128122230).

  Sınanan kural: para birimi uyuşmazsa ONAY LİSANSI AÇMAZ, dönem
  uzamaz, abonelik ve fatura satırı yazılmaz. Ret her zaman serbest.
  Mevcut TRY abonelikleri eskisi gibi çalışmaya devam eder.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUCU = "00000000-0000-4000-8000-00000000e001";
const ARVO = "00000000-0000-4000-8000-00000000e0a1";
const MUSTERI = "00000000-0000-4000-8000-00000000e0a2";
const HESAP_TRY = "00000000-0000-4000-8000-00000000e0b1";
const HESAP_USD = "00000000-0000-4000-8000-00000000e0b2";

let db;

const lisans = async () => (await db.query(
  `select para_birimi, license_status, current_period_end from public.organization_licenses where organization_id = $1`,
  [MUSTERI])).rows[0];

const abonelikSayisi = async () => Number((await db.query(
  "select count(*)::int as n from public.billing_subscriptions where organization_id = $1", [MUSTERI])).rows[0].n);

/** Bekleyen bir havale bildirimi açar. */
async function bildirim(tutar, birim, hesap) {
  const { rows } = await db.query(
    `insert into public.organization_payment_requests
       (organization_id, bank_account_id, plan_code, product, amount, currency, payment_method, receipt_path, submitted_by, status)
     values ($1, $2, 'professional', 'arvoos', $3, $4, 'bank_transfer', 'dekont/x.pdf', $5, 'pending')
     returning id`,
    [MUSTERI, hesap, tutar, birim, KURUCU]);
  return rows[0].id;
}

before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${KURUCU}','kurucu@arvo-os.com');
    insert into public.plans (code,name,description) values
      ('starter','Başlangıç',''), ('professional','Profesyonel','') on conflict (code) do nothing;
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${ARVO}','ArvoOS','arvo-os','active','starter'),
      ('${MUSTERI}','Müşteri Kurum','musteri-kurum','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role,is_active) values
      ('${ARVO}','${KURUCU}','owner',true);
    insert into public.platform_bank_accounts (id, bank_name, account_holder, iban, currency, is_active, sort_order)
    values ('${HESAP_TRY}', 'Banka', 'Arvo', 'TR000000000000000000000001', 'TRY', true, 1),
           ('${HESAP_USD}', 'Banka', 'Arvo', 'TR000000000000000000000002', 'USD', true, 2);
  `);
});

/** Lisansı istenen para birimiyle kurar. */
async function lisansKur(birim) {
  await rol(db, "postgres");
  await db.exec(`
    delete from public.billing_subscriptions where organization_id = '${MUSTERI}';
    delete from public.billing_invoices where organization_id = '${MUSTERI}';
    delete from public.organization_licenses where organization_id = '${MUSTERI}';
    insert into public.organization_licenses
      (organization_id, plan_code, license_status, trial_started_at, user_limit, storage_limit_mb, ai_credit_limit,
       ai_credits_used, module_limits, extra_user_fee, extra_user_cap, monthly_fee, para_birimi, created_at, updated_at)
    values ('${MUSTERI}', 'professional', 'trialing', now(), 15, 51200, 2500, 0, '{}'::jsonb, 29900, 10, 199000, '${birim}', now(), now());
  `);
}

test("TRY abonelik + TRY bildirim: onay lisansı açıyor (bugünkü davranış korunuyor)", async () =>
  islem(db, async () => {
    await lisansKur("TRY");
    const id = await bildirim(199000, "TRY", HESAP_TRY);
    await rol(db, "authenticated", KURUCU);
    await db.query("select public.review_bank_transfer_payment($1, 'approved', null)", [id]);

    await rol(db, "postgres");
    const l = await lisans();
    assert.equal(l.license_status, "active");
    assert.equal(l.para_birimi, "TRY");
    assert.ok(l.current_period_end, "dönem uzadı");
    assert.equal(await abonelikSayisi(), 1);
  }));

test("TRY abonelik + USD bildirim: ONAY REDDEDİLİYOR, lisans açılmıyor", async () =>
  islem(db, async () => {
    await lisansKur("TRY");
    const id = await bildirim(85000, "USD", HESAP_USD);
    await rol(db, "authenticated", KURUCU);
    await reddedilir(
      db,
      "select public.review_bank_transfer_payment($1, 'approved', null)",
      [id],
      /Para birimi uyuşmuyor.*abonelik TRY.*bildirim USD/i,
    );

    await rol(db, "postgres");
    const l = await lisans();
    assert.equal(l.license_status, "trialing", "lisans açılmadı");
    assert.equal(l.current_period_end, null, "dönem uzamadı");
    assert.equal(await abonelikSayisi(), 0, "abonelik satırı yazılmadı");
    const durum = (await db.query("select status from public.organization_payment_requests where id = $1", [id])).rows[0].status;
    assert.equal(durum, "pending", "bildirim bekliyor kaldı: tahsilat işlenmedi");
  }));

test("uyuşmayan bildirim REDDEDİLEBİLİYOR", async () =>
  islem(db, async () => {
    await lisansKur("TRY");
    const id = await bildirim(85000, "USD", HESAP_USD);
    await rol(db, "authenticated", KURUCU);
    await db.query("select public.review_bank_transfer_payment($1, 'rejected', 'Yanlış hesaba yatmış')", [id]);
    await rol(db, "postgres");
    const durum = (await db.query("select status from public.organization_payment_requests where id = $1", [id])).rows[0].status;
    assert.equal(durum, "rejected");
    assert.equal((await lisans()).license_status, "trialing");
  }));

test("USD abonelik + USD bildirim: onay USD olarak işliyor", async () =>
  islem(db, async () => {
    await lisansKur("USD");
    const id = await bildirim(11900, "USD", HESAP_USD);
    await rol(db, "authenticated", KURUCU);
    await db.query("select public.review_bank_transfer_payment($1, 'approved', null)", [id]);

    await rol(db, "postgres");
    assert.equal((await lisans()).para_birimi, "USD");
    const ab = (await db.query(
      "select currency, unit_amount from public.billing_subscriptions where organization_id = $1", [MUSTERI])).rows[0];
    assert.equal(ab.currency, "USD");
    assert.equal(Number(ab.unit_amount), 11900);
    const fatura = (await db.query(
      "select currency, total from public.billing_invoices where organization_id = $1", [MUSTERI])).rows[0];
    assert.equal(fatura.currency, "USD");
  }));

test("sağlayıcının 'TL' değeri ISO'ya çevriliyor, TRY aboneliğe uyuyor", async () =>
  islem(db, async () => {
    await lisansKur("TRY");
    const id = await bildirim(199000, "TL", HESAP_TRY);
    await rol(db, "authenticated", KURUCU);
    await db.query("select public.review_bank_transfer_payment($1, 'approved', null)", [id]);
    await rol(db, "postgres");
    assert.equal((await lisans()).license_status, "active");
    assert.equal((await db.query(
      "select currency from public.billing_subscriptions where organization_id = $1", [MUSTERI])).rows[0].currency, "TRY");
  }));

test("tanınmayan para birimi lisansı açmıyor", async () =>
  islem(db, async () => {
    await lisansKur("TRY");
    await rol(db, "postgres");
    await reddedilir(
      db,
      `select private.arvo_activate_license_period($1, 'professional', 100, 'GBP', 'manual', $2)`,
      [MUSTERI, KURUCU],
      /Tanınmayan para birimi/i,
    );
    assert.equal((await lisans()).license_status, "trialing");
  }));
