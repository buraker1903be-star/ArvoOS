// Veritabanı akış testlerinin ortamı: canlı şemayı (supabase/schema/canli-sema.sql)
// PGlite'a kurar; üzerine Supabase'in sağladığı parçaları taklit eder.
//
// Neden: 19.09.2026'da bir tetikleyici müşterinin teklif onayını canlıda kırdı;
// değişiklik yalnızca saldırı senaryolarıyla sınanmıştı. Bu testler gerçek
// fonksiyon gövdeleriyle müşteri akışını da sınar (bkz. AGENTS.md "Veritabanı").
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import fs from "node:fs";
import path from "node:path";

// Supabase'in hazır getirdikleri: roller, auth şeması, pgcrypto (extensions).
const SUPABASE_KABUGU = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid, aud text, role text,
  email text, encrypted_password text,
  email_confirmed_at timestamptz, phone text, phone_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{}'::jsonb,
  last_sign_in_at timestamptz, banned_until timestamptz, deleted_at timestamptz,
  is_anonymous boolean not null default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select coalesce(auth.jwt() ->> 'role', current_user) $$;
grant usage on schema auth, extensions, private, public to anon, authenticated, service_role;
grant execute on all functions in schema auth, extensions to anon, authenticated, service_role;
`;

// Supabase public şemasındaki tablolara bu üç role varsayılan olarak her hakkı
// verir; asıl kapıyı RLS tutar. Döküm tablo yetkilerini içermeyebilir.
const SUPABASE_VARSAYILAN_YETKI = `
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
`;

export const SEMA = path.resolve(import.meta.dirname, "../../supabase/schema/canli-sema.sql");

/*
  ANLIK GÖRÜNTÜDEN SONRA GELEN MIGRATION'LAR.

  Döküm canlıdan alınıyor; canlıya uygulanmış ama dökümü henüz
  alınmamış bir migration varsa her test onsuz koşar. Buradakiler
  BÜTÜN akış testlerine uygulanıyor — tek bir dosyanın listesine
  koymak, aynı kuralı sınamayan yirmi testi kuralsız bırakırdı.

  Döküm yenilenince bu liste BOŞALTILIR: dolu kalırsa migration iki kez
  uygulanır ve (bir işlevi yeniden yaratan migration'da) anlık
  görüntüdeki yeni gövdeyi eskisine döndürebilir — npm run
  check:db-testleri tam bunu arıyor.
*/
export const BEKLEYEN_MIGRATIONLAR = [
  // Şu an boş: döküm 11.10.2026'da yenilendi, canlıdaki her şey anlık
  // görüntüde. Dolu bırakmak migration'ı iki kez uygulamak demek.
];

/** Yetki satırları (grant/revoke), dosyadaki özgün sırasıyla. */
const yetkiSatirlari = (sql) => sql.match(/^\s*(?:grant|revoke)\s[^;]*;/gim) ?? [];

/**
 * Bir migration'ın YALNIZCA yetki satırlarını uygular.
 *
 * Döküm yenilenince migration'ın DDL'i anlık görüntünün içine giriyor ve
 * dosyayı bütün olarak yeniden uygulamak çakışıyor: 13.10.2026'da
 * 20261012131639 böyle düştü (`create function arvo_tracking_guard` —
 * işlev dökümde zaten vardı, `create or replace` değil `create` yazıyor).
 *
 * Dosyayı test listesinden tamamen çıkarmak da yanlış: döküm TABLO ve
 * SÜTUN yetkilerini taşımıyor, düzenek de Supabase varsayılanını taklit
 * edip her tabloyu anon'a açıyor. O migration'ın
 * `revoke all on table … from anon` satırı gitseydi "anon erişemiyor"
 * senaryosu hiçbir şey ölçmeyen, ama yeşil kalan bir teste dönerdi.
 *
 * Bu yüzden DDL atlanıp yalnızca grant/revoke satırları tekrarlanıyor.
 */
export async function migrationYetkileri(db, dosyaAdlari) {
  for (const ad of dosyaAdlari) {
    const sql = fs.readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations/", ad), "utf8");
    for (const satir of yetkiSatirlari(sql)) await db.exec(satir);
  }
}

/**
 * Supabase varsayılanını kurar, sonra verilen dosyaların yetki
 * satırlarını özgün sırasıyla tekrarlar — canlıdaki son durum bu.
 */
async function yetkileriKur(db, dosyalar) {
  await db.exec(SUPABASE_VARSAYILAN_YETKI);
  for (const sql of dosyalar) {
    for (const satir of yetkiSatirlari(sql)) await db.exec(satir);
  }
}

/** Canlı şemayla kurulmuş, boş bir veritabanı. */
export async function veritabani(semaDosyasi = SEMA) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_KABUGU);
  const sema = fs.readFileSync(semaDosyasi, "utf8");
  await db.exec(sema);
  /*
    YETKİLER EN SONDA, CANLIDAKİ SIRAYLA KURULUR.

    `yetkileriKur` önce Supabase'in varsayılanını (her tabloya her hak)
    kurar, sonra dökümün ve bekleyen migration'ların grant/revoke
    satırlarını özgün sırasıyla tekrarlar. Üç şey bunu gerektirdi:

    1. Toplu grant tek başına, dökümde bilerek yazılmış "revoke … from
       anon" satırlarını eziyordu: anlık görüntüde kapalı olan bir
       görünüm testte anon'a açık görünüyor, "bu anon'a kapalı mı" diye
       soran test yanlış yere geçiyordu.
    2. Yalnızca revoke'ları tekrarlamak yetmez: bir revoke kendisinden
       önce gelen grant'i de siler (ops_* görünümlerinde yaşandı). O
       yüzden grant ve revoke satırlarının TAMAMI, sırasıyla.
    3. Bekleyen migration'lar eskiden dökümün hemen ardından, toplu
       grant'ten ÖNCE uygulanıyordu: migration kendi görünümünü
       kapatsa bile arkadan gelen toplu grant onu geri açıyordu.
       Canlıda sıra tersi. 11.10.2026'da yorum yan sorgusu
       migration'ında yakalandı: "anon görünüme erişemiyor" testi,
       canlıda var olmayan bir açıklık yüzünden düştü — yanlış yöne de
       düşebilirdi, kapalı olanı açık sanan bir test sessizce geçerdi.

    Toplu grant bekleyen migration'lardan sonra çalışıyor, çünkü
    Supabase yeni yaratılan tabloya varsayılanı kendisi veriyor.
  */
  const bekleyen = BEKLEYEN_MIGRATIONLAR.map((ad) =>
    fs.readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations/", ad), "utf8"),
  );
  for (const dosya of bekleyen) await db.exec(dosya);
  await yetkileriKur(db, [sema, ...bekleyen]);
  return db;
}

/**
 * Bir işlemi Supabase'teki gibi belirli bir rol ve kullanıcıyla çalıştırır:
 * anon (müşteri, oturumsuz), authenticated (panel kullanıcısı) ya da
 * service_role. İşlem sonunda geri alınır; testler birbirini kirletmez.
 */
export async function olarak(db, rol, kullaniciId, isle) {
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: kullaniciId ?? "", role: rol }),
    ]);
    await db.exec(`set local role ${rol}`);
    return await isle();
  } finally {
    await db.exec("rollback");
  }
}

/**
 * Tek işlem içinde birden çok rol arasında geçen akışlar için (personel teklifi
 * hazırlar → müşteri imzalar → personel tahsil eder). İşlem sonunda geri alınır.
 */
export async function islem(db, isle) {
  await db.exec("begin");
  try {
    return await isle();
  } finally {
    await db.exec("rollback");
  }
}

/**
 * İşlem içinde rol değiştirir. "postgres" veritabanı sahibidir: istek bağlamı
 * yoktur, korumalar onu sunucu tarafı gibi görür (tohum ve doğrulama için).
 */
export async function rol(db, ad, kullaniciId = null) {
  await db.exec("reset role");
  const claims = ad === "postgres" ? "" : JSON.stringify({ sub: kullaniciId ?? "", role: ad });
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
  if (ad !== "postgres") await db.exec(`set local role ${ad}`);
}

/** Sorgunun hata vermesini bekler; işlemi bozmadan (savepoint) döner. */
export async function reddedilir(db, sql, params, desen) {
  await db.exec("savepoint beklenen_hata");
  try {
    await db.query(sql, params);
  } catch (hata) {
    await db.exec("rollback to savepoint beklenen_hata");
    if (!desen.test(hata.message)) {
      throw new Error(`Beklenmeyen hata: ${hata.message} (beklenen ${desen})`);
    }
    return hata;
  }
  await db.exec("release savepoint beklenen_hata");
  throw new Error(`Sorgu reddedilmeliydi: ${sql}`);
}
