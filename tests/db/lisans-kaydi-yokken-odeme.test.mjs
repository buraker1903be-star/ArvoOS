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
//     'no_license' olarak kurucunun listesine düşer, tahsilat (bağlantı
//     'paid') yazılır ama onaylı ödeme isteği yazılmaz;
//   - lisans oluşturulunca AYNI olay satırı yeniden işlenir (kimlik,
//     received_at, payload korunur), bir kez uygulanır; her deneme
//     activity_logs'a kurucunun adıyla yazılır.
//
// Bu dosya SIRALI akışı sınar; eşzamanlılık kanıtı DEĞİLDİR. İki
// bağlantılı sınama gerçek PostgreSQL ister: scripts/odeme-eszamanlilik.sh.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUCU = "00000000-0000-4000-8000-000000000001";
const SAHIP = "00000000-0000-4000-8000-000000000002";
const ARVO = "00000000-0000-4000-8000-0000000000a0";
const SALON = "00000000-0000-4000-8000-0000000000a1";
const HESAP = "00000000-0000-4000-8000-0000000000e1";
const BAGLANTI = "00000000-0000-4000-8000-0000000000f1";
const YOK = "00000000-0000-4000-8000-00000000dead";

let db;
before(async () => {
  db = await veritabani();
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const sayi = async (sql, p = []) => Number((await tek(sql, p)).n);

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
const ayniZaman = (a, b, mesaj) => assert.equal(new Date(a).getTime(), new Date(b).getTime(), mesaj);

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
    `select public.arvo_record_paytr_payment($1, $2, 150000, 150000, 'TL', false, '{"payment_type":"card","taksit":"1"}'::jsonb) as sonuc`,
    [BAGLANTI, oid],
  );
  await rol(db, "postgres");
  return r.sonuc;
}

async function yenidenIsle(id) {
  await rol(db, "authenticated", KURUCU);
  const r = await tek(`select public.arvo_reprocess_paytr_event($1) as s`, [id]);
  await rol(db, "postgres");
  return r.s;
}

const OLAY = `select id, received_at, payload, result, total_amount, payment_amount, currency from public.payment_provider_events where merchant_oid = 'OID-1'`;
const onayliOdemeSayisi = () =>
  sayi(`select count(*) as n from public.organization_payment_requests where organization_id = $1 and status = 'approved' and product = 'arvoos'`, [SALON]);
