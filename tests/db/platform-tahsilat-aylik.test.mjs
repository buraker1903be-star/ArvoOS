/*
  PLATFORM TAHSİLATI AY AY (konsolun Tahsilat ekranındaki grafik).

  Sınananlar:
  1. Ay sınırı TÜRKİYE saatiyle: ayın ilk gecesi (UTC'de önceki ayın
     son akşamı) yazılan tahsilat yeni aya giriyor.
  2. Tahsilat kuralı özet işleviyle aynı: kendi markamız ve grup
     markası sayılmıyor, bireysel abone sayılıyor.
  3. Bekleyen havale "bekleyen", onaylı olan "tahsilat" serisinde;
     birbirine karışmıyor.
  4. Proforma serisi yalnızca ödenmemiş ve süresi geçmemiş proformalar.
  5. Seri boş ayları da sıfırla taşıyor (ekran boşluğu dolduruyor
     sanmasın) ve istenen ay sayısı kadar.
  6. Yalnızca service_role çağırabiliyor: proforma tablosu istemciye
     kapalı, işlev invoker.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20261029152535_platform_tahsilat_aylik.sql");

const ARVO = "00000000-0000-4000-8000-00000000c1a1";
const KIRACI = "00000000-0000-4000-8000-00000000c1a2";
const GRUP = "00000000-0000-4000-8000-00000000c1a3";
const KURUCU = "00000000-0000-4000-8000-00000000c1b1";
const ABONE = "00000000-0000-4000-8000-00000000c1c1";
const HESAP = "00000000-0000-4000-8000-00000000c1d1";

let db;
const satirlar = async (ay = 12) => (await db.query(`select * from public.platform_tahsilat_aylik($1)`, [ay])).rows;
// Bu ayın ve geçen ayın ilk günü, Türkiye takvimiyle (beklenen değer veritabanına sorulur, elle hesaplanmaz).
const ayBasi = async (geri) => (await db.query(
  `select to_char(date_trunc('month', timezone('Europe/Istanbul', now())) - make_interval(months => $1), 'YYYY-MM-DD') as ay`, [geri],
)).rows[0].ay;
const ayi = (liste, ay) => liste.find((s) => s.ay.toISOString().slice(0, 10) === ay);

before(async () => {
  db = await veritabani();
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${KURUCU}','kurucu@arvo-os.com');
    insert into public.plans (code, name, description) values ('professional','P','');
    insert into public.organizations (id,name,slug,status,plan_code,kind,grup_markasi) values
      ('${ARVO}','ArvoOS','arvo-os','active','professional','internal',false),
      ('${KIRACI}','Akademik Merkez','akademik','active','professional','customer',false),
      ('${GRUP}','Grup','grup','active','professional','customer',true);
    insert into public.platform_bank_accounts (id,bank_name,iban,updated_at) values ('${HESAP}','Banka','TR000000000000000000000000',now());

    insert into public.organization_payment_requests (organization_id,plan_code,amount,currency,status,submitted_by,reviewed_at,created_at,product,receipt_path,bank_account_id)
    values
      -- Bu ayın ilk gecesi 01:30 (Türkiye) = UTC'de önceki ayın son günü 22:30: BU aya girmeli.
      ('${KIRACI}','professional',100000,'TRY','approved','${KURUCU}',
        (date_trunc('month', timezone('Europe/Istanbul', now())) + interval '90 minutes') at time zone 'Europe/Istanbul', now(),'arvoos','d/1','${HESAP}'),
      -- Geçen ay onaylanan.
      ('${KIRACI}','professional',200000,'TRY','approved','${KURUCU}',
        (date_trunc('month', timezone('Europe/Istanbul', now())) - interval '10 days') at time zone 'Europe/Istanbul', now(),'arvoos','d/2','${HESAP}'),
      -- Bekleyen havale: bu ay bildirildi.
      ('${KIRACI}','professional',50000,'TRY','pending','${KURUCU}', null, now(),'arvoos','d/3','${HESAP}'),
      -- Kendi markamız ve grup markası: hiçbir seriye girmez.
      ('${ARVO}','professional',999000,'TRY','approved','${KURUCU}', now(), now(),'arvoos','d/4','${HESAP}'),
      ('${GRUP}','professional',888000,'TRY','approved','${KURUCU}', now(), now(),'arvoos','d/5','${HESAP}'),
      ('${GRUP}','professional',777000,'TRY','pending','${KURUCU}', null, now(),'arvoos','d/6','${HESAP}');

    insert into public.product_subscribers (id,product,email,status,external_user_id)
      values ('${ABONE}','arvolab','abone@x.com','active',gen_random_uuid());
    insert into public.subscriber_payments (subscriber_id,provider,amount,currency,paid_at)
      values ('${ABONE}','paytr',30000,'TRY', now());

    /* Proformalar: biri bekliyor ve geçerli (sayılır), biri süresi geçmiş,
       biri iptal (ikisi de sayılmaz). Düzenleme günü bu ayın ilk günü. */
    insert into public.platform_proformalari (product,organization_id,musteri_adi,kalemler,ara_toplam,kdv_orani,kdv,toplam,duzenleme_tarihi,gecerlilik_tarihi,durum)
    values
      ('arvoos','${KIRACI}','Akademik','[{"aciklama":"a","miktar":1,"birim_fiyat":100000}]',100000,20,20000,120000,
        date_trunc('month', timezone('Europe/Istanbul', now()))::date, timezone('Europe/Istanbul', now())::date + 5,'bekliyor'),
      ('arvoos','${KIRACI}','Akademik','[{"aciklama":"a","miktar":1,"birim_fiyat":100000}]',100000,20,20000,120000,
        date_trunc('month', timezone('Europe/Istanbul', now()))::date - 40, date_trunc('month', timezone('Europe/Istanbul', now()))::date - 30,'bekliyor'),
      ('arvoos','${KIRACI}','Akademik','[{"aciklama":"a","miktar":1,"birim_fiyat":100000}]',100000,20,20000,120000,
        date_trunc('month', timezone('Europe/Istanbul', now()))::date, timezone('Europe/Istanbul', now())::date + 5,'iptal');
  `);
});

test("ay sınırı Türkiye saatiyle; tahsilat kuralı özet işleviyle aynı", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    const liste = await satirlar();
    const buAy = ayi(liste, await ayBasi(0));
    const gecen = ayi(liste, await ayBasi(1));
    // 1000 (ayın ilk gecesi) + 300 (abone); kendi markamız ve grup dışarıda.
    assert.equal(Number(buAy.tahsilat), 100000 + 30000);
    assert.equal(buAy.tahsilat_adet, 2);
    assert.equal(Number(gecen.tahsilat), 200000);
  });
});

test("bekleyen havale ve geçerli proforma kendi serisinde", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    const liste = await satirlar();
    const buAy = ayi(liste, await ayBasi(0));
    assert.equal(Number(buAy.bekleyen), 50000, "grup markasının bekleyeni dışarıda");
    assert.equal(buAy.bekleyen_adet, 1);
    assert.equal(Number(buAy.proforma), 120000, "iptal ve süresi geçen dışarıda");
    assert.equal(liste.reduce((t, s) => t + s.proforma_adet, 0), 1);
  });
});

test("seri istenen ay kadar, boş aylar sıfırla, eskiden yeniye", async () => {
  await islem(db, async () => {
    await rol(db, "service_role");
    const liste = await satirlar(6);
    assert.equal(liste.length, 6);
    assert.equal(liste.at(-1).ay.toISOString().slice(0, 10), await ayBasi(0));
    assert.equal(Number(liste[0].tahsilat), 0);
  });
});

test("istemci rolleri işlevi çağıramıyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    await reddedilir(db, `select * from public.platform_tahsilat_aylik(12)`, [], /permission denied/i);
  });
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(db, `select * from public.platform_tahsilat_aylik(12)`, [], /permission denied/i);
  });
});
