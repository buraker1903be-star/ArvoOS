/*
  HİZMET TÜRÜ → ÇALIŞMA TÜRÜ VE AKADEMİKMERKEZ ŞABLONLARI (20261013104639).

  Sınananlar:
  1. TEZ'E DOKUNULMAZ: kurumun tez listesi aynen kalır; yalnızca eşlemesi
     (boşsa) "Tez Danışmanlığı" olur.
  2. Yeni türler (makale, çeviri…) adımlarıyla ve eşlemeleriyle kurulur.
  3. Kurumun elle açtığı aynı adlı tür (farklı kodla, kendi adımlarıyla)
     korunur: ikinci bir tür açılmaz, adımlarına ekleme yapılmaz.
  4. Tekrar uygulanabilir: ikinci çalıştırma hiçbir şeyi değiştirmez.
  5. MEŞRU yol uçtan uca: makale türüyle açılan işe makale adımları düşer
     (gerçek add_standard_operation_steps tetikleyicisi).
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(import.meta.dirname, "../../supabase/migrations/20261013104639_calisma_turu_hizmet_eslemesi.sql");
const KURUM = "00000000-0000-4000-8000-00000000c701";
const SAHIP = "00000000-0000-4000-8000-00000000c711";

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const adimlar = async (tur) => (await db.query(
  `select title from public.organization_step_templates where organization_id = $1 and set_code = $2 order by sort_order`, [KURUM, tur])).rows.map((r) => r.title);

before(async () => {
  db = await veritabani();
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values ('${SAHIP}','sahip@x.com');
    insert into public.plans (code,name,description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values ('${KURUM}','AkademikMerkez','akademikmerkez','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values ('${KURUM}','${SAHIP}','owner');
    insert into public.organization_step_template_sets (organization_id, code, name, sort_order, is_default, is_active)
      values ('${KURUM}','tez','Tez',10,true,true),('${KURUM}','ceviri_ozel','Akademik Çeviri',90,false,true);
    insert into public.organization_step_templates (organization_id, set_code, code, title, sort_order, is_active) values
      ('${KURUM}','tez','tez_a','Tez Öneri Formu',10,true),('${KURUM}','tez','tez_b','Tez Savunma Sunumu',20,true),
      ('${KURUM}','ceviri_ozel','cv_a','Kendi çeviri adımımız',10,true);
  `);
  const sql = fs.readFileSync(MIGRATION, "utf8");
  await db.exec(sql);
  await db.exec(sql); // tekrar uygulanabilir olmalı
});

describe("tez korunur", () => {
  test("tez listesi aynen kalır, eşlemesi yazılır", async () => {
    assert.deepEqual(await adimlar("tez"), ["Tez Öneri Formu", "Tez Savunma Sunumu"]);
    const tez = await tek(`select hizmet_turleri, is_default from public.organization_step_template_sets where organization_id = $1 and code = 'tez'`, [KURUM]);
    assert.deepEqual(tez.hizmet_turleri, ["Tez Danışmanlığı"]);
    assert.equal(tez.is_default, true, "öntanımlı tür değişmemeli");
  });
});

describe("yeni türler", () => {
  test("makale adımlarıyla ve eşlemesiyle kurulur; iki kez uygulanınca çoğalmaz", async () => {
    const liste = await adimlar("makale");
    assert.equal(liste.length, 15);
    assert.equal(liste[0], "Hedef Dergi ve Kapsamın Belirlenmesi");
    const set = await tek(`select hizmet_turleri from public.organization_step_template_sets where organization_id = $1 and code = 'makale'`, [KURUM]);
    assert.deepEqual(set.hizmet_turleri, ["Makale Danışmanlığı"]);
  });

  test("kurumun aynı adlı türü korunur: ikinci tür açılmaz, adımlarına ekleme yapılmaz", async () => {
    const sayi = await tek(`select count(*)::int as n from public.organization_step_template_sets where organization_id = $1 and lower(name) = lower('Akademik Çeviri')`, [KURUM]);
    assert.equal(sayi.n, 1);
    assert.deepEqual(await adimlar("ceviri_ozel"), ["Kendi çeviri adımımız"]);
    const set = await tek(`select hizmet_turleri from public.organization_step_template_sets where organization_id = $1 and code = 'ceviri_ozel'`, [KURUM]);
    assert.deepEqual(set.hizmet_turleri, ["Akademik Çeviri"]);
  });
});

describe("uçtan uca", () => {
  test("makale türüyle açılan işe makale adımları düşer", async () =>
    islem(db, async () => {
      const is = await tek(
        `insert into public.operation_workflows (organization_id, title, status, created_by, step_template_set)
         values ($1, 'Makale işi', 'planned', $2, 'makale') returning id`, [KURUM, SAHIP]);
      const { rows } = await db.query(`select title, phase_title from public.operation_steps where workflow_id = $1 order by sort_order`, [is.id]);
      assert.equal(rows.length, 15);
      assert.equal(rows[0].title, "Hedef Dergi ve Kapsamın Belirlenmesi");
      assert.equal(rows[0].phase_title, "Hazırlık");
    }));
});
