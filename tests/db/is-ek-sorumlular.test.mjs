/*
  İŞİN EK SORUMLULARI (20261022081123) — AkademikMerkez'in talebi: bir işi
  iki operasyoncu da görebilsin, takip edebilsin.

  Sınananlar:
  1. MEŞRU yol: yönetici ek sorumlu ekliyor; ek sorumlu (yönetici değil)
     işi görüyor, durumunu değiştiriyor, ekip dosyası ekliyor ve
     eklendiğinde bildirim alıyor. Asıl sorumlunun yolu bozulmadı.
  2. Ek sorumlu asıl sorumluyu DEĞİŞTİREMİYOR ve ek sorumlu listesine
     dokunamıyor (güncelleme politikası onu içeri aldığı için kısıt
     tetikleyicide).
  3. İşle ilgisi olmayan personel hâlâ görmüyor; anon tabloya erişemiyor.
  4. Liste süzgeci (?sorumlu=) ek sorumlu olunan işi de getiriyor;
     "atanmamis" yalnızca kimsesi olmayan işi.
  5. Müşteri mesajı ek sorumluya da bildirim düşürüyor.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
/* Ekip dosyası politikaları arvo_can_access_workflow'a dayanıyor; ek
   sorumlunun dosya ekleyebildiğini görmek için o tablo da kuruluyor. */
const MIGRATIONLAR = ["20261013065421_is_ekip_dosyalari.sql", "20261022081123_is_ek_sorumlular.sql"];

