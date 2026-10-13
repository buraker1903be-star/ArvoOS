/*
  İŞİN EKİP İÇİ DOSYALARI (20261013065421) — sahadan fotoğraf/belge.

  Sınananlar:
  1. MEŞRU yol: işin sorumlusu (yönetici değil) dosyayı kovaya yükleyip
     kaydını ekliyor; yükleyen sunucuda damgalanıyor. Yönetici de görüyor.
  2. İşi göremeyen personel (başka işin sorumlusu) ne kaydı görüyor ne
     kovaya o işin klasörüne yazabiliyor; başka kurum ve anon hiç.
  3. Kayıt değişmez: yalnızca not; kaldırılan dosya geri açılamaz.
  4. Yol kapsamı: başka işin klasörüne kayıt açılamıyor.

  Depo (storage) şeması test düzeneğinde yok: Supabase'teki tabloların
  ve storage.foldername'in en küçük taklidi burada kuruluyor; kova
  politikaları gerçek RLS ile sınanıyor.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = ["20261013065421_is_ekip_dosyalari.sql"];

const KURUM = "00000000-0000-4000-8000-00000000f701";
const OTEKI = "00000000-0000-4000-8000-00000000f702";
const SAHIP = "00000000-0000-4000-8000-00000000f711";
const SAHACI = "00000000-0000-4000-8000-00000000f712";
const DIGER = "00000000-0000-4000-8000-00000000f713";
const YABANCI = "00000000-0000-4000-8000-00000000f714";
const SAHACI_PERSONEL = "00000000-0000-4000-8000-00000000f721";
const DIGER_PERSONEL = "00000000-0000-4000-8000-00000000f722";
const IS = "00000000-0000-4000-8000-00000000f731";
const DIGER_IS = "00000000-0000-4000-8000-00000000f732";

const DEPO_TAKLIDI = `
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, delete on storage.objects to authenticated;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
`;

let db;
before(async () => {
  db = await veritabani();
  await db.exec(DEPO_TAKLIDI);
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values
      ('${SAHIP}','sahip@x.com'),('${SAHACI}','saha@x.com'),('${DIGER}','diger@x.com'),('${YABANCI}','yabanci@y.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${KURUM}','AM','am','active','starter'),('${OTEKI}','Öteki','oteki','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${SAHACI}','operasyoncu'),('${KURUM}','${DIGER}','operasyoncu'),('${OTEKI}','${YABANCI}','owner');
    insert into public.hr_employees (id,organization_id,user_id,full_name,employment_status) values
      ('${SAHACI_PERSONEL}','${KURUM}','${SAHACI}','Saha','active'),('${DIGER_PERSONEL}','${KURUM}','${DIGER}','Diğer','active');
    insert into public.operation_workflows (id,organization_id,title,status,assigned_employee_id,created_by) values
      ('${IS}','${KURUM}','Tez','in_progress','${SAHACI_PERSONEL}','${SAHIP}'),
      ('${DIGER_IS}','${KURUM}','Makale','in_progress','${DIGER_PERSONEL}','${SAHIP}');
  `);
});

const yol = (isId, ad = "11111111-1111-4111-8111-111111111111.jpg") => `${KURUM}/${isId}/${ad}`;
const kovayaYaz = (isId) => db.query(`insert into storage.objects (bucket_id, name) values ('operation-team-files', $1)`, [yol(isId)]);
const kayitAc = (isId, ad = "11111111-1111-4111-8111-111111111111.jpg") => db.query(
  `insert into public.operation_team_files (organization_id, workflow_id, storage_path, file_name, mime_type, size_bytes)
   values ($1, $2, $3, 'saha.jpg', 'image/jpeg', 2048) returning id, uploaded_by`, [KURUM, isId, yol(isId, ad)]);

describe("meşru yol", () => {
  test("işin sorumlusu kovaya yükleyip kaydı ekliyor; yükleyen damgalanıyor; yönetici görüyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHACI);
      await kovayaYaz(IS);
      const { rows } = await kayitAc(IS);
      assert.equal(rows[0].uploaded_by, SAHACI, "yükleyen damgalanmadı");
      await rol(db, "authenticated", SAHIP);
      const gorunen = await db.query(`select 1 from public.operation_team_files where workflow_id = $1`, [IS]);
      assert.equal(gorunen.rows.length, 1, "yönetici dosyayı göremedi");
      const nesne = await db.query(`select 1 from storage.objects where bucket_id = 'operation-team-files'`);
      assert.equal(nesne.rows.length, 1, "yönetici kovadaki nesneyi göremedi");
    }));
});

describe("yetki", () => {
  test("işi göremeyen personel kaydı görmüyor, kovaya o işe yazamıyor, kayıt açamıyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHACI);
      await kovayaYaz(IS);
      await kayitAc(IS);
      await rol(db, "authenticated", DIGER);
      assert.equal((await db.query(`select 1 from public.operation_team_files`)).rows.length, 0, "başka işin personeli dosyayı gördü");
      assert.equal((await db.query(`select 1 from storage.objects`)).rows.length, 0, "başka işin personeli nesneyi gördü");
      await reddedilir(db, `insert into storage.objects (bucket_id, name) values ('operation-team-files', $1)`, [yol(IS, "22222222-2222-4222-8222-222222222222.jpg")], /row-level security/);
      await reddedilir(db,
        `insert into public.operation_team_files (organization_id, workflow_id, storage_path, file_name, mime_type, size_bytes) values ($1, $2, $3, 'x.jpg', 'image/jpeg', 1)`,
        [KURUM, IS, yol(IS, "33333333-3333-4333-8333-333333333333.jpg")], /row-level security/);
    }));

  test("başka kurum görmüyor; anon tabloya erişemiyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHACI);
      await kayitAc(IS);
      await rol(db, "authenticated", YABANCI);
      assert.equal((await db.query(`select 1 from public.operation_team_files`)).rows.length, 0);
      await rol(db, "anon");
      await reddedilir(db, `select 1 from public.operation_team_files`, [], /permission denied/);
    }));
});

describe("kayıt koruması", () => {
  test("dosya değiştirilemez, not değişir; kaldırılan dosya geri açılamaz", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHACI);
      const { rows } = await kayitAc(IS);
      const id = rows[0].id;
      await db.query(`update public.operation_team_files set note = 'Ön cephe' where id = $1`, [id]);
      await reddedilir(db, `update public.operation_team_files set file_name = 'baska.jpg' where id = $1`, [id], /permission denied/);
      await db.query(`update public.operation_team_files set deleted_at = now() where id = $1`, [id]);
      // Kaldırılan satır RLS'te güncellenemez (deleted_at is null koşulu): 0 satır.
      const { affectedRows } = await db.query(`update public.operation_team_files set deleted_at = null where id = $1`, [id]);
      assert.equal(affectedRows, 0, "kaldırılan dosya geri açıldı");
    }));

  test("yol kapsamı: kayıt başka işin klasörünü gösteremez", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db,
        `insert into public.operation_team_files (organization_id, workflow_id, storage_path, file_name, mime_type, size_bytes) values ($1, $2, $3, 'x.jpg', 'image/jpeg', 1)`,
        [OTEKI, IS, `${KURUM}/${IS}/44444444-4444-4444-8444-444444444444.jpg`], /operation_team_files_path_scope|row-level security/);
    }));
});
