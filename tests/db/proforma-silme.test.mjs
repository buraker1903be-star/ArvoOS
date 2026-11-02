/*
  PROFORMA SİLME KORUMASI (migration 20261102190813).

  Konsol hatalı proformayı servis rolüyle siliyor; servis rolü RLS'i
  atlıyor, tetikleyiciyi atlamıyor. Sabitlenen:
   - MEŞRU: bekleyen ve iptal edilmiş elle kesilmiş proforma silinir;
   - ödenmiş (ödemeyle eşlenmiş) proforma silinemez;
   - otomatik proforma silinemez (günlük iş aynısını yeniden keserdi).
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const ABONE = "00000000-0000-4000-8000-0000000c00f1";
const ODEME = "00000000-0000-4000-8000-0000000c00f2";
const KALEM = JSON.stringify([{ aciklama: "ArvoLab bireysel abonelik (1 ay)", miktar: 1, birim_fiyat: 100000 }]);

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into public.product_subscribers (id, product, external_user_id, email, status, created_at, updated_at)
      values ('${ABONE}', 'arvolab', gen_random_uuid(), 'sil@x.co', 'active', now(), now());
    insert into public.subscriber_payments (id, subscriber_id, provider, merchant_oid, amount, currency)
      values ('${ODEME}', '${ABONE}', 'paytr', 'oid-sil', 120000, 'TRY');
  `);
  await rol(db, "service_role");
}

const proforma = async (ek = "") =>
  (await db.query(
    `insert into public.platform_proformalari
       (subscriber_id, musteri_adi, kalemler, ara_toplam, kdv, toplam, gecerlilik_tarihi${ek ? ", otomatik, donem_sonu" : ""})
     values ($1, 'Öğrenci', $2::jsonb, 100000, 20000, 120000, current_date + 15${ek ? ", true, current_date + 3" : ""})
     returning id`,
    [ABONE, KALEM],
  )).rows[0].id;

const var_ = async (id) => (await db.query(`select 1 from public.platform_proformalari where id = $1`, [id])).rows.length === 1;

describe("proforma silme", () => {
  test("bekleyen ve iptal edilmiş elle kesilmiş proforma silinir", () =>
    islem(db, async () => {
      await tohum();
      const bekleyen = await proforma();
      await db.query(`delete from public.platform_proformalari where id = $1`, [bekleyen]);
      assert.equal(await var_(bekleyen), false);
      const iptal = await proforma();
      await db.query(`update public.platform_proformalari set durum = 'iptal' where id = $1`, [iptal]);
      await db.query(`delete from public.platform_proformalari where id = $1`, [iptal]);
      assert.equal(await var_(iptal), false);
    }));

  test("ödenmiş proforma silinemez", () =>
    islem(db, async () => {
      await tohum();
      const id = await proforma();
      await db.query(`update public.platform_proformalari set durum = 'odendi', subscriber_payment_id = $2, odendi_at = now() where id = $1`, [id, ODEME]);
      await reddedilir(db, `delete from public.platform_proformalari where id = $1`, [id], /Ödenmiş/);
      assert.equal(await var_(id), true);
    }));

  test("otomatik proforma silinemez", () =>
    islem(db, async () => {
      await tohum();
      const id = await proforma("otomatik");
      await reddedilir(db, `delete from public.platform_proformalari where id = $1`, [id], /Otomatik/);
      assert.equal(await var_(id), true);
    }));
});