const KURUM = "00000000-0000-4000-8000-00000000a501";
const SAHIP = "00000000-0000-4000-8000-00000000a511";
const ASIL = "00000000-0000-4000-8000-00000000a512";
const EK = "00000000-0000-4000-8000-00000000a513";
const ILGISIZ = "00000000-0000-4000-8000-00000000a514";
const ASIL_P = "00000000-0000-4000-8000-00000000a521";
const EK_P = "00000000-0000-4000-8000-00000000a522";
const ILGISIZ_P = "00000000-0000-4000-8000-00000000a523";
const IS = "00000000-0000-4000-8000-00000000a531";
const BOS_IS = "00000000-0000-4000-8000-00000000a532";
const FIRSAT = "00000000-0000-4000-8000-00000000a541";
const TEKLIF = "00000000-0000-4000-8000-00000000a542";
const SOZLESME = "00000000-0000-4000-8000-00000000a543";
const KOD = "EKS123";

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
      ('${SAHIP}','sahip@am.com'),('${ASIL}','asil@am.com'),('${EK}','ek@am.com'),('${ILGISIZ}','ilgisiz@am.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values ('${KURUM}','AM','am','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${ASIL}','operasyoncu'),
      ('${KURUM}','${EK}','operasyoncu'),('${KURUM}','${ILGISIZ}','operasyoncu');
    insert into public.hr_employees (id,organization_id,user_id,full_name,employment_status) values
      ('${ASIL_P}','${KURUM}','${ASIL}','Asıl','active'),
      ('${EK_P}','${KURUM}','${EK}','Ek','active'),
      ('${ILGISIZ_P}','${KURUM}','${ILGISIZ}','İlgisiz','active');
    insert into public.crm_opportunities (id, organization_id, title, customer_name, created_by)
      values ('${FIRSAT}', '${KURUM}', 'Tez', 'Ayşe', '${SAHIP}');
    insert into public.crm_proposals (id, organization_id, opportunity_id, proposal_no, title, access_token_hash, created_by, status)
      values ('${TEKLIF}', '${KURUM}', '${FIRSAT}', 'TKF-E-1', 'Tez', 'x', '${SAHIP}', 'accepted');
    insert into public.crm_contracts
      (id, organization_id, opportunity_id, proposal_id, contract_no, title, access_token_hash,
       amount, status, start_date, created_by, tracking_code)
      values ('${SOZLESME}', '${KURUM}', '${FIRSAT}', '${TEKLIF}', 'SOZ-E-1', 'Tez', 'x',
              1200000, 'signed', current_date, '${SAHIP}', '${KOD}');
    insert into public.operation_workflows (id,organization_id,title,status,assigned_employee_id,created_by,contract_id) values
      ('${IS}','${KURUM}','Tez','in_progress','${ASIL_P}','${SAHIP}','${SOZLESME}'),
      ('${BOS_IS}','${KURUM}','Makale','planned',null,'${SAHIP}',null);
    update public.crm_contracts set workflow_id = '${IS}' where id = '${SOZLESME}';
  `);
});

const ekSorumluEkle = (isId = IS, personel = EK_P) => db.query(
  `insert into public.operation_workflow_assignees (workflow_id, employee_id, organization_id) values ($1, $2, $3)`,
  [isId, personel, KURUM]);
const gorunenIsler = async () =>
  (await db.query(`select id from public.operation_workflows order by title`)).rows.map((r) => r.id);

describe("meşru yol", () => {
  test("yönetici ek sorumlu ekliyor; ek sorumlu işi görüyor, durumunu değiştiriyor, dosya ekliyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", EK);
      assert.deepEqual(await gorunenIsler(), [], "eklenmeden önce görmemeli");

      await rol(db, "authenticated", SAHIP);
      await ekSorumluEkle();

      await rol(db, "authenticated", EK);
      assert.deepEqual(await gorunenIsler(), [IS], "ek sorumlu işi görmeli");
      await db.query(`update public.operation_workflows set status = 'blocked' where id = $1`, [IS]);
      await db.query(`insert into storage.objects (bucket_id, name) values ('operation-team-files', $1)`,
        [`${KURUM}/${IS}/11111111-1111-4111-8111-111111111111.jpg`]);
      await db.query(
        `insert into public.operation_team_files (organization_id, workflow_id, storage_path, file_name, mime_type, size_bytes)
         values ($1, $2, $3, 'saha.jpg', 'image/jpeg', 10)`,
        [KURUM, IS, `${KURUM}/${IS}/11111111-1111-4111-8111-111111111111.jpg`]);
      const ekler = await db.query(`select employee_id from public.operation_workflow_assignees where workflow_id = $1`, [IS]);
      assert.deepEqual(ekler.rows.map((r) => r.employee_id), [EK_P], "ek sorumlu listeyi görebilmeli");

      await rol(db, "postgres");
      assert.equal((await db.query(`select status from public.operation_workflows where id = $1`, [IS])).rows[0].status, "blocked");
    }));

  test("asıl sorumlunun yolu bozulmadı; yönetici sorumluyu değiştirebiliyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await ekSorumluEkle();
      await rol(db, "authenticated", ASIL);
      assert.deepEqual(await gorunenIsler(), [IS]);
      await db.query(`update public.operation_workflows set status = 'completed' where id = $1`, [IS]);
      await rol(db, "authenticated", SAHIP);
      await db.query(`update public.operation_workflows set assigned_employee_id = $2 where id = $1`, [IS, ILGISIZ_P]);
    }));

  test("eklenen kişi bildirim alıyor (kendini ekleyen almıyor)", async () =>
    islem(db, async () => {
      /* Tohumdaki ilk atama asıl sorumluya bildirim yazdı; burada
         yalnızca ek sorumlu eklemesinin ürettiği sayılıyor. */
      await rol(db, "postgres");
      await db.exec(`delete from public.notifications`);
      await rol(db, "authenticated", SAHIP);
      await ekSorumluEkle();
      await rol(db, "postgres");
      const { rows } = await db.query(
        `select user_id, category, action_url from public.notifications where category = 'operation_assignment'`);
      assert.deepEqual(rows.map((r) => r.user_id), [EK]);
      assert.equal(rows[0].action_url, `/panel/operations/${IS}`);
    }));
});

describe("sınırlar", () => {
  test("ek sorumlu asıl sorumluyu değiştiremiyor, ek sorumlu listesine dokunamıyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await ekSorumluEkle();
      await rol(db, "authenticated", EK);
      await reddedilir(db, `update public.operation_workflows set assigned_employee_id = $2 where id = $1`,
        [IS, EK_P], /yalnızca yönetici/);
      await reddedilir(db, `insert into public.operation_workflow_assignees (workflow_id, employee_id, organization_id) values ($1, $2, $3)`,
        [IS, ILGISIZ_P, KURUM], /row-level security/);
      await db.query(`delete from public.operation_workflow_assignees where workflow_id = $1`, [IS]);
      await rol(db, "postgres");
      assert.equal((await db.query(`select 1 from public.operation_workflow_assignees`)).rows.length, 1,
        "ek sorumlu kendi kaydını silememeli");
    }));

  test("asıl sorumlu da (yönetici değilse) ek sorumlu ekleyemiyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", ASIL);
      await reddedilir(db, `insert into public.operation_workflow_assignees (workflow_id, employee_id, organization_id) values ($1, $2, $3)`,
        [IS, EK_P, KURUM], /row-level security/);
    }));

  test("ilgisiz personel görmüyor; anon tabloya erişemiyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await ekSorumluEkle();
      await rol(db, "authenticated", ILGISIZ);
      assert.deepEqual(await gorunenIsler(), []);
      assert.equal((await db.query(`select 1 from public.operation_workflow_assignees`)).rows.length, 0);
      await rol(db, "anon");
      await reddedilir(db, `select 1 from public.operation_workflow_assignees`, [], /permission denied/);
    }));
});

describe("liste süzgeci", () => {
  test("?sorumlu=<ek sorumlu> işi getiriyor; atanmamis yalnızca kimsesi olmayanı", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await ekSorumluEkle();
      await ekSorumluEkle(BOS_IS, ILGISIZ_P);
      const suz = async (p) => (await db.query(
        `select id from public.operasyon_is_suz($1, null, $2) order by title`, [KURUM, p])).rows.map((r) => r.id);
      assert.deepEqual(await suz(EK_P), [IS], "ek sorumlu olduğu iş gelmeli");
      assert.deepEqual(await suz(ASIL_P), [IS], "asıl sorumlu da görmeye devam");
      assert.deepEqual(await suz("atanmamis"), [], "yalnızca ek sorumlusu olan iş atanmamış sayılmamalı");
      await db.query(`delete from public.operation_workflow_assignees where workflow_id = $1`, [BOS_IS]);
      assert.deepEqual(await suz("atanmamis"), [BOS_IS]);
    }));
});

describe("müşteri mesajı", () => {
  test("ek sorumlu da bildirim alıyor", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHIP);
      await ekSorumluEkle();
      await rol(db, "postgres");
      await db.exec(`delete from public.notifications`);
      await rol(db, "service_role");
      await db.query(`select public.send_customer_file_message($1, $2)`, [KOD, "Belgeyi yükledim, bakar mısınız?"]);
      await rol(db, "postgres");
      const { rows } = await db.query(`select user_id from public.notifications where category = 'customer_message'`);
      const alanlar = rows.map((r) => r.user_id);
      assert.ok(alanlar.includes(EK), "ek sorumlu müşteri mesajı bildirimi almalı");
      assert.ok(alanlar.includes(ASIL), "asıl sorumlu almaya devam etmeli");
      assert.ok(!alanlar.includes(ILGISIZ), "ilgisiz personel almamalı");
    }));
});
