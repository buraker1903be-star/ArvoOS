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
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const MIGRATION = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260925113839_is_adimlari_tarihli_ve_kiraci_sablonu.sql",
);
const MIGRATION_ASAMA = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20261001060820_asama_gruplari_ve_firsat_adimlari.sql",
);
const MIGRATION_SET = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20261001062623_sablon_setleri.sql",
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
  const { rows: asama } = await db.query(
    `select 1 as v from information_schema.columns
      where table_schema = 'public' and table_name = 'operation_steps' and column_name = 'phase_title'`,
  );
  if (!asama.length) await db.exec(fs.readFileSync(MIGRATION_ASAMA, "utf8"));
  const { rows: set } = await db.query(
    `select 1 as v from information_schema.columns
      where table_schema = 'public' and table_name = 'organization_step_templates' and column_name = 'set_code'`,
  );
  if (!set.length) await db.exec(fs.readFileSync(MIGRATION_SET, "utf8"));
  /*
    Supabase yeni tabloyu üç role de açar; migration bunun ardından anon'u
    geri alıyor. Harness blanket grant'i tablo yokken çalıştığı için burada
    tekrarlanıyor — anon bilerek dışarıda, kapı o migration'ın kendisi.
  */
  await db.exec(`grant all on public.organization_step_template_sets to authenticated, service_role;`);
});

