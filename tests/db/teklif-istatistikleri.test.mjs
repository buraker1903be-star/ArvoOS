/*
  TEKLİF İSTATİSTİKLERİ — sayılar veritabanında doğru mu, kim sayıyor.

  Kart tüm teklifleri okumak zorundaydı; sayım veritabanına taşındı.
  İki şey sınanıyor: hesaplar (son 30 gün, kabul oranı payı, ortanca,
  yanıt bekleyen, aktif değer, aylık dilimler) ve KAPSAM — işlev
  invoker olduğu için çağıranın göremediği teklif sayıya girmemeli.
  Girerse rakam sızıntısı olur: başka kurumun ciro büyüklüğü.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = [
  "20261010210835_teklif_liste_gorunumu.sql",
  "20261010213839_teklif_istatistikleri.sql",
];

const KURUM = "00000000-0000-4000-8000-00000000e0a1";
const BASKA = "00000000-0000-4000-8000-00000000e0a2";
const SAHIP = "00000000-0000-4000-8000-00000000e0b1";
const YABANCI = "00000000-0000-4000-8000-00000000e0b2";
const FIRSAT = "00000000-0000-4000-8000-00000000e0c1";
const PERSONEL = "00000000-0000-4000-8000-00000000e0d1";

let db;
const ozet = async () => (await db.query(`select public.crm_teklif_istatistikleri($1) as o`, [KURUM])).rows[0].o;

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
    insert into public.hr_employees (id,organization_id,full_name,employment_status,can_receive_sales_requests)
      values ('${PERSONEL}','${KURUM}','Gizem Kaya','active',true);
    insert into public.crm_opportunities (id,organization_id,title,customer_name,stage,estimated_value,probability,created_by,created_at,updated_at,request_details,assigned_employee_id)
      values ('${FIRSAT}','${KURUM}','Danışmanlık','Ayşe','proposal',100000,50,'${SAHIP}',now(),now(),'{"service_type":"Tez"}'::jsonb,'${PERSONEL}');
  `);
  /* Senaryo: 100 ve 300 kuruşluk iki aktif (ortanca 200), bir kabul,
     bir ret, bir de on gündür yanıt bekleyen. */
  const teklif = (no, tutar, durum, sebep, gunOnce, gonderim) => `
    insert into public.crm_proposals (id,organization_id,opportunity_id,proposal_no,title,amount,currency,status,archive_reason,sent_at,access_token_hash,created_by,created_at,updated_at,view_count,tax_status)
    values (gen_random_uuid(),'${KURUM}','${FIRSAT}','${no}','T',${tutar},'TRY','${durum}',${sebep ? `'${sebep}'` : "null"},
            ${gonderim ? `now() - interval '${gonderim} days'` : "null"},
            md5(random()::text),'${SAHIP}', now() - interval '${gunOnce} days', now(), 0,'included');`;
  await db.exec([
    teklif("T1", 100, "draft", null, 3, null),
    teklif("T2", 300, "sent", null, 5, 10),
    teklif("T3", 500, "archived", "accepted", 40, 38),
    teklif("T4", 700, "archived", "rejected", 45, 44),
  ].join("\n"));
});

test("sayılar ve tutarlar", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const o = await ozet();
    assert.equal(o.toplam, 4);
    // Son 30 gün: T1 ve T2; önceki 30 gün: T3 ve T4.
    assert.equal(o.son30, 2);
    assert.equal(o.onceki30, 2);
    assert.equal(o.kabul, 1);
    assert.equal(o.karara, 2);
    // Ortanca (100,300,500,700) = 400; ortalama da 400 ama çift sayıda
    // kayıtta iki ortanın ortalaması alınıyor (TypeScript'teki kuralla aynı).
    assert.equal(Number(o.ortanca), 400);
    assert.equal(o.bekleyen, 1);
    // On gündür yanıt bekleyen: 7 günü geçmiş.
    assert.equal(o.bekleyen_gec, 1);
    // Aktif değer yalnızca taslak + gönderildi: 100 + 300.
    assert.equal(Number(o.aktif_deger), 400);
    assert.deepEqual(o.hizmetler, [{ ad: "Tez", adet: 4 }]);
    assert.deepEqual(o.temsilciler, [PERSONEL]);
    /* Aylık dilimler son altı ay: 40-45 gün önceki kayıtlar da
       pencereye giriyor, toplam dört teklif iki dilime dağılıyor. */
    const aylikToplam = o.aylik.reduce((t, d) => t + d.adet, 0);
    assert.equal(aylikToplam, 4);
  });
});

test("eski revizyon hiçbir sayıya girmiyor", async () => {
  /* Yeni revizyonla değişen teklif listede de yok; istatistikte
     sayılsaydı kabul oranı ve tipik tutar iki kez sayardı. */
  await islem(db, async () => {
    await rol(db, "postgres");
    await db.query(
      `update public.crm_proposals set superseded_by = (select id from public.crm_proposals where proposal_no = 'T2')
       where proposal_no = 'T1'`,
    );
    await rol(db, "authenticated", SAHIP);
    const o = await ozet();
    assert.equal(o.toplam, 3);
    assert.equal(Number(o.aktif_deger), 300, "eskiyen teklif aktif değere girmiyor");
  });
});

test("başka kurumun kullanıcısı sıfır görüyor", async () => {
  /* İşlev invoker: çağıranın göremediği teklif sayıya girmemeli,
     yoksa başka kurumun ciro büyüklüğü sızar. */
  await islem(db, async () => {
    await rol(db, "authenticated", YABANCI);
    const o = await ozet();
    assert.equal(o.toplam, 0);
    assert.equal(Number(o.aktif_deger), 0);
  });
});

test("anon işlevi çağıramıyor", async () => {
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(db, `select public.crm_teklif_istatistikleri($1)`, [KURUM], /permission denied/i);
  });
});
