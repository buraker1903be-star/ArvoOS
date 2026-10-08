// Cari ödeme bağlantısı (20261008141602): müşterinin söylediği tutarla açılan
// PayTR bağlantısı ödendiğinde tutar o cariye tahsilat olarak işlenir.
//
// Migration anlık görüntüde (08.10.2026); testler onu canlı şemayla sınıyor.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const SAHIP = "00000000-0000-4000-8000-000000000002";
const KURUM = "00000000-0000-4000-8000-0000000000b1";
const BASKA = "00000000-0000-4000-8000-0000000000b2";
const CARI = "00000000-0000-4000-8000-0000000000c1";
const BAGLANTI = "00000000-0000-4000-8000-0000000000d1";

let db;
before(async () => {
  db = await veritabani();
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'sahip@example.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code) values
      ('${KURUM}', 'Kurum', 'kurum', 'active', 'starter'),
      ('${BASKA}', 'Başka', 'baska', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role) values ('${KURUM}', '${SAHIP}', 'owner');
    insert into public.account_parties (id, organization_id, party_type, name, created_by)
      values ('${CARI}', '${KURUM}', 'customer', 'Ayşe Yılmaz', '${SAHIP}');
  `);
}

const baglantiAc = (kurum = KURUM, not = "Kalan ödeme") =>
  db.query(
    `insert into public.payment_links (id, organization_id, purpose, party_id, note, provider_link_id, url, amount, created_by)
     values ($1, $2, 'account', $3, $4, 'p-1', 'https://www.paytr.com/link/abc', 500000, $5)`,
    [BAGLANTI, kurum, CARI, not, SAHIP],
  );

const ode = (oid, tutar, test = false) =>
  tek(`select public.arvo_record_paytr_payment($1, $2, $3, $3, 'TL', $4, '{}'::jsonb) as sonuc`, [BAGLANTI, oid, tutar, test]);

describe("cari ödeme bağlantısı", () => {
  test("ödenince tutar cariye tahsilat olarak yazılır, bağlantı kapanır", () =>
    islem(db, async () => {
      await tohum();
      await baglantiAc();
      await rol(db, "service_role");
      assert.equal((await ode("oid-1", 500000)).sonuc, "recorded");
      await rol(db, "postgres");

      const hareket = await tek(`select entry_type, source_type, amount, description, reference_no from public.account_entries where party_id = $1`, [CARI]);
      assert.deepEqual(
        [hareket.entry_type, hareket.source_type, Number(hareket.amount), hareket.description, hareket.reference_no],
        ["credit", "payment", 500000, "PayTR tahsilatı · Kalan ödeme", "PAYTR-oid-1"],
      );
      const b = await tek(`select status, paid_at is not null as odendi from public.payment_links where id = $1`, [BAGLANTI]);
      assert.deepEqual([b.status, b.odendi], ["paid", true]);
    }));

  test("aynı bildirim iki kez gelirse cariye bir kez yazılır", () =>
    islem(db, async () => {
      await tohum();
      await baglantiAc();
      await rol(db, "service_role");
      await ode("oid-2", 500000);
      assert.equal((await ode("oid-2", 500000)).sonuc, "duplicate");
      await rol(db, "postgres");
      assert.equal(Number((await tek(`select count(*) as n from public.account_entries where party_id = $1`, [CARI])).n), 1);
    }));

  test("test ödemesi cariye dokunmaz", () =>
    islem(db, async () => {
      await tohum();
      await baglantiAc();
      await rol(db, "service_role");
      assert.equal((await ode("oid-3", 500000, true)).sonuc, "test");
      await rol(db, "postgres");
      assert.equal(Number((await tek(`select count(*) as n from public.account_entries where party_id = $1`, [CARI])).n), 0);
    }));

  test("açıklama boşsa genel bir açıklama yazılır", () =>
    islem(db, async () => {
      await tohum();
      await baglantiAc(KURUM, null);
      await rol(db, "service_role");
      await ode("oid-4", 500000);
      await rol(db, "postgres");
      assert.equal((await tek(`select description from public.account_entries where party_id = $1`, [CARI])).description, "PayTR tahsilatı · ödeme bağlantısı");
    }));

  test("cari olmadan ya da başka kurumun carisine bağlantı açılamaz", () =>
    islem(db, async () => {
      await tohum();
      await reddedilir(
        db,
        `insert into public.payment_links (id, organization_id, purpose, provider_link_id, url, amount, created_by)
         values (gen_random_uuid(), $1, 'account', 'p-2', 'https://www.paytr.com/link/x', 1000, $2)`,
        [KURUM, SAHIP],
        /payment_links_purpose_check/,
      );
      await reddedilir(
        db,
        `insert into public.payment_links (id, organization_id, purpose, party_id, provider_link_id, url, amount, created_by)
         values (gen_random_uuid(), $1, 'account', $2, 'p-3', 'https://www.paytr.com/link/y', 1000, $3)`,
        [BASKA, CARI, SAHIP],
        /payment_links_party_org_fk/,
      );
    }));

  test("panel kullanıcısı fonksiyonu doğrudan çağıramaz", () =>
    islem(db, async () => {
      await tohum();
      await baglantiAc();
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `select public.arvo_record_paytr_payment($1, 'oid-5', 1, 1, 'TL', false, '{}'::jsonb)`, [BAGLANTI], /permission denied/);
    }));
});
