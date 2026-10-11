/*
  CRM GENEL BAKIŞ ÖZETİ.

  Sayfa kurumun bütün taleplerini, tekliflerini ve sözleşmelerini
  çekip her sayıyı bellekte hesaplıyordu; sayılar artık bu işlevden
  geliyor. Sınananlar:

  1. Sayılar ve tutarlar: atanmamış talep, bekleyen teklif değeri
     (yalnızca TRY), süresi dolan, geciken sözleşme, bu ayın imzaları.
  2. Grafik dilimi TÜRKİYE gününe göre: UTC'de gece yarısından sonra
     açılan kayıt bir sonraki güne düşmeli.
  3. Kapsam: başka kurumun kullanıcısı hiçbir sayı görmemeli, anon
     işleve hiç erişmemeli.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = ["20261011144414_crm_genel_bakis_ozeti.sql"];

const KURUM = "00000000-0000-4000-8000-00000000c1a1";
const BASKA = "00000000-0000-4000-8000-00000000c1a2";
const SAHIP = "00000000-0000-4000-8000-00000000c1b1";
const YABANCI = "00000000-0000-4000-8000-00000000c1b2";
const PERSONEL = "00000000-0000-4000-8000-00000000c1c1";
const YENI_ASAMALAR = ["lead", "qualified", "pre_review", "academic_review"];
const IMZALI = ["signed", "completed"];

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const ozet = async (kurum = KURUM) =>
  (await tek(`select public.crm_genel_bakis_ozeti($1,$2,$3) as o`, [kurum, YENI_ASAMALAR, IMZALI])).o;

/*
  Fırsat + teklif + sözleşme zinciri. Sözleşme gerçek zinciriyle
  kuruluyor (fırsat → kabul edilmiş teklif → sözleşme): tabloların
  yabancı anahtarları bunu istiyor, kısa kesmek kuralı atlamak olurdu.
  Zaman damgaları (sent_at/signed_at) sonradan UPDATE ile konuyor.
*/
const zincir = (ad, durum, tutar = 100000) => `
  with f as (
    insert into public.crm_opportunities (organization_id,title,customer_name,contact_phone,contact_email,stage,estimated_value,probability,created_by,created_at,updated_at,request_details)
    values ('${KURUM}','${ad}','${ad}','05320000000','${ad}@x.com','contract',1000,80,'${SAHIP}',now(),now(),'{}'::jsonb)
    returning id
  ), t as (
    insert into public.crm_proposals (organization_id,opportunity_id,proposal_no,title,amount,currency,status,access_token_hash,created_by,created_at,updated_at,view_count,tax_status)
    select '${KURUM}', f.id, 'TEK-${ad}', '${ad}', ${tutar}, 'TRY', 'accepted', '${ad}h', '${SAHIP}', now(), now(), 0, 'included' from f
    returning id, opportunity_id
  )
  insert into public.crm_contracts (organization_id,opportunity_id,proposal_id,contract_no,title,amount,currency,status,access_token_hash,created_by,created_at,updated_at)
  select '${KURUM}', t.opportunity_id, t.id, 'SOZ-${ad}', '${ad}', ${tutar}, 'TRY', '${durum}', '${ad}c', '${SAHIP}', now(), now()
  from t;
`;

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

    /* Üç yeni talep: ikisi atanmamış. Biri UTC gece yarısından SONRA
       (Türkiye'de ertesi gün) — grafik dilimi bunu sınıyor. */
    insert into public.crm_opportunities (organization_id,title,customer_name,contact_phone,contact_email,stage,estimated_value,probability,created_by,created_at,updated_at,request_details,assigned_employee_id)
    values
      ('${KURUM}','Tez','Ayşe','05321112233','a@x.com','lead',1000,10,'${SAHIP}',now(),now(),'{}'::jsonb,null),
      ('${KURUM}','Makale','Veli','05321112234','v@x.com','qualified',2000,30,'${SAHIP}',now(),now(),'{}'::jsonb,null),
      ('${KURUM}','Sunum','Can','05321112235','c@x.com','lead',3000,20,'${SAHIP}',now(),now(),'{}'::jsonb,'${PERSONEL}'),
      /* Teklif aşamasında: "yeni talep" sayılmamalı. */
      ('${KURUM}','Eski','Deniz','05321112236','d@x.com','proposal',4000,60,'${SAHIP}',now(),now(),'{}'::jsonb,'${PERSONEL}');
  `);

  /*
    Teklifler: süresi 2 gün sonra biten (uyarı), bugün biten (uyarı),
    20 gün sonra biten, USD olan (sayıya girer, TRY değerine girmez),
    yerine yenisi geçmiş olan (bekleyenlerden düşer) ve süresi DOLMUŞ
    olan.

    Süresi dolmuş teklif `sent` kalmıyor: archive_inactive_crm_proposal
    tetikleyicisi INSERT'te onu arşive alıyor (archive_reason =
    'expired'). Yani "bekleyen" sayısına girmiyor — tohumu buna göre
    kuruyoruz, tetikleyiciyi atlatmak kuralı yok saymak olurdu.
    Tetikleyici yalnızca satıra DOKUNULDUĞUNDA işliyor, bu yüzden
    canlıda eli değmemiş ve süresi geçmiş teklifler `sent` kalabiliyor;
    işlevin "süresi dolan" sayacı onları da uyarıya katıyor.
  */
  await db.exec(`
    insert into public.crm_opportunities (id,organization_id,title,customer_name,contact_phone,contact_email,stage,estimated_value,probability,created_by,created_at,updated_at,request_details)
      values ('00000000-0000-4000-8000-00000000c1d1','${KURUM}','Teklif zinciri','Teklif','05321110000','t@x.com','proposal',5000,50,'${SAHIP}',now(),now(),'{}'::jsonb);
    insert into public.crm_proposals (organization_id,opportunity_id,proposal_no,title,amount,currency,status,valid_until,sent_at,access_token_hash,created_by,created_at,updated_at,view_count,tax_status)
    values
      ('${KURUM}','00000000-0000-4000-8000-00000000c1d1','TEK-1','Yakın',150000,'TRY','sent',(timezone('Europe/Istanbul',now()))::date + 2,now() - interval '1 day','h1','${SAHIP}',now(),now(),0,'included'),
      ('${KURUM}','00000000-0000-4000-8000-00000000c1d1','TEK-2','Uzak',250000,'TRY','sent',(timezone('Europe/Istanbul',now()))::date + 20,now() - interval '2 days','h2','${SAHIP}',now(),now(),0,'included'),
      ('${KURUM}','00000000-0000-4000-8000-00000000c1d1','TEK-3','Dolmuş',350000,'TRY','sent',(timezone('Europe/Istanbul',now()))::date - 1,now() - interval '9 days','h3','${SAHIP}',now(),now(),0,'included'),
      ('${KURUM}','00000000-0000-4000-8000-00000000c1d1','TEK-4','Dolar',1000,'USD','sent',(timezone('Europe/Istanbul',now()))::date + 20,now() - interval '3 days','h4','${SAHIP}',now(),now(),0,'included'),
      ('${KURUM}','00000000-0000-4000-8000-00000000c1d1','TEK-5','Devredilmiş',900000,'TRY','sent',(timezone('Europe/Istanbul',now()))::date + 5,now() - interval '4 days','h5','${SAHIP}',now(),now(),0,'included'),
      ('${KURUM}','00000000-0000-4000-8000-00000000c1d1','TEK-6','Bugün biten',500000,'TRY','sent',(timezone('Europe/Istanbul',now()))::date,now() - interval '5 days','h6','${SAHIP}',now(),now(),0,'included');
    update public.crm_proposals set superseded_by = (select id from public.crm_proposals where proposal_no = 'TEK-1')
      where proposal_no = 'TEK-5';
  `);

  /* Sözleşmeler: biri 8 gündür imzada (gecikmiş), biri 2 gündür,
     biri bu ay imzalı, biri geçen ay imzalı. */
  await db.exec(zincir("gec", "sent"));
  await db.query(`update public.crm_contracts set sent_at = now() - interval '8 days' where contract_no = 'SOZ-gec'`);
  await db.exec(zincir("yeni", "sent"));
  await db.query(`update public.crm_contracts set sent_at = now() - interval '2 days' where contract_no = 'SOZ-yeni'`);
  await db.exec(zincir("imza", "signed", 400000));
  await db.query(`update public.crm_contracts set signed_at = now() where contract_no = 'SOZ-imza'`);
  await db.exec(zincir("eskiimza", "signed", 700000));
  await db.query(
    `update public.crm_contracts
     set signed_at = (date_trunc('month', timezone('Europe/Istanbul', now())) - interval '5 days')
     where contract_no = 'SOZ-eskiimza'`,
  );
});

test("talep sayıları: yalnızca teklif öncesi aşamalar, atanmamışlar ayrı", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const o = await ozet();
    assert.equal(Number(o.yeni_talep), 3, "lead + qualified; proposal aşaması sayılmaz");
    assert.equal(Number(o.atanmamis), 2);
  });
});

test("bekleyen teklif: devredilmiş düşer, değer yalnızca TRY", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const o = await ozet();
    /* Bekleyenler: TEK-1, TEK-2, TEK-4, TEK-6. TEK-5'in yerine yenisi
       geçti; TEK-3 süresi dolduğu için tetikleyiciyle arşivde. */
    assert.equal(Number(o.bekleyen_teklif), 4);
    /* 1500 + 2500 + 5000 TL; dolar teklifi sayıda var, değerde yok —
       kurları toplamak yanlış bir tek sayı üretirdi. */
    assert.equal(Number(o.bekleyen_teklif_degeri), 150000 + 250000 + 500000);
    /* Süresi dolan: üç gün içinde bitenler (TEK-1 iki gün, TEK-6
       bugün). Yirmi gün sonrası uyarıya girmiyor. */
    assert.equal(Number(o.suresi_dolan), 2);
    /* Arşivlenen teklif "bekliyor" sayılmıyor. */
    const arsiv = await tek(`select status, archive_reason from public.crm_proposals where proposal_no = 'TEK-3'`);
    assert.equal(arsiv.status, "archived");
    assert.equal(arsiv.archive_reason, "expired");
  });
});

test("sözleşme sayıları: 7 günden uzun bekleyen gecikmiş", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const o = await ozet();
    assert.equal(Number(o.bekleyen_sozlesme), 2);
    assert.equal(Number(o.geciken_sozlesme), 1, "8 gün gecikmiş, 2 gün değil");
  });
});

test("imzalar: bu ay olanlar ayrı, tutar yalnızca bu aydan", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const o = await ozet();
    assert.equal(Number(o.imzali_toplam), 2, "geçen ayın imzası da imzalı");
    assert.equal(Number(o.bu_ay_imza), 1);
    assert.equal(Number(o.bu_ay_imza_degeri), 400000, "geçen ayın 7000 TL'si girmiyor");
  });
});

test("grafik dilimi Türkiye gününe göre", async () => {
  await islem(db, async () => {
    await rol(db, "postgres");
    /* UTC'de 22:30, Türkiye'de ertesi gün 01:30. Dilim Türkiye gününe
       göre olmazsa kayıt bir önceki güne düşer (AGENTS.md: tarih
       Türkiye saatiyle). */
    const { gun } = await tek(
      `insert into public.crm_opportunities (organization_id,title,customer_name,contact_phone,contact_email,stage,estimated_value,probability,created_by,created_at,updated_at,request_details)
       values ($1,'Gece','Gece','05321119999','g@x.com','lead',100,10,$2,
               (timezone('Europe/Istanbul', now()))::date - 3 + interval '22 hours 30 minutes',
               now(),'{}'::jsonb)
       returning to_char((timezone('Europe/Istanbul', created_at))::date,'YYYY-MM-DD') as gun`,
      [KURUM, SAHIP],
    );
    await rol(db, "authenticated", SAHIP);
    const o = await ozet();
    const dilim = o.seri.find((s) => s.gun === gun);
    assert.ok(dilim, `Türkiye günü ${gun} dilimi yok: ${JSON.stringify(o.seri)}`);
    assert.equal(Number(dilim.adet), 1);
    /* Kayıt UTC gününe yazılsaydı bir gün öncesinde görünürdü. */
    const utcGunu = (await tek(
      `select to_char((created_at)::date,'YYYY-MM-DD') as g from public.crm_opportunities where title = 'Gece'`,
    )).g;
    assert.notEqual(utcGunu, gun, "tohum gece yarısını gerçekten aşıyor");
    assert.equal(o.seri.find((s) => s.gun === utcGunu)?.adet ?? 0, 0);
  });
});

test("başka kurumun kullanıcısı hiçbir sayı görmüyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", YABANCI);
    const o = await ozet();
    assert.equal(Number(o.yeni_talep), 0);
    assert.equal(Number(o.bekleyen_teklif), 0);
    assert.equal(Number(o.imzali_toplam), 0);
    assert.deepEqual(o.seri, []);
  });
});

test("anon işleve erişemiyor", async () => {
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(db, `select public.crm_genel_bakis_ozeti($1,$2,$3)`, [KURUM, YENI_ASAMALAR, IMZALI], /permission denied/i);
  });
});
