/*
  İŞİN ÇALIŞMA TÜRÜNÜ DEĞİŞTİRME (20261013110047).

  Sınananlar:
  1. MEŞRU yol: işin sorumlusu (yönetici değil; görev silme RLS'i ona
     kapalı) tez işini makaleye çevirir. Tamamlanmış görev (tikleyeniyle)
     korunur, tamamlanmamışlar makale listesiyle değişir, iş "Tamamlandı"ya
     düşmez (önce ekle, sonra sil).
  2. İşi göremeyen personel çeviremez; anon işlevi çağıramaz.
  3. Görev listesi boş türe çevirmek reddedilir, hiçbir şey değişmez.
  4. Arşivdeki iş çevrilemez.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20261013110047_is_turunu_degistir.sql");
// Ara teslimleri silmeyen gövde (20261022083708); SONDAN uygulanır.
const MIGRATION_ARA_TESLIM = path.resolve(import.meta.dirname, "../../supabase/migrations/20261022083708_sozlesmeli_iste_tur_gorevleri.sql");
const KURUM = "00000000-0000-4000-8000-00000000b701";
const SAHIP = "00000000-0000-4000-8000-00000000b711";
const SAHACI = "00000000-0000-4000-8000-00000000b712";
const DIGER = "00000000-0000-4000-8000-00000000b713";
const IS = "00000000-0000-4000-8000-00000000b731";

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const gorevler = async () => (await db.query(
  `select title, is_completed, completed_by from public.operation_steps where workflow_id = $1 order by sort_order`, [IS])).rows;

before(async () => {
  db = await veritabani();
  await db.exec(fs.readFileSync(MIGRATION, "utf8"));
  await db.exec(fs.readFileSync(MIGRATION_ARA_TESLIM, "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${SAHIP}','s@x.com'),('${SAHACI}','h@x.com'),('${DIGER}','d@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values ('${KURUM}','AM','am','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${SAHACI}','member'),('${KURUM}','${DIGER}','member');
    insert into public.organization_step_template_sets (organization_id, code, name, sort_order, is_default, is_active) values
      ('${KURUM}','tez','Tez',10,true,true),('${KURUM}','makale','Makale',20,false,true),('${KURUM}','bos','Boş',30,false,true);
    insert into public.organization_step_templates (organization_id, set_code, code, title, phase_title, sort_order, is_active) values
      ('${KURUM}','tez','t1','Tez Öneri Formu','Hazırlık',10,true),('${KURUM}','tez','t2','Tez Savunması','Savunma',20,true),
      ('${KURUM}','makale','m1','Hedef Dergi Seçimi','Hazırlık',10,true),('${KURUM}','makale','m2','Literatür Taraması','Hazırlık',20,true),
      ('${KURUM}','makale','m3','Dergiye Gönderim','Teslim',30,true);
  `);
  const sahaci = await tek(`insert into public.hr_employees (organization_id,user_id,full_name,employment_status) values ($1,$2,'Saha','active') returning id`, [KURUM, SAHACI]);
  await db.query(`insert into public.operation_workflows (id, organization_id, title, status, created_by, step_template_set, assigned_employee_id)
                  values ($1,$2,'Makale işi','in_progress',$3,'tez',$4)`, [IS, KURUM, SAHIP, sahaci.id]);
  // Tez listesinin ilk görevi tamamlanmış (sorumlu tikledi).
  await db.query(`update public.operation_steps set status = 'done', completed_by = $1 where workflow_id = $2 and title = 'Tez Öneri Formu'`, [SAHACI, IS]);
});

describe("meşru yol", () => {
  test("işin sorumlusu tezi makaleye çevirir; tamamlanan görev ve tikleyeni korunur, iş kapanmaz", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", SAHACI);
      const { rows } = await db.query(`select public.arvo_is_turunu_degistir($1, 'makale') as sonuc`, [IS]);
      assert.deepEqual(rows[0].sonuc, { eklenen: 3, silinen: 1, korunan: 1 });
      await rol(db, "postgres");
      const liste = await gorevler();
      assert.deepEqual(liste.map((g) => g.title), ["Tez Öneri Formu", "Hedef Dergi Seçimi", "Literatür Taraması", "Dergiye Gönderim"]);
      assert.equal(liste[0].completed_by, SAHACI, "tikleyen kaybolmamalı");
      const is = await tek(`select status, step_template_set from public.operation_workflows where id = $1`, [IS]);
      assert.equal(is.status, "in_progress", "iş kendiliğinden tamamlanmamalı");
      assert.equal(is.step_template_set, "makale");
    }));
});

describe("sözleşmenin ara teslimleri", () => {
  /*
    Eskiden tür değişince tamamlanmamış her görev silinirdi; müşteriye
    tarihiyle verilen ara teslimler de gidiyordu (20261022083708).
  */
  test("tür değişince ara teslim görevi silinmez", async () =>
    islem(db, async () => {
      await db.query(`insert into public.operation_steps (organization_id, workflow_id, title, sort_order, due_date, phase_title)
                      values ($1, $2, 'Ara paylaşım', 900, '2026-12-27', 'Sözleşme ara teslimleri')`, [KURUM, IS]);
      await rol(db, "authenticated", SAHACI);
      await db.query(`select public.arvo_is_turunu_degistir($1, 'makale')`, [IS]);
      await rol(db, "postgres");
      const liste = (await gorevler()).map((g) => g.title);
      assert.ok(liste.includes("Ara paylaşım"), "ara teslim kalmalı");
      assert.ok(!liste.includes("Tez Savunması"), "türün eski görevi gitmeli");
    }));
});

describe("yetki ve korumalar", () => {
  test("işi göremeyen personel çeviremez", async () =>
    islem(db, async () => {
      await rol(db, "authenticated", DIGER);
      await reddedilir(db, `select public.arvo_is_turunu_degistir($1, 'makale')`, [IS], /yetkiniz yok/);
    }));

  test("anon işlevi çağıramaz", async () =>
    islem(db, async () => {
      await rol(db, "anon");
      await reddedilir(db, `select public.arvo_is_turunu_degistir($1, 'makale')`, [IS], /permission denied/);
    }));

  test("görev listesi boş türe çevirmek reddedilir, görevler aynen kalır", async () =>
    islem(db, async () => {
      const once = await gorevler();
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `select public.arvo_is_turunu_degistir($1, 'bos')`, [IS], /görev listesi boş/);
      await rol(db, "postgres");
      assert.deepEqual(await gorevler(), once);
    }));

  test("arşivdeki iş çevrilemez", async () =>
    islem(db, async () => {
      // Gerçek arşivleme yolu: tamamlanan iş arşive alınır (guard_operation_workflow_archive).
      await db.query(`update public.operation_workflows set status = 'completed' where id = $1`, [IS]);
      await db.query(`update public.operation_workflows set status = 'archived' where id = $1`, [IS]);
      await rol(db, "authenticated", SAHIP);
      await reddedilir(db, `select public.arvo_is_turunu_degistir($1, 'makale')`, [IS], /Arşivdeki/);
    }));
});
