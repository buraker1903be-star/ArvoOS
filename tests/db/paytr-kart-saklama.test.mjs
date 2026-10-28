// PayTR kart saklama ve otomatik yenileme (20261028165823).
//
// MEŞRU yol: kartla ödeme bir payment_links satırı (sağlayıcı kimliği =
// sipariş no, adres PayTR ödeme adresi) ve bir deneme satırı açıyor;
// bildirim mevcut arvo_record_paytr_payment'ı çağırıyor ve lisans bağlantı
// ödemesiyle AYNI kuralla uzuyor; ikinci bildirim yok sayılıyor.
//
// KORUMA: üç tablo da istemciye kapalı (utoken/ctoken bir karttan para
// çekmeye yetiyor); otomatik yenileme onayı kaydı (an, IP, metin) olmadan
// kurulamıyor; kart numarası tutacak bir sütun yok.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUCU = "00000000-0000-4000-8000-000000000001";
const SAHIP = "00000000-0000-4000-8000-000000000002";
const ARVO = "00000000-0000-4000-8000-0000000000a0";
const SALON = "00000000-0000-4000-8000-0000000000a1";
const OID = "ARVOOSTEST1";

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
  `);
}

async function kartOdemesi() {
  await rol(db, "service_role");
  const link = await tek(
    `insert into public.payment_links (id, organization_id, purpose, provider, payer_organization_id, product, plan_code, provider_link_id, url, amount, status, created_by, note)
     values (gen_random_uuid(), $1, 'subscription', 'paytr', $2, 'arvoos', 'starter', $3, 'https://www.paytr.com/odeme', 239000, 'active', $4, 'ArvoOS · Başlangıç aylık lisans')
     returning id`,
    [ARVO, SALON, OID, SAHIP],
  );
  await db.query(
    `insert into public.paytr_kart_islemleri (merchant_oid, payment_link_id, tur, tutar, kullanici_ip) values ($1, $2, 'ilk', 239000, '85.105.1.2')`,
    [OID, link.id],
  );
  return link.id;
}

describe("PayTR kart saklama", () => {
  test("MEŞRU: kartla ödemenin bildirimi ArvoOS lisansını uzatır, ikinci bildirim yok sayılır", () =>
    islem(db, async () => {
      await tohum();
      const linkId = await kartOdemesi();
      const kaydet = () => tek(`select public.arvo_record_paytr_payment($1, $2, 239000, 239000, 'TL', false, '{"kaynak":"direkt"}'::jsonb) as r`, [linkId, OID]);
      assert.equal((await kaydet()).r, "recorded");
      const l = await tek(`select license_status, current_period_end > now() + interval '27 days' as bir_ay from public.organization_licenses where organization_id = $1`, [SALON]);
      assert.deepEqual([l.license_status, l.bir_ay], ["active", true]);
      assert.equal((await kaydet()).r, "duplicate");
      const odeme = await tek(`select product, payment_method, status, amount from public.organization_payment_requests where organization_id = $1`, [SALON]);
      assert.deepEqual([odeme.product, odeme.payment_method, odeme.status, Number(odeme.amount)], ["arvoos", "paytr", "approved", 239000]);
    }));

  test("MEŞRU: onaylı otomatik yenileme ve kayıtlı kart yazılabilir (servis rolü)", () =>
    islem(db, async () => {
      await tohum();
      await kartOdemesi();
      await db.query(
        `update public.paytr_kart_islemleri set kart_sakla = true, otomatik_onay = true, onay_at = now(), onay_ip = '85.105.1.2', onay_metni = 'v1 · ...', onaylayan = $2 where merchant_oid = $1`,
        [OID, SAHIP],
      );
      const kart = await tek(
        `insert into public.paytr_kayitli_kartlar (organization_id, utoken, ctoken, son4, banka) values ($1, 'UT1', 'CT1', '4358', 'Yapı Kredi') returning id`,
        [SALON],
      );
      await db.query(
        `insert into public.paytr_otomatik_yenileme (organization_id, product, kart_id, onay_at, onay_ip, onay_metni, onaylayan) values ($1, 'arvoos', $2, now(), '85.105.1.2', 'v1 · ...', $3)`,
        [SALON, kart.id, SAHIP],
      );
      // Kart silinince bağlı otomatik yenileme de gider.
      await db.query(`delete from public.paytr_kayitli_kartlar where id = $1`, [kart.id]);
      assert.equal((await tek(`select count(*)::int as n from public.paytr_otomatik_yenileme`)).n, 0);
    }));

  test("otomatik yenileme onayı kaydı olmadan verilemez; son 4 hane dört rakam", () =>
    islem(db, async () => {
      await tohum();
      await kartOdemesi();
      await reddedilir(db, `update public.paytr_kart_islemleri set kart_sakla = true, otomatik_onay = true where merchant_oid = $1`, [OID], /paytr_kart_islemleri_onay_check/);
      await reddedilir(db, `update public.paytr_kart_islemleri set otomatik_onay = true, onay_at = now(), onay_ip = '1.1.1.1', onay_metni = 'x' where merchant_oid = $1`, [OID], /paytr_kart_islemleri_onay_check/);
      await reddedilir(db, `insert into public.paytr_kayitli_kartlar (organization_id, utoken, ctoken, son4) values ($1, 'UT', 'CT', '4355084355084358')`, [SALON], /paytr_kayitli_kartlar_son4_check/);
    }));

  test("üç tablo da istemciye kapalı: kurumun kendi sahibi bile okuyamaz", () =>
    islem(db, async () => {
      await tohum();
      await kartOdemesi();
      for (const tablo of ["paytr_kart_islemleri", "paytr_kayitli_kartlar", "paytr_otomatik_yenileme"]) {
        await rol(db, "authenticated", SAHIP);
        await reddedilir(db, `select * from public.${tablo}`, [], /permission denied/);
        await rol(db, "anon");
        await reddedilir(db, `select * from public.${tablo}`, [], /permission denied/);
      }
    }));
});