const aktivasyonSayisi = () => sayi(`select count(*) as n from public.billing_subscriptions where organization_id = $1`, [SALON]);
const denetimKayitlari = async () => (await db.query(
  `select actor_user_id, action, entity_type, entity_id, organization_id, metadata
     from public.activity_logs where entity_type = 'payment_event' order by id`,
)).rows;

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
      const olay = await tek(OLAY);
      assert.equal(olay.result, "recorded");
      const link = await tek(`select status, paid_at from public.payment_links where id = $1`, [BAGLANTI]);
      assert.equal(link.status, "paid");
      ayniZaman(link.paid_at, olay.received_at, "ilk bildirimde paid_at eskisi gibi işlem anı");

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

  test("PayTR bildirimi 'no_license': tahsilat yazılır, onaylı ödeme ve lisans dönemi yazılmaz, olay listeye düşer", () =>
    islem(db, async () => {
      await tohum();
      await baglanti();
      await lisansiSil();
      assert.equal(await bildirim(), "no_license");
      assert.equal(await onayliOdemeSayisi(), 0, "lisansa uygulanmadan 'onaylı ödeme' yok");
      assert.equal(await aktivasyonSayisi(), 0, "lisans dönemi/aktivasyon kaydı yok");
      // Para PayTR'de tahsil edildi: bağlantı yeniden ödenecek açık borç gibi kalmaz.
      const link = await tek(`select status, paid_at from public.payment_links where id = $1`, [BAGLANTI]);
      assert.equal(link.status, "paid");
      const olay = await tek(OLAY);
      assert.equal(olay.result, "no_license");
      ayniZaman(link.paid_at, olay.received_at, "tahsilat anı = bildirimin geldiği an");
      // PayTR yeniden bildirse de aynı olay; ikinci kez işlenmez.
      assert.equal(await bildirim(), "duplicate");
      assert.equal(await sayi(`select count(*) as n from public.payment_provider_events where merchant_oid = 'OID-1'`), 1);
    }));

  test("yeniden işleme olayı silmez: kimlik, zaman, payload korunur; başarısız deneme kanıtı kaybetmez; her deneme denetime düşer", () =>
    islem(db, async () => {
      await tohum();
      await baglanti();
      await lisansiSil();
      await bildirim();
      const ilk = await tek(OLAY);

      // Lisans hâlâ yokken: yine 'no_license', AYNI satır yerinde.
      assert.equal(await yenidenIsle(ilk.id), "no_license");
      const ara = await tek(OLAY);
      assert.equal(ara.id, ilk.id, "olay silinip yeniden yaratılmadı");
      ayniZaman(ara.received_at, ilk.received_at);
      assert.deepEqual(ara.payload, ilk.payload);
      assert.equal(ara.result, "no_license");
      assert.equal(await onayliOdemeSayisi(), 0);

      await lisansiOlustur();
      assert.equal(await yenidenIsle(ilk.id), "recorded");
      const son = await tek(OLAY);
      assert.equal(son.id, ilk.id);
      ayniZaman(son.received_at, ilk.received_at);
      assert.deepEqual(son.payload, ilk.payload);
      assert.equal(son.result, "recorded");
      assert.equal(String(son.payment_amount), String(ilk.payment_amount));
      assert.equal(String(son.total_amount), String(ilk.total_amount));
      assert.equal(son.currency, ilk.currency);
      const link = await tek(`select paid_at from public.payment_links where id = $1`, [BAGLANTI]);
      ayniZaman(link.paid_at, ilk.received_at, "tahsilat anı yeniden işleme anıyla ezilmedi");

      const kayitlar = await denetimKayitlari();
      assert.equal(kayitlar.length, 2, "başarısız ve başarılı deneme ayrı ayrı kayıtlı");
      for (const k of kayitlar) {
        assert.equal(k.actor_user_id, KURUCU);
        assert.equal(k.action, "reprocess");
        assert.equal(k.entity_id, ilk.id);
        assert.equal(k.organization_id, SALON, "kayıt ödeyen kurumun altında (müşteri kartı Hareketler)");
        assert.equal(k.metadata.by, "founder_console");
        assert.equal(k.metadata.merchant_oid, "OID-1");
        assert.equal(k.metadata.onceki_sonuc, "no_license");
      }
      assert.deepEqual(kayitlar.map((k) => k.metadata.sonuc), ["no_license", "recorded"]);
    }));

  test("başarılı yeniden işleme: tek ödeme, tek aktivasyon, tek uzama; tekrar ve PayTR tekrarı engellenir", () =>
    islem(db, async () => {
      await tohum();
      await baglanti();
      await lisansiSil();
      await bildirim();
      const { id } = await tek(OLAY);
      await lisansiOlustur();

      assert.equal(await yenidenIsle(id), "recorded");
      const l = await lisans();
      assert.equal(l.license_status, "active");
      ayniAn(l.son, await birAySonra(Number(l.simdi)));
      assert.equal(await onayliOdemeSayisi(), 1);
      assert.equal(await aktivasyonSayisi(), 1, "tek aktivasyon kaydı");

      await rol(db, "authenticated", KURUCU);
      await reddedilir(db, `select public.arvo_reprocess_paytr_event($1)`, [id], /event_not_reprocessable/);
      await rol(db, "postgres");
      assert.equal(await bildirim(), "duplicate", "PayTR tekrarı ikinci kez uzatmaz");
      ayniAn((await lisans()).son, l.son);
      assert.equal(await onayliOdemeSayisi(), 1);
      assert.equal(await aktivasyonSayisi(), 1);
      // Reddedilen deneme işlemiyle birlikte geri alındı; yalnızca başarılı deneme kayıtlı.
      assert.equal((await denetimKayitlari()).length, 1);
    }));

  test("işlenmiş ya da bulunmayan olay yeniden işlenemez", () =>
    islem(db, async () => {
      await tohum();
      await baglanti();
      assert.equal(await bildirim(), "recorded");
      const { id } = await tek(OLAY);
      await rol(db, "authenticated", KURUCU);
      await reddedilir(db, `select public.arvo_reprocess_paytr_event($1)`, [id], /event_not_reprocessable/);
      await reddedilir(db, `select public.arvo_reprocess_paytr_event($1)`, [YOK], /event_not_found/);
    }));

  test("yeniden işleme yalnızca kurucuya açık; yetkisiz deneme olaya dokunmaz", () =>
    islem(db, async () => {
      await tohum();
      await baglanti();
      await lisansiSil();
      await bildirim();
      await lisansiOlustur();
      const { id } = await tek(OLAY);
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `select public.arvo_reprocess_paytr_event($1)`, [id], /Founder authorization required/);
      await rol(db, "anon");
      await reddedilir(db, `select public.arvo_reprocess_paytr_event($1)`, [id], /permission denied/);
      await rol(db, "postgres");
      assert.equal((await tek(OLAY)).result, "no_license", "yetkisiz deneme olayı değiştirmedi");
      assert.equal(await onayliOdemeSayisi(), 0);
      assert.equal((await denetimKayitlari()).length, 0);
    }));

  test("ortak iç işlev hiçbir istemci rolüne açık değil", () =>
    islem(db, async () => {
      await tohum();
      for (const r of ["anon", "authenticated", "service_role"]) {
        await rol(db, r, r === "authenticated" ? KURUCU : null);
        await reddedilir(db, `select private.arvo_apply_paytr_event($1)`, [YOK], /permission denied/);
      }
    }));

  /*
    Mevcut ürün kuralı (değiştirilmedi, sabitleniyor): lisansa uygulanmamış
    tahsilat varken müşteri yeni ödeme başlatabilir mi?
      - Kart: lib/license-checkout ücreti lisans satırından okuyor; satır
        yokken ücret 0 → "fee_not_set", Abonelik ekranında kart düğmesi
        yok ("Aylık ücret henüz belirlenmedi"). Bu dosya TS'ye dokunmadığı
        için kart yolu burada değil; kural kodda.
      - Havale: bildirimi lisansa bakmadan kaydediliyor. Onay lisans yokken
        'license_missing' ile reddediliyor; bildirim bekliyor kalıyor.
        Lisans açıldıktan sonra kurucu onaylarsa İKİNCİ gerçek ödeme olarak
        ikinci ay eklenir — onaylayan kurucu, bekleyen PayTR olayını
        Ödemeler ekranında aynı anda görüyor.
  */
  test("lisansa uygulanmamış tahsilat varken havale bildirimi kabul edilir ama lisans açılana kadar onaylanamaz", () =>
    islem(db, async () => {
      await tohum();
      await baglanti();
      await lisansiSil();
      assert.equal(await bildirim(), "no_license");
      const id = await dekont();
      assert.ok(id, "havale bildirimi kaydedildi (müşteriye kapalı değil)");
      await rol(db, "authenticated", KURUCU);
      await reddedilir(db, `select public.review_bank_transfer_payment($1, 'approved', null)`, [id], /license_missing/);
      await rol(db, "postgres");
      assert.equal((await tek(`select status from public.organization_payment_requests where id = $1`, [id])).status, "pending");
      assert.equal(await onayliOdemeSayisi(), 0);

      await lisansiOlustur();
      const { id: olay } = await tek(OLAY);
      assert.equal(await yenidenIsle(olay), "recorded");
      const birAy = await lisans();
      await onayla(id);
      const ikiAy = await lisans();
      ayniAn(ikiAy.son, await birAySonra(Number(birAy.son)));
      assert.equal(await onayliOdemeSayisi(), 2, "iki gerçek ödeme, iki dönem");
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
