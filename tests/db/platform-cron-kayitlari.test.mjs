/*
  ZAMANLANMIŞ İŞLERİN KOŞMA KAYDI.

  Beş cron ekosistemi taşıyor (posta eşitlemesi iki dakikada bir, ArvoARC
  ve Randevu köprüleri on dakikada, iş adımı terminleri ve abonelik
  hatırlatması her sabah) ve hiçbiri koştuğunu kaydetmiyordu: biri
  sessizce durduğunda belirti kullanıcıda çıkıyordu.

  Sınananlar:
  1. İşlev satırı yazıyor, süreyi kendisi hesaplıyor.
  2. BUDAMA: 14 günden eski kayıt gidiyor, öteki işin kaydına
     dokunulmuyor (budama is_adi içinde).
  3. Görünüm iş başına SON kaydı ve SON BAŞARILI koşmayı veriyor —
     ekrandaki gecikme son başarılıya göre ölçülüyor, yoksa her tur
     düşen bir iş "yeni koştu" diye yeşil görünür.
  4. KAPSAM: anon ne tabloyu ne görünümü okuyor, işlevi çağıramıyor;
     kiracının kendi yöneticisi de okuyamıyor (kurucuya özel veri).
     Kurucu okuyor.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { islem, migrationYetkileri, reddedilir, rol, veritabani } from "./ortam.mjs";

/*
  Tablo, işlev ve görünüm artık DÖKÜMDE (14.10.2026'da uygulandı), ama
  döküm TABLO ve GÖRÜNÜM yetkilerini taşımıyor ve düzenek Supabase
  varsayılanını taklit edip her ikisini de anon'a açıyor (AGENTS.md).
  Dosyayı listeden tamamen çıkarmak, aşağıdaki "anon okuyamıyor"
  senaryosunu hiçbir şey ölçmeyen ama yeşil kalan bir teste çevirirdi:
  o satırları ayakta tutan tek şey migration'ın kendi revoke/grant
  satırları. Bu yüzden yalnızca yetki satırları tekrarlanıyor.
  govde-tamam: DDL dökümden, yetkiler dosyadan.
*/
const YALNIZCA_YETKI = ["20261014173724_cron_kayitlari.sql"];

const ARVO = "00000000-0000-4000-8000-00000000c0a1";
const KIRACI = "00000000-0000-4000-8000-00000000c0a2";
const KURUCU = "00000000-0000-4000-8000-00000000c0b1";
const KIRACI_YONETICI = "00000000-0000-4000-8000-00000000c0b2";

const POSTA = "/api/cron/posta-esitleme";
const ARC = "/api/cron/arc-sync";

let db;

