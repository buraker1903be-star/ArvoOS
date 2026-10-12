/*
  PLATFORM TAHSİLAT ÖZETİ (Abonelikler sayfasının gelir sayıları).

  Tahsilat üç kanaldan geliyor: onaylanmış havale bildirimleri, kart
  ödeme günlüğü (billing_subscriptions) ve bireysel abone ödemeleri.
  Eskiden her kanalda `.limit(50)` vardı ve toplam son 50 kaydın
  toplamıydı; sınır kaldırılınca da bütün kayıtlar okunmaya başladı —
  satır tavanında aynı sessiz eksilme. Toplam artık burada.

  Sınananlar:
  1. Üç kanal toplanıyor, bekleyen (onaylanmamış) havale sayılmıyor.
  2. KENDİ MARKAMIZ (kind = 'internal') sayılmıyor: kendi kurumumuza
     kesilen tahsilat Arvo'nun geliri değil.
  3. "Bu ay" sınırı TÜRKİYE saatiyle: ayın ilk gününün gecesi
     yazılan tahsilat bu aya girmeli.
  4. Para birimleri dizi olarak dönüyor (ekran karışıklığı uyarıyor).
  5. anon işlevi çağıramıyor.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = ["20261012172749_platform_tahsilat_ozeti.sql"];

const ARVO = "00000000-0000-4000-8000-00000000b1a1";
const KIRACI = "00000000-0000-4000-8000-00000000b1a2";
const KURUCU = "00000000-0000-4000-8000-00000000b1b1";
const ABONE = "00000000-0000-4000-8000-00000000b1c1";

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const ozet = async () => (await tek(`select public.platform_tahsilat_ozeti() as o`)).o;

before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${KURUCU}','kurucu@arvo-os.com');
    insert into public.plans (code, name, description) values ('starter','B',''),('professional','P','');
    insert into public.organizations (id,name,slug,status,plan_code,kind) values
      ('${ARVO}','ArvoOS','arvo-os','active','professional','internal'),
      ('${KIRACI}','Akademik Merkez','akademik','active','professional','customer');
    insert into public.organization_memberships (organization_id,user_id,role,is_active)
      values ('${ARVO}','${KURUCU}','owner',true);

    /* Havale bildirimi DEKONT ve BANKA HESABI ister (kısıt:
       organization_payment_requests_transfer_fields) — gerçek akış
       böyle, tohum da onu izliyor. */
    /* Hesap PLATFORM'un hesabı (platform_bank_accounts): kiracı
       Arvo'ya havale yapıyor, kendi hesabına değil. */
    insert into public.platform_bank_accounts (id,bank_name,iban,updated_at)
      values ('00000000-0000-4000-8000-00000000b1d1','Banka','TR000000000000000000000000',now());

    /* Havale: biri onaylı (sayılır), biri bekliyor (sayılmaz), biri
       KENDİ markamıza ait (sayılmaz). */
    insert into public.organization_payment_requests (organization_id,plan_code,amount,currency,status,submitted_by,reviewed_at,product,receipt_path,bank_account_id)
    values
      ('${KIRACI}','professional',150000,'TRY','approved','${KURUCU}', now() - interval '2 days','arvoos','dekont/1.pdf','00000000-0000-4000-8000-00000000b1d1'),
      ('${KIRACI}','professional',999000,'TRY','pending','${KURUCU}', null,'arvoos','dekont/2.pdf','00000000-0000-4000-8000-00000000b1d1'),
      ('${ARVO}','professional',500000,'TRY','approved','${KURUCU}', now() - interval '1 day','arvoos','dekont/3.pdf','00000000-0000-4000-8000-00000000b1d1');

    /* Kart ödeme günlüğü: kiracıdan iki ödeme (ikisi de sayılır —
       tablo abonelik değil GÜNLÜK). */
    insert into public.billing_subscriptions (organization_id,provider,plan_code,status,currency,unit_amount,product,created_at)
    values
      ('${KIRACI}','paytr','professional','active','TRY',120000,'arvoos', now() - interval '3 days'),
      ('${KIRACI}','paytr','professional','active','TRY',120000,'arvoos', now() - interval '40 days');

    /* Bireysel abone: kurumu yok, hepsi sayılır. Biri USD — para
       birimi karışıklığı ekranda uyarı olarak görünüyor. */
    /* Bireysel abone ürünün kendi veritabanındaki kimliğiyle
       eşleşiyor (external_user_id zorunlu ve uuid). */
    insert into public.product_subscribers (id,product,email,status,external_user_id)
      values ('${ABONE}','arvolab','abone@x.com','active',gen_random_uuid());
    insert into public.subscriber_payments (subscriber_id,provider,amount,currency,paid_at)
    values
      ('${ABONE}','paytr',30000,'TRY', now() - interval '5 days'),
      ('${ABONE}','paytr',1000,'USD', now() - interval '80 days');
  `);
});

test("üç kanal toplanıyor; bekleyen havale ve kendi markamız sayılmıyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    const o = await ozet();
    /* 1500 (havale) + 1200 + 1200 (kart) + 300 + 10 (abone) = 4210 TL.
       Bekleyen 9990 TL ve kendi markamıza ait 5000 TL dışarıda. */
    assert.equal(Number(o.toplam), 150000 + 120000 + 120000 + 30000 + 1000);
    assert.equal(Number(o.adet), 5);
  });
});

test("bu ay sınırı Türkiye saatiyle", async () => {
  await islem(db, async () => {
    await rol(db, "postgres");
    /*
      Ayın ilk gününün Türkiye gecesi (00:30) — UTC'de önceki ayın son
      günü 21:30. Ay sınırı UTC'ye göre hesaplanırsa bu tahsilat
      önceki aya düşer ve "bu ay" eksik çıkar.
    */
    await db.query(
      `insert into public.subscriber_payments (subscriber_id,provider,amount,currency,paid_at)
       values ($1,'paytr',7000,'TRY',
         (date_trunc('month', timezone('Europe/Istanbul', now())) + interval '30 minutes')
           at time zone 'Europe/Istanbul')`,
      [ABONE],
    );
    await rol(db, "authenticated", KURUCU);
    const o = await ozet();
    /* Bu ay: ayın ilk gecesindeki 70 TL + bu ay içinde kalan kayıtlar.
       Beklenen tutar TABLOYA soruluyor: tohumdaki "2 gün önce" gibi
       kayıtlar ayın başında bir önceki aya düşebiliyor. */
    const beklenen = (await tek(
      `with hepsi as (
         select r.amount, r.reviewed_at as tarih from public.organization_payment_requests r
           join public.organizations o on o.id = r.organization_id
          where r.status = 'approved' and coalesce(o.kind,'customer') <> 'internal'
         union all
         select b.unit_amount, b.created_at from public.billing_subscriptions b
           join public.organizations o on o.id = b.organization_id
          where coalesce(o.kind,'customer') <> 'internal'
         union all
         select s.amount, s.paid_at from public.subscriber_payments s
       )
       select coalesce(sum(amount),0)::bigint as tutar from hepsi
        where tarih is not null
          and timezone('Europe/Istanbul', tarih) >= date_trunc('month', timezone('Europe/Istanbul', now()))`,
    )).tutar;
    assert.equal(Number(o.bu_ay), Number(beklenen));
    assert.ok(Number(o.bu_ay) >= 7000, "ayın ilk gecesindeki tahsilat bu aya giriyor");
  });
});

test("para birimleri dizi olarak dönüyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    const o = await ozet();
    assert.deepEqual([...o.birimler].sort(), ["TRY", "USD"], "karışıklık gizlenmiyor, ekran uyarabiliyor");
  });
});

test("anon işlevi çağıramıyor", async () => {
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(db, `select public.platform_tahsilat_ozeti()`, [], /permission denied/i);
  });
});
