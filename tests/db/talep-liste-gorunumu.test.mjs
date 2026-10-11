/*
  TALEP LİSTESİ GÖRÜNÜMÜ VE ÖZETİ.

  Dört büyük listenin sonuncusu. Sınananlar:
  1. Görünüm aramanın ihtiyaç duyduğu alanları veriyor mu (telefon
     anahtarı, hizmet türü, temsilci adı) ve son yorum zamanı doğru mu.
  2. Özet aşama kümelerini ÇAĞIRANDAN alıyor: kural TypeScript'te
     yaşıyor, SQL'e kopyalanmadı.
  3. Kapsam: başka kurumun kullanıcısı hiçbir satır görmemeli.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = ["20261011122651_talep_liste_gorunumu.sql"];

const KURUM = "00000000-0000-4000-8000-00000000b3a1";
const BASKA = "00000000-0000-4000-8000-00000000b3a2";
const SAHIP = "00000000-0000-4000-8000-00000000b3b1";
const YABANCI = "00000000-0000-4000-8000-00000000b3b2";
const PERSONEL = "00000000-0000-4000-8000-00000000b3c1";
const AKTIF = ["lead", "qualified"];
const ILERLEYEN = ["proposal", "contract", "won"];

let db;
const tek = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const ozet = async () =>
  (await tek(`select public.crm_talep_istatistikleri($1,$2,$3) as o`, [KURUM, AKTIF, ILERLEYEN])).o;

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

    insert into public.crm_opportunities (id,organization_id,title,customer_name,contact_email,contact_phone,stage,estimated_value,probability,source,created_by,created_at,updated_at,request_details,assigned_employee_id)
      values
      (gen_random_uuid(),'${KURUM}','Tez düzenleme','Ayşe Yılmaz','ayse@x.com','+90 (532) 111 22 33','lead',1000,10,'whatsapp','${SAHIP}',now() - interval '10 days',now(),'{"service_type":"Tez"}'::jsonb,'${PERSONEL}'),
      (gen_random_uuid(),'${KURUM}','Makale','Veli Can',null,null,'qualified',2000,30,'site','${SAHIP}',now() - interval '40 days',now(),'{"service_type":"Makale"}'::jsonb,null),
      (gen_random_uuid(),'${KURUM}','Sunum','Can Öz',null,null,'proposal',3000,60,'whatsapp','${SAHIP}',now() - interval '5 days',now(),'{}'::jsonb,'${PERSONEL}'),
      (gen_random_uuid(),'${KURUM}','Kaybedilen','Deniz',null,null,'lost',4000,0,'site','${SAHIP}',now() - interval '3 days',now(),'{}'::jsonb,null);
  `);
  /* Bir aktif talebe yorum: "notsuz" sayacı yorumun YOKLUĞUNU sayıyor. */
  await db.query(
    `insert into public.crm_internal_comments (id,organization_id,opportunity_id,context_type,context_id,body,created_by,created_at)
     select gen_random_uuid(), $1, id, 'request', id, 'Müşteri arandı', $2, now()
     from public.crm_opportunities where organization_id = $1 and stage = 'lead'`,
    [KURUM, SAHIP],
  );
});

test("görünüm aramanın alanlarını veriyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const satir = await tek(
      `select telefon_rakamlari, hizmet_turu, temsilci_adi, son_yorum_at
       from public.crm_talep_liste where title = 'Tez düzenleme'`,
    );
    // "+90 (532) 111 22 33" ile "05321112233" aynı anahtara iniyor.
    assert.equal(satir.telefon_rakamlari, "5321112233");
    assert.equal(satir.hizmet_turu, "Tez");
    /* Temsilci adı fırsat kaydında değil personel tablosunda; arama tek
       bir `or` ile ikisine birden baksın diye görünümde. */
    assert.equal(satir.temsilci_adi, "Gizem Kaya");
    assert.ok(satir.son_yorum_at, "yorum zamanı geldi");
  });
});

test("özet aşama kümelerini çağırandan alıyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const o = await ozet();
    assert.equal(o.toplam, 4);
    assert.equal(o.aktif, 2, "lead + qualified");
    assert.equal(o.ilerleyen, 1, "proposal");
    assert.equal(o.kaybedilen, 1);
    assert.equal(o.atanmamis, 1, "atanmamış aktif talep");
    // Yorumu olmayan aktif talep: "Makale".
    assert.equal(o.notsuz, 1);
    assert.deepEqual(o.hizmetler.map((h) => h.ad).sort(), ["Belirtilmedi", "Makale", "Tez"]);
    assert.deepEqual(o.kaynaklar.map((k) => k.ad).sort(), ["site", "whatsapp"]);
    assert.deepEqual(o.temsilciler, [PERSONEL]);
    /* Ortalama yaş yalnızca AKTİF taleplerden: 10 ve 40 günlük iki
       kayıt → 25. Kapanmış kayıtlar sayıya girseydi yaş ortalaması
       kurumun ne kadar hızlı ilerlediğini değil, arşivin yaşını
       söylerdi. */
    assert.equal(Number(o.ortalama_yas), 25);
  });
});

test("küme değişince sayı da değişiyor (kural çağıranda)", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", SAHIP);
    const { o } = await tek(`select public.crm_talep_istatistikleri($1,$2,$3) as o`,
      [KURUM, ["lead"], ILERLEYEN]);
    assert.equal(o.aktif, 1, "yalnızca lead aktif sayıldı");
  });
});

test("başka kurumun kullanıcısı hiçbir talep görmüyor", async () => {
  await islem(db, async () => {
    await rol(db, "authenticated", YABANCI);
    assert.equal((await tek(`select count(*)::int as adet from public.crm_talep_liste`)).adet, 0);
    assert.equal((await ozet()).toplam, 0);
  });
});

test("anon ne görünüme ne işleve erişebiliyor", async () => {
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(db, `select * from public.crm_talep_liste`, [], /permission denied/i);
    await reddedilir(db, `select public.crm_talep_istatistikleri($1,$2,$3)`, [KURUM, AKTIF, ILERLEYEN], /permission denied/i);
  });
});
