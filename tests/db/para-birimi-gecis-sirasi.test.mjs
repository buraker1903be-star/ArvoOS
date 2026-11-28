/*
  MIGRATION BAĞIMLILIKLARI VE UYGULAMA SIRASI (28.11.2026).

  Çok para birimi dört migration'la geliyor ve canlıya SQL Editor'den
  ELLE uygulanıyor (02.11.2026'da bir migration dört gün uygulanmadan
  kaldı). Sıra yoruma yazılmakla kalmamalı: hangi dosya hangisine
  gerçekten bağlı, ÖLÇÜLEREK sabitleniyor.

  Ölçülen dört şey:

   1. 20261128122145 (bileşik anahtar) 20261128114027'ye BAĞLI —
      `para_birimi` sütunu olmadan uygulanamıyor, uygulama anında
      hata veriyor.
   2. 20261128122230 (ödeme denetimi) 20261128120350'ye BAĞLI, ama
      bağımlılık SESSİZ: plpgsql gövdesi sütunları çalışma anında
      denetliyor, yani migration HATASIZ uygulanıp ilk ödeme onayında
      düşüyor (AGENTS.md: "plpgsql gövdesi sütunları çalışma anında
      denetler"). En tehlikeli sıra hatası bu, çünkü uygulandı
      sanılıyor.
   3. 114027/122145 (fiyat) ile 120350/122230 (lisans ve ödeme) BİRBİRİNE
      BAĞLI DEĞİL: fiyat tarafı hiç uygulanmamışken ödeme denetimi
      çalışıyor.
   4. Tam sırada hepsi çalışıyor.

  Sıra bu yüzden: 114027 → 120350 → 122145 → 122230. İkisi fiyat,
  ikisi para; her çiftin içinde sıra ZORUNLU, çiftler arasında serbest.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { BEKLEYEN_MIGRATIONLAR, rol, SEMA, veritabani } from "./ortam.mjs";

const FIYAT_1 = "20261128114027_fiyat_listesi_para_birimi.sql";
const LISANS = "20261128120350_lisans_para_birimi_ve_usd_anahtari.sql";
const FIYAT_2 = "20261128122145_fiyat_para_birimi_anahtari.sql";
const ODEME = "20261128122230_odeme_para_birimi_dogrulamasi.sql";
const YENILER = new Set([FIYAT_1, LISANS, FIYAT_2, ODEME]);

/* Geçiş öncesi taban: dördü dışındaki bütün bekleyen migration'lar.
   govde-tamam: taban bilerek geçiş öncesi hâlde — ölçülen şey tam
   olarak "bu dosyalar olmadan ne olur" sorusu. */
const TABAN = BEKLEYEN_MIGRATIONLAR.filter((ad) => !YENILER.has(ad));

const KURUCU = "00000000-0000-4000-8000-00000000d001";
const ARVO = "00000000-0000-4000-8000-00000000d0a1";
const MUSTERI = "00000000-0000-4000-8000-00000000d0a2";