const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const adimlar = (isId) =>
  db.query(`select title, sort_order, due_date, status, is_completed, phase_title from public.operation_steps
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

/*
  PANODA SÜRÜKLEYEREK TAŞIMA, veritabanı tarafı.

  Taşıma tek adımı değil BİR DİZİ adımı değiştiriyor (gerekçesi
  lib/operasyon-panosu.ts'te) ve bunu tek bir `... where id in (...)`
  ifadesiyle yapıyor. Burada sınanan iki şey: toplu güncelleme RLS altında
  MEŞRU kullanıcı için geçiyor mu, ve BEFORE tetikleyicisi her satırda ayrı
  ayrı çalışıp is_completed/completed_at'i doğru yazıyor mu. Tetikleyici
  satır başına çalıştığı için toplu ifadede sessizce atlanması mümkündü.
*/
describe("panodan toplu aşama taşıma", () => {
  const idler = async (isId) =>
    (await db.query(`select id from public.operation_steps where workflow_id = $1 order by sort_order`, [isId]))
      .rows.map((r) => r.id);

  test("kurumun yöneticisi birden çok adımı tek ifadeyle kapatabiliyor", () =>
    islem(db, async () => {
      await tohum();
      const isId = await isAc();
      const hepsi = await idler(isId);
      // İlk üç adımı kapatmak = kartı 4. kolona taşımak.
      const kapanacak = hepsi.slice(0, 3);

      await rol(db, "authenticated", SAHIP);
      const yazilan = await db.query(
        `update public.operation_steps set status = 'done' where id = any($1::uuid[]) returning id`,
        [kapanacak],
      );
      assert.equal(yazilan.rows.length, 3, "üç satırın üçü de güncellenmeli");

      await rol(db, "postgres");
      const satirlar = await adimlar(isId);
      assert.deepEqual(
        satirlar.slice(0, 3).map((s) => s.is_completed),
        [true, true, true],
        "tetikleyici toplu ifadede de her satırda çalışmalı",
      );
      const damgali = await db.query(
        `select count(*)::int as n from public.operation_steps
           where id = any($1::uuid[]) and completed_at is not null`,
        [kapanacak],
      );
      assert.equal(damgali.rows[0].n, 3, "completed_at üçünde de yazılmalı");
      assert.equal(satirlar[3].is_completed, false, "dokunulmayan adım değişmemeli");
    }));

  test("geri taşıma zaman damgasını temizliyor", () =>
    islem(db, async () => {
      await tohum();
      const isId = await isAc();
      const hepsi = await idler(isId);
      await rol(db, "postgres");
      await db.query(`update public.operation_steps set status = 'done' where id = any($1::uuid[])`, [hepsi.slice(0, 3)]);

      // Kartı 2. kolona geri sürüklemek: hedef ve sonrası yeniden açılır.
      await rol(db, "authenticated", SAHIP);
      const acilan = await db.query(
        `update public.operation_steps set status = 'planned' where id = any($1::uuid[]) returning id`,
        [hepsi.slice(1, 3)],
      );
      assert.equal(acilan.rows.length, 2);

      await rol(db, "postgres");
      const satirlar = await db.query(
        `select is_completed, completed_at, completed_by from public.operation_steps
           where workflow_id = $1 order by sort_order`,
        [isId],
      );
      assert.equal(satirlar.rows[0].is_completed, true, "hedeften ÖNCEKİ kapalı kalmalı");
      assert.deepEqual(
        satirlar.rows.slice(1, 3).map((s) => [s.is_completed, s.completed_at, s.completed_by]),
        [[false, null, null], [false, null, null]],
        "açılan adımda damga ve kim bitirdi bilgisi silinmeli",
      );
    }));

  test("başka kurumun kullanıcısı hiçbir satırı taşıyamıyor", () =>
    islem(db, async () => {
      await tohum();
      const isId = await isAc();
      const hepsi = await idler(isId);
      const YABANCI = "00000000-0000-4000-8000-000000000061";
      const BASKA = "00000000-0000-4000-8000-000000000062";
      await rol(db, "postgres");
      await db.exec(`
        insert into auth.users (id, email) values ('${YABANCI}', 'yabanci2@example.com');
        insert into public.organizations (id, name, slug, status, plan_code)
          values ('${BASKA}', 'Başka', 'baska-2', 'active', 'starter');
        insert into public.organization_memberships (organization_id, user_id, role)
          values ('${BASKA}', '${YABANCI}', 'owner');
      `);

      // RLS hata vermiyor, SIFIR satır döndürüyor: sunucu kodu sayıyı denetliyor.
      await rol(db, "authenticated", YABANCI);
      const yazilan = await db.query(
        `update public.operation_steps set status = 'done' where id = any($1::uuid[]) returning id`,
        [hepsi.slice(0, 3)],
      );
      assert.equal(yazilan.rows.length, 0, "yabancı kurum hiçbir adımı değiştirememeli");
    }));
});

/*
  SATIŞTAN GELEN İŞ.

  Fırsat "kazanıldı" yapılınca iş kendiliğinden açılıyor. Eskiden bu yol
  işe DÖRT GENEL ADIM daha ekliyordu ("Müşteri ihtiyaçlarını ve kapsamı
  doğrula", …); işi açan tetikleyici kurumun şablonunu zaten kurduğu için
  operasyoncu iki listenin karışımını görüyordu ve genel adımlar
  sort_order 0-3 ile şablonun ÜSTÜNDE duruyordu. Adım listesinin kaynağı
  tek: add_standard_operation_steps.
*/
describe("fırsat kazanılınca açılan işin adımları", () => {
  const firsatiKazan = async () => {
    await rol(db, "postgres");
    await db.query(
      `update public.crm_opportunities set stage = 'won', estimated_value = 1200000 where id = $1`,
      [FIRSAT],
    );
    return (await tek(
      `select w.id from public.operation_workflows w
         join public.crm_automation_runs a on a.workflow_id = w.id
        where a.opportunity_id = $1`,
      [FIRSAT],
    )).id;
  };

  test("kurumun şablonu neyse o gelir; genel adımlar eklenmez", () =>
    islem(db, async () => {
      await tohum();
      await db.exec(`
        insert into public.organization_step_templates (organization_id, code, title, sort_order, day_offset) values
          ('${KURUM}', 'tez_oneri', 'Tez Öneri Formunun Hazırlanması', 10, 7),
          ('${KURUM}', 'literatur', 'Literatür Bölümünün Tamamının Gönderilmesi', 20, 30),
          ('${KURUM}', 'savunma', 'Tez Savunma Sunumunun Hazırlanması', 30, 90);
      `);
      const liste = await adimlar(await firsatiKazan());

      assert.deepEqual(liste.map((a) => a.title), [
        "Tez Öneri Formunun Hazırlanması",
        "Literatür Bölümünün Tamamının Gönderilmesi",
        "Tez Savunma Sunumunun Hazırlanması",
      ]);
      // Eskiden liste yedi satırdı ve ilk dördü bunlardı.
      assert.equal(
        liste.some((a) => a.title.startsWith("Müşteri ihtiyaçlarını")),
        false,
        "genel adımlar şablonun üstüne eklenmemeli",
      );
      assert.ok(liste.every((a) => a.due_date), "şablonun gün ofseti tarihe çevrilmeli");
    }));

  test("şablon yoksa varsayılan sekiz adım gelir (dört genel adım değil)", () =>
    islem(db, async () => {
      await tohum();
      const liste = await adimlar(await firsatiKazan());
      assert.equal(liste.length, 8);
      assert.equal(liste[0].title, "İş Kabul Edildi");
    }));

  test("fatura, otomasyon kaydı ve bildirim aynen üretiliyor", () =>
    islem(db, async () => {
      await tohum();
      await firsatiKazan();
      // Adım insert'i kaldırılırken gövdenin geri kalanı bozulmamalı.
      const kayit = await tek(
        `select invoice_id, workflow_id from public.crm_automation_runs where opportunity_id = $1`, [FIRSAT]);
      assert.ok(kayit.invoice_id && kayit.workflow_id);
      const fatura = await tek(`select total, status from public.billing_invoices where id = $1`, [kayit.invoice_id]);
      assert.equal(Number(fatura.total), 1200000);
      const bildirim = await tek(
        `select count(*)::int as n from public.notifications
          where organization_id = $1 and category = 'crm_won_automation'`, [KURUM]);
      assert.equal(bildirim.n, 1);
    }));
});

/*
  AŞAMA GRUPLARI.

  AkademikMerkez'in tablosu iki seviyeli: sekiz aşama, içlerinde yirmi
  görev. Tarih, sorumlu ve durum görevin; aşama yalnızca başlık. Grup
  NUMARASI saklanmıyor — ekran ardışık aynı başlıkları toplayıp
  numaralandırıyor (lib/is-adimlari.ts: asamalaraBol).
*/
describe("aşama başlığı şablondan işe taşınıyor", () => {
  test("her görev kendi aşamasını taşır; aşamasız satır boş kalır", () =>
    islem(db, async () => {
      await tohum();
      await db.exec(`
        insert into public.organization_step_templates (organization_id, code, title, sort_order, day_offset, phase_title) values
          ('${KURUM}', 'oneri', 'Tez Öneri Formunun Hazırlanması', 10, 7, 'Hazırlık'),
          ('${KURUM}', 'etik', 'Etik Kurul İzin Dosyaları', 20, 14, 'Hazırlık'),
          ('${KURUM}', 'veri', 'Veri Toplama Sürecinin Tamamlanması', 30, 60, 'Veri ve Analiz'),
          ('${KURUM}', 'sunum', 'Savunma Sunumu', 40, null, null);
      `);
      const liste = await adimlar(await isAc2());

      assert.deepEqual(liste.map((a) => a.phase_title), ["Hazırlık", "Hazırlık", "Veri ve Analiz", null]);
    }));

  test("aşama başlığı 80 karakteri geçemez", () =>
    islem(db, async () => {
      await tohum();
      await rol(db, "postgres");
      await reddedilir(
        db,
        `insert into public.organization_step_templates (organization_id, code, title, sort_order, phase_title)
         values ($1, 'uzun', 'Adım', 10, $2)`,
        [KURUM, "x".repeat(81)],
        /organization_step_templates_phase_check/,
      );
    }));
});

/** Sözleşmesiz iş: adımlar kurum şablonundan gelsin. */
async function isAc2() {
  await rol(db, "postgres");
  const satir = await tek(
    `insert into public.operation_workflows (organization_id, title, status, start_date, created_by)
     values ($1, 'Tez danışmanlığı', 'planned', current_date, $2) returning id`,
    [KURUM, SAHIP],
  );
  return satir.id;
}

/*
  ÇALIŞMA TÜRÜNE GÖRE ŞABLON.

  Kuruma tek liste düşüyordu (birincil anahtar organization_id + code);
  tezin yirmi maddesi makale işine de iniyordu. Artık her çalışma türünün
  kendi seti var ve iş açılırken tür seçiliyor.
*/
describe("şablon setleri", () => {
  const setKur = async () => {
    await rol(db, "postgres");
    await db.exec(`
      insert into public.organization_step_template_sets (organization_id, code, name, sort_order, is_default) values
        ('${KURUM}', 'tez', 'Tez', 10, true),
        ('${KURUM}', 'makale', 'Makale', 20, false);
      insert into public.organization_step_templates (organization_id, set_code, code, title, sort_order, phase_title) values
        ('${KURUM}', 'tez', 'oneri', 'Tez Öneri Formu', 10, 'Hazırlık'),
        ('${KURUM}', 'tez', 'savunma', 'Tez Savunma Sunumu', 20, 'Savunma'),
        ('${KURUM}', 'makale', 'dergi', 'Hedef Dergi Seçimi', 10, null),
        ('${KURUM}', 'makale', 'gonderim', 'Dergiye Gönderim', 20, null);
    `);
  };

  const turluIsAc = async (tur) => {
    await rol(db, "postgres");
    const satir = await tek(
      `insert into public.operation_workflows (organization_id, title, status, start_date, created_by, step_template_set)
       values ($1, 'Çalışma', 'planned', current_date, $2, $3) returning id`,
      [KURUM, SAHIP, tur],
    );
    return satir.id;
  };

  test("iş kendi türünün listesini alır", () =>
    islem(db, async () => {
      await tohum();
      await setKur();
      assert.deepEqual(
        (await adimlar(await turluIsAc("makale"))).map((a) => a.title),
        ["Hedef Dergi Seçimi", "Dergiye Gönderim"],
        "makale işine tezin adımları inmemeli",
      );
      assert.deepEqual(
        (await adimlar(await turluIsAc("tez"))).map((a) => a.title),
        ["Tez Öneri Formu", "Tez Savunma Sunumu"],
      );
    }));

  test("türü seçilmeyen iş kurumun öntanımlı setini kullanır", () =>
    islem(db, async () => {
      await tohum();
      await setKur();
      // CRM fırsatından otomatik açılan iş tür seçmiyor; boş kalmamalı.
      assert.deepEqual(
        (await adimlar(await turluIsAc(null))).map((a) => a.title),
        ["Tez Öneri Formu", "Tez Savunma Sunumu"],
      );
    }));

  test("kurumun olmayan seti işe yazılamaz", () =>
    islem(db, async () => {
      await tohum();
      await setKur();
      await rol(db, "postgres");
      await reddedilir(
        db,
        `insert into public.operation_workflows (organization_id, title, status, created_by, step_template_set)
         values ($1, 'Çalışma', 'planned', $2, 'odev')`,
        [KURUM, SAHIP],
        /operation_workflows_step_set_fkey/,
      );
    }));

  test("öntanımlı set kurum başına tektir", () =>
    islem(db, async () => {
      await tohum();
      await setKur();
      await rol(db, "postgres");
      await reddedilir(
        db,
        `update public.organization_step_template_sets set is_default = true where organization_id = $1 and code = 'makale'`,
        [KURUM],
        /organization_step_template_sets_default_idx/,
      );
    }));

  test("set silinince satırları da gider, işler kalır", () =>
    islem(db, async () => {
      await tohum();
      await setKur();
      const isId = await turluIsAc("makale");
      await rol(db, "postgres");
      await db.query(`delete from public.organization_step_template_sets where organization_id = $1 and code = 'makale'`, [KURUM]);

      const kalan = await tek(
        `select count(*)::int as n from public.organization_step_templates where organization_id = $1 and set_code = 'makale'`, [KURUM]);
      assert.equal(kalan.n, 0, "setin satırları da silinmeli");
      // Açılmış işin adımları şablona bağlı değil; silinen set onları götürmemeli.
      assert.equal((await adimlar(isId)).length, 2);
      const is = await tek(`select step_template_set from public.operation_workflows where id = $1`, [isId]);
      assert.equal(is.step_template_set, null, "işin türü boşalmalı, iş silinmemeli");
    }));

  test("eski satırlar 'varsayilan' setine taşındı ve o set öntanımlı", () =>
    islem(db, async () => {
      /*
        Migration geçmişe dokunmamalı: bu satır set sütunu olmadan yazılmış
        gibi, kodu verilmeden ekleniyor ve öntanımlıya düşüyor.
      */
      await tohum();
      await rol(db, "postgres");
      await db.exec(`
        insert into public.organization_step_template_sets (organization_id, code, name, is_default)
          values ('${KURUM}', 'varsayilan', 'Varsayılan', true);
        insert into public.organization_step_templates (organization_id, code, title, sort_order)
          values ('${KURUM}', 'eski', 'Eski tek liste', 10);
      `);
      const satir = await tek(
        `select set_code from public.organization_step_templates where organization_id = $1 and code = 'eski'`, [KURUM]);
      assert.equal(satir.set_code, "varsayilan");
      assert.deepEqual((await adimlar(await turluIsAc(null))).map((a) => a.title), ["Eski tek liste"]);
    }));
});
