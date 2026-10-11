/*
  OPERASYON GENEL BAKIŞ ÖZETİ.

  Sayfa kurumun bütün aktif işlerini, aşamalarıyla birlikte çekip her
  sayıyı bellekte hesaplıyordu. Sınananlar:

  1. Durum sayıları ve "süren" kümesinin ÇAĞIRANDAN gelmesi.
  2. Termin penceresi: bugüne kadar gecikmişler ayrı, önümüzdeki yedi
     gün ayrı; sekizinci gün dışarıda.
  3. Aşama sayıları yalnızca AKTİF işlerden ve yalnızca açık adımlardan.
  4. Grafik dilimi Türkiye gününe göre.
  5. Kapsam: başka kurum hiçbir şey görmemeli, anon erişememeli.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = ["20261011151018_operasyon_genel_bakis_ozeti.sql"];

const KURUM = "00000000-0000-4000-8000-00000000d1a1";
const BASKA = "00000000-0000-4000-8000-00000000d1a2";
const SAHIP = "00000000-0000-4000-8000-00000000d1b1";
const YABANCI = "00000000-0000-4000-8000-00000000d1b2";
const PERSONEL = "00000000-0000-4000-8000-00000000d1c1";
const AKTIF = ["planned", "in_progress", "blocked"];
const SUREN = ["in_progress", "blocked"];

/* İşler: iki planlanan (biri atanmamış), bir süren, bir tıkalı, bir
   tamamlanmış (hiçbir sayıya girmemeli). */
const PLAN_ATANMAMIS = "00000000-0000-4000-8000-00000000d1e1";
const PLAN_ATANMIS = "00000000-0000-4000-8000-00000000d1e2";
const SUREN_IS = "00000000-0000-4000-8000-00000000d1e3";
const TIKALI = "00000000-0000-4000-8000-00000000d1e4";
const BITEN = "00000000-0000-4000-8000-00000000d1e5";

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const ozet = async (kurum = KURUM) =>
  (await tek(`select public.operasyon_genel_bakis_ozeti($1,$2,$3) as o`, [kurum, AKTIF, SUREN])).o;