/** Lisansı ve kurucuyu kurar; ödeme onayı yolunu çağırmaya hazırlar. */
async function odemeKur(db) {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${KURUCU}','kurucu@arvo-os.com');
    insert into public.plans (code,name,description) values
      ('starter','Başlangıç',''), ('professional','Profesyonel','') on conflict (code) do nothing;
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${ARVO}','ArvoOS','arvo-os','active','starter'),
      ('${MUSTERI}','Müşteri','musteri','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role,is_active) values
      ('${ARVO}','${KURUCU}','owner',true);
    /* Lisans satırını kurumla birlikte bir tetikleyici açıyor; burada
       yalnızca sınanan duruma getiriliyor. */
    update public.organization_licenses
       set plan_code = 'professional', license_status = 'trialing', monthly_fee = 199000,
           current_period_end = null, updated_at = now()
     where organization_id = '${MUSTERI}';
  `);
}

test("1 · bileşik anahtar migration'ı sütun migration'ı olmadan UYGULANAMIYOR", async () => {
  await assert.rejects(
    () => veritabani(SEMA, [...TABAN, FIYAT_2]),
    /para_birimi/i,
    "20261128122145, 20261128114027 olmadan hata vermeli",
  );
});

test("2 · ödeme denetimi lisans migration'ı olmadan UYGULANAMIYOR (ön koşul bloğu)", async () => {
  /*
    Sıra hatasının en sinsi hâli bu olurdu: plpgsql gövdesi
    oluşturulurken sütunlar denetlenmiyor, yani migration hata vermez,
    SQL Editor "Success" der ve iş ilk havale onayında düşer — sebep
    yalnızca sunucu günlüğünde. Bu yüzden 20261128122230'un başına bir
    ÖN KOŞUL bloğu konuldu: eksik sıra artık uygulama anında, Türkçe
    bir mesajla düşüyor.
  */
  await assert.rejects(
    () => veritabani(SEMA, [...TABAN, ODEME]),
    /Önce 20261128120350 uygulanmalı/i,
    "ön koşul bloğu sırayı uygulama anında denetliyor",
  );
});

test("3 · fiyat tarafı hiç uygulanmamışken ödeme denetimi çalışıyor (çiftler bağımsız)", async () => {
  const db = await veritabani(SEMA, [...TABAN, LISANS, ODEME]);
  await odemeKur(db);
  await rol(db, "postgres");
  const son = (await db.query(
    `select private.arvo_activate_license_period($1, 'professional', 199000, 'TRY', 'manual', $2) as s`,
    [MUSTERI, KURUCU])).rows[0].s;
  assert.ok(son, "dönem uzadı");
  const l = (await db.query(
    "select para_birimi, license_status from public.organization_licenses where organization_id = $1", [MUSTERI])).rows[0];
  assert.equal(l.para_birimi, "TRY");
  assert.equal(l.license_status, "active");

  /* Fiyat listesi hâlâ tek anahtarlı: fiyat tarafı uygulanmadı. */
  const anahtar = (await db.query(`
    select count(*)::int as n from pg_constraint c
     where c.conrelid = 'public.platform_fiyat_listesi'::regclass and c.contype = 'p'
       and array_length(c.conkey, 1) = 2`)).rows[0].n;
  assert.equal(Number(anahtar), 0, "bileşik anahtar yok");
});

test("4 · fiyat çifti kendi içinde sırayla uygulanınca çalışıyor (ödeme çifti olmadan)", async () => {
  const db = await veritabani(SEMA, [...TABAN, FIYAT_1, FIYAT_2]);
  await rol(db, "postgres");
  const anahtar = (await db.query(`
    select string_agg(a.attname, ',' order by k.ord) as sutunlar
      from pg_constraint c
      join lateral unnest(c.conkey) with ordinality as k(attnum, ord) on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
     where c.conrelid = 'public.platform_fiyat_listesi'::regclass and c.contype = 'p'`)).rows[0].sutunlar;
  assert.equal(anahtar, "kod,para_birimi");
  /* Lisans sütunu YOK: ödeme çifti uygulanmadı ve fiyat tarafı onu
     hiç aramıyor. */
  const sutun = (await db.query(`
    select count(*)::int as n from information_schema.columns
     where table_schema = 'public' and table_name = 'organization_licenses' and column_name = 'para_birimi'`)).rows[0].n;
  assert.equal(Number(sutun), 0);
});

test("5 · TAM SIRA: 114027 → 120350 → 122145 → 122230 hepsi çalışıyor", async () => {
  const db = await veritabani(SEMA, [...TABAN, FIYAT_1, LISANS, FIYAT_2, ODEME]);
  await odemeKur(db);
  await rol(db, "postgres");
  const son = (await db.query(
    `select private.arvo_activate_license_period($1, 'professional', 199000, 'TRY', 'manual', $2) as s`,
    [MUSTERI, KURUCU])).rows[0].s;
  assert.ok(son);
  await db.exec(`
    delete from public.platform_fiyat_listesi where kod = 'sira-testi';
    insert into public.platform_fiyat_listesi (kod, para_birimi, tur, aylik_kurus, taslak_bekliyor, updated_at)
    values ('sira-testi', 'TRY', 'plan', 100, false, now()),
           ('sira-testi', 'USD', 'plan', 10, false, now());
  `);
  const n = (await db.query(
    "select count(*)::int as n from public.platform_fiyat_listesi where kod = 'sira-testi'")).rows[0].n;
  assert.equal(Number(n), 2, "iki birim birlikte duruyor");
});
