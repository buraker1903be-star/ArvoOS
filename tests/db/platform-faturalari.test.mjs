// Platform faturaları (20261026191235): elle kesilen faturanın PDF'i bir
// tahsilata bağlanıyor; müşteri ArvoLab'da görüyor.
//
// Fatura müşteriye giden resmî belge: istemciden yazılamamalı, bir ödemenin
// tek faturası olmalı ve ödeme silinmeye kalkılırsa faturası sessizce
// gitmemeli.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const ABONE = "00000000-0000-4000-8000-0000000000f1";
const ODEME = "00000000-0000-4000-8000-0000000000f2";
const KULLANICI = "00000000-0000-4000-8000-0000000000f3";

let db;
before(async () => {
  db = await veritabani();
});

async function tohum() {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${KULLANICI}', 'k@x.co');
    insert into public.product_subscribers (id, product, external_user_id, email, status, created_at, updated_at)
      values ('${ABONE}', 'arvolab', gen_random_uuid(), 'ogrenci@x.co', 'active', now(), now());
    insert into public.subscriber_payments (id, subscriber_id, provider, merchant_oid, amount, currency)
      values ('${ODEME}', '${ABONE}', 'paytr', 'oid-1', 49900, 'TRY');
  `);
}

const faturaEkle = (no = "ARV2026000001") =>
  db.query(
    `insert into public.platform_faturalari (fatura_no, fatura_tarihi, dosya_yolu, subscriber_payment_id)
     values ($1, current_date, 'abone/x/1.pdf', $2)`,
    [no, ODEME],
  );

describe("platform faturaları", () => {
  test("sunucu bir ödemeye bir fatura bağlar; ikincisi reddedilir", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      await faturaEkle();
      await reddedilir(
        db,
        `insert into public.platform_faturalari (fatura_no, fatura_tarihi, dosya_yolu, subscriber_payment_id)
         values ('IKINCI', current_date, 'abone/x/2.pdf', $1)`,
        [ODEME],
        /duplicate key|unique/,
      );
    }));

  test("fatura ödemesiz ya da iki ödemeye birden bağlanamaz", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      await reddedilir(
        db,
        `insert into public.platform_faturalari (fatura_no, fatura_tarihi, dosya_yolu) values ('X', current_date, 'y.pdf')`,
        [],
        /platform_faturalari_odeme_check/,
      );
    }));

  test("panel kullanıcısı ve anonim fatura yazamaz ve okuyamaz", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "authenticated", KULLANICI);
      await reddedilir(
        db,
        `insert into public.platform_faturalari (fatura_no, fatura_tarihi, dosya_yolu, subscriber_payment_id)
         values ('SAHTE', current_date, 'z.pdf', $1)`,
        [ODEME],
        /permission denied|row-level security/,
      );
      // Kurucu olmayan kullanıcı satır görmez (politika yalnızca kurucuya).
      assert.equal((await db.query(`select * from public.platform_faturalari`)).rows.length, 0);
      await rol(db, "anon");
      await reddedilir(db, `select * from public.platform_faturalari`, [], /permission denied/);
    }));

  test("faturası olan ödeme silinemez (fatura sessizce gitmesin)", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "service_role");
      await faturaEkle();
      await rol(db, "postgres");
      await reddedilir(db, `delete from public.subscriber_payments where id = $1`, [ODEME], /foreign key|violates/);
    }));
});