before(async () => {
  db = await veritabani();
  for (const ad of MIGRATIONLAR) await db.exec(fs.readFileSync(migration(ad), "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id, email) values ('${SAHIP}','sahip@x.com'),('${YABANCI}','yabanci@x.com');
    insert into public.plans (code, name, description) values ('starter','B','');
    insert into public.organizations (id,name,slug,status,plan_code) values
      ('${KURUM}','AM','am','active','starter'),('${BASKA}','Öteki','oteki','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${BASKA}','${YABANCI}','owner');
    insert into public.hr_employees (id,organization_id,full_name,employment_status)
      values ('${PERSONEL}','${KURUM}','Gizem Kaya','active');

    insert into public.operation_workflows (id,organization_id,title,customer_name,status,priority,due_date,created_by,created_at,updated_at,assigned_employee_id)
    values
      /* Termini dün: gecikmiş. */
      ('${PLAN_ATANMAMIS}','${KURUM}','Plan A','Ayşe','planned','normal',(timezone('Europe/Istanbul',now()))::date - 1,'${SAHIP}',now(),now(),null),
      /* Termini 3 gün sonra: pencerede. */
      ('${PLAN_ATANMIS}','${KURUM}','Plan B','Veli','planned','normal',(timezone('Europe/Istanbul',now()))::date + 3,'${SAHIP}',now(),now(),'${PERSONEL}'),
      /* Termini 8 gün sonra: pencerenin DIŞINDA. */
      ('${SUREN_IS}','${KURUM}','Süren','Can','in_progress','normal',(timezone('Europe/Istanbul',now()))::date + 8,'${SAHIP}',now(),now(),'${PERSONEL}'),
      ('${TIKALI}','${KURUM}','Tıkalı','Deniz','blocked','normal',null,'${SAHIP}',now(),now(),'${PERSONEL}'),
      ('${BITEN}','${KURUM}','Biten','Elif','in_progress','normal',(timezone('Europe/Istanbul',now()))::date - 2,'${SAHIP}',now(),now(),'${PERSONEL}');

    /* Aşamalar: süren işte biri gecikmiş biri pencerede biri uzak,
       biri de TAMAMLANMIŞ (sayılmamalı). Biten işin açık adımı var —
       aktif olmayan işin adımı "yaklaşan aşama" değil. */
    insert into public.operation_steps (id,organization_id,workflow_id,title,is_completed,sort_order,due_date)
    values
      (gen_random_uuid(),'${KURUM}','${SUREN_IS}','Gecikmiş adım',false,1,(timezone('Europe/Istanbul',now()))::date - 3),
      (gen_random_uuid(),'${KURUM}','${SUREN_IS}','Yarın',false,2,(timezone('Europe/Istanbul',now()))::date + 1),
      (gen_random_uuid(),'${KURUM}','${SUREN_IS}','Çok sonra',false,3,(timezone('Europe/Istanbul',now()))::date + 30),
      (gen_random_uuid(),'${KURUM}','${SUREN_IS}','Biten adım',true,4,(timezone('Europe/Istanbul',now()))::date - 1),
      (gen_random_uuid(),'${KURUM}','${BITEN}','Aktif olmayanın adımı',false,1,(timezone('Europe/Istanbul',now()))::date);
  `);
  /* Biten iş gerçek akışla tamamlanıyor: tetikleyiciler doğrudan
     'completed' doğurmaya izin veriyor ama sıra önemli (in_progress →
     completed). */
  await db.exec(`update public.operation_workflows set status = 'completed' where id = '${BITEN}'`);
  /* Grafik: tamamlanan adımların zamanı. Biri UTC gece yarısından
     SONRA (Türkiye'de ertesi gün). */
  await db.exec(`
    update public.operation_steps set completed_at = now() - interval '2 days'
      where title = 'Biten adım';
    insert into public.operation_steps (id,organization_id,workflow_id,title,is_completed,sort_order,completed_at)
    values (gen_random_uuid(),'${KURUM}','${SUREN_IS}','Gece biten',true,5,
            (timezone('Europe/Istanbul', now()))::date - 4 + interval '22 hours 30 minutes');
  `);
});

test("durum sayıları; süren kümesi çağırandan", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const o = await ozet();
    assert.equal(Number(o.planlanan), 2);
    assert.equal(Number(o.planlanan_atanmamis), 1);
    assert.equal(Number(o.suren), 2, "in_progress + blocked");
    assert.equal(Number(o.tikali), 1);

    const { o: yalnizDevam } = await tek(
      `select public.operasyon_genel_bakis_ozeti($1,$2,$3) as o`, [KURUM, AKTIF, ["in_progress"]],
    );
    assert.equal(Number(yalnizDevam.suren), 1, "küme daralınca sayı da daralıyor");
  });
});

test("termin penceresi: gecikmiş ayrı, yedi gün ayrı, sekizinci dışarıda", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const o = await ozet();
    assert.equal(Number(o.termin_gecmis), 1, "dün terminli plan");
    assert.equal(Number(o.termin_yakin), 1, "3 gün sonrası pencerede");
    /* Sekiz gün sonrası hiçbirine girmiyor; biten işin geçmiş termini
       de aktif olmadığı için sayılmıyor. */
  });
});

test("aşama sayıları: yalnızca aktif işin açık adımları", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const o = await ozet();
    assert.equal(Number(o.asama_gecmis), 1, "3 gün gecikmiş adım");
    assert.equal(Number(o.asama_yakin), 1, "yarınki adım");
    /* Tamamlanmış adım, 30 gün sonrası ve aktif olmayan işin adımı
       dışarıda. */
  });
});

test("grafik dilimi Türkiye gününe göre", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const o = await ozet();
    const toplam = o.seri.reduce((t, s) => t + Number(s.adet), 0);
    assert.equal(toplam, 2, "iki tamamlanan adım");
    const geceGunu = (await tek(
      `select to_char((timezone('Europe/Istanbul', completed_at))::date,'YYYY-MM-DD') as g
       from public.operation_steps where title = 'Gece biten'`,
    )).g;
    const utcGunu = (await tek(
      `select to_char((completed_at)::date,'YYYY-MM-DD') as g
       from public.operation_steps where title = 'Gece biten'`,
    )).g;
    assert.notEqual(geceGunu, utcGunu, "tohum gece yarısını gerçekten aşıyor");
    assert.equal(Number(o.seri.find((s) => s.gun === geceGunu)?.adet ?? 0), 1);
    assert.equal(Number(o.seri.find((s) => s.gun === utcGunu)?.adet ?? 0), 0, "UTC gününe yazılmıyor");
  });
});

test("görünümde updated_at var (süren işler sıralaması)", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const satir = await tek(
      `select updated_at, adim_toplam, adim_tamam from public.operasyon_is_liste where id = $1`, [SUREN_IS],
    );
    assert.ok(satir.updated_at, "updated_at geliyor");
    assert.ok(Number(satir.adim_toplam) >= 5, "adım sayıları yerinde duruyor");
  });
});

test("başka kurumun kullanıcısı hiçbir sayı görmüyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", YABANCI);
    const o = await ozet();
    assert.equal(Number(o.planlanan), 0);
    assert.equal(Number(o.suren), 0);
    assert.equal(Number(o.asama_yakin), 0);
    assert.deepEqual(o.seri, []);
  });
});

test("anon ne işleve ne görünüme erişebiliyor", async () => {
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(db, `select public.operasyon_genel_bakis_ozeti($1,$2,$3)`, [KURUM, AKTIF, SUREN], /permission denied/i);
    await reddedilir(db, `select * from public.operasyon_is_liste`, [], /permission denied/i);
  });
});
