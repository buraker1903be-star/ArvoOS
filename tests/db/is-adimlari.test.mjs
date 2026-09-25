/*
  İş adımlarının tarihi, durumu ve nereden üretildiği.

  Asıl kanıtlanan şey: müşteriye TARİHLERİYLE satılan ara teslim takvimi
  (crm_contracts.work_plan) işin ekranına düşüyor. Eskiden düşmüyordu —
  sözleşmenin 4.3 maddesindeki plan müşteri takip sayfasında görünüyor,
  işi yapan kişi ise herkese aynı gelen 8 genel adımı görüyordu.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260925113839_is_adimlari_tarihli_ve_kiraci_sablonu.sql",
);

const SAHIP = "00000000-0000-4000-8000-000000000041";
const KURUM = "00000000-0000-4000-8000-000000000042";
const CALISAN = "00000000-0000-4000-8000-000000000043";
const FIRSAT = "00000000-0000-4000-8000-000000000044";
const SOZLESME = "00000000-0000-4000-8000-000000000045";
const TEKLIF = "00000000-0000-4000-8000-000000000046";

let db;
before(async () => {
  db = await veritabani();
  // Anlık görüntü canlıdan alınıyor; migration henüz uygulanmadı.
  const { rows } = await db.query(`select to_regclass('public.organization_step_templates') as t`);
  if (!rows[0].t) await db.exec(fs.readFileSync(MIGRATION, "utf8"));
  /*
    Harness şemayı kurduktan SONRA public'teki tüm tablolara varsayılan
    yetkiyi veriyor. Tablo o anda henüz yoktu; migration'ın kapısı sınansın
    diye Supabase'in davranışını burada tekrarlıyoruz.
  */
  await db.exec(`grant all on public.organization_step_templates to anon, authenticated, service_role;`);
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const adimlar = (isId) =>
  db.query(`select title, sort_order, due_date, status, is_completed from public.operation_steps
              where workflow_id = $1 order by sort_order`, [isId]).then((r) => r.rows);

