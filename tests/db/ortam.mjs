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

/** Canlı şemayla kurulmuş, boş bir veritabanı. */
export async function veritabani(semaDosyasi = SEMA) {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_KABUGU);
  await db.exec(fs.readFileSync(semaDosyasi, "utf8"));
  await db.exec(SUPABASE_VARSAYILAN_YETKI);
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
