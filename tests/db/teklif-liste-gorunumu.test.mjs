/*
  TEKLİF LİSTESİ GÖRÜNÜMÜ — ne gösteriyor, kime gösteriyor.

  Görünüm teklif ile fırsatı tek düz yüzeyde birleştiriyor ki liste
  sunucuda süzülüp sayfalanabilsin. İki şey sınanıyor:

  1. Alanlar doğru geliyor mu (grup sütunu, müşteri adı, telefonun
     rakam anahtarı).
  2. KİM GÖRÜYOR: security_invoker olduğu için RLS çağıranın kendi
     yetkisiyle işliyor. Başka kurumun kullanıcısı hiçbir satır
     görmemeli; anon görünüme hiç erişememeli. Bir görünüm yanlış
     kurulursa (security_invoker olmadan) tablo RLS'ini ATLAR ve
     kurumun tekliflerini herkese açar — bu testin asıl sebebi.
*/
import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, reddedilir, rol, veritabani } from "./ortam.mjs";

const migration = (ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad);
const MIGRATIONLAR = ["20261010210835_teklif_liste_gorunumu.sql"];

const KURUM = "00000000-0000-4000-8000-00000000d0a1";
const BASKA = "00000000-0000-4000-8000-00000000d0a2";
const SAHIP = "00000000-0000-4000-8000-00000000d0b1";
const YABANCI = "00000000-0000-4000-8000-00000000d0b2";
const FIRSAT = "00000000-0000-4000-8000-00000000d0c1";

let db;
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
    insert into public.crm_opportunities (id,organization_id,title,customer_name,contact_email,contact_phone,stage,estimated_value,probability,created_by,created_at,updated_at,request_details)
      values ('${FIRSAT}','${KURUM}','Danışmanlık','Ayşe Yılmaz','ayse@firma.com','+90 (532) 111 22 33','proposal',100000,50,'${SAHIP}',now(),now(),'{"service_type":"Tez"}'::jsonb);
    insert into public.crm_proposals (id,organization_id,opportunity_id,proposal_no,title,amount,currency,status,archive_reason,access_token_hash,created_by,created_at,updated_at,view_count,tax_status)
      values (gen_random_uuid(),'${KURUM}','${FIRSAT}','TEK-1','Teklif',150000,'TRY','sent',null,'x1','${SAHIP}',now(),now(),0,'included'),
             (gen_random_uuid(),'${KURUM}','${FIRSAT}','TEK-2','Teklif',250000,'TRY','archived','accepted','x2','${SAHIP}',now(),now(),0,'included');
  `);
});

/* Rol değişimi İŞLEM İÇİNDE: "set local role" işlem dışında hiçbir
   şey yapmıyor ve test farkında olmadan veritabanı sahibi olarak
   koşuyor — RLS'i sınadığını sanan ama hiç sınamayan bir test. */
test("görünüm teklifi fırsatın bilgileriyle birlikte veriyor", async () => {
  await islem(db, async () => {
  await rol(db, "authenticated", SAHIP);
  const { rows } = await db.query(
    `select proposal_no, teklif_grubu, customer_name, contact_email, telefon_rakamlari, amount
     from public.crm_teklif_liste order by proposal_no`,
  );
  assert.deepEqual(rows.map((r) => [r.proposal_no, r.teklif_grubu]), [["TEK-1", "sent"], ["TEK-2", "accepted"]]);
  assert.equal(rows[0].customer_name, "Ayşe Yılmaz");
  assert.equal(rows[0].contact_email, "ayse@firma.com");
  /* Telefon araması: "+90 (532) 111 22 33" ile "05321112233" aynı
     anahtara iniyor; ham metinle arayan liste telefonu hiç bulamıyordu. */
  assert.equal(rows[0].telefon_rakamlari, "5321112233");
  assert.equal(Number(rows[0].amount), 150000);
  });
});

test("başka kurumun kullanıcısı hiçbir satır görmüyor", async () => {
  /* Görünüm security_invoker olmadan kurulsaydı tablo RLS'ini atlar ve
     kurumun bütün tekliflerini (tutarlarıyla) açardı. */
  await islem(db, async () => {
    await rol(db, "authenticated", YABANCI);
    const { rows } = await db.query(`select count(*)::int as adet from public.crm_teklif_liste`);
    assert.equal(rows[0].adet, 0);
  });
});

test("anon görünüme erişemiyor", async () => {
  await islem(db, async () => {
    await rol(db, "anon");
    await reddedilir(db, `select * from public.crm_teklif_liste`, [], /permission denied/i);
  });
});
