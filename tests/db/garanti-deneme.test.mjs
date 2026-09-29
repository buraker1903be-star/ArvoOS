/*
  GARANTİ ÖDEME DENEMELERİ.

  Garanti'de PayTR gibi kalıcı bir ödeme URL'i olamıyor: banka aynı
  orderid'yi ikinci kez kabul etmiyor ve imza orderid'ye bağlı. Bu
  yüzden bir payment_links kaydına birden çok DENEME düşüyor ve
  bankanın geri dönüşü (oid) buraya bağlanıyor.

  En kritik kural: orderid ÜYE İŞYERİ düzeyinde tekil. Üç marka aynı
  üye işyerini paylaştığı için (ayrı terminaller) iki markanın numarası
  çakışırsa bankada ikincisi reddedilir — kısıt bu yüzden
  organization_id'siz.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20260929141537_garanti_odeme_denemeleri.sql");
const KURUM_A = "00000000-0000-4000-8000-0000000000f1";
const KURUM_B = "00000000-0000-4000-8000-0000000000f2";
const SAHIP = "00000000-0000-4000-8000-0000000000f3";
const BAGLANTI_A = "00000000-0000-4000-8000-0000000000f4";
const BAGLANTI_B = "00000000-0000-4000-8000-0000000000f5";

let db;
before(async () => {
  db = await veritabani();
  const { rows } = await db.query(`select to_regclass('public.garanti_payment_attempts') is not null as v`);
  if (!rows[0].v) await db.exec(fs.readFileSync(MIGRATION, "utf8"));
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'sahip@example.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${KURUM_A}', 'Akademik Merkez', 'akademik-merkez', 'active', 'starter'),
      ('${KURUM_B}', 'ArvoCulture', 'arvoculture-test', 'active', 'starter');
  `);
  /* Bağlantı kaydı: purpose 'installment' taksit ister, o yüzden
     'ai_credit' ile en az alanla kuruluyor. */
  for (const [id, kurum] of [[BAGLANTI_A, KURUM_A], [BAGLANTI_B, KURUM_B]]) {
    await db.query(
      `insert into public.payment_links (id, organization_id, provider, provider_link_id, url, amount, purpose, payer_organization_id, created_by)
       values ($1::uuid, $2::uuid, 'garanti', $1::text, 'https://ornek/odeme/' || $1::text, 10000, 'ai_credit', $2::uuid, $3::uuid)`,
      [id, kurum, SAHIP],
    );
  }
}

const deneme = (kurum, baglanti, orderId, ek = "") =>
  db.query(
    `insert into public.garanti_payment_attempts (organization_id, payment_link_id, order_id, amount, terminal_id${ek ? ", status, finished_at" : ""})
     values ($1::uuid, $2::uuid, $3, 10000, '30691297'${ek})`,
    [kurum, baglanti, orderId],
  );