async function tohum({ workPlan = null } = {}) {
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}', 'sahip@example.com');
    insert into public.plans (code, name, description) values ('starter', 'Başlangıç', '');
    insert into public.organizations (id, name, slug, status, plan_code)
      values ('${KURUM}', 'Akademik Merkez', 'akademik-merkez', 'active', 'starter');
    insert into public.organization_memberships (organization_id, user_id, role)
      values ('${KURUM}', '${SAHIP}', 'owner');
    insert into public.hr_employees (id, organization_id, user_id, full_name)
      values ('${CALISAN}', '${KURUM}', '${SAHIP}', 'Uzman');
    insert into public.crm_opportunities (id, organization_id, title, customer_name, created_by)
      values ('${FIRSAT}', '${KURUM}', 'Tez danışmanlığı', 'Ayşe Yılmaz', '${SAHIP}');
  `);
  await db.exec(`
    insert into public.crm_proposals
      (id, organization_id, opportunity_id, proposal_no, title, access_token_hash, created_by, status)
      values ('${TEKLIF}', '${KURUM}', '${FIRSAT}', 'TKF-TEST-1', 'Tez danışmanlığı', 'x', '${SAHIP}', 'accepted');
  `);
  /*
    work_plan tetikleyiciyle normalleştiriliyor (arvo_normalize_work_plan):
    geçersiz satır atılır, tarihe göre sıralanır, sequence yeniden yazılır.
    Test bilerek gerçek yoldan geçiyor — normalleştirmeyi atlarsak adımların
    sırası canlıda farklı çıkabilir.
  */
  await db.query(
    `insert into public.crm_contracts
       (id, organization_id, opportunity_id, proposal_id, contract_no, title, access_token_hash,
        amount, status, start_date, created_by, work_plan)
     values ($1, $2, $3, $4, 'SOZ-TEST-1', 'Tez danışmanlığı', 'x',
             1200000, 'draft', current_date, $5, coalesce($6::jsonb, '[]'::jsonb))`,
    [SOZLESME, KURUM, FIRSAT, TEKLIF, SAHIP, workPlan ? JSON.stringify(workPlan) : null],
  );
}

/** İşi açar; AFTER INSERT tetikleyicisi adımları üretir. */
async function isAc() {
  await rol(db, "postgres");
  const satir = await tek(
    `insert into public.operation_workflows (organization_id, contract_id, title, status, start_date, created_by)
     values ($1, $2, 'Tez danışmanlığı', 'planned', current_date, $3) returning id`,
    [KURUM, SOZLESME, SAHIP],
  );
  return satir.id;
}

describe("iş adımları nereden üretiliyor", () => {
  test("sözleşmenin work_plan'ı varsa adımlar ONDAN ve TARİHLİ gelir", () =>
    islem(db, async () => {
      await tohum({
        workPlan: [
          { sequence: 1, title: "Taslak + kullanılacak kaynaklar", due_date: "2026-10-05" },
          { sequence: 2, title: "Literatür bölümü — birinci kısım", due_date: "2026-10-20" },
          { sequence: 3, title: "Literatür bölümü — ikinci kısım", due_date: "2026-11-05" },
          { sequence: 4, title: "Analiz bölümü", due_date: "2026-11-25" },
        ],
      });
      const isId = await isAc();
      const liste = await adimlar(isId);

      assert.deepEqual(
        liste.map((a) => a.title),
        ["Taslak + kullanılacak kaynaklar", "Literatür bölümü — birinci kısım", "Literatür bölümü — ikinci kısım", "Analiz bölümü"],
        "Sekiz genel adım değil, sözleşmedeki takvim gelmeli",
      );
      // Eskiden buradaki her adımın tarihi NULL'du; tarih tutacak sütun yoktu.
      assert.deepEqual(
        liste.map((a) => a.due_date.toISOString().slice(0, 10)),
        ["2026-10-05", "2026-10-20", "2026-11-05", "2026-11-25"],
      );
      assert.deepEqual(liste.map((a) => a.status), ["planned", "planned", "planned", "planned"]);
    }));

  test("work_plan boşsa kurumun şablonu kullanılır; gün ofseti tarihe çevrilir", () =>
    islem(db, async () => {
      await tohum();
      await db.exec(`
        insert into public.organization_step_templates (organization_id, code, title, sort_order, day_offset) values
          ('${KURUM}', 'taslak', 'Taslak ve kaynaklar', 10, 7),
          ('${KURUM}', 'literatur_1', 'Literatür 1. kısım', 20, 21),
          ('${KURUM}', 'sunum', 'Sunum dosyası', 90, null),
          ('${KURUM}', 'pasif', 'Kullanılmayan adım', 99, 5);
        update public.organization_step_templates set is_active = false where code = 'pasif';
      `);
      const isId = await isAc();
      const liste = await adimlar(isId);

      assert.deepEqual(liste.map((a) => a.title), ["Taslak ve kaynaklar", "Literatür 1. kısım", "Sunum dosyası"]);
      const bugun = (await tek(`select current_date as g`)).g;
      const gunEkle = (n) => new Date(bugun.getTime() + n * 86400000).toISOString().slice(0, 10);
      assert.equal(liste[0].due_date.toISOString().slice(0, 10), gunEkle(7));
      assert.equal(liste[1].due_date.toISOString().slice(0, 10), gunEkle(21));
      // Ofseti olmayan adım tarihsiz açılır: "sunum isterse" belli değil.
      assert.equal(liste[2].due_date, null);
    }));

  test("ne work_plan ne şablon varsa bugünkü 8 varsayılan adım gelir", () =>
    islem(db, async () => {
      await tohum();
      const isId = await isAc();
      const liste = await adimlar(isId);
      // Şablon tanımlamamış kurumlar için davranış DEĞİŞMEMELİ.
      assert.equal(liste.length, 8);
      assert.equal(liste[0].title, "İş Kabul Edildi");
      assert.equal(liste[7].title, "Evrak Teslimine Hazır");
      assert.ok(liste.every((a) => a.due_date === null));
    }));
});

describe("durum ile onay kutusu birbirini takip ediyor", () => {
  async function birAdim() {
    await tohum();
    const isId = await isAc();
    const { id } = await tek(`select id from public.operation_steps where workflow_id = $1 order by sort_order limit 1`, [isId]);
    return { isId, adimId: id };
  }

  test("status = done onay kutusunu ve zaman damgasını yazar", () =>
    islem(db, async () => {
      const { adimId } = await birAdim();
      await db.query(`update public.operation_steps set status = 'done' where id = $1`, [adimId]);
      const a = await tek(`select is_completed, completed_at from public.operation_steps where id = $1`, [adimId]);
      assert.equal(a.is_completed, true);
      assert.ok(a.completed_at, "Tamamlanma zamanı yazılmalı");
    }));

  test("yalnızca is_completed yazan ESKİ kod da çalışıyor", () =>
    islem(db, async () => {
      const { adimId } = await birAdim();
      // process_won_crm_opportunity ve PostgREST'e doğrudan giden istemciler
      // bu sütunu yazıyor; status onlara uymalı.
      await db.query(`update public.operation_steps set is_completed = true where id = $1`, [adimId]);
      assert.equal((await tek(`select status from public.operation_steps where id = $1`, [adimId])).status, "done");
      await db.query(`update public.operation_steps set is_completed = false where id = $1`, [adimId]);
      const geri = await tek(`select status, completed_at, completed_by from public.operation_steps where id = $1`, [adimId]);
      assert.equal(geri.status, "planned");
      assert.equal(geri.completed_at, null, "Geri alınca damga silinmeli (CHECK bunu zorunlu tutuyor)");
      assert.equal(geri.completed_by, null);
    }));

  test("ara durum korunuyor: 'kontrolde' iken onay kutusu kalkınca 'planlandı'ya düşmüyor", () =>
    islem(db, async () => {
      const { adimId } = await birAdim();
      await db.query(`update public.operation_steps set status = 'review' where id = $1`, [adimId]);
      await db.query(`update public.operation_steps set is_completed = false where id = $1`, [adimId]);
      assert.equal((await tek(`select status from public.operation_steps where id = $1`, [adimId])).status, "review");
    }));

  test("adım tamamlanınca iş de tamamlanıyor (mevcut kural bozulmadı)", () =>
    islem(db, async () => {
      const { isId } = await birAdim();
      await db.query(`update public.operation_steps set status = 'done' where workflow_id = $1`, [isId]);
      assert.equal((await tek(`select status from public.operation_workflows where id = $1`, [isId])).status, "completed");
    }));

  test("tarih değişince hatırlatma işareti sıfırlanıyor", () =>
    islem(db, async () => {
      const { adimId } = await birAdim();
      await db.query(
        `update public.operation_steps set due_date = current_date, reminder_state = 'overdue', reminder_sent_at = now() where id = $1`,
        [adimId],
      );
      // Ertelenen adım için "gecikti" uyarısı yeniden gidebilmeli.
      await db.query(`update public.operation_steps set due_date = current_date + 30 where id = $1`, [adimId]);
      const a = await tek(`select reminder_state, reminder_sent_at from public.operation_steps where id = $1`, [adimId]);
      assert.equal(a.reminder_state, null);
      assert.equal(a.reminder_sent_at, null);
    }));
});

describe("şablon kapısı", () => {
  test("şablonu yalnızca kurumun yöneticisi yazabiliyor, üyesi okuyabiliyor", () =>
    islem(db, async () => {
      await tohum();
      const BASKA_KURUM = "00000000-0000-4000-8000-000000000051";
      const YABANCI = "00000000-0000-4000-8000-000000000052";
      await db.exec(`
        insert into auth.users (id, email) values ('${YABANCI}', 'yabanci@example.com');
        insert into public.organizations (id, name, slug, status, plan_code)
          values ('${BASKA_KURUM}', 'Başka Kurum', 'baska-kurum', 'active', 'starter');
        insert into public.organization_memberships (organization_id, user_id, role)
          values ('${BASKA_KURUM}', '${YABANCI}', 'owner');
      `);

      await rol(db, "authenticated", SAHIP);
      const yazilan = await db.query(
        `insert into public.organization_step_templates (organization_id, code, title, sort_order)
         values ($1, 'taslak', 'Taslak ve kaynaklar', 10) returning code`,
        [KURUM],
      );
      assert.equal(yazilan.rows.length, 1, "Kurum sahibi kendi şablonunu yazabilmeli");

      // Başka kurumun yöneticisi: RLS hata vermez, HİÇBİR satır göstermez.
      await rol(db, "authenticated", YABANCI);
      const okunan = await db.query(`select code from public.organization_step_templates`);
      assert.equal(okunan.rows.length, 0, "Başka kurumun şablonu görünmemeli");
    }));
});
