/*
  Ödeme sağlayıcısı katmanı.

  En kritik kural: credentials_enc'e DÜZ METİN bir sır yazılamaz. Kod
  tarafındaki bir unutkanlık (encryptSecret çağrısını atlamak) veritabanına
  açık parola bırakırdı ve bunu fark etmenin hiçbir yolu olmazdı — tablo
  zaten yalnızca service_role'e açık, kimse içine bakmıyor.

  İkincisi: 'paytr' dışına çıkmayı yasaklayan yedi CHECK gerçekten açıldı mı.
  Biri atlanırsa Garanti satırı o tabloda sessizce reddedilir ve hata ancak
  ilk tahsilatta görülür.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260925130801_odeme_saglayici_katmani_garanti.sql",
);

const KURUM = "00000000-0000-4000-8000-0000000000e1";
const SAHIP = "00000000-0000-4000-8000-0000000000e2";
// Gerçek biçim: "v1:<iv b64>:<etiket b64>:<veri b64>" (lib/payment-credentials.ts)
const SIFRELI = "v1:YWJjZGVmZ2hpams=:bG1ub3BxcnN0dXZ3eHl6MTI=:Zm9vYmFyYmF6";

let db;
before(async () => {
  db = await veritabani();
  const { rows } = await db.query(`
    select exists (
      select 1 from information_schema.columns
      where table_name = 'organization_payment_providers' and column_name = 'credentials_enc') as v`);
  if (!rows[0].v) await db.exec(fs.readFileSync(MIGRATION, "utf8"));
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'sahip@example.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code)
      values ('${KURUM}', 'Akademik Merkez', 'akademik-merkez', 'active', 'starter');
  `);
}

const saglayiciYaz = (provider, harita, ek = "") =>
  db.query(
    `insert into public.organization_payment_providers
       (organization_id, provider, merchant_id, credentials_enc, is_enabled${ek ? ", mode" : ""})
     values ($1, $2, '7000679', $3::jsonb, true${ek ? `, '${ek}'` : ""})`,
    [KURUM, provider, JSON.stringify(harita)],
  );

describe("sırlar düz metin yazılamıyor", () => {
  test("şifreli biçimdeki değer kabul ediliyor", () =>
    islem(db, async () => {
      await tohum();
      await saglayiciYaz("garanti", { terminal_id: SIFRELI, store_key: SIFRELI });
      assert.equal((await tek(`select count(*)::int n from public.organization_payment_providers`)).n, 1);
    }));

  test("düz metin parola REDDEDİLİYOR", () =>
    islem(db, async () => {
      await tohum();
      // encryptSecret çağrısı atlanmış hâli; veritabanı bunu durdurmalı.
      await reddedilir(db,
        `insert into public.organization_payment_providers (organization_id, provider, merchant_id, credentials_enc, is_enabled)
         values ($1, 'garanti', '7000679', '{"store_key":"123qweASD"}'::jsonb, true)`,
        [KURUM], /credentials_check/);
    }));

  test("bozuk şifreli biçim ve metin olmayan değer de reddediliyor", () =>
    islem(db, async () => {
      await tohum();
      await reddedilir(db,
        `insert into public.organization_payment_providers (organization_id, provider, merchant_id, credentials_enc, is_enabled)
         values ($1, 'garanti', '7000679', '{"store_key":"v2:a:b:c"}'::jsonb, true)`,
        [KURUM], /credentials_check/);
      await reddedilir(db,
        `insert into public.organization_payment_providers (organization_id, provider, merchant_id, credentials_enc, is_enabled)
         values ($1, 'garanti', '7000679', '{"store_key":12345}'::jsonb, true)`,
        [KURUM], /credentials_check/);
    }));

  test("boş harita serbest: sağlayıcı satırı bilgiler girilmeden açılabiliyor", () =>
    islem(db, async () => {
      await tohum();
      await saglayiciYaz("paytr", {});
      assert.equal((await tek(`select count(*)::int n from public.organization_payment_providers`)).n, 1);
    }));
});

describe("Garanti bir sağlayıcı olarak tanınıyor", () => {
  test("yedi kısıt da 'garanti' değerini kabul ediyor", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      const kisitlar = [
        "billing_customers_provider_check",
        "billing_invoices_provider_check",
        "billing_subscriptions_provider_check",
        "organization_payment_providers_provider_check",
        "organization_payment_requests_payment_method_check",
        "payment_installments_payment_link_source_check",
        "payment_links_provider_check",
      ];
      for (const ad of kisitlar) {
        const satir = await tek(`select pg_get_constraintdef(oid) d from pg_constraint where conname = $1`, [ad]);
        assert.ok(satir, `${ad} bulunamadı`);
        assert.match(satir.d, /garanti/, `${ad} hâlâ garanti'yi kabul etmiyor`);
      }
    }));

  test("tanınmayan sağlayıcı yine reddediliyor", () =>
    islem(db, async () => {
      await tohum();
      await reddedilir(db, `insert into public.organization_payment_providers
         (organization_id, provider, merchant_id, credentials_enc, is_enabled)
         values ($1, 'iyzico', '7000679', '{}'::jsonb, true)`, [KURUM], /provider_check/);
    }));

  test("kip yalnızca test ya da production", () =>
    islem(db, async () => {
      await tohum();
      await saglayiciYaz("garanti", {}, "test");
      assert.equal((await tek(`select mode from public.organization_payment_providers`)).mode, "test");
      await reddedilir(db,
        `update public.organization_payment_providers set mode = 'sandbox'`, [], /mode_check/);
    }));

  test("aynı kurumda iki sağlayıcı yan yana durabiliyor", () =>
    islem(db, async () => {
      await tohum();
      await saglayiciYaz("paytr", { merchant_key: SIFRELI, merchant_salt: SIFRELI });
      await saglayiciYaz("garanti", { store_key: SIFRELI });
      // Birincil anahtar (organization_id, provider): geçiş döneminde ikisi
      // birden kayıtlı olacak, biri yedek.
      assert.equal((await tek(`select count(*)::int n from public.organization_payment_providers where organization_id = $1`, [KURUM])).n, 2);
    }));
});

describe("PayTR satırları taşındı", () => {
  test("eski sütunlardaki değerler haritaya kopyalandı", () =>
    islem(db, async () => {
      await tohum();
      /*
        Migration mevcut satırları taşıyor. Burada taşımayı yeniden
        koşturuyoruz: anahtar adları ('merchant_key', 'merchant_salt')
        koddaki secretKeys("paytr") ile birebir aynı olmalı, yoksa kayıtlı
        mağazalar dağıtımdan sonra sessizce "bağlı değil" olurdu.
      */
      await db.query(
        `insert into public.organization_payment_providers
           (organization_id, provider, merchant_id, merchant_key_enc, merchant_salt_enc, credentials_enc, is_enabled)
         values ($1, 'paytr', '123456', $2, $2, '{}'::jsonb, true)`,
        [KURUM, SIFRELI],
      );
      await db.query(`
        update public.organization_payment_providers
        set credentials_enc = jsonb_build_object('merchant_key', merchant_key_enc, 'merchant_salt', merchant_salt_enc)
        where provider = 'paytr' and credentials_enc = '{}'::jsonb
          and merchant_key_enc is not null and merchant_salt_enc is not null`);
      const satir = await tek(`select credentials_enc from public.organization_payment_providers`);
      assert.deepEqual(Object.keys(satir.credentials_enc).sort(), ["merchant_key", "merchant_salt"]);
    }));

  test("Garanti satırı eski PayTR sütunları olmadan yazılabiliyor", () =>
    islem(db, async () => {
      await tohum();
      // Sütunlar not null kalsaydı Garanti satırı hiç açılamazdı.
      await saglayiciYaz("garanti", { store_key: SIFRELI });
      const satir = await tek(`select merchant_key_enc from public.organization_payment_providers`);
      assert.equal(satir.merchant_key_enc, null);
    }));
});