describe("garanti ödeme denemeleri", () => {
  test("bir bağlantıya birden çok deneme düşebiliyor", () =>
    islem(db, async () => {
      await tohum();
      /* Düşen bir denemeden sonra müşteri tekrar deniyor: yeni orderid. */
      await deneme(KURUM_A, BAGLANTI_A, "ef43ef579b97484d9f67d445e4b15b93");
      await deneme(KURUM_A, BAGLANTI_A, "aa43ef579b97484d9f67d445e4b15b94");
      assert.equal((await tek(`select count(*)::int n from public.garanti_payment_attempts`)).n, 2);
    }));

  test("ORDERID ÜYE İŞYERİ DÜZEYİNDE TEKİL — farklı markalar bile çakışamıyor", () =>
    islem(db, async () => {
      /*
        Üç marka aynı Üye İşyeri Numarasını paylaşıyor; bankada numara
        çakışırsa ikinci işlem reddedilir. Kısıt bu yüzden kuruma göre
        değil, tablo genelinde.
      */
      await tohum();
      await deneme(KURUM_A, BAGLANTI_A, "ef43ef579b97484d9f67d445e4b15b93");
      await reddedilir(db,
        `insert into public.garanti_payment_attempts (organization_id, payment_link_id, order_id, amount, terminal_id)
         values ($1::uuid, $2::uuid, 'ef43ef579b97484d9f67d445e4b15b93', 10000, '30691298')`,
        [KURUM_B, BAGLANTI_B], /order_id_key|duplicate key/i);
    }));

  test("bozuk sipariş numarası reddediliyor", () =>
    islem(db, async () => {
      /* Boşluklu ya da işaretli numara bankada sessizce başka
         yorumlanabilir. */
      await tohum();
      for (const kotu of ["kisa", "ef43 ef57", "ef43/ef57", "x".repeat(65)]) {
        await reddedilir(db,
          `insert into public.garanti_payment_attempts (organization_id, payment_link_id, order_id, amount, terminal_id)
           values ($1::uuid, $2::uuid, $3, 10000, '30691297')`,
          [KURUM_A, BAGLANTI_A, kotu], /order_id_check/);
      }
    }));

  test("BİTMEMİŞ deneme bitmiş gibi görünemiyor", () =>
    islem(db, async () => {
      /*
        Sonuçlanmış bir denemenin bitiş damgası olmalı, sonuçlanmamışın
        olmamalı. Aksi hâlde "ödendi ama ne zaman belli değil" ya da
        "hâlâ sürüyor ama bitmiş" gibi kayıtlar birikir.
      */
      await tohum();
      await reddedilir(db,
        `insert into public.garanti_payment_attempts (organization_id, payment_link_id, order_id, amount, terminal_id, status)
         values ($1::uuid, $2::uuid, 'ef43ef579b97484d9f67d445e4b15b93', 10000, '30691297', 'paid')`,
        [KURUM_A, BAGLANTI_A], /finished_check/);
      await reddedilir(db,
        `insert into public.garanti_payment_attempts (organization_id, payment_link_id, order_id, amount, terminal_id, status, finished_at)
         values ($1::uuid, $2::uuid, 'ef43ef579b97484d9f67d445e4b15b94', 10000, '30691297', 'started', now())`,
        [KURUM_A, BAGLANTI_A], /finished_check/);
      await deneme(KURUM_A, BAGLANTI_A, "ef43ef579b97484d9f67d445e4b15b95", ", 'paid', now()");
      assert.equal((await tek(`select status from public.garanti_payment_attempts`)).status, "paid");
    }));

  test("tanınmayan durum ve sıfır tutar reddediliyor", () =>
    islem(db, async () => {
      await tohum();
      await reddedilir(db,
        `insert into public.garanti_payment_attempts (organization_id, payment_link_id, order_id, amount, terminal_id, status, finished_at)
         values ($1::uuid, $2::uuid, 'ef43ef579b97484d9f67d445e4b15b93', 10000, '30691297', 'belki', now())`,
        [KURUM_A, BAGLANTI_A], /status_check/);
      await reddedilir(db,
        `insert into public.garanti_payment_attempts (organization_id, payment_link_id, order_id, amount, terminal_id)
         values ($1::uuid, $2::uuid, 'ef43ef579b97484d9f67d445e4b15b94', 0, '30691297')`,
        [KURUM_A, BAGLANTI_A], /amount_check/);
    }));

  test("bağlantı silinince denemeleri de gidiyor", () =>
    islem(db, async () => {
      await tohum();
      await deneme(KURUM_A, BAGLANTI_A, "ef43ef579b97484d9f67d445e4b15b93");
      await db.query(`delete from public.payment_links where id = $1::uuid`, [BAGLANTI_A]);
      assert.equal((await tek(`select count(*)::int n from public.garanti_payment_attempts`)).n, 0);
    }));

  test("tablo yalnızca service_role'e açık", () =>
    islem(db, async () => {
      /* payment_links ile aynı kalıp: RLS açık, politika yok. Ödeme
         kayıtları doğrudan tarayıcıya açılmıyor. */
      const satir = await tek(`
        select c.relrowsecurity as rls,
               (select count(*) from pg_policies p where p.tablename = 'garanti_payment_attempts')::int as politika
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'garanti_payment_attempts'`);
      assert.equal(satir.rls, true);
      assert.equal(satir.politika, 0);
    }));

  test("migration ikinci kez çalıştırılabiliyor", () =>
    islem(db, async () => {
      await rol(db, "postgres");
      await db.exec(fs.readFileSync(MIGRATION, "utf8"));
      await tohum();
      await deneme(KURUM_A, BAGLANTI_A, "ef43ef579b97484d9f67d445e4b15b93");
      assert.equal((await tek(`select count(*)::int n from public.garanti_payment_attempts`)).n, 1);
    }));
});