before(async () => {
  db = await veritabani();
  await migrationYetkileri(db, YALNIZCA_YETKI);
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values
      ('${KURUCU}','kurucu@arvo-os.com'),('${KIRACI_YONETICI}','yonetici@kiraci.com');
    insert into public.plans (code, name, description) values ('professional','P','');
    /* Kurucu kontrolü slug'a bakıyor: 'arvo-os' kurumunun owner'ı. */
    insert into public.organizations (id,name,slug,status,plan_code,kind) values
      ('${ARVO}','ArvoOS','arvo-os','active','professional','internal'),
      ('${KIRACI}','Akademik Merkez','akademik','active','professional','customer');
    insert into public.organization_memberships (organization_id,user_id,role,is_active) values
      ('${ARVO}','${KURUCU}','owner',true),
      ('${KIRACI}','${KIRACI_YONETICI}','owner',true);
  `);
});

test("işlev satır yazıyor ve süreyi kendisi hesaplıyor", async () => {
  await rol(db, "postgres");
  await db.exec(`delete from public.platform_cron_kayitlari;`);
  await db.query(
    `select public.platform_cron_kaydet($1, now() - interval '3 seconds', 'tamam', $2::jsonb)`,
    [POSTA, JSON.stringify({ kutu: 4, mesaj: 11 })],
  );
  const { rows } = await db.query(
    `select is_adi, sonuc, sure_ms, bitti_at, ayrinti from public.platform_cron_kayitlari`,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].is_adi, POSTA);
  assert.equal(rows[0].sonuc, "tamam");
  assert.ok(rows[0].bitti_at, "bitiş zamanı yazılıyor");
  // Süre çağıranın söylediği başlangıçtan ölçülüyor; yaklaşık 3 saniye.
  assert.ok(rows[0].sure_ms >= 2900 && rows[0].sure_ms < 10000, `süre beklenmedik: ${rows[0].sure_ms}`);
  assert.equal(rows[0].ayrinti.mesaj, 11, "işin sayaçları saklanıyor");
});

test("sonuç üç değerli; dördüncüsü reddediliyor", async () => {
  await rol(db, "postgres");
  for (const sonuc of ["tamam", "eksik", "hata"]) {
    await db.query(`select public.platform_cron_kaydet($1, now(), $2, '{}'::jsonb)`, [ARC, sonuc]);
  }
  await islem(db, async () => {
    await reddedilir(
      db,
      `insert into public.platform_cron_kayitlari (is_adi, sonuc) values ($1, 'yarim')`,
      [ARC],
      /check|constraint/i,
    );
  });
});

/*
  BUDAMA. Posta eşitlemesi günde ~720 kayıt yazıyor; sınırsız büyüyen bir
  günlük tablosu kimsenin bakmadığı yerde şişer. Budamanın is_adi içinde
  olması önemli: bir işin yazması öteki işin geçmişini silmemeli.
*/
test("14 günden eski kayıt budanıyor, öteki işin kaydına dokunulmuyor", async () => {
  await rol(db, "postgres");
  await db.exec(`delete from public.platform_cron_kayitlari;`);
  await db.exec(`
    insert into public.platform_cron_kayitlari (is_adi, basladi_at, sonuc) values
      ('${POSTA}', now() - interval '20 days', 'tamam'),
      ('${POSTA}', now() - interval '13 days', 'tamam'),
      ('${ARC}',   now() - interval '30 days', 'tamam');
  `);
  await db.query(`select public.platform_cron_kaydet($1, now(), 'tamam', '{}'::jsonb)`, [POSTA]);

  const { rows } = await db.query(
    `select is_adi, count(*)::int as adet from public.platform_cron_kayitlari group by is_adi order by is_adi`,
  );
  const adet = Object.fromEntries(rows.map((r) => [r.is_adi, r.adet]));
  assert.equal(adet[POSTA], 2, "20 günlük gitti, 13 günlük ve yeni kayıt kaldı");
  assert.equal(adet[ARC], 1, "başka işin eski kaydı budanmadı");
});

/*
  Gecikme SON BAŞARILI koşmaya göre ölçülüyor (lib/cron-isleri): her tur
  düşen bir iş yalnızca "son koşma"ya bakıldığında yeni koşmuş görünür,
  oysa iş hiç yapılmıyor. Görünüm iki tarihi ayrı veriyor.
*/
test("görünüm iş başına son kaydı ve son BAŞARILI koşmayı veriyor", async () => {
  await rol(db, "postgres");
  await db.exec(`
    delete from public.platform_cron_kayitlari;
    insert into public.platform_cron_kayitlari (is_adi, basladi_at, sonuc, ayrinti) values
      ('${POSTA}', now() - interval '3 hours',  'tamam', '{}'),
      ('${POSTA}', now() - interval '2 hours',  'hata',  '{"hata":"kutu açılamadı"}'),
      ('${POSTA}', now() - interval '1 minute', 'hata',  '{"hata":"kutu açılamadı"}'),
      ('${ARC}',   now() - interval '5 minutes','tamam', '{}');
  `);
  await islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    const { rows } = await db.query(
      `select is_adi, sonuc, ayrinti,
              extract(epoch from (now() - son_calisma))/60 as calisma_dk,
              extract(epoch from (now() - son_basarili))/60 as basarili_dk
         from public.platform_cron_durumu order by is_adi`,
    );
    assert.equal(rows.length, 2, "iş başına tek satır");
    const posta = rows.find((r) => r.is_adi === POSTA);
    assert.equal(posta.sonuc, "hata", "son kaydın sonucu");
    assert.equal(posta.ayrinti.hata, "kutu açılamadı");
    assert.ok(Number(posta.calisma_dk) < 5, "son koşma bir dakika önce");
    assert.ok(Number(posta.basarili_dk) > 150, "son BAŞARILI koşma üç saat önce");
  });
});

test("hiç başarılı koşmamış işte son_basarili boş", async () => {
  await rol(db, "postgres");
  await db.exec(`
    delete from public.platform_cron_kayitlari;
    insert into public.platform_cron_kayitlari (is_adi, basladi_at, sonuc)
      values ('${POSTA}', now() - interval '2 minutes', 'hata');
  `);
  await islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    const { rows } = await db.query(`select son_basarili from public.platform_cron_durumu`);
    assert.equal(rows[0].son_basarili, null);
  });
});

/*
  KAPSAM. Kurucuya özel veri: hangi işin ne zaman düştüğü kiracıyı
  ilgilendirmiyor ve dışarıya sistemin iç işleyişini anlatıyor. Döküm
  tablo/görünüm yetkilerini taşımadığı ve düzenek Supabase varsayılanını
  taklit ettiği için (AGENTS.md) bu senaryoyu ayakta tutan tek şey
  migration'ın kendi revoke satırı ve RLS politikası.
*/
test("anon okuyamıyor, kayıt da yazamıyor", async () => {
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(db, `select * from public.platform_cron_durumu`, [], /permission denied|policy/i);
  });
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(db, `select * from public.platform_cron_kayitlari`, [], /permission denied|policy/i);
  });
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(
      db,
      `select public.platform_cron_kaydet('${POSTA}', now(), 'tamam', '{}'::jsonb)`,
      [],
      /permission denied/i,
    );
  });
});

test("kiracının yöneticisi okuyamıyor, kurucu okuyor", async () => {
  await rol(db, "postgres");
  await db.exec(`
    delete from public.platform_cron_kayitlari;
    insert into public.platform_cron_kayitlari (is_adi, basladi_at, sonuc)
      values ('${POSTA}', now(), 'tamam');
  `);
  await islem(db, async () => {
    await rol(db, "authenticated", KIRACI_YONETICI);
    const { rows } = await db.query(`select * from public.platform_cron_kayitlari`);
    assert.equal(rows.length, 0, "RLS kiracı yöneticisine satır vermiyor");
  });
  await islem(db, async () => {
    await rol(db, "authenticated", KURUCU);
    const { rows } = await db.query(`select * from public.platform_cron_kayitlari`);
    assert.equal(rows.length, 1, "kurucu okuyor");
  });
});

test("kiracının yöneticisi kayıt yazamıyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", KIRACI_YONETICI);
    await reddedilir(
      db,
      `select public.platform_cron_kaydet('${POSTA}', now(), 'tamam', '{}'::jsonb)`,
      [],
      /permission denied/i,
    );
  });
});
