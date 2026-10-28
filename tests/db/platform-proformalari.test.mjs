// Platform proformaları (20261027174258): ödemeden ÖNCE müşteriye giden
// belge. Kurucu hazırlıyor, müşteri ArvoLab'da görüyor, ödeme gelince
// kurucu proformayı o ödemeyle eşliyor.
//
// Proforma resmî belge gibi okunuyor: istemciden yazılamamalı, numarası
// sunucuda verilmeli, toplamı kalemlerle tutarsız olamamalı ve bir ödeme
// iki proformayı kapatamamalı.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, migrationYetkileri, reddedilir, rol, veritabani } from "./ortam.mjs";

const KURUCU = "00000000-0000-4000-8000-000000000001";
const SAHIP = "00000000-0000-4000-8000-000000000002";
const ARVO = "00000000-0000-4000-8000-0000000000a0";
const SALON = "00000000-0000-4000-8000-0000000000a1";
const ABONE = "00000000-0000-4000-8000-0000000000f1";
const ODEME = "00000000-0000-4000-8000-0000000000f2";

/*
  Döküm TABLO yetkilerini taşımıyor; düzenek de her tabloyu anon ve
  authenticated'a açıyor. Tabloyu istemciye kapatan tek şey migration'ın
  kendi revoke satırları: döküm 28.10.2026'da yenilenip migration
  BEKLEYEN_MIGRATIONLAR'dan çıkınca "istemci yazamaz" senaryosu düştü.
  DDL dökümden geliyor, yetki satırları dosyadan tekrarlanıyor.
  govde-tamam: DDL dökümden, yetkiler dosyadan.
*/
const YALNIZCA_YETKI = ["20261027174258_platform_proformalari.sql"];

let db;
before(async () => {
  db = await veritabani();
  await migrationYetkileri(db, YALNIZCA_YETKI);
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
    insert into public.product_subscribers (id, product, external_user_id, email, status, created_at, updated_at)
      values ('${ABONE}', 'arvolab', gen_random_uuid(), 'ogrenci@x.co', 'active', now(), now());
    insert into public.subscriber_payments (id, subscriber_id, provider, merchant_oid, amount, currency)
      values ('${ODEME}', '${ABONE}', 'paytr', 'oid-1', 120000, 'TRY');
  `);
}

const KALEM = JSON.stringify([{ aciklama: "ArvoLab bireysel abonelik (1 ay)", miktar: 1, birim_fiyat: 100000 }]);

const aboneProformasi = () =>
  tek(
    `insert into public.platform_proformalari
       (subscriber_id, musteri_adi, kalemler, ara_toplam, kdv, toplam, gecerlilik_tarihi)
     values ($1, 'Öğrenci', $2::jsonb, 100000, 20000, 120000, current_date + 15)
     returning id, proforma_no`,
    [ABONE, KALEM],
  );

describe("platform proformaları", () => {
  test("numara sunucuda verilir, istemcinin yazdığı yok sayılır", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      const p = await tek(
        `insert into public.platform_proformalari
           (proforma_no, subscriber_id, musteri_adi, kalemler, ara_toplam, kdv, toplam, gecerlilik_tarihi)
         values ('SAHTE-1', $1, 'Öğrenci', $2::jsonb, 100000, 20000, 120000, current_date + 15)
         returning proforma_no`,
        [ABONE, KALEM],
      );
      assert.match(p.proforma_no, /^PRF-\d{4}-\d{4,}$/);
      const ikinci = await aboneProformasi();
      assert.notEqual(ikinci.proforma_no, p.proforma_no);
    }));

  test("toplam ara toplam + KDV'den sapamaz", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      await reddedilir(
        db,
        `insert into public.platform_proformalari
           (subscriber_id, musteri_adi, kalemler, ara_toplam, kdv, toplam, gecerlilik_tarihi)
         values ($1, 'Öğrenci', $2::jsonb, 100000, 20000, 100000, current_date + 15)`,
        [ABONE, KALEM],
        /platform_proformalari_toplam/,
      );
    }));

  test("müşteri tam olarak bir tane: kurum ya da abone", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      await reddedilir(
        db,
        `insert into public.platform_proformalari
           (organization_id, subscriber_id, musteri_adi, kalemler, ara_toplam, kdv, toplam, gecerlilik_tarihi)
         values ($1, $2, 'İkisi', $3::jsonb, 100000, 20000, 120000, current_date + 15)`,
        [SALON, ABONE, KALEM],
        /platform_proformalari_musteri/,
      );
    }));

  test("ödendi durumu ancak eşlenen ödemeyle; bir ödeme bir proformayı kapatır", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      const p = await aboneProformasi();
      await reddedilir(
        db,
        `update public.platform_proformalari set durum = 'odendi' where id = $1`,
        [p.id],
        /platform_proformalari_odeme/,
      );
      await db.query(
        `update public.platform_proformalari set durum = 'odendi', subscriber_payment_id = $2, odendi_at = now() where id = $1`,
        [p.id, ODEME],
      );
      const ikinci = await aboneProformasi();
      await reddedilir(
        db,
        `update public.platform_proformalari set durum = 'odendi', subscriber_payment_id = $2 where id = $1`,
        [ikinci.id, ODEME],
        /duplicate key|unique/,
      );
    }));

  test("kurumun proforması abonenin ödemesiyle eşlenemez", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      const p = await tek(
        `insert into public.platform_proformalari
           (organization_id, musteri_adi, kalemler, ara_toplam, kdv, toplam, gecerlilik_tarihi)
         values ($1, 'Güzel Salon', $2::jsonb, 100000, 20000, 120000, current_date + 15) returning id`,
        [SALON, KALEM],
      );
      await reddedilir(
        db,
        `update public.platform_proformalari set durum = 'odendi', subscriber_payment_id = $2 where id = $1`,
        [p.id, ODEME],
        /platform_proformalari_odeme_turu/,
      );
    }));

  test("kurucu okur; kurum sahibi okuyamaz, kimse istemciden yazamaz", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      await aboneProformasi();

      await rol(db, "authenticated", KURUCU);
      assert.equal((await db.query(`select id from public.platform_proformalari`)).rows.length, 1);
      await reddedilir(
        db,
        `update public.platform_proformalari set toplam = 1`,
        [],
        /permission denied/,
      );

      await rol(db, "authenticated", SAHIP);
      assert.equal((await db.query(`select id from public.platform_proformalari`)).rows.length, 0);
      await reddedilir(
        db,
        `insert into public.platform_proformalari
           (organization_id, musteri_adi, kalemler, ara_toplam, kdv, toplam, gecerlilik_tarihi)
         values ($1, 'Sahte', $2::jsonb, 100000, 20000, 120000, current_date + 15)`,
        [SALON, KALEM],
        /permission denied/,
      );

      await rol(db, "anon");
      await reddedilir(db, `select * from public.platform_proformalari`, [], /permission denied/);
    }));
});
