/*
  KİŞİ MODÜL İSTİSNASI, MÜŞTERİ SORGULAMA KAPISINDA DA GEÇERLİ.

  arvo_crm_lookup_role modül yetkisini veritabanında okuyan tek fonksiyon
  ve yalnızca ROL satırına bakıyordu. Kişi bazlı istisna geldiğinde iki
  yönlü tutarsızlık oluştu:

    rolde kapalı + kişide açık  → panel CRM'i gösteriyor, sorgu boş dönüyor
    rolde açık  + kişide kapalı → panel kapatıyor, sorgu HÂLÂ çalışıyor

  İkincisi bir kısıtlamanın yarım uygulanması; tehlikeli olan o.
*/
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { islem, olarak, rol, veritabani } from "./ortam.mjs";

const MIGRATIONLAR = [
  "20261002173447_kisi_bazli_yetki.sql",
  "20261002175804_kisi_istisnasi_crm_sorgulamada.sql",
].map((ad) => path.resolve(import.meta.dirname, "../../supabase/migrations/", ad));

const KURUM = "00000000-0000-4000-8000-0000000005a1";
const SAHIP = "00000000-0000-4000-8000-0000000005b1";
const SATISCI = "00000000-0000-4000-8000-0000000005b2";

let db;
before(async () => {
  db = await veritabani();
  for (const m of MIGRATIONLAR) await db.exec(fs.readFileSync(m, "utf8"));
  await rol(db, "postgres");
  await db.exec(`
    insert into auth.users (id,email) values
      ('${SAHIP}','sahip@y.com'),('${SATISCI}','satisci@y.com');
    insert into public.plans (code,name,description) values ('starter','Başlangıç','');
    insert into public.organizations (id,name,slug,status,plan_code)
      values ('${KURUM}','Akademik Merkez','akademik-merkez','active','starter');
    insert into public.organization_memberships (organization_id,user_id,role) values
      ('${KURUM}','${SAHIP}','owner'),('${KURUM}','${SATISCI}','member');
    insert into public.arvo_modules (code,name,description,sort_order,is_active)
      values ('crm','Müşteri ve Satış','',1,true);
    insert into public.organization_modules (organization_id,module_code,is_enabled)
      values ('${KURUM}','crm',true);
    insert into public.crm_opportunities (organization_id,title,customer_name,created_by,estimated_value)
      values ('${KURUM}','Tez danışmanlığı','Ayşe Yılmaz','${SAHIP}',100000);
  `);
});

/*
  Kapı doğrudan sorgulanmıyor: arvo_crm_lookup_role istemciye kapalı ve öyle
  kalmalı. Onu çağıran gerçek RPC (crm_customer_search) üzerinden ölçüyoruz.
  Kapı kapandığında RPC hata vermiyor, SESSİZCE boş dönüyor — ölçüt de bu:
  kurumda eşleşen bir müşteri var, satır gelmiyorsa kapı kapalı demektir.
*/
const sorgulayabiliyorMu = async (userId) => {
  let sonuc;
  await olarak(db, "authenticated", userId, async () => {
    const { rows } = await db.query(`select * from public.crm_customer_search($1, $2, 5)`, [KURUM, "ayşe"]);
    sonuc = rows.length > 0;
  });
  return sonuc;
};

const rolKurali = (rolAdi, acik) => db.query(
  `insert into public.role_module_permissions (organization_id,role,module_key,can_access)
   values ($1,$2,'crm',$3)
   on conflict (organization_id,role,module_key) do update set can_access = excluded.can_access`,
  [KURUM, rolAdi, acik],
);

const kisiKurali = (userId, acik) => db.query(
  `insert into public.member_module_permissions (organization_id,user_id,module_key,can_access)
   values ($1,$2,'crm',$3)
   on conflict (organization_id,user_id,module_key) do update set can_access = excluded.can_access`,
  [KURUM, userId, acik],
);

describe("müşteri sorgulama kapısı kişi istisnasını okuyor", () => {
  test("hiç kural yoksa açık", async () => {
    assert.equal(await sorgulayabiliyorMu(SATISCI), true);
  });

  test("rolde kapatılınca kapanıyor", async () => {
    await rol(db, "postgres");
    await islem(db, async () => {
      await rolKurali("member", false);
      assert.equal(await sorgulayabiliyorMu(SATISCI), false);
    });
  });

  test("rolde kapalı ama kişide açıkken geri açılıyor", async () => {
    await rol(db, "postgres");
    await islem(db, async () => {
      await rolKurali("member", false);
      await kisiKurali(SATISCI, true);
      assert.equal(await sorgulayabiliyorMu(SATISCI), true);
    });
  });

  test("rolde açık ama kişide kapalıyken kapanıyor", async () => {
    // Kısıtlamanın yarım uygulanması buydu: panel kapatıyor, sorgu
    // çalışmaya devam ediyordu.
    await rol(db, "postgres");
    await islem(db, async () => {
      await rolKurali("member", true);
      await kisiKurali(SATISCI, false);
      assert.equal(await sorgulayabiliyorMu(SATISCI), false);
    });
  });

  test("kurum sahibi hiçbir kuralla kapanmıyor", async () => {
    await rol(db, "postgres");
    await islem(db, async () => {
      await rolKurali("member", false);
      await kisiKurali(SAHIP, false);
      assert.equal(await sorgulayabiliyorMu(SAHIP), true);
    });
  });
});
