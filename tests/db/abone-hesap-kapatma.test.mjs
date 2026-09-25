// Hesabını silen bireysel abonenin kaydı KAPANIR, silinmez.
//
// Kritik olan şu: product_subscribers satırını silmek ödeme ve fatura
// kaydını da götürür (subscriber_payments ve payment_links cascade ile
// bağlı) ve VUK bunların beş yıl saklanmasını zorunlu tutuyor. Bu testin
// asıl işi o cascade'in gerçekten öyle davrandığını göstermek: kural
// yorumda değil, veritabanında.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

// Harness şemayı kurar, migration'ları tek tek uygulamaz; bu testin
// dayandığı sütunu kendimiz ekliyoruz (abonelik-istegi.test.mjs ile aynı yol).
const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20260925110035_abone_hesap_kapatma.sql");

const ABONE = "00000000-0000-4000-8000-0000000000f1";

let db;
before(async () => {
  db = await veritabani();
  const { rows } = await db.query(
    `select 1 from information_schema.columns
      where table_schema='public' and table_name='product_subscribers' and column_name='closed_at'`);
  if (!rows.length) await db.exec(fs.readFileSync(MIGRATION, "utf8"));
});

async function tohum() {
  await rol(db, "postgres");
  const { rows } = await db.query(`
    insert into public.product_subscribers (product, external_user_id, email, full_name, status, current_period_end)
    values ('arvolab', '${ABONE}', 'ayse@ornek.com', 'Ayşe Yılmaz', 'active', now() + interval '20 days')
    returning id`);
  const id = rows[0].id;
  await db.query(
    `insert into public.subscriber_payments (subscriber_id, provider, merchant_oid, amount, currency, period_start, period_end)
     values ($1, 'paytr', 'OID-1', 14900, 'TRY', now() - interval '10 days', now() + interval '20 days')`, [id]);
  return id;
}

describe("abone hesap kapatma", () => {
  test("satırı silmek ÖDEME KAYDINI da siler — bu yüzden silinmiyor", () =>
    islem(db, async () => {
      const id = await tohum();
      await db.query(`delete from public.product_subscribers where id = $1`, [id]);
      const { rows } = await db.query(`select count(*) n from public.subscriber_payments where subscriber_id = $1`, [id]);
      assert.equal(Number(rows[0].n), 0, "Cascade beklendiği gibi değil; kapatma kararının gerekçesi değişmiş olabilir");
    }));

  test("kapatma: durum canceled, closed_at damgalı, kişisel alanlar anonim", () =>
    islem(db, async () => {
      const id = await tohum();
      await db.query(`
        update public.product_subscribers
        set status = 'canceled', closed_at = now(), email = 'silinmis+' || id || '@arvo-os.com',
            full_name = null, suspension_reason = 'Kullanıcı hesabını sildi'
        where id = $1`, [id]);

      const { rows } = await db.query(
        `select status, closed_at, email, full_name from public.product_subscribers where id = $1`, [id]);
      const satir = rows[0];
      assert.equal(satir.status, "canceled");
      assert.ok(satir.closed_at, "closed_at damgalanmalı");
      assert.equal(satir.full_name, null);
      assert.equal(satir.email.includes("ayse@ornek.com"), false, "Gerçek e-posta kalmamalı");
      assert.match(satir.email, /^silinmis\+.+@arvo-os\.com$/);
    }));

  test("kapatıldıktan sonra ödeme kaydı yerinde duruyor", () =>
    islem(db, async () => {
      const id = await tohum();
      await db.query(`update public.product_subscribers set status='canceled', closed_at=now(), full_name=null where id=$1`, [id]);
      const { rows } = await db.query(`select amount from public.subscriber_payments where subscriber_id = $1`, [id]);
      assert.equal(rows.length, 1, "VUK: ödeme izi beş yıl saklanmalı");
      assert.equal(Number(rows[0].amount), 14900);
    }));

  test("closed_at 'aboneliği bitti' ile 'hesabını sildi'yi ayırıyor", () =>
    islem(db, async () => {
      const id = await tohum();
      // Yalnızca aboneliği biten: canceled ama closed_at boş.
      await db.query(`update public.product_subscribers set status='canceled' where id=$1`, [id]);
      const { rows } = await db.query(
        `select count(*) n from public.product_subscribers where product='arvolab' and closed_at is not null`);
      assert.equal(Number(rows[0].n), 0, "Durum tek başına hesap silmeyi göstermemeli");
    }));
});
